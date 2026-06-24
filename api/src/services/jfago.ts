import { config } from "../config.js";

type JfaUser = { id?: string; name?: string; username?: string };

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

export async function checkJellyfinUser(username: string) {
  if (!config.JFA_GO_TOKEN) return username.length >= 3;
  const users = await jfaFetch("/users") as JfaUser[] | { users?: JfaUser[] };
  const list = Array.isArray(users) ? users : users.users || [];
  return list.some((user) => [user.name, user.username].includes(username));
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
