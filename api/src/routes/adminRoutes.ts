import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { Queue } from "bullmq";
import { z } from "zod";
import { config } from "../config.js";
import { safeEqual, signAdminToken, verifyAdminToken, type AdminClaims } from "../lib/adminToken.js";
import { clientIp, listAudit, recordAudit } from "../lib/audit.js";
import { toCsv } from "../lib/csv.js";
import { generateTotpSecret, totpAuthUri, verifyTotp } from "../lib/totp.js";
import {
  BOT_FLAG_KEYS,
  getBotFlags,
  getBotLastSeen,
  getSupportStatus,
  getTotpConfig,
  getTrialEnabled,
  getTrialParams,
  setBotFlag,
  setSupportStatus,
  setTotpEnabled,
  setTotpSecret,
  setTrialEnabled,
  setTrialParams,
  type BotFlagKey
} from "../lib/appSettings.js";
import { checkJellyfinUser, listJfaUsersDetailed, setJfaUserEnabled } from "../services/jfago.js";
import { provisionManual, setManualExpiry } from "../services/provisioning.js";
import { addDays, laterOf } from "../lib/expiry.js";
import { checkHealth } from "../services/health.js";
import {
  dashboardData,
  reconciliationData,
  toNum,
  userDirectory,
  userHistory
} from "../services/adminStats.js";

const adminConfigured = Boolean(config.ADMIN_USERNAME && config.ADMIN_PASSWORD && config.ADMIN_SESSION_SECRET);

// requireAdmin attaches the verified claims so handlers can attribute audit rows.
type AuthedRequest = FastifyRequest & { adminClaims?: AdminClaims };

