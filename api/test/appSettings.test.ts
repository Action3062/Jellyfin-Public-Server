import { describe, expect, it } from "vitest";
import {
  getBotFlags,
  getSupportStatus,
  getTrialEnabled,
  getTrialParams,
  setBotFlag,
  setSupportStatus,
  setTrialEnabled,
  setTrialParams,
  TRIAL_ENABLED_KEY,
  type SettingsStore
} from "../src/lib/appSettings.js";

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

describe("trial params", () => {
  it("default to null (no override) and round-trip numbers", async () => {
    const { store } = fakeStore();
    expect(await getTrialParams(store)).toEqual({ trialHours: null, nudgeHours: null });
    await setTrialParams(store, { trialHours: 72, nudgeHours: 12 });
    expect(await getTrialParams(store)).toEqual({ trialHours: 72, nudgeHours: 12 });
    await setTrialParams(store, { trialHours: null });
    expect(await getTrialParams(store)).toEqual({ trialHours: null, nudgeHours: 12 });
  });
});

describe("bot flags", () => {
  it("start as null (no override) and store tri-state", async () => {
    const { store } = fakeStore();
    const flags = await getBotFlags(store);
    expect(flags.ai_assistant).toBeNull();
    await setBotFlag(store, "ai_assistant", true);
    expect((await getBotFlags(store)).ai_assistant).toBe(true);
    await setBotFlag(store, "ai_assistant", false);
    expect((await getBotFlags(store)).ai_assistant).toBe(false);
    await setBotFlag(store, "ai_assistant", null);
    expect((await getBotFlags(store)).ai_assistant).toBeNull();
  });
});

describe("support status", () => {
  it("defaults to offline and round-trips", async () => {
    const { store } = fakeStore();
    expect(await getSupportStatus(store)).toEqual({ status: "offline", message: "" });
    await setSupportStatus(store, "online", "Da bis 22 Uhr");
    expect(await getSupportStatus(store)).toEqual({ status: "online", message: "Da bis 22 Uhr" });
  });
});
