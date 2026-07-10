import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { Prisma, PrismaClient, type Payment } from "@prisma/client";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { nanoid } from "nanoid";
import { z } from "zod";
import { config } from "./config.js";
import { aztecoOptions, defaultPlans, findPlan, supportedCoins } from "./data/defaults.js";
import { sha256, timingSafeEqual } from "./lib/hash.js";
import { createAztecoClient } from "./services/azteco.js";
import { checkJellyfinUser } from "./services/jfago.js";
import { createNowPaymentsInvoice, getNowPaymentsStatus, verifyNowPaymentsIpn } from "./services/nowpayments.js";
import { fulfillPayment, reconcileRegistration } from "./services/provisioning.js";

const prisma = new PrismaClient();

function redisConnection(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: parsed.pathname ? Number(parsed.pathname.slice(1) || 0) : 0,
    maxRetriesPerRequest: null
  };
}

const connection = redisConnection(config.REDIS_URL);
const provisioningQueue = new Queue("provisioning", { connection });
const aztecoClient = createAztecoClient();

new Worker(
  "provisioning",
  async (job) => {
    if (job.name === "fulfill") await fulfillPayment(prisma, job.data.orderId);
  },
  { connection }
);

const app = Fastify({ logger: true });
await app.register(helmet);
await app.register(cors, {
  origin: config.NODE_ENV === "production" ? [config.PUBLIC_BASE_URL] : true
});
const mockMode = config.NODE_ENV !== "production" && !config.NOWPAYMENTS_API_KEY;
await app.register(rateLimit, {
  max: 90,
  timeWindow: "1 minute",
  // Local mock mode only (dev/e2e): don't throttle the test loopback.
  allowList: mockMode ? ["127.0.0.1", "::1"] : []
});

/** Enqueue fulfillment; fall back to inline fulfillment if Redis is down. */
async function scheduleFulfillment(orderId: string) {
  try {
    await provisioningQueue.add(
      "fulfill",
      { orderId },
      { jobId: orderId, attempts: 5, backoff: { type: "exponential", delay: 30000 } }
    );
  } catch (error) {
    app.log.error({ err: error, orderId }, "queue unavailable, fulfilling inline");
    await fulfillPayment(prisma, orderId);
  }
}

function newClaimToken() {
  // ~190 bits of entropy; only the sha256 hash is stored at rest.
  return nanoid(32);
}

// NOWPayments status vocabulary (verified against official docs/SDK):
// "finished" is the ONLY success state — "confirmed" means enough blockchain
// confirmations, funds are NOT yet in the merchant wallet. "partially_paid"
// is terminal-ish (funds arrived but below price) and needs manual handling.
const SUCCESS_STATUSES = new Set(["finished"]);
const FAILED_STATUSES = new Set(["failed", "expired", "refunded", "cancelled", "canceled"]);

function paymentPhase(status: string): "paid" | "failed" | "underpaid" | "pending" {
  if (SUCCESS_STATUSES.has(status)) return "paid";
  if (FAILED_STATUSES.has(status)) return "failed";
  if (status === "partially_paid") return "underpaid";
  return "pending";
}

function serializeOrder(payment: Payment) {
  const plan = findPlan(payment.planId);
  return {
    order_id: payment.orderId,
    provider: payment.provider,
    payment_status: payment.status,
    payment_phase: paymentPhase(payment.status),
    provision_state: payment.provisionState,
    account_mode: payment.accountMode,
    amount_eur: Number(payment.amountEur),
    coin: payment.coin,
    plan: plan
      ? { id: plan.id, label_de: plan.label_de, label_en: plan.label_en, months: plan.months }
      : { id: payment.planId || payment.product, label_de: payment.product, label_en: payment.product, months: payment.months || 0 },
    days: payment.days,
    invoice_url: payment.invoiceUrl,
    invite_url: payment.inviteUrl,
    plex_state: payment.plexState,
    provisioned_at: payment.provisionedAt?.toISOString() || null,
    created_at: payment.createdAt.toISOString()
  };
}

async function findAuthorizedPayment(orderId: string, claimToken: string | undefined): Promise<Payment | null> {
  if (!claimToken || claimToken.length < 16 || claimToken.length > 128) return null;
  const payment = await prisma.payment.findUnique({ where: { orderId } });
  if (!payment?.claimTokenHash) return null;
  if (!timingSafeEqual(sha256(claimToken), payment.claimTokenHash)) return null;
  return payment;
}