export function registerAdminRoutes(app: FastifyInstance, deps: { prisma: PrismaClient; queue: Queue }) {
  const { prisma, queue } = deps;
  const audit = (entry: { action: string; actor?: string; ip?: string; detail?: unknown }) =>
    recordAudit(prisma.adminAuditLog, entry);
  const actorOf = (request: FastifyRequest) => (request as AuthedRequest).adminClaims?.sub ?? "";

  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!adminConfigured) return reply.code(503).send({ error: "admin_not_configured" });
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const claims = verifyAdminToken(token, config.ADMIN_SESSION_SECRET);
    if (!claims) return reply.code(401).send({ error: "unauthorized" });
    (request as AuthedRequest).adminClaims = claims;
  };

  const TTL = 8 * 60 * 60;

  // ---- Auth ----------------------------------------------------------------
  app.post("/admin/api/login", { config: { rateLimit: { max: 5, timeWindow: "5 minutes" } } }, async (request, reply) => {
    if (!adminConfigured) return reply.code(503).send({ error: "admin_not_configured" });
    const body = z.object({
      username: z.string().min(1).max(120),
      password: z.string().min(1).max(200),
      token: z.string().max(10).optional()
    }).parse(request.body);

    const userOk = safeEqual(body.username, config.ADMIN_USERNAME);
    const passOk = safeEqual(body.password, config.ADMIN_PASSWORD);
    if (!(userOk && passOk)) {
      await audit({ action: "login_failed", actor: body.username, ip: clientIp(request), detail: { reason: "bad_credentials" } });
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const totp = await getTotpConfig(prisma.appSetting);
    if (totp.enabled && totp.secret) {
      if (!body.token) return reply.code(401).send({ error: "totp_required" });
      if (!verifyTotp(totp.secret, body.token)) {
        await audit({ action: "login_failed", actor: body.username, ip: clientIp(request), detail: { reason: "bad_totp" } });
        return reply.code(401).send({ error: "invalid_totp" });
      }
    }

    await audit({ action: "login", actor: body.username, ip: clientIp(request) });
    return { token: signAdminToken(body.username, config.ADMIN_SESSION_SECRET, TTL), expires_in: TTL };
  });

  // Issue a fresh token from a still-valid one so long sessions don't 401 mid-edit.
  app.post("/admin/api/refresh", { preHandler: requireAdmin }, async (request) => {
    const sub = actorOf(request);
    return { token: signAdminToken(sub, config.ADMIN_SESSION_SECRET, TTL), expires_in: TTL };
  });

  // ---- Two-factor ----------------------------------------------------------
  app.get("/admin/api/2fa/status", { preHandler: requireAdmin }, async () => {
    const totp = await getTotpConfig(prisma.appSetting);
    return { enabled: totp.enabled, configured: Boolean(totp.secret) };
  });

  app.post("/admin/api/2fa/setup", { preHandler: requireAdmin }, async (request) => {
    const secret = generateTotpSecret();
    await setTotpSecret(prisma.appSetting, secret);
    await setTotpEnabled(prisma.appSetting, false); // not active until a code is confirmed
    return { secret, otpauth_uri: totpAuthUri(secret, config.ADMIN_USERNAME || "admin", config.SHOP_NAME || "Admin") };
  });

  app.post("/admin/api/2fa/enable", { preHandler: requireAdmin }, async (request, reply) => {
    const body = z.object({ token: z.string().min(6).max(10) }).parse(request.body);
    const totp = await getTotpConfig(prisma.appSetting);
    if (!totp.secret) return reply.code(400).send({ error: "totp_not_setup" });
    if (!verifyTotp(totp.secret, body.token)) return reply.code(401).send({ error: "invalid_totp" });
    await setTotpEnabled(prisma.appSetting, true);
    await audit({ action: "2fa_enabled", actor: actorOf(request), ip: clientIp(request) });
    return { ok: true, enabled: true };
  });

  app.post("/admin/api/2fa/disable", { preHandler: requireAdmin }, async (request) => {
    await setTotpEnabled(prisma.appSetting, false);
    await audit({ action: "2fa_disabled", actor: actorOf(request), ip: clientIp(request) });
    return { ok: true, enabled: false };
  });

  // ---- Settings (trial toggle) --------------------------------------------
  app.get("/admin/api/settings", { preHandler: requireAdmin }, async () => ({
    trial_enabled: await getTrialEnabled(prisma.appSetting)
  }));

  app.post("/admin/api/settings/trial", { preHandler: requireAdmin }, async (request) => {
    const body = z.object({ enabled: z.boolean() }).parse(request.body);
    await setTrialEnabled(prisma.appSetting, body.enabled);
    await audit({ action: "trial_toggle", actor: actorOf(request), ip: clientIp(request), detail: { enabled: body.enabled } });
    return { ok: true, enabled: body.enabled };
  });

  // ---- Dashboard & reports -------------------------------------------------
  app.get("/admin/api/dashboard", { preHandler: requireAdmin }, async () => dashboardData(prisma));

  app.get("/admin/api/reconciliation", { preHandler: requireAdmin }, async () => reconciliationData(prisma));

  app.get("/admin/api/payments", { preHandler: requireAdmin }, async (request) => {
    const q = z.object({
      status: z.string().optional(),
      provider: z.string().optional(),
      user: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100)
    }).parse(request.query);
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.provider) where.provider = q.provider;
    if (q.user) where.user = { contains: q.user, mode: "insensitive" };
    const rows = await prisma.payment.findMany({ where, orderBy: { createdAt: "desc" }, take: q.limit });
    return rows.map((r) => ({
      id: r.id, provider: r.provider, coin: r.coin, amountEur: toNum(r.amountEur),
      status: r.status, user: r.user, product: r.product, orderId: r.orderId,
      providerRef: r.providerRef, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString()
    }));
  });

  app.get("/admin/api/webhooks", { preHandler: requireAdmin }, async (request) => {
    const q = z.object({ unprocessed: z.coerce.boolean().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(request.query);
    const where = q.unprocessed ? { processedAt: null } : {};
    const rows = await prisma.webhookEvent.findMany({ where, orderBy: { id: "desc" }, take: q.limit });
    return rows.map((r) => ({ id: r.id, provider: r.provider, eventId: r.eventId, processedAt: r.processedAt?.toISOString() ?? null, payload: r.payload }));
  });

  app.get("/admin/api/vouchers", { preHandler: requireAdmin }, async () => {
    const rows = await prisma.voucherRedemption.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    return rows.map((r) => ({ id: r.id, status: r.status, valueEur: toNum(r.valueEur), user: r.user, product: r.product, txRef: r.txRef, createdAt: r.createdAt.toISOString() }));
  });

  app.get("/admin/api/audit", { preHandler: requireAdmin }, async () => listAudit(prisma.adminAuditLog, 150));

  app.get("/admin/api/export/payments.csv", { preHandler: requireAdmin }, async (request, reply) => {
    const rows = await prisma.payment.findMany({ orderBy: { createdAt: "desc" } });
    const csv = toCsv(
      ["created_at", "provider", "coin", "amount_eur", "status", "user", "product", "order_id"],
      rows.map((r) => [r.createdAt.toISOString(), r.provider, r.coin ?? "", toNum(r.amountEur), r.status, r.user, r.product, r.orderId])
    );
    return reply.header("Content-Type", "text/csv; charset=utf-8").header("Content-Disposition", 'attachment; filename="payments.csv"').send(csv);
  });

  // ---- Users ---------------------------------------------------------------
  app.get("/admin/api/users", { preHandler: requireAdmin }, async () => userDirectory(prisma));

  app.get("/admin/api/users/:username", { preHandler: requireAdmin }, async (request) => {
    const params = z.object({ username: z.string().min(1).max(80) }).parse(request.params);
    return userHistory(prisma, params.username);
  });

  app.post("/admin/api/users/enable", { preHandler: requireAdmin }, async (request, reply) => {
    const body = z.object({ username: z.string().min(1).max(80), enabled: z.boolean() }).parse(request.body);
    try {
      await setJfaUserEnabled(body.username.trim(), body.enabled);
    } catch (error) {
      return reply.code(502).send({ error: "jfa_error", message: error instanceof Error ? error.message : String(error) });
    }
    await audit({ action: body.enabled ? "user_enable" : "user_disable", actor: actorOf(request), ip: clientIp(request), detail: { username: body.username.trim() } });
    return { ok: true, enabled: body.enabled };
  });

  // Current expiry + resulting expiry for a proposed credit, for the confirm dialog.
  app.get("/admin/api/expiry-preview", { preHandler: requireAdmin }, async (request) => {
    const q = z.object({ username: z.string().min(1).max(80), days: z.coerce.number().int().min(0).max(3650).default(0) }).parse(request.query);
    const name = q.username.trim().toLowerCase();
    let current: string | null = null;
    try {
      const users = await listJfaUsersDetailed();
      const match = users.find((u) => u.name.toLowerCase() === name);
      if (match && match.expiry > 0) current = new Date(match.expiry * 1000).toISOString();
    } catch {
      current = null;
    }
    const base = laterOf(new Date(), current ? new Date(current) : new Date());
    const projected = q.days > 0 ? addDays(base, q.days).toISOString() : (current ?? null);
    return { current, projected, days: q.days };
  });

  // ---- Credit (manual) & corrections --------------------------------------
  app.post("/admin/api/credit", { preHandler: requireAdmin }, async (request, reply) => {
    const body = z.object({
      username: z.string().min(1).max(80),
      days: z.number().int().min(1).max(3650),
      amount_eur: z.number().min(0).max(100000).optional(),
      note: z.string().max(200).optional()
    }).parse(request.body);

    const userCheck = await checkJellyfinUser(body.username.trim());
    if (!(userCheck.verified && userCheck.exists)) {
      return reply.code(422).send({ error: userCheck.verified ? "user_not_found" : "user_unverified" });
    }

    const result = await provisionManual(prisma, body.username.trim(), "hd", body.days, body.amount_eur ?? 0, (body.note || "").trim());
    await audit({ action: "credit", actor: actorOf(request), ip: clientIp(request), detail: { username: body.username.trim(), days: body.days, amount_eur: body.amount_eur ?? 0, note: body.note ?? "" } });
    return { ok: true, days: body.days, expires_at: result.expiresAt };
  });

  // Set an absolute expiry (correction / subtract time / undo).
  app.post("/admin/api/expiry/set", { preHandler: requireAdmin }, async (request, reply) => {
    const body = z.object({ username: z.string().min(1).max(80), expires_at: z.string().datetime(), note: z.string().max(200).optional() }).parse(request.body);
    const userCheck = await checkJellyfinUser(body.username.trim());
    if (!(userCheck.verified && userCheck.exists)) {
      return reply.code(422).send({ error: userCheck.verified ? "user_not_found" : "user_unverified" });
    }
    const result = await setManualExpiry(prisma, body.username.trim(), new Date(body.expires_at), (body.note || "").trim());
    await audit({ action: "expiry_set", actor: actorOf(request), ip: clientIp(request), detail: { username: body.username.trim(), expires_at: body.expires_at, note: body.note ?? "" } });
    return { ok: true, expires_at: result.expiresAt };
  });

  // ---- Operations: health & queue -----------------------------------------
  app.get("/admin/api/health", { preHandler: requireAdmin }, async () => {
    const checks = await checkHealth({
      pingDb: () => prisma.$queryRaw`SELECT 1`,
      pingQueue: () => queue.getJobCounts()
    });
    const botLastSeen = await getBotLastSeen(prisma.appSetting);
    return { checks, botLastSeen };
  });

  app.get("/admin/api/queue", { preHandler: requireAdmin }, async () => {
    const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed", "completed");
    const failed = await queue.getFailed(0, 25);
    return {
      counts,
      failed: failed.map((job) => ({
        id: job.id, name: job.name, attemptsMade: job.attemptsMade,
        failedReason: job.failedReason, data: job.data, timestamp: job.timestamp
      }))
    };
  });

  app.post("/admin/api/queue/retry", { preHandler: requireAdmin }, async (request, reply) => {
    const body = z.object({ jobId: z.string() }).parse(request.body);
    const job = await queue.getJob(body.jobId);
    if (!job) return reply.code(404).send({ error: "job_not_found" });
    await job.retry();
    await audit({ action: "queue_retry", actor: actorOf(request), ip: clientIp(request), detail: { jobId: body.jobId } });
    return { ok: true };
  });

  // ---- Discord bot control -------------------------------------------------
  app.get("/admin/api/bot", { preHandler: requireAdmin }, async () => {
    const [flags, support, params, lastSeen, trialsReport, ticketsReport, funnelHistory] = await Promise.all([
      getBotFlags(prisma.appSetting),
      getSupportStatus(prisma.appSetting),
      getTrialParams(prisma.appSetting),
      getBotLastSeen(prisma.appSetting),
      prisma.botReport.findUnique({ where: { kind: "trials" } }),
      prisma.botReport.findUnique({ where: { kind: "tickets" } }),
      prisma.funnelSnapshot.findMany({ orderBy: { periodEnd: "desc" }, take: 12 })
    ]);
    return {
      flags, support, trialParams: params, lastSeen,
      trials: trialsReport?.payload ?? null,
      tickets: ticketsReport?.payload ?? null,
      funnel: funnelHistory.map((f) => ({ periodEnd: f.periodEnd.toISOString(), trials: f.trials, upgrades: f.upgrades, expired: f.expired, reactivated: f.reactivated, activeAbos: f.activeAbos, activeTrials: f.activeTrials }))
    };
  });

  app.post("/admin/api/bot/flags", { preHandler: requireAdmin }, async (request, reply) => {
    const body = z.object({ name: z.enum(BOT_FLAG_KEYS as unknown as [BotFlagKey, ...BotFlagKey[]]), value: z.boolean().nullable() }).parse(request.body);
    await setBotFlag(prisma.appSetting, body.name, body.value);
    await audit({ action: "bot_flag", actor: actorOf(request), ip: clientIp(request), detail: { name: body.name, value: body.value } });
    return { ok: true };
  });

  app.post("/admin/api/bot/support", { preHandler: requireAdmin }, async (request) => {
    const body = z.object({ status: z.enum(["online", "busy", "offline"]), message: z.string().max(280).default("") }).parse(request.body);
    await setSupportStatus(prisma.appSetting, body.status, body.message);
    await audit({ action: "support_status", actor: actorOf(request), ip: clientIp(request), detail: { status: body.status } });
    return { ok: true };
  });

  app.post("/admin/api/bot/trial-params", { preHandler: requireAdmin }, async (request) => {
    const body = z.object({ trialHours: z.number().int().min(1).max(2160).nullable().optional(), nudgeHours: z.number().int().min(1).max(2160).nullable().optional() }).parse(request.body);
    await setTrialParams(prisma.appSetting, body);
    await audit({ action: "trial_params", actor: actorOf(request), ip: clientIp(request), detail: body });
    return { ok: true };
  });

  app.post("/admin/api/bot/command", { preHandler: requireAdmin }, async (request) => {
    const body = z.object({ kind: z.enum(["trial_reset"]), target: z.string().min(1).max(120) }).parse(request.body);
    const command = await prisma.botCommand.create({ data: { kind: body.kind, target: body.target.trim(), createdBy: actorOf(request) } });
    await audit({ action: "bot_command", actor: actorOf(request), ip: clientIp(request), detail: { kind: body.kind, target: body.target.trim() } });
    return { ok: true, id: command.id };
  });

  app.get("/admin/api/bot/commands", { preHandler: requireAdmin }, async () => {
    const rows = await prisma.botCommand.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    return rows.map((c) => ({ id: c.id, kind: c.kind, target: c.target, status: c.status, result: c.result, createdAt: c.createdAt.toISOString(), processedAt: c.processedAt?.toISOString() ?? null }));
  });
}
