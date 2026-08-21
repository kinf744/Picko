import { describe, expect, it } from "vitest";

import { createConfigurationExport, parseConfigurationImport } from "../lib/vpn/config-transfer";
import { createEmptyProfile } from "../lib/vpn/profiles";
import { DEFAULT_VPN_SETTINGS } from "../lib/vpn/settings-context";

describe("sauvegarde de configuration Picko", () => {
  it("exporte puis importe un profil complet", () => {
    const profile = {
      ...createEmptyProfile("ssh-ssl-tls"),
      name: "TLS principal",
      sshHost: "vpn.example.test",
      sshPort: "443",
      sshUser: "alice",
      password: "mot-de-passe-visible",
      sslSni: "cdn.example.test",
    };
    const exported = createConfigurationExport([profile], { ...DEFAULT_VPN_SETTINGS, mtu: "1420", customDnsEnabled: true });
    const imported = parseConfigurationImport(JSON.stringify(exported));
    expect(imported.profiles).toHaveLength(1);
    expect(imported.profiles[0].password).toBe("mot-de-passe-visible");
    expect(imported.profiles[0].method).toBe("ssh-ssl-tls");
    expect(imported.settings.mtu).toBe("1420");
  });

  it("rejette un fichier qui n’est pas une sauvegarde Picko", () => {
    expect(() => parseConfigurationImport(JSON.stringify({ profiles: [] }))).toThrow("sauvegarde Picko compatible");
  });

  it("rejette les profils dont la méthode n’est pas reconnue", () => {
    const invalid = { format: "picko-vpn-config", version: 1, profiles: [{ method: "unknown" }], settings: {} };
    expect(() => parseConfigurationImport(JSON.stringify(invalid))).toThrow("méthode inconnue");
  });
});
