import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { config } from "../config.js";
import { safeEqual } from "../lib/adminToken.js";
import {
  getBotFlags,
  getSupportStatus,
  getTrialEnabled,
  getTrialParams,
  recordBotHeartbeat
} from "../lib/appSettings.js";

// The bot authenticates write endpoints with a shared secret (Bearer). Reads
// (trial status, flags, support) stay public — they expose nothing beyond what
// the bot's own behavior already shows to users.
export function registerBotRoutes(app: FastifyInstance, deps: { prisma: PrismaClient }) {
  const { prisma } = deps;

  const requireBotSecret = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!config.BOT_API_SECRET) return reply.code(503).send({ error: "bot_api_disabled" });
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token || !safeEqual(token, config.BOT_API_SECRET)) return reply.code(401).send({ error: "unauthorized" });
  };

  // Public: the bot polls this before handing out a trial (now also carries the
  // remote-controllable trial parameters).
  app.get("/pay/api/trial/status", async () => {
    const [enabled, params] = await Promise.all([
      getTrialEnabled(prisma.appSetting),
      getTrialParams(prisma.appSetting)
    ]);
    return { enabled, trial_hours: params.trialHours, nudge_hours: params.nudgeHours };
  });

  // Public: remote feature-flag overrides. null = no override (keep bot env).
  app.get("/pay/api/bot/flags", async () => ({ flags: await getBotFlags(prisma.appSetting) }));

  // Public: support status the bot mirrors to users / feeds to the AI assistant.
  app.get("/pay/api/support/status", async () => getSupportStatus(prisma.appSetting));

  // Authenticated writes -----------------------------------------------------
  app.post("/pay/api/bot/heartbeat", { preHandler: requireBotSecret }, async (request) => {
    const body = z.object({ at: z.string().datetime().optional() }).parse(request.body ?? {});
    await recordBotHeartbeat(prisma.appSetting, body.at ?? new Date().toISOString());
    return { ok: true };
  });

  app.post("/pay/api/bot/report", { preHandler: requireBotSecret }, async (request, reply) => {
    const body = z.object({
      kind: z.enum(["trials", "tickets", "funnel"]),
      payload: z.unknown().optional(),
      snapshots: z.array(z.object({
        guildId: z.string(),
        trials: z.number().int().nonnegative(),
        upgrades: z.number().int().nonnegative(),
        expired: z.number().int().nonnegative(),
        reactivated: z.number().int().nonnegative(),
        activeAbos: z.number().int().nonnegative(),
        activeTrials: z.number().int().nonnegative(),
        periodEnd: z.string().datetime()
      })).optional()
    }).parse(request.body);

    if (body.kind === "funnel") {
      const snaps = body.snapshots ?? [];
      for (const s of snaps) {
        await prisma.funnelSnapshot.create({
          data: {
            guildId: s.guildId, trials: s.trials, upgrades: s.upgrades, expired: s.expired,
            reactivated: s.reactivated, activeAbos: s.activeAbos, activeTrials: s.activeTrials,
            periodEnd: new Date(s.periodEnd)
          }
        });
      }
      return { ok: true, stored: snaps.length };
    }

    if (body.payload === undefined) return reply.code(400).send({ error: "payload_required" });
    await prisma.botReport.upsert({
      where: { kind: body.kind },
      create: { kind: body.kind, payload: body.payload as never },
      update: { payload: body.payload as never }
    });
    return { ok: true };
  });

  app.get("/pay/api/bot/commands", { preHandler: requireBotSecret }, async () => {
    const rows = await prisma.botCommand.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 20 });
    return rows.map((c) => ({ id: c.id, kind: c.kind, target: c.target }));
  });

  app.post("/pay/api/bot/commands/ack", { preHandler: requireBotSecret }, async (request) => {
    const body = z.object({ id: z.string(), status: z.enum(["done", "failed"]), result: z.string().max(500).optional() }).parse(request.body);
    await prisma.botCommand.update({
      where: { id: body.id },
      data: { status: body.status, result: body.result ?? null, processedAt: new Date() }
    }).catch(() => undefined);
    return { ok: true };
  });
}
