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
