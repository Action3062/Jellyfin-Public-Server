import type { PrismaClient } from "@prisma/client";
import type { JfaUserDetailed } from "./jfago.js";
import { listJfaUsersDetailed } from "./jfago.js";

// Aggregations for the admin dashboard. The pure helpers take plain arrays so
// they can be unit-tested without a database; thin wrappers fetch from Prisma
// and delegate. Revenue counts only status "finished" (terminal success).

export const PAID_STATUS = "finished";

export type PaymentLike = {
  provider: string;
  coin?: string | null;
  amountEur: number;
  status: string;
  user: string;
  createdAt: Date;
};

export function toNum(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number((value as { toString(): string }).toString());
  return Number.isFinite(n) ? n : 0;
}

function ymd(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function computeKpis(payments: PaymentLike[], now: Date) {
  const paid = payments.filter((p) => p.status === PAID_STATUS);
  const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const sum = (list: PaymentLike[]) => list.reduce((acc, p) => acc + p.amountEur, 0);
  const total = sum(paid);
  return {
    today: sum(paid.filter((p) => p.createdAt >= startToday)),
    last30: sum(paid.filter((p) => p.createdAt >= start30)),
    year: sum(paid.filter((p) => p.createdAt >= startYear)),
    total,
    count: paid.length,
    avg: paid.length ? total / paid.length : 0
  };
}

export function monthlySeries(payments: PaymentLike[], months: number, now: Date) {
  const paid = payments.filter((p) => p.status === PAID_STATUS);
  const buckets: Array<{ month: string; total: number; nowpayments: number; azteco: number; manual: number }> = [];
  const index = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = ymd(d);
    index.set(key, buckets.length);
    buckets.push({ month: key, total: 0, nowpayments: 0, azteco: 0, manual: 0 });
  }
  for (const p of paid) {
    const slot = index.get(ymd(p.createdAt));
    if (slot === undefined) continue;
    const bucket = buckets[slot];
    bucket.total += p.amountEur;
    if (p.provider === "nowpayments") bucket.nowpayments += p.amountEur;
    else if (p.provider === "azteco") bucket.azteco += p.amountEur;
    else if (p.provider === "manual") bucket.manual += p.amountEur;
  }
  return buckets;
}

export function breakdownBy(payments: PaymentLike[], key: "provider" | "coin") {
  const paid = payments.filter((p) => p.status === PAID_STATUS);
  const map = new Map<string, { total: number; count: number }>();
  for (const p of paid) {
    const raw = key === "provider" ? p.provider : (p.coin || "—");
    const entry = map.get(raw) ?? { total: 0, count: 0 };
    entry.total += p.amountEur;
    entry.count += 1;
    map.set(raw, entry);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total);
}

