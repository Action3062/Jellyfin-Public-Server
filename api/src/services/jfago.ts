import { config, jfaGoConfigured } from "../config.js";
import { jellyfinConfigured, jellyfinUserExists } from "./jellyfin.js";

/**
 * jfa-go admin API client.
 *
 * Contract verified against the upstream source (hrfee/jfa-go, v0.6.x):
 * - Auth: GET /token/login with HTTP Basic returns { token }, an HS256 JWT
 *   valid for 20 minutes whose signing secret rotates on every jfa-go
 *   restart. There is no long-lived API key, so we log in with credentials,
 *   cache the token briefly, and re-login on 401.
 * - GET /users returns { users: [...], last_page } — the username field is
 *   `name` and `expiry` is Unix SECONDS.
 * - Expiry changes go through POST /users/extend with Jellyfin user IDs and
 *   either relative fields or an absolute `timestamp` (Unix seconds). Success
 *   is HTTP 204 with an empty body.
 * - POST /invites (hyphenated DTO keys) does NOT return the generated code;
 *   we set a unique label and recover the code via GET /invites.
 *
 * When no credentials are configured every call returns mock values so local
 * development, CI, and e2e tests run without a jfa-go instance.
 */

type JfaUser = { id: string; name: string; expiry?: number; last_active?: number; disabled?: boolean };

const TOKEN_TTL_MS = 15 * 60 * 1000; // refresh well before the 20-minute expiry

let cachedToken: { value: string; fetchedAt: number } | null = null;

async function login(): Promise<string> {
  const basic = Buffer.from(`${config.JFA_GO_USERNAME}:${config.JFA_GO_PASSWORD}`).toString("base64");
  const res = await fetch(`${config.JFA_GO_BASE_URL}/token/login`, {
    headers: { Authorization: `Basic ${basic}` }
  });
  if (!res.ok) throw new Error(`jfa-go login failed: ${res.status}`);
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("jfa-go login returned no token");
  cachedToken = { value: data.token, fetchedAt: Date.now() };
  return data.token;
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() - cachedToken.fetchedAt < TOKEN_TTL_MS) return cachedToken.value;
  return login();
}

