import { beforeEach, describe, expect, it, vi } from "vitest";

// Stockage en mémoire : évite de charger le vrai module AsyncStorage (React Native)
// sous Vitest et permet de tester la persistance réelle.
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

import { APP_SETTINGS_KEY, DEFAULT_APP_SETTINGS, loadAppSettings, saveAppSettings } from "../lib/app-settings";
import { toEngineSettings } from "../lib/vpn/engine-payload";

beforeEach(() => store.clear());

describe("app-settings", () => {
  it("retombe sur les défauts quand aucun blob n'existe", async () => {
    await expect(loadAppSettings()).resolves.toEqual(DEFAULT_APP_SETTINGS);
  });

  it("complète un blob partiel (install existante) sans migration", async () => {
    store.set(APP_SETTINGS_KEY, JSON.stringify({ autoReconnect: true }));
    const loaded = await loadAppSettings();
    expect(loaded.autoReconnect).toBe(true);
    expect(loaded.theme).toBe("system");
    expect(loaded.mtu).toBe(DEFAULT_APP_SETTINGS.mtu);
    expect(Object.keys(loaded)).toEqual(Object.keys(DEFAULT_APP_SETTINGS));
  });

  it("blob corrompu → défauts", async () => {
    store.set(APP_SETTINGS_KEY, "{not json");
    await expect(loadAppSettings()).resolves.toEqual(DEFAULT_APP_SETTINGS);
  });

  it("round-trip save/load", async () => {
    const next = { ...DEFAULT_APP_SETTINGS, theme: "dark", mtu: 1450, customDnsEnabled: true, dnsPrimary: "9.9.9.9" } as const;
    await saveAppSettings({ ...next });
    await expect(loadAppSettings()).resolves.toEqual(next);
  });

  it("garde-fou anti-dérive : chaque défaut moteur JS = défaut natif documenté (VpnRuntimeSettings.kt:7-20)", () => {
    // Référence figée — toute divergence des défauts AppSettings doit faire échouer ce test
    // AVANT qu'un utilisateur ne reçoive un moteur au comportement changé sans rien toucher.
    const expected = {
      customDnsEnabled: false,
      dnsPrimary: "1.1.1.1",
      dnsSecondary: "1.0.0.1",
      mtu: 1400,
      wakeLockEnabled: false,
      profileNameInNotification: true,
      httpPingEnabled: true,
      httpPingUrl: "https://www.google.com/generate_204",
      httpPingIntervalMs: 5000,
      httpPingTimeoutMs: 5000,
      reconnectAfterFailures: 3,
      alwaysReconnect: true,
    };
    expect(toEngineSettings(DEFAULT_APP_SETTINGS)).toEqual(expected);
  });

  it("l'identité est neutre par défaut : toEngineSettings(défauts) ne change aucune valeur", () => {
    const engine = toEngineSettings(DEFAULT_APP_SETTINGS);
    expect(engine.mtu).toBe(DEFAULT_APP_SETTINGS.mtu);
    expect(engine.httpPingIntervalMs).toBe(DEFAULT_APP_SETTINGS.httpPingIntervalMs);
    expect(engine.httpPingTimeoutMs).toBe(DEFAULT_APP_SETTINGS.httpPingTimeoutMs);
    expect(engine.reconnectAfterFailures).toBe(DEFAULT_APP_SETTINGS.reconnectAfterFailures);
    expect(engine.dnsPrimary).toBe(DEFAULT_APP_SETTINGS.dnsPrimary);
    expect(engine.dnsSecondary).toBe(DEFAULT_APP_SETTINGS.dnsSecondary);
    expect(engine.httpPingUrl).toBe(DEFAULT_APP_SETTINGS.httpPingUrl);
  });
});
