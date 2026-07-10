export const shopName = process.env.NEXT_PUBLIC_SHOP_NAME || "Byteflix";
export const discordUrl = process.env.NEXT_PUBLIC_SHOP_DISCORD_URL || "";
export const apiBase = "/pay/api";
// Visibility switches — enabled unless explicitly set to "false" (production
// compose defaults them off until the operator opts in).
export const aztecoEnabled = process.env.NEXT_PUBLIC_AZTECO_ENABLED !== "false";
export const plexEnabled = process.env.NEXT_PUBLIC_PLEX_ENABLED !== "false";
