import { describe, expect, it } from "vitest";

import { buildConfigExport, parseConfigImport } from "../lib/vpn/config-transfer";
import { createProfile, defaultBalancer, type TunnelKind, type TunnelProfile, type ZivpnProfile } from "../lib/vpn/tunnel-profiles";

const emptyProfiles = () => ({
  zivpn: [], slowdns: [], hysteria: [], "http-payload": [], "ssh-tls": [], "v2ray-slowdns": [], "xray-v2ray": [],
}) as Record<TunnelKind, TunnelProfile[]>;

const emptyBalancers = () => ({
  zivpn: defaultBalancer(), slowdns: defaultBalancer(), hysteria: defaultBalancer(), "http-payload": defaultBalancer(), "ssh-tls": defaultBalancer(), "v2ray-slowdns": defaultBalancer(), "xray-v2ray": defaultBalancer(),
});

const makeZivpn = (patch: Partial<ZivpnProfile> = {}): ZivpnProfile => ({ ...createProfile("zivpn"), ...patch, kind: "zivpn" } as ZivpnProfile);

describe("transfert de configurations KIGHMU VPN", () => {
  it("exporte uniquement les familles sélectionnées et retire les secrets par défaut", () => {
    const profiles = emptyProfiles();
    profiles.zivpn = [makeZivpn({ name: "Principal", host: "203.0.113.10", port: "5667", obfs: "secret-obfs", password: "secret-password" })];
    const exported = buildConfigExport(profiles, emptyBalancers(), ["zivpn"], false);

    expect(exported.containsSecrets).toBe(false);
    expect(exported.tunnels).toHaveLength(1);
    expect(exported.tunnels[0].kind).toBe("zivpn");
    expect(exported.tunnels[0].profiles[0]).toMatchObject({ host: "203.0.113.10", port: "5667", obfs: "", password: "" });
  });

  it("importe un profil public exporté sans rejeter les secrets volontairement absents", () => {
    const profiles = emptyProfiles();
    profiles.zivpn = [makeZivpn({ host: "203.0.113.10", port: "5667", obfs: "secret-obfs", password: "secret-password" })];
    const exported = buildConfigExport(profiles, emptyBalancers(), ["zivpn"], false);
    const imported = parseConfigImport(JSON.stringify(exported));

    expect(imported.importedKinds).toEqual(["zivpn"]);
    expect(imported.importedProfiles).toBe(1);
    expect(imported.tunnels[0].profiles[0]).toMatchObject({ kind: "zivpn", host: "203.0.113.10", port: "5667", obfs: "", password: "" });
  });

  it("refuse un fichier qui ne suit pas le schéma KIGHMU VPN", () => {
    expect(() => parseConfigImport(JSON.stringify({ schemaVersion: 1, application: "Autre application", tunnels: [] }))).toThrow("configuration KIGHMU VPN compatible");
  });
});
