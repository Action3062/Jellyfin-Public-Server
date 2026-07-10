import type { FastifyRequest } from "fastify";

// Thin wrapper around the AdminAuditLog table. Kept dependency-light and
// null-safe: audit logging must never break the action it records.

// Loose structural type so a Prisma model delegate (whose create/findMany are
// generic) is assignable without pulling Prisma types into this light module.
type AuditStore = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create(args: any): unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findMany(args: any): Promise<unknown[]>;
};

export function clientIp(request: FastifyRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (header?.split(",")[0]?.trim() || request.ip || "").slice(0, 64);
}

export async function recordAudit(
  store: AuditStore,
  entry: { action: string; actor?: string; ip?: string; detail?: unknown }
): Promise<void> {
  try {
    await store.create({
      data: {
        action: entry.action,
        actor: entry.actor ?? "",
        ip: entry.ip ?? "",
        detail: (entry.detail ?? undefined) as never
      }
    });
  } catch (error) {
    console.error(`[audit] failed to record "${entry.action}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listAudit(store: AuditStore, limit = 100): Promise<unknown[]> {
  return store.findMany({ orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 500) });
}
