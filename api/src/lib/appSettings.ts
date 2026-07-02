// Key-value app settings backed by the AppSetting table. Values are stored as
// strings so the table stays schema-free; helpers handle the (de)serialization.
// The store is typed structurally (matches prisma.appSetting) so the logic is
// testable without a generated Prisma client.

export const TRIAL_ENABLED_KEY = "discord_trial_enabled";

type SettingRow = { value: string };

export type SettingsStore = {
  findUnique(args: { where: { key: string } }): Promise<SettingRow | null>;
  upsert(args: {
    where: { key: string };
    create: { key: string; value: string };
    update: { value: string };
  }): Promise<unknown>;
};

/**
 * Whether the Discord bot may hand out new trials. A missing row means
 * enabled: the switch changes nothing on existing deployments until an admin
 * explicitly turns it off.
 */
export async function getTrialEnabled(settings: SettingsStore): Promise<boolean> {
  const row = await settings.findUnique({ where: { key: TRIAL_ENABLED_KEY } });
  return row ? row.value === "true" : true;
}

export async function setTrialEnabled(settings: SettingsStore, enabled: boolean): Promise<void> {
  const value = String(enabled);
  await settings.upsert({
    where: { key: TRIAL_ENABLED_KEY },
    create: { key: TRIAL_ENABLED_KEY, value },
    update: { value }
  });
}
