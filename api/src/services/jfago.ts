import { config, jfaGoConfigured } from "../config.js";

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

type JfaUser = { id: string; name: string; expiry?: number };

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
  return Boolean(await findJellyfinUser(username));
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

export type RegistrationInvite = { code: string; url: string };

function inviteBaseUrl(): string {
  const base = config.JFA_GO_EXTERNAL_URL || config.JFA_GO_BASE_URL;
  return base.replace(/\/$/, "");
}

/**
 * Create a single-use registration invite whose created account already
 * carries the purchased duration as user expiry. `label` must be unique
 * (we use the order id) because POST /invites does not return the code —
 * it is recovered from GET /invites by label.
 */
export async function createRegistrationInvite(input: {
  label: string;
  userMonths?: number;
  userDays?: number;
}): Promise<RegistrationInvite> {
  if (!jfaGoConfigured) {
    const code = `mock-${input.label}`;
    return { code, url: `${inviteBaseUrl()}/invite/${code}` };
  }
  await jfaFetch("/invites", {
    method: "POST",
    body: JSON.stringify({
      days: config.INVITE_VALIDITY_DAYS,
      months: 0,
      hours: 0,
      minutes: 0,
      "user-expiry": true,
      "user-months": input.userMonths || 0,
      "user-days": input.userDays || 0,
      "user-hours": 0,
      "user-minutes": 0,
      "multiple-uses": false,
      "no-limit": false,
      "remaining-uses": 1,
      profile: config.JFA_GO_DEFAULT_PROFILE || undefined,
      label: input.label,
      user_label: input.label
    })
  });
  const data = (await jfaFetch("/invites")) as { invites?: Array<{ code: string; label?: string }> } | null;
  const invite = (data?.invites || []).find((item) => item.label === input.label);
  if (!invite) throw new Error(`jfa-go invite created but not found by label ${input.label}`);
  return { code: invite.code, url: `${inviteBaseUrl()}/invite/${invite.code}` };
}

/**
 * Look up whether an invite has been used and by which username.
 * Expired invites are purged by jfa-go, so a missing invite after its
 * validity window with no recorded use means the invite lapsed.
 */
export async function getInviteUsage(
  code: string,
  label: string
): Promise<{ usedBy: string | null; usedAt: Date | null; missing: boolean }> {
  if (!jfaGoConfigured) return { usedBy: null, usedAt: null, missing: false };
  const data = (await jfaFetch("/invites")) as {
    invites?: Array<{ code: string; label?: string; used_by?: Record<string, number> }>;
  } | null;
  const invite = (data?.invites || []).find((item) => item.code === code || item.label === label);
  if (!invite) return { usedBy: null, usedAt: null, missing: true };
  const [entry] = Object.entries(invite.used_by || {});
  if (!entry) return { usedBy: null, usedAt: null, missing: false };
  return { usedBy: entry[0], usedAt: new Date(entry[1] * 1000), missing: false };
}