app.get("/health", async () => ({ ok: true, shop: config.SHOP_NAME }));

app.get("/pay/api/products", async () => defaultPlans);

app.get("/pay/api/azteco/options", async () => aztecoOptions);

app.post("/pay/api/user/check", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request) => {
  const body = z.object({ username: z.string().min(1).max(80) }).parse(request.body);
  return { exists: await checkJellyfinUser(body.username.trim()) };
});

const checkoutIdentity = z.object({
  account_mode: z.enum(["existing", "new"]).default("existing"),
  jellyfin_username: z.string().min(1).max(80).optional(),
  // Legacy field name: carried the Jellyfin username by design.
  discord_user: z.string().min(1).max(80).optional(),
  plex_username: z.string().min(1).max(120).optional()
});

function resolveUsername(body: z.infer<typeof checkoutIdentity>) {
  return (body.jellyfin_username || body.discord_user || "").trim();
}

app.post("/pay/api/nowpayments/create", async (request, reply) => {
  const body = z
    .object({
      plan_id: z.string().optional(),
      tier_id: z.string().optional(),
      coin: z.enum(supportedCoins)
    })
    .and(checkoutIdentity)
    .parse(request.body);
  const plan = findPlan(body.plan_id || body.tier_id);
  if (!plan) return reply.code(400).send({ error: "unknown plan" });

  const username = resolveUsername(body);
  if (body.account_mode === "existing") {
    if (!username) return reply.code(400).send({ error: "jellyfin_username required" });
    const exists = await checkJellyfinUser(username);
    if (!exists) return reply.code(400).send({ error: "jellyfin user not found — choose \"new account\" instead" });
  }

  const orderId = `np_${nanoid(18)}`;
  const claimToken = newClaimToken();
  const invoice = await createNowPaymentsInvoice({
    orderId,
    priceEur: plan.price_eur,
    coin: body.coin,
    description: `${config.SHOP_NAME} ${plan.label_en}`
  });
  await prisma.payment.create({
    data: {
      provider: "nowpayments",
      providerRef: invoice.invoice_id,
      orderId,
      coin: body.coin,
      amountEur: plan.price_eur,
      status: "waiting",
      planId: plan.id,
      months: plan.months,
      accountMode: body.account_mode,
      user: body.account_mode === "existing" ? username : null,
      plexUsername: plan.includes_plex && body.plex_username ? body.plex_username.trim() : null,
      plexState: plan.includes_plex && body.plex_username ? "pending" : "none",
      claimTokenHash: sha256(claimToken),
      invoiceUrl: invoice.invoice_url,
      product: plan.product
    }
  });
  return {
    order_id: orderId,
    claim_token: claimToken,
    invoice_id: invoice.invoice_id,
    invoice_url: invoice.invoice_url,
    price_eur: plan.price_eur,
    pay_currency: body.coin
  };
});

app.get("/pay/api/order/:orderId", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
  const params = z.object({ orderId: z.string().min(4).max(64) }).parse(request.params);
  const header = request.headers["x-claim-token"];
  const token = Array.isArray(header) ? header[0] : header;
  let payment = await findAuthorizedPayment(params.orderId, token);
  if (!payment) return reply.code(404).send({ error: "not found" });

  // Reconciliation poll: IPN retries are finite, so pending crypto payments
  // are re-checked against NOWPayments while the customer watches the page.
  if (payment.provider === "nowpayments" && paymentPhase(payment.status) === "pending" && payment.npPaymentId) {
    const remote = await getNowPaymentsStatus(payment.npPaymentId).catch(() => null);
    if (remote && remote.payment_status !== payment.status) {
      payment = await prisma.payment.update({
        where: { id: payment.id },
        data: { status: remote.payment_status }
      });
      if (SUCCESS_STATUSES.has(remote.payment_status)) await scheduleFulfillment(payment.orderId);
    }
  }

  if (payment.provisionState === "awaiting_registration") {
    payment = await reconcileRegistration(prisma, payment);
  }
  return serializeOrder(payment);
});

