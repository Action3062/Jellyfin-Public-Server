import { config } from "../config.js";

type JellyfinUser = { Name?: string; Id?: string };

/** True when a Jellyfin base URL and API key are both configured. */
export const jellyfinConfigured = Boolean(config.JELLYFIN_BASE_URL && config.JELLYFIN_API_KEY);

async function jellyfinFetch(path: string) {
  const base = config.JELLYFIN_BASE_URL.replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    headers: {
      // Jellyfin accepts the static API key via the X-Emby-Token header.
      "X-Emby-Token": config.JELLYFIN_API_KEY,
      Accept: "application/json"
    }
  });
  if (!res.ok) throw new Error(`jellyfin ${path} failed: ${res.status}`);
  return res.json();
}

/** Returns whether a Jellyfin user with the given name exists (case-insensitive). */
export async function jellyfinUserExists(username: string) {
  const users = (await jellyfinFetch("/Users")) as JellyfinUser[];
  const target = username.trim().toLowerCase();
  return users.some((user) => user.Name?.toLowerCase() === target);
}

export type JellyfinAuthResult = { ok: boolean; userId?: string; name?: string };

/**
 * Verify customer credentials against Jellyfin itself
 * (POST /Users/AuthenticateByName — no API key needed; Jellyfin requires the
 * MediaBrowser authorization header to identify the client). The password is
 * forwarded once for verification and never stored.
 *
 * Mock mode (no JELLYFIN_BASE_URL outside production): accepts 3+ character
 * usernames with 4+ character passwords so local flows stay testable.
 */
export async function authenticateJellyfinUser(username: string, password: string): Promise<JellyfinAuthResult> {
  if (!config.JELLYFIN_BASE_URL) {
    if (config.NODE_ENV !== "production") {
      return username.trim().length >= 3 && password.length >= 4
        ? { ok: true, userId: `mock-${username.trim().toLowerCase()}`, name: username.trim() }
        : { ok: false };
    }
    return { ok: false };
  }
  const base = config.JELLYFIN_BASE_URL.replace(/\/+$/, "");
  const res = await fetch(`${base}/Users/AuthenticateByName`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: 'MediaBrowser Client="Byteflix Portal", Device="portal", DeviceId="byteflix-portal", Version="1.0"'
    },
    body: JSON.stringify({ Username: username.trim(), Pw: password })
  });
  if (res.status === 401 || res.status === 403) return { ok: false };
  if (!res.ok) throw new Error(`jellyfin auth failed: ${res.status}`);
  const data = (await res.json()) as { User?: { Id?: string; Name?: string } };
  return { ok: true, userId: data.User?.Id, name: data.User?.Name || username.trim() };
}

/** Whether credential login/password change can work in this environment. */
export const jellyfinLoginAvailable = Boolean(config.JELLYFIN_BASE_URL) || config.NODE_ENV !== "production";

/**
 * Change a member's password the same way Jellyfin's own apps do:
 * authenticate with the current password to obtain a user-scoped token,
 * then POST /Users/{id}/Password. Neither password is ever persisted here.
 */
export async function changeJellyfinPassword(
  username: string,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean; reason?: "invalid_credentials" | "unavailable" }> {
  if (!config.JELLYFIN_BASE_URL) {
    if (config.NODE_ENV !== "production") {
      const auth = await authenticateJellyfinUser(username, currentPassword);
      return auth.ok ? { ok: true } : { ok: false, reason: "invalid_credentials" };
    }
    return { ok: false, reason: "unavailable" };
  }
  const base = config.JELLYFIN_BASE_URL.replace(/\/+$/, "");
  const authRes = await fetch(`${base}/Users/AuthenticateByName`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: 'MediaBrowser Client="Byteflix Portal", Device="portal", DeviceId="byteflix-portal", Version="1.0"'
    },
    body: JSON.stringify({ Username: username.trim(), Pw: currentPassword })
  });
  if (authRes.status === 401 || authRes.status === 403) return { ok: false, reason: "invalid_credentials" };
  if (!authRes.ok) throw new Error(`jellyfin auth failed: ${authRes.status}`);
  const auth = (await authRes.json()) as { AccessToken?: string; User?: { Id?: string } };
  if (!auth.AccessToken || !auth.User?.Id) throw new Error("jellyfin auth: unexpected response");

  const res = await fetch(`${base}/Users/${encodeURIComponent(auth.User.Id)}/Password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Emby-Token": auth.AccessToken },
    body: JSON.stringify({ CurrentPw: currentPassword, NewPw: newPassword })
  });
  if (res.status === 401 || res.status === 403) return { ok: false, reason: "invalid_credentials" };
  if (!res.ok) throw new Error(`jellyfin password change failed: ${res.status}`);
  return { ok: true };
}
