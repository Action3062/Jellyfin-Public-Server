import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { Prisma, PrismaClient } from "@prisma/client";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { nanoid } from "nanoid";
import { z } from "zod";
import { config } from "./config.js";
import { aztecoOptions, defaultPlans, supportedCoins } from "./data/defaults.js";
import { sha256 } from "./lib/hash.js";
import { safeEqual, signAdminToken, verifyAdminToken } from "./lib/adminToken.js";
import { createAztecoClient } from "./services/azteco.js";
import { checkJellyfinUser } from "./services/jfago.js";
import { createNowPaymentsInvoice, verifyNowPaymentsIpn } from "./services/nowpayments.js";
import { invitePlexUser } from "./services/plex.js";
import { provisionDays, provisionManual, provisionMonths } from "./services/provisioning.js";

const adminConfigured = Boolean(config.ADMIN_USERNAME && config.ADMIN_PASSWORD && config.ADMIN_SESSION_SECRET);

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

new Worker("provisioning", async (job) => {
  if (job.name === "nowpayments") {
    const payment = await prisma.payment.findUnique({ where: { orderId: job.data.orderId } });
    const plan = defaultPlans.find((item) => item.id === job.data.planId);
    if (!payment || !plan || payment.status !== "finished") return;
    await provisionMonths(prisma, payment.user, plan.product, plan.id, plan.months);
  }
  if (job.name === "azteco") {
    await provisionDays(prisma, job.data.username, job.data.product, job.data.days);
  }
}, { connection });

const app = Fastify({ logger: true });
await app.register(helmet);
// Restrict CORS to the configured web origin. Server-to-server requests (Next
// proxy, NowPayments IPN) carry no Origin header and are unaffected.
await app.register(cors, { origin: config.PUBLIC_BASE_URL });
await app.register(rateLimit, { max: 90, timeWindow: "1 minute" });

function serializePlan(plan: typeof defaultPlans[number]) {
  return plan;
}

app.get("/health", async () => ({ ok: true, shop: config.SHOP_NAME }));

app.get("/pay/api/products", async () => defaultPlans.map(serializePlan));

app.get("/pay/api/azteco/options", async () => aztecoOptions);

app.post("/pay/api/user/check", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request) => {
  const body = z.object({ username: z.string().min(1).max(80) }).parse(request.body);
  return checkJellyfinUser(body.username.trim());
});

app.post("/pay/api/nowpayments/create", async (request, reply) => {
  const body = z.object({
    tier_id: z.string(),
    coin: z.enum(supportedCoins),
    discord_user: z.string().min(1).max(80)
  }).parse(request.body);

  // Block payment unless the Jellyfin user is confirmed to exist: provisioning
  // credits the subscription time to this username, so an unknown/unverifiable
  // user would mean paying with no way to apply the time.
  const userCheck = await checkJellyfinUser(body.discord_user.trim());
  if (!(userCheck.verified && userCheck.exists)) {
    return reply.code(422).send({ error: userCheck.verified ? "user_not_found" : "user_unverified" });
  }

  const plan = defaultPlans.find((item) => item.id === body.tier_id);
  if (!plan) return reply.code(400).send({ error: "unknown tier_id" });

  const orderId = `np_${nanoid(18)}`;
  const invoice = await createNowPaymentsInvoice({
    orderId,
    priceEur: plan.price_eur,
    coin: body.coin,
    description: `${config.SHOP_NAME} ${plan.label}`
  });
  await prisma.payment.create({
    data: {
      provider: "nowpayments",
      providerRef: invoice.invoice_id,
      orderId,
      coin: body.coin,
      amountEur: plan.price_eur,
      status: "waiting",
      user: body.discord_user.trim(),
      product: plan.product
    }
  });
  return {
    invoice_id: invoice.invoice_id,
    invoice_url: invoice.invoice_url,
    price_eur: plan.price_eur,
    pay_currency: body.coin
  };
});

app.get("/pay/api/nowpayments/status/:invoice_id", async (request, reply) => {
  const params = z.object({ invoice_id: z.string() }).parse(request.params);
  const payment = await prisma.payment.findFirst({ where: { providerRef: params.invoice_id, provider: "nowpayments" } });
  if (!payment) return reply.code(404).send({ payment_status: "unknown" });
  return { payment_status: payment.status };
});

