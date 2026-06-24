import type { PrismaClient } from "@prisma/client";
import { addDays, addMonths, laterOf } from "../lib/expiry.js";
import { extendJellyfinExpiry } from "./jfago.js";

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
