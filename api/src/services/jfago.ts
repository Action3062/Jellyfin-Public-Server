import { config } from "../config.js";
import { jellyfinConfigured, jellyfinUserExists } from "./jellyfin.js";

type JfaUser = { id: string; name: string; expiry: number; disabled: boolean };

export type UserCheckResult = {
  /** Whether a matching user exists. Only meaningful when `verified` is true. */
  exists: boolean;
  /** Whether the lookup was actually performed against a backend. */
  verified: boolean;
};

/** True when jfa-go base URL and admin credentials are configured. */
export const jfaConfigured = Boolean(config.JFA_GO_BASE_URL && config.JFA_GO_USER && config.JFA_GO_PASSWORD);

const jfaBase = () => config.JFA_GO_BASE_URL.replace(/\/+$/, "");

// jfa-go has no static API key: log in with Basic auth to receive a short-lived
// (~20 min) JWT, then send it as a Bearer token. We cache it with a safety margin.
let tokenCache: { token: string; expiresAt: number } | null = null;

async function jfaToken(force = false): Promise<string> {
  const now = Date.now();
  if (!force && tokenCache && tokenCache.expiresAt > now) return tokenCache.token;
  const basic = Buffer.from(`${config.JFA_GO_USER}:${config.JFA_GO_PASSWORD}`).toString("base64");
  const res = await fetch(`${jfaBase()}/token/login`, { headers: { Authorization: `Basic ${basic}` } });
  if (!res.ok) throw new Error(`jfa-go login failed: ${res.status}`);
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("jfa-go login: no token returned");
  tokenCache = { token: data.token, expiresAt: now + 15 * 60 * 1000 };
  return data.token;
}

async function jfaFetch(path: string, init: RequestInit = {}) {
  const send = async (token: string) =>
    fetch(`${jfaBase()}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) }
    });

  let res = await send(await jfaToken());
  if (res.status === 401) res = await send(await jfaToken(true)); // token expired -> re-login once
  if (!res.ok) throw new Error(`jfa-go ${path} failed: ${res.status}`);
  return res.json();
}

async function jfaGetUsers(): Promise<JfaUser[]> {
  const data = (await jfaFetch("/users")) as { users?: JfaUser[] };
  return data.users || [];
}

async function jfaFindUserId(username: string): Promise<string | null> {
  const target = username.trim().toLowerCase();
  const match = (await jfaGetUsers()).find((user) => user.name?.toLowerCase() === target);
  return match?.id || null;
}

/**
 * Checks whether a Jellyfin user exists.
 *
 * Verification uses the Jellyfin API when configured (preferred), otherwise
 * jfa-go. When no backend is configured — or the backend is unreachable — the
 * result is reported as `verified: false` instead of guessing, so the UI never
 * claims an arbitrary username exists. Failures are logged so the reason is
 * visible in the API logs instead of being silently swallowed.
 */
let warnedNoBackend = false;

export async function checkJellyfinUser(username: string): Promise<UserCheckResult> {
  const name = username.trim();
  if (!name) return { exists: false, verified: false };

  try {
    if (jellyfinConfigured) {
      return { exists: await jellyfinUserExists(name), verified: true };
    }
    if (jfaConfigured) {
      return { exists: Boolean(await jfaFindUserId(name)), verified: true };
    }
  } catch (error) {
    const backend = jellyfinConfigured ? "jellyfin" : "jfa-go";
    console.error(`[user-check] ${backend} lookup failed for "${name}": ${error instanceof Error ? error.message : String(error)}`);
    return { exists: false, verified: false };
  }

  if (!warnedNoBackend) {
    warnedNoBackend = true;
    console.warn("[user-check] no verification backend configured — set JELLYFIN_BASE_URL/JELLYFIN_API_KEY (preferred) or JFA_GO_BASE_URL/JFA_GO_USER/JFA_GO_PASSWORD; all checks return verified:false until then.");
  }
  return { exists: false, verified: false };
}

/**
 * Sets the Jellyfin account expiry (via jfa-go) to an absolute timestamp.
 *
 * We pass the already-computed absolute expiry (Unix seconds) rather than a
 * relative extension, which keeps the operation idempotent: a retried
 * provisioning job re-applies the same target instead of stacking time twice.
 */
export async function extendJellyfinExpiry(username: string, expiresAt: Date) {
  if (!jfaConfigured) return { ok: true, mock: true };

  const userId = await jfaFindUserId(username);
  if (!userId) throw new Error(`jfa-go: user not found: ${username}`);

  await jfaFetch("/users/extend", {
    method: "POST",
    body: JSON.stringify({
      users: [userId],
      timestamp: Math.floor(expiresAt.getTime() / 1000),
      notify: false,
      reason: "Subscription payment",
      try_extend_from_previous_expiry: false
    })
  });

  return { ok: true, userId, expiresAt: expiresAt.toISOString() };
}
