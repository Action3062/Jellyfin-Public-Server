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
