export const defaultPlans = [
  { id: "hd_1m", product: "hd", label: "1 Month", price_eur: 12.99, months: 1, icon: "🎬", popular: false },
  { id: "hd_3m", product: "hd", label: "3 Months", price_eur: 34.99, months: 3, icon: "🎬", popular: false },
  { id: "hd_12m", product: "hd", label: "Yearly", price_eur: 99.99, months: 12, icon: "🎬", popular: true }
] as const;

export const aztecoOptions = {
  hd: [
    { eur: 25, days: 53, label_en: "€25 · 53 days", label_de: "25 € · 53 Tage" },
    { eur: 50, days: 106, label_en: "€50 · 106 days", label_de: "50 € · 106 Tage" },
    { eur: 75, days: 159, label_en: "€75 · 159 days", label_de: "75 € · 159 Tage" },
    { eur: 100, days: 335, label_en: "€100 · ~335 days", label_de: "100 € · ~335 Tage" }
  ]
};

export const supportedCoins = ["btc", "eth", "ltc", "usdc", "usdterc20", "sol", "xmr", "trx"] as const;
