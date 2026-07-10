import type { Payment, PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";
import { addDays, addMonths, laterOf } from "../lib/expiry.js";
import { createJellyfinUser, extendJellyfinExpiry, isUsernameAvailable, UsernameTakenError } from "./jfago.js";
import { invitePlexUser } from "./plex.js";

/**
 * Fulfillment engine. All access is granted here, server-side, driven by the
 * Payment row that was written at checkout time — never by browser calls.
 * Every step is idempotent so BullMQ retries and duplicate webhooks are safe.
 */

async function activateSubscription(
  prisma: PrismaClient,
  input: { username: string; plan: string; source: "nowpayments" | "azteco" | "manual"; months?: number | null; days?: number | null }
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
 * Fulfill a paid order. Existing accounts get their Jellyfin expiry
 * extended immediately; new-account orders are parked in
 * `awaiting_registration` until the customer completes the portal's own
 * registration form (registerNewAccount below).
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
      await prisma.payment.update({
        where: { id: payment.id },
        data: { provisionState: "awaiting_registration" }
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
 * Complete a new-account order through the portal's own registration form:
 * create the Jellyfin account via jfa-go, stamp the purchased duration as
 * expiry, and backfill the portal User + Subscription. Throws
 * UsernameTakenError when the requested name is unavailable.
 */
export async function registerNewAccount(
  prisma: PrismaClient,
  payment: Payment,
  input: { username: string; password: string }
): Promise<Payment> {
  if (payment.status !== "finished" || payment.accountMode !== "new") {
    throw new Error("order is not awaiting registration");
  }
  if (payment.provisionState === "provisioned") {
    throw new UsernameTakenError("order already registered");
  }

  if (!(await isUsernameAvailable(input.username))) {
    throw new UsernameTakenError("username taken");
  }
  await createJellyfinUser(input);

  const now = new Date();
  const expiresAt = payment.months ? addMonths(now, payment.months) : addDays(now, payment.days || 0);

  // The user list behind /users/extend may lag briefly after creation, so
  // retry a few times. If it still fails, keep the account (customer paid
  // and can watch) and log loudly — the missing expiry is visible in
  // jfa-go's admin Accounts view.
  let expiryError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await extendJellyfinExpiry(input.username, expiresAt);
      expiryError = null;
      break;
    } catch (error) {
      expiryError = error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  if (expiryError) {
    console.error(`registerNewAccount: expiry could not be set for ${input.username}`, expiryError);
  }

  const user = await prisma.user.upsert({
    where: { jellyfinUsername: input.username },
    update: {},
    create: { jellyfinUsername: input.username }
  });
  await prisma.subscription.create({
    data: {
      userId: user.id,
      plan: payment.planId || payment.product,
      source: payment.provider,
      startsAt: now,
      expiresAt,
      status: "active"
    }
  });
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { user: input.username, userId: user.id, provisionState: "provisioned", provisionedAt: now }
  });
  await fulfillPlex(prisma, updated);
  return prisma.payment.findUnique({ where: { orderId: payment.orderId } }) as Promise<Payment>;
}

/**
 * Admin action: credit days manually (support goodwill, offline payments).
 * Records a `manual` payment + subscription so revenue stats and the
 * customer's dashboard history stay complete.
 */
export async function provisionManual(
  prisma: PrismaClient,
  username: string,
  product: string,
  days: number,
  amountEur: number,
  note: string
) {
  const user = await prisma.user.upsert({
    where: { jellyfinUsername: username },
    update: {},
    create: { jellyfinUsername: username }
  });
  const latest = await prisma.subscription.findFirst({
    where: { userId: user.id, status: "active" },
    orderBy: { expiresAt: "desc" }
  });
  const startsAt = laterOf(new Date(), latest?.expiresAt || new Date());
  const expiresAt = addDays(startsAt, days);
  await extendJellyfinExpiry(username, expiresAt);
  await prisma.subscription.create({
    data: { userId: user.id, plan: note ? `manual: ${note}` : "manual", source: "manual", startsAt, expiresAt, status: "active" }
  });
  await prisma.payment.create({
    data: {
      provider: "manual",
      orderId: `man_${nanoid(18)}`,
      amountEur,
      status: "finished",
      provisionState: "provisioned",
      provisionedAt: startsAt,
      user: username,
      userId: user.id,
      product
    }
  });
  return { startsAt, expiresAt };
}

/**
 * Admin action: set an absolute expiry (correction / subtract time / undo).
 * Supersedes all active subscription rows (case-insensitive across duplicate
 * User rows) so future stacking credits resume from the corrected date.
 */
export async function setManualExpiry(prisma: PrismaClient, username: string, expiresAt: Date, note: string) {
  const user = await prisma.user.upsert({
    where: { jellyfinUsername: username },
    update: {},
    create: { jellyfinUsername: username }
  });
  const related = await prisma.user.findMany({
    where: { jellyfinUsername: { equals: username, mode: "insensitive" } },
    select: { id: true }
  });
  const userIds = Array.from(new Set([user.id, ...related.map((r) => r.id)]));
  // jfa-go holds the authoritative expiry; set it first so a later DB failure
  // still leaves the account showing the corrected date.
  await extendJellyfinExpiry(username, expiresAt);
  await prisma.$transaction([
    prisma.subscription.updateMany({
      where: { userId: { in: userIds }, status: "active" },
      data: { status: "expired" }
    }),
    prisma.subscription.create({
      data: {
        userId: user.id,
        plan: note ? `korrektur: ${note}` : "korrektur",
        source: "manual",
        startsAt: new Date(),
        expiresAt,
        status: "active"
      }
    })
  ]);
  return { expiresAt };
}
