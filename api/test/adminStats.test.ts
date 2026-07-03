import { describe, expect, it } from "vitest";
import {
  abuseReport,
  breakdownBy,
  computeKpis,
  driftReport,
  expiringSoon,
  monthlySeries,
  reconciliation,
  topPayers,
  type PaymentLike,
  type SubLike
} from "../src/services/adminStats.js";
import type { JfaUserDetailed } from "../src/services/jfago.js";

const NOW = new Date("2026-07-02T12:00:00.000Z");
const day = (iso: string) => new Date(iso);

function pay(partial: Partial<PaymentLike>): PaymentLike {
  return { provider: "nowpayments", coin: "btc", amountEur: 10, status: "finished", user: "alice", createdAt: NOW, ...partial };
}

describe("computeKpis", () => {
  const payments: PaymentLike[] = [
    pay({ amountEur: 10, createdAt: NOW }),                               // today
    pay({ amountEur: 20, createdAt: day("2026-06-20T00:00:00Z") }),      // in 30d + year
    pay({ amountEur: 30, createdAt: day("2026-01-05T00:00:00Z") }),      // year only
    pay({ amountEur: 99, createdAt: day("2025-12-01T00:00:00Z") }),      // last year
    pay({ amountEur: 50, status: "waiting", createdAt: NOW })            // not paid -> ignored
  ];
  it("sums only finished payments across windows", () => {
    const k = computeKpis(payments, NOW);
    expect(k.today).toBe(10);
    expect(k.last30).toBe(30);   // 10 today + 20 on Jun 20
    expect(k.year).toBe(60);     // 10 + 20 + 30
    expect(k.total).toBe(159);   // 10 + 20 + 30 + 99
    expect(k.count).toBe(4);
    expect(k.avg).toBeCloseTo(159 / 4);
  });
});

describe("monthlySeries", () => {
  it("buckets by month and splits by provider", () => {
    const payments = [
      pay({ amountEur: 10, provider: "nowpayments", createdAt: day("2026-07-01T00:00:00Z") }),
      pay({ amountEur: 5, provider: "azteco", createdAt: day("2026-07-02T00:00:00Z") }),
      pay({ amountEur: 7, provider: "manual", createdAt: day("2026-06-15T00:00:00Z") })
    ];
    const series = monthlySeries(payments, 3, NOW);
    expect(series).toHaveLength(3);
    const july = series[series.length - 1];
    expect(july.month).toBe("2026-07");
    expect(july.total).toBe(15);
    expect(july.nowpayments).toBe(10);
    expect(july.azteco).toBe(5);
    const june = series[series.length - 2];
    expect(june.manual).toBe(7);
  });
});

describe("breakdownBy / topPayers", () => {
  const payments = [
    pay({ user: "alice", amountEur: 10, provider: "nowpayments" }),
    pay({ user: "bob", amountEur: 40, provider: "azteco" }),
    pay({ user: "alice", amountEur: 20, provider: "nowpayments" })
  ];
  it("aggregates provider revenue sorted desc", () => {
    const b = breakdownBy(payments, "provider");
    expect(b[0]).toMatchObject({ name: "azteco", total: 40 });
    expect(b[1]).toMatchObject({ name: "nowpayments", total: 30, count: 2 });
  });
  it("ranks payers by lifetime revenue", () => {
    const top = topPayers(payments);
    expect(top[0]).toMatchObject({ user: "bob", total: 40 });
    expect(top[1]).toMatchObject({ user: "alice", total: 30, count: 2 });
  });
});

describe("reconciliation", () => {
  it("flags finished payments without a matching subscription", () => {
    const payments = [
      pay({ user: "paid", amountEur: 10, createdAt: day("2026-06-01T00:00:00Z") }),
      pay({ user: "missing", amountEur: 10, createdAt: day("2026-06-01T00:00:00Z") }),
      pay({ user: "stale", status: "waiting", createdAt: day("2026-06-01T00:00:00Z") }),
      // A payment stuck at "confirmed" (on-chain confirmed but never finished) must also surface.
      pay({ user: "stuck", status: "confirmed", createdAt: day("2026-06-01T00:00:00Z") }),
      // Recent pending must NOT surface (only >24h old).
      pay({ user: "fresh", status: "waiting", createdAt: NOW })
    ];
    const subs: SubLike[] = [
      { userId: "1", jellyfinUsername: "paid", expiresAt: NOW, createdAt: day("2026-06-01T00:05:00Z"), source: "manual" }
    ];
    const r = reconciliation(payments, subs, 2, NOW);
    expect(r.creditedMissing.map((c) => c.user)).toEqual(["missing"]);
    expect(r.stalePending.map((c) => c.user).sort()).toEqual(["stale", "stuck"]);
    expect(r.unprocessedWebhooks).toBe(2);
  });
});

describe("driftReport", () => {
  it("reports only mismatches over 24h", () => {
    const users: JfaUserDetailed[] = [
      { id: "1", name: "aligned", expiry: Math.floor(NOW.getTime() / 1000), disabled: false },
      { id: "2", name: "drifted", expiry: Math.floor(day("2026-08-01T00:00:00Z").getTime() / 1000), disabled: false }
    ];
    const db = new Map<string, Date>([
      ["aligned", NOW],
      ["drifted", day("2026-07-01T00:00:00Z")]
    ]);
    const drift = driftReport(users, db, NOW);
    expect(drift).toHaveLength(1);
    expect(drift[0].user).toBe("drifted");
    expect(drift[0].deltaHours).toBeGreaterThan(24);
  });
});

describe("abuseReport / expiringSoon", () => {
  const users: JfaUserDetailed[] = [
    { id: "1", name: "acc1", expiry: Math.floor(day("2026-07-05T00:00:00Z").getTime() / 1000), disabled: false, discordId: "d1" },
    { id: "2", name: "acc2", expiry: Math.floor(day("2026-07-20T00:00:00Z").getTime() / 1000), disabled: false, discordId: "d1" },
    { id: "3", name: "paidacc", expiry: Math.floor(day("2026-07-06T00:00:00Z").getTime() / 1000), disabled: false }
  ];
  it("detects shared discord ids and unpaid active accounts", () => {
    const paying = new Set(["paidacc"]);
    const r = abuseReport(users, paying, NOW);
    expect(r.sharedDiscord).toHaveLength(1);
    expect(r.sharedDiscord[0].accounts.sort()).toEqual(["acc1", "acc2"]);
    expect(r.activeUnpaid.map((u) => u.user).sort()).toEqual(["acc1", "acc2"]);
  });
  it("lists accounts expiring within the window sorted by days left", () => {
    const soon = expiringSoon(users, NOW, 14);
    expect(soon.map((u) => u.user)).toEqual(["acc1", "paidacc"]); // acc2 is >14d out
    expect(soon[0].daysLeft).toBeLessThanOrEqual(soon[1].daysLeft);
  });
});
