import type { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";
import { addDays, addMonths, laterOf } from "../lib/expiry.js";
import { extendJellyfinExpiry } from "./jfago.js";

/**
 * Sets a Jellyfin account's expiry to an ABSOLUTE date (admin correction/undo),
 * bypassing the stacking logic. Records a manual subscription with a note for
 * the audit trail but no payment, so revenue stays untouched.
 */
export async function setManualExpiry(
  prisma: PrismaClient,
  username: string,
  expiresAt: Date,
  note: string
) {
  const user = await prisma.user.upsert({
    where: { jellyfinUsername: username },
    update: {},
    create: { jellyfinUsername: username }
  });
  // Case-variant duplicate User rows can exist (checkout usernames are
  // buyer-typed and only checked case-insensitively), so supersede active subs
  // across ALL rows that match case-insensitively — otherwise the next stacking
  // credit could resume from a stale row stored under a different casing.
  const related = await prisma.user.findMany({
    where: { jellyfinUsername: { equals: username, mode: "insensitive" } },
    select: { id: true }
  });
  const userIds = Array.from(new Set([user.id, ...related.map((r) => r.id)]));
  // jfa-go holds the authoritative expiry; set it first so a later DB failure
  // still leaves the account showing the corrected date.
  await extendJellyfinExpiry(username, expiresAt);
  // Atomic: expire the old active rows and record the correction together, so a
  // mid-flight failure can't leave the user with zero active subscriptions.
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

export async function provisionMonths(prisma: PrismaClient, username: string, product: string, plan: string, months: number) {
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
  const expiresAt = addMonths(startsAt, months);
  await extendJellyfinExpiry(username, expiresAt);
  return prisma.subscription.create({
    data: { userId: user.id, plan: `${product}:${plan}`, source: "nowpayments", startsAt, expiresAt, status: "active" }
  });
}

export async function provisionDays(prisma: PrismaClient, username: string, product: string, days: number) {
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
  return prisma.subscription.create({
    data: { userId: user.id, plan: product, source: "azteco", startsAt, expiresAt, status: "active" }
  });
}

/**
 * Manually credits `days` of time to a Jellyfin user (admin action). Uses the
 * same stacking + jfa-go expiry flow as the paid paths and records a manual
 * subscription + payment for the audit trail.
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
      user: username,
      product
    }
  });
  return { startsAt, expiresAt };
}