export function topPayers(payments: PaymentLike[], limit = 20) {
  const paid = payments.filter((p) => p.status === PAID_STATUS);
  const map = new Map<string, { total: number; count: number; last: Date }>();
  for (const p of paid) {
    const entry = map.get(p.user) ?? { total: 0, count: 0, last: p.createdAt };
    entry.total += p.amountEur;
    entry.count += 1;
    if (p.createdAt > entry.last) entry.last = p.createdAt;
    map.set(p.user, entry);
  }
  return [...map.entries()]
    .map(([user, v]) => ({ user, total: v.total, count: v.count, lastAt: v.last.toISOString() }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export type SubLike = { userId: string; jellyfinUsername: string; expiresAt: Date; createdAt: Date; source: string };

/** Finds operational problems that otherwise stay silent. */
export function reconciliation(
  payments: PaymentLike[],
  subs: SubLike[],
  unprocessedWebhooks: number,
  now: Date
) {
  // Finished payments whose user never got a subscription row created at/after payment.
  const subsByUser = new Map<string, SubLike[]>();
  for (const s of subs) {
    const list = subsByUser.get(s.jellyfinUsername) ?? [];
    list.push(s);
    subsByUser.set(s.jellyfinUsername, list);
  }
  const creditedMissing = payments
    .filter((p) => p.status === PAID_STATUS)
    .filter((p) => {
      const userSubs = subsByUser.get(p.user) ?? [];
      // A matching credit is a subscription created no earlier than 1 min before the payment.
      return !userSubs.some((s) => s.createdAt.getTime() >= p.createdAt.getTime() - 60_000);
    })
    .map((p) => ({ user: p.user, amountEur: p.amountEur, provider: p.provider, createdAt: p.createdAt.toISOString() }));

  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const stalePending = payments
    .filter((p) => ["waiting", "confirming", "confirmed", "partially_paid", "sending"].includes(p.status))
    .filter((p) => p.createdAt.getTime() < dayAgo)
    .map((p) => ({ user: p.user, status: p.status, provider: p.provider, createdAt: p.createdAt.toISOString() }));

  return { creditedMissing, stalePending, unprocessedWebhooks };
}

export function driftReport(jfaUsers: JfaUserDetailed[], latestExpiryByUser: Map<string, Date>, now: Date) {
  const out: Array<{ user: string; jfaExpiry: string | null; dbExpiry: string | null; deltaHours: number; disabled: boolean }> = [];
  for (const u of jfaUsers) {
    const dbExpiry = latestExpiryByUser.get(u.name.toLowerCase()) ?? null;
    const jfaExpiry = u.expiry > 0 ? new Date(u.expiry * 1000) : null;
    if (!dbExpiry && !jfaExpiry) continue;
    const jfaMs = jfaExpiry ? jfaExpiry.getTime() : 0;
    const dbMs = dbExpiry ? dbExpiry.getTime() : 0;
    const deltaHours = Math.round(Math.abs(jfaMs - dbMs) / 3_600_000);
    if (deltaHours > 24) {
      out.push({
        user: u.name,
        jfaExpiry: jfaExpiry ? jfaExpiry.toISOString() : null,
        dbExpiry: dbExpiry ? dbExpiry.toISOString() : null,
        deltaHours,
        disabled: u.disabled
      });
    }
  }
  return out.sort((a, b) => b.deltaHours - a.deltaHours);
}

export function abuseReport(jfaUsers: JfaUserDetailed[], payingUsers: Set<string>, now: Date) {
  // Multiple Jellyfin accounts sharing one Discord ID -> trial farming.
  const byDiscord = new Map<string, string[]>();
  for (const u of jfaUsers) {
    if (!u.discordId) continue;
    const list = byDiscord.get(u.discordId) ?? [];
    list.push(u.name);
    byDiscord.set(u.discordId, list);
  }
  const sharedDiscord = [...byDiscord.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([discordId, names]) => ({ discordId, accounts: names }));

  // Active (not disabled, future expiry) accounts with no finished payment on record.
  const activeUnpaid = jfaUsers
    .filter((u) => !u.disabled && u.expiry > 0 && u.expiry * 1000 > now.getTime())
    .filter((u) => !payingUsers.has(u.name.toLowerCase()))
    .map((u) => ({ user: u.name, expiry: new Date(u.expiry * 1000).toISOString() }));

  return { sharedDiscord, activeUnpaid };
}

export function expiringSoon(jfaUsers: JfaUserDetailed[], now: Date, withinDays: number) {
  const limit = now.getTime() + withinDays * 24 * 60 * 60 * 1000;
  return jfaUsers
    .filter((u) => !u.disabled && u.expiry > 0)
    .filter((u) => u.expiry * 1000 > now.getTime() && u.expiry * 1000 <= limit)
    .map((u) => ({
      user: u.name,
      expiry: new Date(u.expiry * 1000).toISOString(),
      daysLeft: Math.ceil((u.expiry * 1000 - now.getTime()) / (24 * 60 * 60 * 1000))
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// ---------------------------------------------------------------------------
// Prisma-backed wrappers
// ---------------------------------------------------------------------------

async function loadPayments(prisma: PrismaClient): Promise<PaymentLike[]> {
  const rows = await prisma.payment.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({
    provider: r.provider,
    coin: r.coin,
    amountEur: toNum(r.amountEur),
    status: r.status,
    user: r.user,
    createdAt: r.createdAt
  }));
}

export async function dashboardData(prisma: PrismaClient, now = new Date()) {
  const payments = await loadPayments(prisma);
  return {
    kpis: computeKpis(payments, now),
    monthly: monthlySeries(payments, 12, now),
    byProvider: breakdownBy(payments, "provider"),
    byCoin: breakdownBy(payments, "coin"),
    topPayers: topPayers(payments, 10)
  };
}

export async function reconciliationData(prisma: PrismaClient, now = new Date()) {
  const [payments, subRows, unprocessed] = await Promise.all([
    loadPayments(prisma),
    prisma.subscription.findMany({ include: { user: true } }),
    prisma.webhookEvent.count({ where: { processedAt: null } })
  ]);
  const subs: SubLike[] = subRows.map((s) => ({
    userId: s.userId,
    jellyfinUsername: s.user.jellyfinUsername,
    expiresAt: s.expiresAt,
    createdAt: s.startsAt,
    source: s.source
  }));
  return reconciliation(payments, subs, unprocessed, now);
}

export async function userDirectory(prisma: PrismaClient, now = new Date()) {
  const [jfaUsers, subRows, payments] = await Promise.all([
    listJfaUsersDetailed(),
    // Only active rows: a manual correction expires the superseded (later-dated)
    // rows, so restricting to active keeps the directory/drift in sync with it.
    prisma.subscription.findMany({ where: { status: "active" }, include: { user: true }, orderBy: { expiresAt: "desc" } }),
    loadPayments(prisma)
  ]);

  const latestSubByUser = new Map<string, { expiresAt: Date; source: string }>();
  for (const s of subRows) {
    const key = s.user.jellyfinUsername.toLowerCase();
    if (!latestSubByUser.has(key)) latestSubByUser.set(key, { expiresAt: s.expiresAt, source: s.source });
  }
  const revenueByUser = new Map<string, number>();
  const payingUsers = new Set<string>();
  for (const p of payments) {
    if (p.status !== PAID_STATUS) continue;
    payingUsers.add(p.user.toLowerCase());
    revenueByUser.set(p.user.toLowerCase(), (revenueByUser.get(p.user.toLowerCase()) ?? 0) + p.amountEur);
  }

  const users = jfaUsers.map((u) => {
    const sub = latestSubByUser.get(u.name.toLowerCase());
    return {
      name: u.name,
      expiry: u.expiry > 0 ? new Date(u.expiry * 1000).toISOString() : null,
      disabled: u.disabled,
      discordId: u.discordId ?? null,
      lastActive: u.lastActive ? new Date(u.lastActive * 1000).toISOString() : null,
      source: sub?.source ?? null,
      revenueEur: revenueByUser.get(u.name.toLowerCase()) ?? 0
    };
  });

  const latestExpiryByUser = new Map<string, Date>();
  for (const [k, v] of latestSubByUser) latestExpiryByUser.set(k, v.expiresAt);

  return {
    users,
    expiringSoon: expiringSoon(jfaUsers, now, 14),
    drift: driftReport(jfaUsers, latestExpiryByUser, now),
    abuse: abuseReport(jfaUsers, payingUsers, now)
  };
}

export async function userHistory(prisma: PrismaClient, username: string) {
  const name = username.trim();
  // Case-insensitive throughout: the jfa-go account name (source of the lookup)
  // and the stored jellyfinUsername/payment.user can differ in casing. Aggregate
  // subscriptions across ALL matching User rows so a split-casing account shows
  // its full history (payments/vouchers already merge across variants).
  const [users, payments, vouchers] = await Promise.all([
    prisma.user.findMany({
      where: { jellyfinUsername: { equals: name, mode: "insensitive" } },
      include: { subscriptions: true }
    }),
    prisma.payment.findMany({ where: { user: { equals: name, mode: "insensitive" } }, orderBy: { createdAt: "desc" } }),
    prisma.voucherRedemption.findMany({ where: { user: { equals: name, mode: "insensitive" } }, orderBy: { createdAt: "desc" } })
  ]);
  const subscriptions = users
    .flatMap((u) => u.subscriptions)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return {
    username: name,
    subscriptions: subscriptions.map((s) => ({
      plan: s.plan,
      source: s.source,
      startsAt: s.startsAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      status: s.status
    })),
    payments: payments.map((p) => ({
      provider: p.provider,
      coin: p.coin,
      amountEur: toNum(p.amountEur),
      status: p.status,
      orderId: p.orderId,
      createdAt: p.createdAt.toISOString()
    })),
    vouchers: vouchers.map((v) => ({
      status: v.status,
      valueEur: toNum(v.valueEur),
      txRef: v.txRef,
      createdAt: v.createdAt.toISOString()
    }))
  };
}
