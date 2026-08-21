import { describe, expect, it } from "vitest";

import { createConfigurationExport, createKighmuUri, parseConfigurationImport } from "../lib/vpn/config-transfer";
import { createEmptyProfile } from "../lib/vpn/profiles";
import { DEFAULT_VPN_SETTINGS } from "../lib/vpn/settings-context";

const profile = {
  ...createEmptyProfile("ssh-ssl-tls"),
  name: "TLS principal",
  sshHost: "vpn.example.test",
  sshPort: "443",
  sshUser: "alice",
  password: "mot-de-passe-visible",
  sslSni: "cdn.example.test",
};

const settings = { ...DEFAULT_VPN_SETTINGS, mtu: "1420", customDnsEnabled: true };

describe("sauvegarde de configuration Kighmu", () => {
  it("exporte puis importe un bloc .kmu complet", () => {
    const exported = createConfigurationExport([profile], settings, { userMessage: "Configuration de test" });
    const imported = parseConfigurationImport(JSON.stringify(exported));
    expect(imported.source).toBe("kmu");
    expect(imported.profiles).toHaveLength(1);
    expect(imported.profiles[0].password).toBe("mot-de-passe-visible");
    expect(imported.profiles[0].method).toBe("ssh-ssl-tls");
    expect(imported.settings.mtu).toBe("1420");
    expect(imported.policy.userMessage).toBe("Configuration de test");
  });

  it("importe le même bloc depuis une URI kighmu://", () => {
    const uri = createKighmuUri([profile], settings);
    const imported = parseConfigurationImport(uri);
    expect(uri.startsWith("kighmu://")).toBe(true);
    expect(imported.source).toBe("uri");
    expect(imported.profiles[0].sshHost).toBe("vpn.example.test");
  });

  it("refuse une configuration expirée", () => {
    const exported = createConfigurationExport([profile], settings, { expiresAt: "2020-01-01T00:00:00Z" });
    expect(() => parseConfigurationImport(JSON.stringify(exported), { now: new Date("2026-01-01T00:00:00Z") })).toThrow("expirée");
  });

  it("applique le verrouillage Hardware ID à l’import", () => {
    const exported = createConfigurationExport([profile], settings, { lockDeviceId: true, deviceId: "ANDROID-ABC" });
    expect(() => parseConfigurationImport(JSON.stringify(exported), { hardwareId: "ANDROID-XYZ" })).toThrow("Hardware ID");
    expect(parseConfigurationImport(JSON.stringify(exported), { hardwareId: "android-abc" }).profiles).toHaveLength(1);
  });

  it("reste compatible avec les sauvegardes Picko JSON v1", () => {
    const legacy = { format: "picko-vpn-config", version: 1, profiles: [profile], settings };
    expect(parseConfigurationImport(JSON.stringify(legacy)).source).toBe("legacy");
  });

  it("rejette les méthodes de tunnel inconnues", () => {
    const invalid = { format: "kighmu-kmu", version: 2, profiles: [{ method: "unknown" }], settings: {}, policy: {} };
    expect(() => parseConfigurationImport(JSON.stringify(invalid))).toThrow("méthode inconnue");
  });
});
