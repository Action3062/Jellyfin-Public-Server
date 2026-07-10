import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.string().default("development"),
    PORT: z.coerce.number().default(4000),
    PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
    API_PUBLIC_BASE_URL: z.string().url().default("http://localhost:4000"),
    SHOP_NAME: z.string().default("Arkiv3"),
    SHOP_DISCORD_URL: z.string().default(""),
    NOWPAYMENTS_API_KEY: z.string().default(""),
    NOWPAYMENTS_IPN_SECRET: z.string().default(""),
    NOWPAYMENTS_BASE_URL: z.string().url().default("https://api.nowpayments.io/v1"),
    AZTECO_RESELLER_API_BASE: z.string().default(""),
    AZTECO_RESELLER_API_KEY: z.string().default(""),
    AZTECO_CLIENT_MODE: z.enum(["mock", "real"]).default("mock"),
    // jfa-go issues 20-minute JWTs via GET /token/login (Basic auth); there is
    // no long-lived static API key, so the portal logs in with credentials.
    JFA_GO_BASE_URL: z.string().url().default("http://jfa-go:8056"),
    JFA_GO_USERNAME: z.string().default(""),
    JFA_GO_PASSWORD: z.string().default(""),
    // Public URL of the jfa-go instance used to build invite links shown to
    // customers (falls back to JFA_GO_BASE_URL, which is usually internal).
    JFA_GO_EXTERNAL_URL: z.string().default(""),
    JFA_GO_DEFAULT_PROFILE: z.string().default(""),
    // How long a post-payment registration invite stays valid.
    INVITE_VALIDITY_DAYS: z.coerce.number().int().min(1).default(7),
    JELLYFIN_BASE_URL: z.string().default(""),
    JELLYFIN_API_KEY: z.string().default(""),
    PLEX_TOKEN: z.string().default(""),
    PLEX_SERVER_NAME: z.string().default(""),
    DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/payment_portal"),
    REDIS_URL: z.string().default("redis://localhost:6379")
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.NOWPAYMENTS_API_KEY && !env.NOWPAYMENTS_IPN_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NOWPAYMENTS_IPN_SECRET"],
        message: "NOWPAYMENTS_IPN_SECRET is required in production when NOWPAYMENTS_API_KEY is set — without it, forged webhooks could activate subscriptions."
      });
    }
  });

export const config = schema.parse(process.env);
export const jfaGoConfigured = Boolean(config.JFA_GO_USERNAME && config.JFA_GO_PASSWORD);