async function jfaFetch(path: string, init: RequestInit = {}, retryOn401 = true): Promise<unknown> {
  const token = await getToken();
  const res = await fetch(`${config.JFA_GO_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {})
    }
  });
  if (res.status === 401 && retryOn401) {
    cachedToken = null;
    return jfaFetch(path, init, false);
  }
  if (!res.ok) throw new Error(`jfa-go ${path} failed: ${res.status}`);
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function listUsers(): Promise<JfaUser[]> {
  const data = (await jfaFetch("/users")) as { users?: JfaUser[] } | null;
  return data?.users || [];
}

export async function findJellyfinUser(username: string): Promise<JfaUser | null> {
  if (!jfaGoConfigured) {
    // Mock mode: usernames of 3+ characters "exist" so flows are testable.
    return username.length >= 3 ? { id: `mock-${username.toLowerCase()}`, name: username } : null;
  }
  const users = await listUsers();
  const lower = username.toLowerCase();
  return users.find((user) => user.name?.toLowerCase() === lower) || null;
}

export async function checkJellyfinUser(username: string): Promise<boolean> {
  if (jellyfinConfigured) return jellyfinUserExists(username).catch(() => false);
  return Boolean(await findJellyfinUser(username));
}

export type UserCheckResult = {
  /** Whether a matching user exists. Only meaningful when `verified` is true. */
  exists: boolean;
  /** Whether the lookup was actually performed against a backend. */
  verified: boolean;
};

/**
 * Existence check with an explicit verification signal, used by admin actions
 * that must not credit unverifiable usernames. Prefers the Jellyfin API,
 * falls back to jfa-go; in pure mock mode (development only) 3+ character
 * names count as verified so the panel remains testable.
 */
export async function checkJellyfinUserVerified(username: string): Promise<UserCheckResult> {
  const name = username.trim();
  if (!name) return { exists: false, verified: false };
  try {
    if (jellyfinConfigured) return { exists: await jellyfinUserExists(name), verified: true };
    if (jfaGoConfigured) return { exists: Boolean(await findJellyfinUser(name)), verified: true };
  } catch (error) {
    console.error(`[user-check] lookup failed for "${name}": ${error instanceof Error ? error.message : String(error)}`);
    return { exists: false, verified: false };
  }
  if (config.NODE_ENV !== "production") return { exists: name.length >= 3, verified: true };
  return { exists: false, verified: false };
}

export type JfaUserDetailed = {
  id: string;
  name: string;
  expiry: number; // Unix seconds (0 = no expiry)
  disabled: boolean;
  discordId?: string;
  lastActive?: number; // Unix seconds
  email?: string;
  label?: string; // jfa-go account label; the Discord bot tags trials with "Trial"
};

function pick(obj: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

/**
 * Full user list for the admin panel. Parsed defensively because jfa-go's JSON
 * tag casing for the user-list response differs between versions.
 */
export async function listJfaUsersDetailed(): Promise<JfaUserDetailed[]> {
  if (!jfaGoConfigured) return [];
  const data = (await jfaFetch("/users")) as Record<string, unknown> | null;
  const rawList = (pick(data || {}, "users", "UserList", "user_list") ?? []) as Array<Record<string, unknown>>;
  return rawList
    .map((entry) => {
      const discord = pick(entry, "discord_id", "discordID", "DiscordID");
      const lastActive = Number(pick(entry, "last_active", "lastActive", "LastActive") ?? 0);
      const email = pick(entry, "email", "Email");
      const label = pick(entry, "label", "Label");
      return {
        id: String(pick(entry, "id", "ID") ?? ""),
        name: String(pick(entry, "name", "Name") ?? ""),
        expiry: Number(pick(entry, "expiry", "Expiry") ?? 0),
        disabled: Boolean(pick(entry, "disabled", "Disabled") ?? false),
        discordId: discord ? String(discord) : undefined,
        lastActive: Number.isFinite(lastActive) && lastActive > 0 ? lastActive : undefined,
        email: email ? String(email) : undefined,
        label: label ? String(label) : undefined
      };
    })
    .filter((entry) => entry.name);
}

/** Enable or disable a Jellyfin account via jfa-go, without touching its expiry. */
export async function setJfaUserEnabled(username: string, enabled: boolean) {
  if (!jfaGoConfigured) return { ok: true, mock: true };
  const user = await findJellyfinUser(username);
  if (!user) throw new Error(`jfa-go: user not found: ${username}`);
  await jfaFetch("/users/enable", {
    method: "POST",
    body: JSON.stringify({
      users: [user.id],
      enabled,
      notify: false,
      reason: enabled ? "Re-enabled by admin" : "Disabled by admin"
    })
  });
  return { ok: true, userId: user.id, enabled };
}

export type JellyfinUserInfo = {
  exists: boolean;
  expiresAt: Date | null;
  lastActive: Date | null;
  disabled: boolean;
};

/**
 * Live member info from jfa-go (the same data its "My Account" page shows):
 * authoritative expiry, last activity, and whether the account is disabled.
 * `expiry`/`last_active` are Unix seconds; 0 means "not set".
 */
export async function getJellyfinUserInfo(username: string): Promise<JellyfinUserInfo | null> {
  if (!jfaGoConfigured) {
    // Mock mode: plausible activity so local dev and e2e render the field;
    // expiry stays null so the portal's own subscription data is used.
    return { exists: true, expiresAt: null, lastActive: new Date(Date.now() - 3 * 3600 * 1000), disabled: false };
  }
  const user = await findJellyfinUser(username);
  if (!user) return { exists: false, expiresAt: null, lastActive: null, disabled: false };
  return {
    exists: true,
    expiresAt: user.expiry ? new Date(user.expiry * 1000) : null,
    lastActive: user.last_active ? new Date(user.last_active * 1000) : null,
    disabled: Boolean(user.disabled)
  };
}

/** Set an absolute expiry for an existing Jellyfin user. */
export async function extendJellyfinExpiry(username: string, expiresAt: Date): Promise<{ ok: boolean; mock?: boolean; userId?: string }> {
  if (!jfaGoConfigured) return { ok: true, mock: true };
  const user = await findJellyfinUser(username);
  if (!user) throw new Error(`jfa-go user not found: ${username}`);
  await jfaFetch("/users/extend", {
    method: "POST",
    body: JSON.stringify({
      users: [user.id],
      timestamp: Math.floor(expiresAt.getTime() / 1000),
      notify: false,
      reason: "payment received"
    })
  });
  return { ok: true, userId: user.id };
}

export class UsernameTakenError extends Error {}

/**
 * Whether a username is available for registration. In mock mode every
 * plausible name is free so local/e2e flows can complete.
 */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  if (!jfaGoConfigured) return username.length >= 3;
  return !(await findJellyfinUser(username));
}

/**
 * Create a Jellyfin account directly through jfa-go (POST /user), applying
 * the configured default profile. Registration is rendered by OUR portal —
 * customers never see jfa-go's own UI. The password is forwarded to jfa-go
 * over the internal network and never persisted here. Note: POST /user does
 * not set an expiry; callers follow up with extendJellyfinExpiry.
 */
export async function createJellyfinUser(input: { username: string; password: string }): Promise<{ mock?: boolean }> {
  if (!jfaGoConfigured) return { mock: true };
  const token = await getToken();
  const res = await fetch(`${config.JFA_GO_BASE_URL}/user`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      username: input.username,
      password: input.password,
      profile: config.JFA_GO_DEFAULT_PROFILE || undefined
    })
  });
  if (res.ok) return {};
  let message = "";
  try {
    message = ((await res.json()) as { error?: string }).error || "";
  } catch {
    /* non-JSON error body */
  }
  if (res.status === 401) {
    cachedToken = null;
    throw new Error("jfa-go create user unauthorized");
  }
  if (res.status === 409 || /exist|taken|already/i.test(message)) {
    throw new UsernameTakenError(message || "username taken");
  }
  throw new Error(`jfa-go create user failed: ${res.status}${message ? ` ${message}` : ""}`);
}
