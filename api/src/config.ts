import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.string().default("development"),
    PORT: z.coerce.number().default(4000),
    PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
    API_PUBLIC_BASE_URL: z.string().url().default("http://localhost:4000"),
    SHOP_NAME: z.string().default("Byteflix"),
    SHOP_DISCORD_URL: z.string().default(""),
    NOWPAYMENTS_API_KEY: z.string().default(""),
    NOWPAYMENTS_IPN_SECRET: z.string().default(""),
    NOWPAYMENTS_BASE_URL: z.string().url().default("https://api.nowpayments.io/v1"),
    AZTECO_RESELLER_API_BASE: z.string().default(""),
    AZTECO_RESELLER_API_KEY: z.string().default(""),
    AZTECO_CLIENT_MODE: z.enum(["mock", "real"]).default("mock"),
    // Master switch: voucher redemption is rejected while disabled.
    AZTECO_ENABLED: z
      .string()
      .default("false")
      .transform((value) => value === "true"),
    // jfa-go issues 20-minute JWTs via GET /token/login (Basic auth); there is
    // no long-lived static API key, so the portal logs in with credentials.
    JFA_GO_BASE_URL: z.string().url().default("http://jfa-go:8056"),
    JFA_GO_USERNAME: z.string().default(""),
    JFA_GO_PASSWORD: z.string().default(""),
    JFA_GO_DEFAULT_PROFILE: z.string().default(""),
    JELLYFIN_BASE_URL: z.string().default(""),
    JELLYFIN_API_KEY: z.string().default(""),
    // Customer-facing Jellyfin URL, shown as "log in now" after registration.
    JELLYFIN_PUBLIC_URL: z.string().default(""),
    PLEX_TOKEN: z.string().default(""),
    PLEX_SERVER_NAME: z.string().default(""),
    DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/payment_portal"),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    // Admin panel (all three required for /admin to accept logins).
    ADMIN_USERNAME: z.string().default(""),
    ADMIN_PASSWORD: z.string().default(""),
    ADMIN_SESSION_SECRET: z.string().default(""),
    // Shared secret the Discord bot sends (Bearer) on write endpoints
    // (heartbeat/report/command-ack). Empty = bot write endpoints disabled.
    BOT_API_SECRET: z.string().default(""),
    // Signs customer dashboard sessions (Jellyfin-credential login). Falls
    // back to a value derived from ADMIN_SESSION_SECRET, or an ephemeral
    // boot-time secret in development.
    MEMBER_SESSION_SECRET: z.string().default("")
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

// Accept JFA_GO_USER as an alias for JFA_GO_USERNAME so existing production
// .env files (which predate the rename) keep working unchanged.
export const config = schema.parse({
  ...process.env,
  JFA_GO_USERNAME: process.env.JFA_GO_USERNAME || process.env.JFA_GO_USER || ""
});
export const jfaGoConfigured = Boolean(config.JFA_GO_USERNAME && config.JFA_GO_PASSWORD);

import crypto from "node:crypto";
// Member sessions must never verify against the admin secret (and vice
// versa), so derive a distinct one when no dedicated secret is set.
export const memberSessionSecret =
  config.MEMBER_SESSION_SECRET ||
  (config.ADMIN_SESSION_SECRET
    ? crypto.createHash("sha256").update(`${config.ADMIN_SESSION_SECRET}:member`).digest("hex")
    : crypto.randomBytes(32).toString("hex"));
