// Key-value app settings backed by the AppSetting table. Values are stored as
// strings so the table stays schema-free; helpers handle the (de)serialization.
// The store is typed structurally (matches prisma.appSetting) so the logic is
// testable without a generated Prisma client.

export const TRIAL_ENABLED_KEY = "discord_trial_enabled";
export const TRIAL_HOURS_KEY = "trial_hours";
export const TRIAL_NUDGE_HOURS_KEY = "trial_nudge_hours";
export const BOT_LAST_SEEN_KEY = "bot_last_seen";
export const SUPPORT_STATUS_KEY = "support_status";
export const SUPPORT_MESSAGE_KEY = "support_message";
export const TOTP_SECRET_KEY = "admin_totp_secret";
export const TOTP_ENABLED_KEY = "admin_totp_enabled";

// Remote-controllable Discord bot feature flags. Each maps to an ENABLE_* env
// var on the bot; the bot polls GET /pay/api/bot/flags and overrides its env.
// `null` default means "no override — keep the bot's own env value".
export const BOT_FLAG_KEYS = [
  "ai_assistant",
  "link_filter",
  "ticket_followups",
  "advanced_anti_spam",
  "welcome",
  "member_monitoring",
  "new_account_protection"
] as const;
export type BotFlagKey = (typeof BOT_FLAG_KEYS)[number];
const flagKey = (name: BotFlagKey) => `flag_${name}`;

type SettingRow = { value: string };

export type SettingsStore = {
  findUnique(args: { where: { key: string } }): Promise<SettingRow | null>;
  findMany?(args?: unknown): Promise<Array<{ key: string; value: string }>>;
  upsert(args: {
    where: { key: string };
    create: { key: string; value: string };
    update: { value: string };
  }): Promise<unknown>;
};

async function getRaw(settings: SettingsStore, key: string): Promise<string | null> {
  const row = await settings.findUnique({ where: { key } });
  return row ? row.value : null;
}

async function setRaw(settings: SettingsStore, key: string, value: string): Promise<void> {
  await settings.upsert({
    where: { key },
    create: { key, value },
    update: { value }
  });
}

/**
 * Whether the Discord bot may hand out new trials. A missing row means
 * enabled: the switch changes nothing on existing deployments until an admin
 * explicitly turns it off.
 */
export async function getTrialEnabled(settings: SettingsStore): Promise<boolean> {
  const value = await getRaw(settings, TRIAL_ENABLED_KEY);
  return value === null ? true : value === "true";
}

export async function setTrialEnabled(settings: SettingsStore, enabled: boolean): Promise<void> {
  await setRaw(settings, TRIAL_ENABLED_KEY, String(enabled));
}

/** Optional numeric override; returns null when unset so the bot keeps its env value. */
async function getOptionalNumber(settings: SettingsStore, key: string): Promise<number | null> {
  const value = await getRaw(settings, key);
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function getTrialParams(settings: SettingsStore): Promise<{ trialHours: number | null; nudgeHours: number | null }> {
  const [trialHours, nudgeHours] = await Promise.all([
    getOptionalNumber(settings, TRIAL_HOURS_KEY),
    getOptionalNumber(settings, TRIAL_NUDGE_HOURS_KEY)
  ]);
  return { trialHours, nudgeHours };
}

export async function setTrialParams(settings: SettingsStore, params: { trialHours?: number | null; nudgeHours?: number | null }): Promise<void> {
  if (params.trialHours !== undefined) await setRaw(settings, TRIAL_HOURS_KEY, params.trialHours == null ? "" : String(params.trialHours));
  if (params.nudgeHours !== undefined) await setRaw(settings, TRIAL_NUDGE_HOURS_KEY, params.nudgeHours == null ? "" : String(params.nudgeHours));
}

/** Feature flags: value is "true"/"false", or absent = no override (null). */
export async function getBotFlags(settings: SettingsStore): Promise<Record<BotFlagKey, boolean | null>> {
  const out = {} as Record<BotFlagKey, boolean | null>;
  await Promise.all(BOT_FLAG_KEYS.map(async (name) => {
    const value = await getRaw(settings, flagKey(name));
    out[name] = value === null || value === "" ? null : value === "true";
  }));
  return out;
}

export async function setBotFlag(settings: SettingsStore, name: BotFlagKey, value: boolean | null): Promise<void> {
  await setRaw(settings, flagKey(name), value == null ? "" : String(value));
}

export type SupportStatus = "online" | "busy" | "offline";
export async function getSupportStatus(settings: SettingsStore): Promise<{ status: SupportStatus; message: string }> {
  const [status, message] = await Promise.all([
    getRaw(settings, SUPPORT_STATUS_KEY),
    getRaw(settings, SUPPORT_MESSAGE_KEY)
  ]);
  const valid: SupportStatus[] = ["online", "busy", "offline"];
  return {
    status: valid.includes(status as SupportStatus) ? (status as SupportStatus) : "offline",
    message: message ?? ""
  };
}

export async function setSupportStatus(settings: SettingsStore, status: SupportStatus, message: string): Promise<void> {
  await setRaw(settings, SUPPORT_STATUS_KEY, status);
  await setRaw(settings, SUPPORT_MESSAGE_KEY, message);
}

export async function recordBotHeartbeat(settings: SettingsStore, isoTimestamp: string): Promise<void> {
  await setRaw(settings, BOT_LAST_SEEN_KEY, isoTimestamp);
}

export async function getBotLastSeen(settings: SettingsStore): Promise<string | null> {
  return getRaw(settings, BOT_LAST_SEEN_KEY);
}

export async function getTotpConfig(settings: SettingsStore): Promise<{ secret: string | null; enabled: boolean }> {
  const [secret, enabled] = await Promise.all([
    getRaw(settings, TOTP_SECRET_KEY),
    getRaw(settings, TOTP_ENABLED_KEY)
  ]);
  return { secret: secret || null, enabled: enabled === "true" };
}

export async function setTotpSecret(settings: SettingsStore, secret: string): Promise<void> {
  await setRaw(settings, TOTP_SECRET_KEY, secret);
}

export async function setTotpEnabled(settings: SettingsStore, enabled: boolean): Promise<void> {
  await setRaw(settings, TOTP_ENABLED_KEY, String(enabled));
}