app.post("/pay/api/azteco/redeem", { config: { rateLimit: { max: 8, timeWindow: "10 minutes" } } }, async (request, reply) => {
  const body = z
    .object({
      code: z.string().regex(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/),
      product: z.string().default("hd")
    })
    .and(checkoutIdentity)
    .parse(request.body);

  const username = resolveUsername(body);
  if (body.account_mode === "existing") {
    if (!username) return reply.code(400).send({ error: "jellyfin_username required" });
    const exists = await checkJellyfinUser(username);
    if (!exists) return reply.code(400).send({ error: "jellyfin user not found — choose \"new account\" instead" });
  }

  const codeHash = sha256(body.code);
  const existing = await prisma.voucherRedemption.findUnique({ where: { codeHash } });
  if (existing?.status === "redeemed") return reply.code(409).send({ value_eur: 0, error: "already redeemed" });
  if (existing?.status === "in_progress") return reply.code(409).send({ value_eur: 0, error: "in progress (bis zu 10 Min)" });

  await prisma.voucherRedemption.upsert({
    where: { codeHash },
    create: { codeHash, status: "in_progress", valueEur: 0, user: username || null, product: body.product },
    update: { status: "in_progress" }
  });

  let result;
  try {
    result = await aztecoClient.redeem(body.code);
  } catch (error) {
    // Release the lock on unexpected errors so the customer can retry.
    await prisma.voucherRedemption.delete({ where: { codeHash } }).catch(() => null);
    throw error;
  }

  if (result.status !== "redeemed") {
    const message =
      result.status === "already_redeemed"
        ? "already redeemed"
        : result.status === "in_progress"
          ? "in progress (bis zu 10 Min)"
          : "code invalid";
    await prisma.voucherRedemption.update({
      where: { codeHash },
      data: { status: result.status, valueEur: 0, txRef: result.tx_ref }
    });
    return reply.code(400).send({ value_eur: 0, error: message });
  }

  const option = aztecoOptions.hd.find((item) => item.eur === result.value_eur);
  if (!option) return reply.code(400).send({ value_eur: 0, error: "unsupported voucher amount" });

  await prisma.voucherRedemption.update({
    where: { codeHash },
    data: { status: "redeemed", valueEur: result.value_eur, txRef: result.tx_ref, user: username || null }
  });

  const orderId = `az_${nanoid(18)}`;
  const claimToken = newClaimToken();
  await prisma.payment.create({
    data: {
      provider: "azteco",
      providerRef: result.tx_ref,
      orderId,
      amountEur: result.value_eur,
      status: "finished",
      days: option.days,
      accountMode: body.account_mode,
      user: body.account_mode === "existing" ? username : null,
      plexUsername: option.includes_plex && body.plex_username ? body.plex_username.trim() : null,
      plexState: option.includes_plex && body.plex_username ? "pending" : "none",
      claimTokenHash: sha256(claimToken),
      product: body.product
    }
  });

  // Azteco redemption is synchronous — fulfill inline so new customers get
  // their invite link in the response; the queue is the retry safety net.
  let inviteUrl: string | null = null;
  try {
    const fulfilled = await fulfillPayment(prisma, orderId);
    inviteUrl = fulfilled?.inviteUrl || null;
  } catch (error) {
    app.log.error({ err: error, orderId }, "inline azteco fulfillment failed, scheduling retry");
    await scheduleFulfillment(orderId);
  }

  return { value_eur: result.value_eur, order_id: orderId, claim_token: claimToken, invite_url: inviteUrl };
});

app.post("/pay/api/dashboard", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
  const body = z.object({ token: z.string().min(16).max(128) }).parse(request.body);
  const tokenHash = sha256(body.token);
  let payment = await prisma.payment.findFirst({ where: { claimTokenHash: tokenHash } });
  if (!payment) return reply.code(404).send({ error: "not found" });

  if (payment.provisionState === "awaiting_registration") {
    payment = await reconcileRegistration(prisma, payment);
  }

  const user = payment.userId
    ? await prisma.user.findUnique({ where: { id: payment.userId } })
    : payment.user
      ? await prisma.user.findUnique({ where: { jellyfinUsername: payment.user } })
      : null;

  if (!user) {
    return {
      registered: false,
      order: serializeOrder(payment)
    };
  }

  const subscriptions = await prisma.subscription.findMany({
    where: { userId: user.id },
    orderBy: { expiresAt: "desc" }
  });
  const latest = subscriptions[0] || null;
  const now = new Date();
  const active = Boolean(latest && latest.expiresAt > now);
  const history = await prisma.payment.findMany({
    where: { OR: [{ userId: user.id }, { user: user.jellyfinUsername }] },
    orderBy: { createdAt: "desc" },
    take: 12
  });

  const name = user.jellyfinUsername;
  const masked = name.length <= 3 ? `${name[0]}**` : `${name.slice(0, 2)}${"*".repeat(Math.min(6, name.length - 3))}${name.slice(-1)}`;

  return {
    registered: true,
    username_masked: masked,
    active,
    expires_at: latest?.expiresAt.toISOString() || null,
    days_left: latest ? Math.max(0, Math.ceil((latest.expiresAt.getTime() - now.getTime()) / 86400000)) : 0,
    plan: latest ? findPlan(latest.plan)?.label_en || latest.plan : null,
    plan_id: latest?.plan || null,
    source: latest?.source || null,
    history: history.map((item) => ({
      date: item.createdAt.toISOString(),
      amount_eur: Number(item.amountEur),
      method: item.provider,
      status: item.status,
      provision_state: item.provisionState
    }))
  };
});

