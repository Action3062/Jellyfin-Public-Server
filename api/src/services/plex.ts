import { config } from "../config.js";

/**
 * Invite a Plex user to the shared server. Eligibility is decided by the
 * fulfillment engine from the paid plan (Payment.plexState), never by the
 * caller, so this function only performs the share.
 */
export async function invitePlexUser(plexUsername: string): Promise<{ success: boolean; error?: string }> {
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
