import { describe, expect, it } from "vitest";
import { getTrialEnabled, setTrialEnabled, TRIAL_ENABLED_KEY, type SettingsStore } from "../src/lib/appSettings.js";

function fakeStore(initialValue?: string) {
  const rows = new Map<string, { key: string; value: string }>();
  if (initialValue !== undefined) rows.set(TRIAL_ENABLED_KEY, { key: TRIAL_ENABLED_KEY, value: initialValue });
  const store: SettingsStore = {
    async findUnique({ where }) {
      return rows.get(where.key) ?? null;
    },
    async upsert({ where, create, update }) {
      const existing = rows.get(where.key);
      const row = existing ? { ...existing, ...update } : { ...create };
      rows.set(where.key, row);
      return row;
    }
  };
  return { store, rows };
}

describe("trial setting", () => {
  it("defaults to enabled when no row exists", async () => {
    const { store } = fakeStore();
    expect(await getTrialEnabled(store)).toBe(true);
  });

  it("reads back a stored value", async () => {
    expect(await getTrialEnabled(fakeStore("false").store)).toBe(false);
    expect(await getTrialEnabled(fakeStore("true").store)).toBe(true);
  });

  it("treats unknown stored values as disabled", async () => {
    expect(await getTrialEnabled(fakeStore("garbage").store)).toBe(false);
  });

  it("persists toggling off and back on", async () => {
    const { store } = fakeStore();
    await setTrialEnabled(store, false);
    expect(await getTrialEnabled(store)).toBe(false);
    await setTrialEnabled(store, true);
    expect(await getTrialEnabled(store)).toBe(true);
  });
});
