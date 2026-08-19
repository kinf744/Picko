import { describe, expect, it } from "vitest";

import { buildClipboardPayload, buildConfigExport, parseConfigImport } from "../lib/vpn/config-transfer";
import { DEFAULT_EXPORT_RESTRICTIONS, normalizeExportRestrictions } from "../lib/vpn/export-restrictions";
import { createProfile, defaultBalancer, shouldUseRoundRobin, type TunnelKind, type TunnelProfile, type ZivpnProfile } from "../lib/vpn/tunnel-profiles";

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
    profiles.zivpn = [makeZivpn({ name: "Principal", host: "203.0.113.10", port: "5667", password: "secret-password" })];
    const exported = buildConfigExport(profiles, emptyBalancers(), ["zivpn"], false);

    expect(exported.containsSecrets).toBe(false);
    expect(exported.tunnels).toHaveLength(1);
    expect(exported.tunnels[0].kind).toBe("zivpn");
    expect(exported.tunnels[0].profiles[0]).toMatchObject({ host: "203.0.113.10", port: "5667", password: "" });
  });

  it("importe un profil public exporté sans rejeter les secrets volontairement absents", () => {
    const profiles = emptyProfiles();
    profiles.zivpn = [makeZivpn({ host: "203.0.113.10", port: "5667", password: "secret-password" })];
    const exported = buildConfigExport(profiles, emptyBalancers(), ["zivpn"], false);
    const imported = parseConfigImport(JSON.stringify(exported));

    expect(imported.importedKinds).toEqual(["zivpn"]);
    expect(imported.importedProfiles).toBe(1);
    expect(imported.tunnels[0].profiles[0]).toMatchObject({ kind: "zivpn", host: "203.0.113.10", port: "5667", password: "" });
  });

  it("produit et relit un Clipboard kighmu:// Base64", () => {
    const profiles = emptyProfiles();
    profiles.zivpn = [makeZivpn({ name: "Mobile", host: "203.0.113.10", port: "5667", password: "secret-password" })];
    const clipboard = buildClipboardPayload(buildConfigExport(profiles, emptyBalancers(), ["zivpn"], false));

    expect(clipboard).toMatch(/^kighmu:\/\/[A-Za-z0-9+/=]+$/);
    expect(parseConfigImport(clipboard).tunnels[0].profiles[0]).toMatchObject({ kind: "zivpn", name: "Mobile", password: "" });
  });

  it("active le round robin seulement à partir de deux profils sélectionnés", () => {
    expect(shouldUseRoundRobin(0)).toBe(false);
    expect(shouldUseRoundRobin(1)).toBe(false);
    expect(shouldUseRoundRobin(2)).toBe(true);
    expect(shouldUseRoundRobin(3)).toBe(true);
  });

  it("conserve les restrictions sélectionnées dans un export compatible", () => {
    const profiles = emptyProfiles();
    profiles.zivpn = [makeZivpn({ host: "203.0.113.10", port: "5667", password: "secret-password" })];
    const restrictions = { ...DEFAULT_EXPORT_RESTRICTIONS, lockConfiguration: true, mobileDataOnly: true, blockRootedDevice: true, expiresAt: "2027-12-31", userNote: "Configuration réservée aux utilisateurs autorisés." };
    const exported = buildConfigExport(profiles, emptyBalancers(), ["zivpn"], false, restrictions);
    const imported = parseConfigImport(JSON.stringify(exported));

    expect(exported.schemaVersion).toBe(2);
    expect(imported.restrictions).toMatchObject({ lockConfiguration: true, mobileDataOnly: true, blockRootedDevice: true, expiresAt: "2027-12-31", userNote: "Configuration réservée aux utilisateurs autorisés." });
  });

  it("normalise une expiration absente ou littérale null sans créer de date active", () => {
    expect(normalizeExportRestrictions({ expiresAt: null }).expiresAt).toBeNull();
    expect(normalizeExportRestrictions({ expiresAt: "null" }).expiresAt).toBeNull();
    expect(normalizeExportRestrictions({ expiresAt: "" }).expiresAt).toBeNull();
  });

  it("normalise et conserve les listes Hardware ID et opérateurs autorisés", () => {
    const profiles = emptyProfiles();
    profiles.zivpn = [makeZivpn({ host: "203.0.113.10", port: "5667", password: "secret-password" })];
    const restrictions = { ...DEFAULT_EXPORT_RESTRICTIONS, bindDeviceId: true, lockMobileOperator: true, allowedHardwareIds: ["b1cd cfa8 3952 5e38 b3b8 b6db cd28 da5f", "INVALIDE"], allowedMobileOperators: ["20801", " 310260 "] };
    const imported = parseConfigImport(JSON.stringify(buildConfigExport(profiles, emptyBalancers(), ["zivpn"], false, restrictions)));

    expect(imported.restrictions).toMatchObject({ bindDeviceId: true, lockMobileOperator: true, allowedHardwareIds: ["B1CDCFA839525E38B3B8B6DBCD28DA5F"], allowedMobileOperators: ["20801", "310260"] });
  });

  it("refuse un fichier qui ne suit pas le schéma KIGHMU VPN", () => {
    expect(() => parseConfigImport(JSON.stringify({ schemaVersion: 1, application: "Autre application", tunnels: [] }))).toThrow("configuration KIGHMU VPN compatible");
  });
});
