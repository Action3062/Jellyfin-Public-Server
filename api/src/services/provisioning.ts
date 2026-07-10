import type { Payment, PrismaClient } from "@prisma/client";
import { addDays, addMonths, laterOf } from "../lib/expiry.js";
import { createRegistrationInvite, extendJellyfinExpiry, getInviteUsage } from "./jfago.js";
import { invitePlexUser } from "./plex.js";

/**
 * Fulfillment engine. All access is granted here, server-side, driven by the
 * Payment row that was written at checkout time — never by browser calls.
 * Every step is idempotent so BullMQ retries and duplicate webhooks are safe.
 */

async function activateSubscription(
  prisma: PrismaClient,
  input: { username: string; plan: string; source: "nowpayments" | "azteco"; months?: number | null; days?: number | null }
) {
  const user = await prisma.user.upsert({
    where: { jellyfinUsername: input.username },
    update: {},
    create: { jellyfinUsername: input.username }
  });
  const latest = await prisma.subscription.findFirst({
    where: { userId: user.id, status: "active" },
    orderBy: { expiresAt: "desc" }
  });
  const startsAt = laterOf(new Date(), latest?.expiresAt || new Date());
  const expiresAt = input.months ? addMonths(startsAt, input.months) : addDays(startsAt, input.days || 0);
  await extendJellyfinExpiry(input.username, expiresAt);
  const subscription = await prisma.subscription.create({
    data: { userId: user.id, plan: input.plan, source: input.source, startsAt, expiresAt, status: "active" }
  });
  return { user, subscription };
}

async function fulfillPlex(prisma: PrismaClient, payment: Payment): Promise<void> {
  if (payment.plexState !== "pending" || !payment.plexUsername) return;
  const result = await invitePlexUser(payment.plexUsername);
  await prisma.payment.update({
    where: { id: payment.id },
    data: { plexState: result.success ? "invited" : "failed" }
  });
  if (payment.userId) {
    await prisma.user.update({ where: { id: payment.userId }, data: { plexUsername: payment.plexUsername } }).catch(() => null);
  }
}

/**
 * Fulfill a paid order. For existing accounts this extends the Jellyfin
 * expiry; for new accounts it creates a single-use jfa-go invite that
 * already carries the purchased duration as user expiry.
 */
export async function fulfillPayment(prisma: PrismaClient, orderId: string): Promise<Payment | null> {
  const payment = await prisma.payment.findUnique({ where: { orderId } });
  if (!payment) return null;
  if (payment.status !== "finished") return payment;
  if (payment.provisionState === "provisioned" || payment.provisionState === "awaiting_registration") {
    await fulfillPlex(prisma, payment);
    return prisma.payment.findUnique({ where: { orderId } });
  }

  try {
    if (payment.accountMode === "new") {
      const invite = await createRegistrationInvite({
        label: payment.orderId,
        userMonths: payment.months || 0,
        userDays: payment.days || 0
      });
      await prisma.payment.update({
        where: { id: payment.id },
        data: { inviteCode: invite.code, inviteUrl: invite.url, provisionState: "awaiting_registration" }
      });
    } else {
      if (!payment.user) throw new Error(`payment ${payment.orderId} has no username to provision`);
      const { user, subscription } = await activateSubscription(prisma, {
        username: payment.user,
        plan: payment.planId || payment.product,
        source: payment.provider,
        months: payment.months,
        days: payment.days
      });
      await prisma.payment.update({
        where: { id: payment.id },
        data: { userId: user.id, provisionState: "provisioned", provisionedAt: subscription.startsAt }
      });
    }
  } catch (error) {
    await prisma.payment.update({ where: { id: payment.id }, data: { provisionState: "failed" } });
    throw error;
  }

  const fresh = await prisma.payment.findUnique({ where: { orderId } });
  if (fresh) await fulfillPlex(prisma, fresh);
  return prisma.payment.findUnique({ where: { orderId } });
}

/**
 * Lazy reconciliation for new-account orders: once the customer has used
 * their invite on jfa-go, backfill the portal User + Subscription so the
 * dashboard and renewals work. Called from the order/dashboard endpoints,
 * so no extra scheduler is needed.
 */
export async function reconcileRegistration(prisma: PrismaClient, payment: Payment): Promise<Payment> {
  if (payment.provisionState !== "awaiting_registration" || !payment.inviteCode) return payment;
  const usage = await getInviteUsage(payment.inviteCode, payment.orderId).catch(() => null);
  if (!usage?.usedBy) return payment;

  const usedAt = usage.usedAt || new Date();
  const expiresAt = payment.months ? addMonths(usedAt, payment.months) : addDays(usedAt, payment.days || 0);
  const user = await prisma.user.upsert({
    where: { jellyfinUsername: usage.usedBy },
    update: {},
    create: { jellyfinUsername: usage.usedBy }
  });
  await prisma.subscription.create({
    data: {
      userId: user.id,
      plan: payment.planId || payment.product,
      source: payment.provider,
      startsAt: usedAt,
      expiresAt,
      status: "active"
    }
  });
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { user: usage.usedBy, userId: user.id, provisionState: "provisioned", provisionedAt: usedAt }
  });
  await fulfillPlex(prisma, updated);
  return updated;
}
