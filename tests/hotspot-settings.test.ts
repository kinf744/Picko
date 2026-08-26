import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: async (key: string) => {
      store.delete(key);
    },
  },
}));

import { DEFAULT_HOTSPOT_SETTINGS, HOTSPOT_SETTINGS_KEY, loadHotspotSettings, saveHotspotSettings } from "../lib/hotspot-settings";

beforeEach(() => store.clear());

describe("hotspot-settings (mode sans root)", () => {
  it("retombe sur les défauts quand aucun blob n'existe", async () => {
    await expect(loadHotspotSettings()).resolves.toEqual(DEFAULT_HOTSPOT_SETTINGS);
    expect(DEFAULT_HOTSPOT_SETTINGS.killSwitchEnabled).toBe(true);
    expect(DEFAULT_HOTSPOT_SETTINGS.shareArmed).toBe(false);
  });

  it("complète un blob partiel (et absorbe les anciennes clés ssid/password) sans migration", async () => {
    store.set(HOTSPOT_SETTINGS_KEY, JSON.stringify({ killSwitchEnabled: false, ssid: "ancien", password: "ancien" }));
    const loaded = await loadHotspotSettings();
    expect(loaded.killSwitchEnabled).toBe(false);
    expect(Object.keys(loaded)).toEqual(Object.keys(DEFAULT_HOTSPOT_SETTINGS));
    expect(Object.keys(DEFAULT_HOTSPOT_SETTINGS)).not.toContain("ssid");
    expect(Object.keys(DEFAULT_HOTSPOT_SETTINGS)).not.toContain("password");
  });

  it("blob corrompu → défauts", async () => {
    store.set(HOTSPOT_SETTINGS_KEY, "{not json");
    await expect(loadHotspotSettings()).resolves.toEqual(DEFAULT_HOTSPOT_SETTINGS);
  });

  it("round-trip save/load", async () => {
    const next = { ...DEFAULT_HOTSPOT_SETTINGS, lanProxyPort: 9999, shareArmed: true, lanProxyEnabled: true };
    await saveHotspotSettings(next);
    await expect(loadHotspotSettings()).resolves.toEqual(next);
  });
});
