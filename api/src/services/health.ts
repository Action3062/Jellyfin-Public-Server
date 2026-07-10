import { config } from "../config.js";
import { jellyfinConfigured } from "./jellyfin.js";
import { jfaGoConfigured as jfaConfigured } from "../config.js";
import { listJfaUsersDetailed } from "./jfago.js";

export type HealthState = "ok" | "warn" | "error" | "off";
export type HealthCheck = { name: string; state: HealthState; detail: string };

type HealthDeps = {
  pingDb: () => Promise<unknown>;
  pingQueue: () => Promise<unknown>;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ]);
}

async function check(name: string, run: () => Promise<{ state: HealthState; detail: string }>): Promise<HealthCheck> {
  try {
    const { state, detail } = await run();
    return { name, state, detail };
  } catch (error) {
    return { name, state: "error", detail: error instanceof Error ? error.message : String(error) };
  }
}

/** Live reachability/config status of every backend dependency, for the admin ampel. */
export async function checkHealth(deps: HealthDeps): Promise<HealthCheck[]> {
  return Promise.all([
    check("Postgres", async () => {
      await withTimeout(Promise.resolve(deps.pingDb()), 4000);
      return { state: "ok", detail: "erreichbar" };
    }),
    check("Redis / Queue", async () => {
      await withTimeout(Promise.resolve(deps.pingQueue()), 4000);
      return { state: "ok", detail: "erreichbar" };
    }),
    check("jfa-go", async () => {
      if (!jfaConfigured) return { state: "off" as const, detail: "nicht konfiguriert" };
      const users = await withTimeout(listJfaUsersDetailed(), 6000);
      return { state: "ok" as const, detail: `${users.length} Konten` };
    }),
    check("Jellyfin", async () => {
      if (!jellyfinConfigured) return { state: "off" as const, detail: "nicht konfiguriert (jfa-go wird genutzt)" };
      const base = config.JELLYFIN_BASE_URL.replace(/\/+$/, "");
      const res = await withTimeout(fetch(`${base}/System/Info/Public`, { headers: { Accept: "application/json" } }), 5000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { state: "ok" as const, detail: "erreichbar" };
    }),
    check("NowPayments", async () => {
      if (!config.NOWPAYMENTS_API_KEY) return { state: "warn" as const, detail: "Mock-Modus (kein API-Key)" };
      if (!config.NOWPAYMENTS_IPN_SECRET) return { state: "warn" as const, detail: "API-Key gesetzt, aber IPN-Secret fehlt (Webhooks werden abgelehnt)" };
      return { state: "ok" as const, detail: "konfiguriert" };
    }),
    check("Azteco", async () => {
      if (!config.AZTECO_ENABLED) return { state: "off" as const, detail: "deaktiviert (AZTECO_ENABLED=false)" };
      if (config.AZTECO_CLIENT_MODE !== "real") return { state: "warn" as const, detail: "aktiv im Mock-Modus" };
      const ready = Boolean(config.AZTECO_RESELLER_API_BASE && config.AZTECO_RESELLER_API_KEY);
      return ready ? { state: "ok" as const, detail: "Real-Modus konfiguriert" } : { state: "warn" as const, detail: "Real-Modus, aber Reseller-API unvollständig" };
    }),
    check("Plex", async () => {
      if (!config.PLEX_TOKEN) return { state: "off" as const, detail: "nicht konfiguriert" };
      return { state: "ok" as const, detail: config.PLEX_SERVER_NAME || "Token gesetzt" };
    })
  ]);
}