app.post("/api/webhooks/nowpayments", async (request, reply) => {
  const payload = request.body as Prisma.InputJsonObject;
  const sig = request.headers["x-nowpayments-sig"];
  const signature = Array.isArray(sig) ? sig[0] : sig;
  if (!verifyNowPaymentsIpn(payload, signature)) return reply.code(403).send({ error: "invalid signature" });

  const orderId = String(payload.order_id || "");
  const paymentStatus = String(payload.payment_status || "waiting");
  // NOWPayments sends one IPN per status change, all sharing the same
  // payment_id — the event identity must include the status, otherwise the
  // "finished" notification is dropped as a duplicate of "waiting".
  const paymentId = String(payload.payment_id || payload.invoice_id || payload.order_id || nanoid());
  const eventId = `${paymentId}:${paymentStatus}`;

  await prisma.webhookEvent.upsert({
    where: { provider_eventId: { provider: "nowpayments", eventId } },
    update: { payload },
    create: { provider: "nowpayments", eventId, payload }
  });
  // Atomically claim the event: only one concurrent delivery wins the update.
  const claimed = await prisma.webhookEvent.updateMany({
    where: { provider: "nowpayments", eventId, processedAt: null },
    data: { processedAt: new Date() }
  });
  if (claimed.count === 0) return { ok: true, duplicate: true };

  try {
    if (orderId) {
      const payment = await prisma.payment
        .update({
          where: { orderId },
          data: { status: paymentStatus, npPaymentId: payload.payment_id ? String(payload.payment_id) : undefined }
        })
        .catch(() => null);
      if (!payment) {
        app.log.warn({ orderId, paymentStatus }, "IPN for unknown order");
      } else if (SUCCESS_STATUSES.has(paymentStatus)) {
        // Validate the paid amount/currency against our records before
        // granting access (mirrors the official plugin's checks).
        const priceAmount = Number(payload.price_amount ?? NaN);
        const priceCurrency = String(payload.price_currency || "").toLowerCase();
        const amountOk = Number.isFinite(priceAmount) && Math.abs(priceAmount - Number(payment.amountEur)) < 0.01;
        const currencyOk = !priceCurrency || priceCurrency === "eur";
        if (!amountOk || !currencyOk) {
          app.log.error({ orderId, priceAmount, priceCurrency, expected: Number(payment.amountEur) }, "IPN amount mismatch — NOT provisioning");
        } else {
          await scheduleFulfillment(orderId);
        }
      }
    }
  } catch (error) {
    // Release the claim so the provider's retry can reprocess the event.
    await prisma.webhookEvent
      .updateMany({ where: { provider: "nowpayments", eventId }, data: { processedAt: null } })
      .catch(() => null);
    throw error;
  }
  return { ok: true };
});

// Development helper: simulate a completed NOWPayments payment for an order.
// Only mounted when no real API key is configured and never in production.
if (mockMode) {
  app.post("/pay/api/dev/simulate-payment", async (request, reply) => {
    const body = z.object({ order_id: z.string() }).parse(request.body);
    const payment = await prisma.payment
      .update({ where: { orderId: body.order_id }, data: { status: "finished" } })
      .catch(() => null);
    if (!payment) return reply.code(404).send({ error: "not found" });
    await fulfillPayment(prisma, body.order_id);
    return { ok: true };
  });
}

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  if (error instanceof z.ZodError) return reply.code(400).send({ error: error.issues[0]?.message || "invalid input" });
  if (config.NODE_ENV === "production") return reply.code(500).send({ error: "server error" });
  return reply.code(500).send({ error: error.message || "server error" });
});

app.listen({ port: config.PORT, host: "0.0.0.0" });
