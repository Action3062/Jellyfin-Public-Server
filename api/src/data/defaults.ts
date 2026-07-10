export const defaultPlans = [
  {
    id: "hd_1m",
    product: "hd",
    label: "1 Month",
    label_de: "1 Monat",
    label_en: "1 Month",
    price_eur: 12.99,
    months: 1,
    icon: "🎬",
    popular: false,
    includes_plex: false
  },
  {
    id: "hd_3m",
    product: "hd",
    label: "3 Months",
    label_de: "3 Monate",
    label_en: "3 Months",
    price_eur: 34.99,
    months: 3,
    icon: "🎬",
    popular: false,
    includes_plex: false
  },
  {
    id: "hd_12m",
    product: "hd",
    label: "12 Months",
    label_de: "12 Monate",
    label_en: "12 Months",
    price_eur: 99.99,
    months: 12,
    icon: "🎬",
    popular: true,
    includes_plex: true
  }
] as const;

export type PlanRecord = (typeof defaultPlans)[number];

export function findPlan(planId: string | null | undefined): PlanRecord | undefined {
  return defaultPlans.find((item) => item.id === planId);
}

export const aztecoOptions = {
  hd: [
    { eur: 25, days: 53, label_en: "€25 · 53 days", label_de: "25 € · 53 Tage", includes_plex: false },
    { eur: 50, days: 106, label_en: "€50 · 106 days", label_de: "50 € · 106 Tage", includes_plex: false },
    { eur: 75, days: 159, label_en: "€75 · 159 days", label_de: "75 € · 159 Tage", includes_plex: false },
    { eur: 100, days: 335, label_en: "€100 · ~335 days", label_de: "100 € · ~335 Tage", includes_plex: true }
  ]
};

export const supportedCoins = ["btc", "eth", "ltc", "usdc", "usdterc20", "sol", "xmr", "trx"] as const;
