import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
  API_PUBLIC_BASE_URL: z.string().url().default("http://localhost:4000"),
  SHOP_NAME: z.string().default("<<< SHOP_NAME >>>"),
  SHOP_DISCORD_URL: z.string().default("<<< DISCORD_INVITE_URL >>>"),
  NOWPAYMENTS_API_KEY: z.string().default(""),
  NOWPAYMENTS_IPN_SECRET: z.string().default(""),
  NOWPAYMENTS_BASE_URL: z.string().url().default("https://api.nowpayments.io/v1"),
  AZTECO_RESELLER_API_BASE: z.string().default(""),
  AZTECO_RESELLER_API_KEY: z.string().default(""),
  AZTECO_CLIENT_MODE: z.enum(["mock", "real"]).default("mock"),
  JFA_GO_BASE_URL: z.string().url().default("http://jfa-go:8056"),
  JFA_GO_TOKEN: z.string().default(""),
  JFA_GO_DEFAULT_PROFILE: z.string().default(""),
  JELLYFIN_BASE_URL: z.string().default(""),
  JELLYFIN_API_KEY: z.string().default(""),
  PLEX_TOKEN: z.string().default(""),
  PLEX_SERVER_NAME: z.string().default(""),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/payment_portal"),
  REDIS_URL: z.string().default("redis://localhost:6379")
});

export const config = schema.parse(process.env);
