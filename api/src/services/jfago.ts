import { config } from "../config.js";
import { jellyfinConfigured, jellyfinUserExists } from "./jellyfin.js";

type JfaUser = { id?: string; name?: string; username?: string };

export type UserCheckResult = {
  /** Whether a matching user exists. Only meaningful when `verified` is true. */
  exists: boolean;
  /** Whether the lookup was actually performed against a backend. */
  verified: boolean;
};

async function jfaFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${config.JFA_GO_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.JFA_GO_TOKEN}`,
      ...(init.headers || {})
    }
  });
  if (!res.ok) throw new Error(`jfa-go ${path} failed: ${res.status}`);
  return res.json();
}

async function jfaUserExists(username: string) {
  const users = (await jfaFetch("/users")) as JfaUser[] | { users?: JfaUser[] };
  const list = Array.isArray(users) ? users : users.users || [];
  const target = username.toLowerCase();
  return list.some((user) => [user.name, user.username].some((name) => name?.toLowerCase() === target));
}

/**
 * Checks whether a Jellyfin user exists.
 *
 * Verification is performed against the Jellyfin API when configured (its API
 * key is static and the /Users endpoint is stable), otherwise against jfa-go.
 * When no backend is configured — or the backend is unreachable — the result is
 * reported as `verified: false` instead of guessing, so the UI never claims an
 * arbitrary username exists.
 */
export async function checkJellyfinUser(username: string): Promise<UserCheckResult> {
  const name = username.trim();
  if (!name) return { exists: false, verified: false };

  try {
    if (jellyfinConfigured) {
      return { exists: await jellyfinUserExists(name), verified: true };
    }
    if (config.JFA_GO_TOKEN) {
      return { exists: await jfaUserExists(name), verified: true };
    }
  } catch {
    return { exists: false, verified: false };
  }

  return { exists: false, verified: false };
}

export async function extendJellyfinExpiry(username: string, expiresAt: Date) {
  if (!config.JFA_GO_TOKEN) return { ok: true, mock: true };

  // TODO: Confirm the exact jfa-go expiry route/DTO against the deployed /swagger/index.html.
  // Common installs expose user expiry controls through the admin API, but route names have varied.
  return jfaFetch(`/users/${encodeURIComponent(username)}/expiry`, {
    method: "POST",
    body: JSON.stringify({ expiry: expiresAt.toISOString(), profile: config.JFA_GO_DEFAULT_PROFILE || undefined })
  });
}