app.post("/pay/api/azteco/redeem", { config: { rateLimit: { max: 8, timeWindow: "10 minutes" } } }, async (request, reply) => {
  if (!config.AZTECO_ENABLED) return reply.code(403).send({ value_eur: 0, error: "azteco_disabled" });
  const body = z.object({
    code: z.string().regex(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/),
    discord_user: z.string().min(1).max(80),
    product: z.string().default("hd")
  }).parse(request.body);

  // Same guard as the crypto flow: the redeemed time is credited to this
  // Jellyfin user, so refuse unless the user is confirmed to exist.
  const userCheck = await checkJellyfinUser(body.discord_user.trim());
  if (!(userCheck.verified && userCheck.exists)) {
    return reply.code(422).send({ value_eur: 0, error: userCheck.verified ? "user_not_found" : "user_unverified" });
  }

  const codeHash = sha256(body.code);
  const existing = await prisma.voucherRedemption.findUnique({ where: { codeHash } });
  if (existing?.status === "redeemed") return reply.code(409).send({ value_eur: 0, error: "already redeemed" });
  if (existing?.status === "in_progress") return reply.code(409).send({ value_eur: 0, error: "in progress (bis zu 10 Min)" });

  await prisma.voucherRedemption.upsert({
    where: { codeHash },
    create: { codeHash, status: "in_progress", valueEur: 0, user: body.discord_user.trim(), product: body.product },
    update: { status: "in_progress" }
  });

  const result = await aztecoClient.redeem(body.code);
  if (result.status !== "redeemed") {
    const message = result.status === "already_redeemed"
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
    data: { status: "redeemed", valueEur: result.value_eur, txRef: result.tx_ref }
  });
  await prisma.payment.create({
    data: {
      provider: "azteco",
      providerRef: result.tx_ref,
      orderId: `az_${nanoid(18)}`,
      amountEur: result.value_eur,
      status: "finished",
      user: body.discord_user.trim(),
      product: body.product
    }
  });
  await provisioningQueue.add("azteco", {
    username: body.discord_user.trim(),
    product: body.product,
    days: option.days
  }, { attempts: 5, backoff: { type: "exponential", delay: 30000 } });
  return { value_eur: result.value_eur };
});

app.post("/pay/api/plex/invite", async (request) => {
  const body = z.object({
    plex_username: z.string().min(1).max(120),
    product: z.string()
  }).parse(request.body);
  return invitePlexUser(body.plex_username.trim(), body.product);
});

app.post("/api/webhooks/nowpayments", async (request, reply) => {
  const payload = request.body as Prisma.InputJsonObject;
  const sig = request.headers["x-nowpayments-sig"];
  const signature = Array.isArray(sig) ? sig[0] : sig;
  if (!verifyNowPaymentsIpn(payload, signature)) return reply.code(403).send({ error: "invalid signature" });

  const eventId = String(payload.payment_id || payload.invoice_id || payload.order_id || nanoid());
  const orderId = String(payload.order_id || "");
  const paymentStatus = String(payload.payment_status || "waiting");
  const already = await prisma.webhookEvent.findUnique({
    where: { provider_eventId: { provider: "nowpayments", eventId } }
  });
  if (already?.processedAt) return { ok: true, duplicate: true };

  await prisma.webhookEvent.upsert({
    where: { provider_eventId: { provider: "nowpayments", eventId } },
    update: { payload },
    create: { provider: "nowpayments", eventId, payload }
  });
  if (orderId) {
    const payment = await prisma.payment.update({
      where: { orderId },
      data: { status: paymentStatus === "confirmed" ? "confirmed" : paymentStatus }
    }).catch(() => null);
    if (payment && paymentStatus === "finished") {
      const plan = defaultPlans.find((item) => item.product === payment.product && Number(item.price_eur) === Number(payment.amountEur));
      await provisioningQueue.add("nowpayments", {
        orderId,
        planId: plan?.id
      }, { jobId: orderId, attempts: 5, backoff: { type: "exponential", delay: 30000 } });
    }
  }
  await prisma.webhookEvent.update({
    where: { provider_eventId: { provider: "nowpayments", eventId } },
    data: { processedAt: new Date() }
  });
  return { ok: true };
});

const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!adminConfigured) return reply.code(503).send({ error: "admin_not_configured" });
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!verifyAdminToken(token, config.ADMIN_SESSION_SECRET)) return reply.code(401).send({ error: "unauthorized" });
};

app.post("/admin/api/login", { config: { rateLimit: { max: 5, timeWindow: "5 minutes" } } }, async (request, reply) => {
  if (!adminConfigured) return reply.code(503).send({ error: "admin_not_configured" });
  const body = z.object({ username: z.string().min(1).max(120), password: z.string().min(1).max(200) }).parse(request.body);
  // Compare both before AND-ing so the result is not short-circuited on the username.
  const userOk = safeEqual(body.username, config.ADMIN_USERNAME);
  const passOk = safeEqual(body.password, config.ADMIN_PASSWORD);
  if (!(userOk && passOk)) return reply.code(401).send({ error: "invalid_credentials" });
  const ttl = 8 * 60 * 60;
  return { token: signAdminToken(body.username, config.ADMIN_SESSION_SECRET, ttl), expires_in: ttl };
});

app.post("/admin/api/credit", { preHandler: requireAdmin }, async (request, reply) => {
  const body = z.object({
    username: z.string().min(1).max(80),
    days: z.number().int().min(1).max(3650),
    amount_eur: z.number().min(0).max(100000).optional(),
    note: z.string().max(200).optional()
  }).parse(request.body);

  // Same guard as the paid flows: only credit a confirmed Jellyfin user.
  const userCheck = await checkJellyfinUser(body.username.trim());
  if (!(userCheck.verified && userCheck.exists)) {
    return reply.code(422).send({ error: userCheck.verified ? "user_not_found" : "user_unverified" });
  }

  const result = await provisionManual(prisma, body.username.trim(), "hd", body.days, body.amount_eur ?? 0, (body.note || "").trim());
  return { ok: true, days: body.days, expires_at: result.expiresAt };
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  if (error instanceof z.ZodError) return reply.code(400).send({ error: error.issues[0]?.message || "invalid input" });
  // Log the detail server-side, return a generic message to avoid leaking internals.
  return reply.code(500).send({ error: "internal server error" });
});

app.listen({ port: config.PORT, host: "0.0.0.0" });
