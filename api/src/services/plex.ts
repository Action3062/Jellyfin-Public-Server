import { config } from "../config.js";

export async function invitePlexUser(plexUsername: string, product: string) {
  if (product !== "hd") return { success: false, error: "product not eligible" };
  if (!config.PLEX_TOKEN) return { success: true };

  // TODO: Wire against the selected Plex API flow for the target server/library setup.
  // The token and server name are already ENV-driven; exact sharing payload depends on
  // whether username, email, and library section IDs are used in the deployment.
  const res = await fetch("https://plex.tv/api/v2/shared_servers", {
    method: "POST",
    headers: {
      "X-Plex-Token": config.PLEX_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username: plexUsername, server_name: config.PLEX_SERVER_NAME })
  });
  if (!res.ok) return { success: false, error: `Plex invite failed: ${res.status}` };
  return { success: true };
}
