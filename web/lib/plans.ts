export type Plan = {
  id: string;
  product: string;
  label: string;
  label_de?: string;
  label_en?: string;
  price_eur: number;
  months: number;
  icon: string;
  popular: boolean;
  includes_plex?: boolean;
};

export type AztecoOption = {
  eur: number;
  days: number;
  label_en: string;
  label_de: string;
};

export const defaultPlans: Plan[] = [
  { id: "hd_1m", product: "hd", label: "1 Month", label_de: "1 Monat", label_en: "1 Month", price_eur: 12.99, months: 1, icon: "🎬", popular: false, includes_plex: false },
  { id: "hd_3m", product: "hd", label: "3 Months", label_de: "3 Monate", label_en: "3 Months", price_eur: 34.99, months: 3, icon: "🎬", popular: false, includes_plex: false },
  { id: "hd_12m", product: "hd", label: "12 Months", label_de: "12 Monate", label_en: "12 Months", price_eur: 99.99, months: 12, icon: "🎬", popular: true, includes_plex: true }
];

export const defaultAztecoOptions: AztecoOption[] = [
  { eur: 25, days: 53, label_en: "€25 · 53 days", label_de: "25 € · 53 Tage" },
  { eur: 50, days: 106, label_en: "€50 · 106 days", label_de: "50 € · 106 Tage" },
  { eur: 75, days: 159, label_en: "€75 · 159 days", label_de: "75 € · 159 Tage" },
  { eur: 100, days: 335, label_en: "€100 · ~335 days", label_de: "100 € · ~335 Tage" }
];

export const coins = [
  { id: "btc", label: "BTC" },
  { id: "eth", label: "ETH" },
  { id: "ltc", label: "LTC" },
  { id: "usdc", label: "USDC" },
  { id: "usdterc20", label: "USDT" },
  { id: "sol", label: "SOL" },
  { id: "xmr", label: "XMR" },
  { id: "trx", label: "TRX" }
];
