import { describe, expect, it } from "vitest";

import { buildClipboardPayload, buildConfigExport, parseConfigImport } from "../lib/vpn/config-transfer";
import { DEFAULT_EXPORT_RESTRICTIONS, normalizeExportRestrictions } from "../lib/vpn/export-restrictions";
import { createProfile, defaultBalancer, shouldUseRoundRobin, TUNNEL_KINDS, type TunnelKind, type TunnelProfile, type XrayProfile, type ZivpnProfile } from "../lib/vpn/tunnel-profiles";

const emptyProfiles = () => ({
  zivpn: [], slowdns: [], hysteria: [], "http-payload": [], "ssh-tls": [], "v2ray-slowdns": [], "xray-v2ray": [],
}) as Record<TunnelKind, TunnelProfile[]>;

const emptyBalancers = () => ({
  zivpn: defaultBalancer(), slowdns: defaultBalancer(), hysteria: defaultBalancer(), "http-payload": defaultBalancer(), "ssh-tls": defaultBalancer(), "v2ray-slowdns": defaultBalancer(), "xray-v2ray": defaultBalancer(),
});

const makeZivpn = (patch: Partial<ZivpnProfile> = {}): ZivpnProfile => ({ ...createProfile("zivpn"), selected: true, ...patch, kind: "zivpn" } as ZivpnProfile);

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

  it("produit et relit la structure Clipboard VLESS directe attendue", () => {
    const profiles = emptyProfiles();
    profiles["xray-v2ray"] = [{ ...createProfile("xray-v2ray"), selected: true, kind: "xray-v2ray", name: "Jivo", inputMode: "link", link: "vless://1a3829ce-f01e-4899-8537-1b4d188408ef@jiovod.cdn.jio.com:443?type=ws&security=none&path=%2FTELEGRAM&host=pane2.global.ssl.fastly.net#Jivo", json: "" } as XrayProfile];
    const restrictions = { ...DEFAULT_EXPORT_RESTRICTIONS, lockConfiguration: true, blockRootedDevice: true, bindDeviceId: true, allowedHardwareIds: ["B1CDCFA839525E38B3B8B6DBCD28DA5F"], userNote: "VLESS autorisé" };
    const clipboard = buildClipboardPayload(buildConfigExport(profiles, emptyBalancers(), ["xray-v2ray"], true, restrictions));
    const decoded = JSON.parse(Buffer.from(clipboard.slice("kighmu://".length), "base64").toString("utf-8"));
    const imported = parseConfigImport(clipboard);

    expect(decoded).toMatchObject({ type: "VLESS", name: "Jivo", sshTunnelConfig: { sshConfig: { port: 80 } }, vlessTunnelConfig: { v2rayConfig: { host: "jiovod.cdn.jio.com", uuid: "1a3829ce-f01e-4899-8537-1b4d188408ef", tls: false, wsPath: "/TELEGRAM", wsHeaderHost: "pane2.global.ssl.fastly.net" } } });
    expect(imported.tunnels[0].profiles[0]).toMatchObject({ kind: "xray-v2ray", name: "Jivo", inputMode: "link" });
    expect(imported.restrictions).toMatchObject({ lockConfiguration: true, blockRootedDevice: true, bindDeviceId: true, allowedHardwareIds: ["B1CDCFA839525E38B3B8B6DBCD28DA5F"], userNote: "VLESS autorisé" });
  });

  it("conserve les sept familles dans l’enveloppe Clipboard multi-profils", () => {
    const exported = buildConfigExport(emptyProfiles(), emptyBalancers(), [...TUNNEL_KINDS], false);
    const imported = parseConfigImport(buildClipboardPayload(exported));
    expect(imported.importedKinds).toEqual([...TUNNEL_KINDS]);
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

    expect(exported.schemaVersion).toBe(3);
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

  it("n'exporte jamais un profil dont selected vaut false", () => {
    const profiles = emptyProfiles();
    profiles.zivpn = [
      makeZivpn({ name: "Coché", host: "203.0.113.10", port: "5667", password: "secret-A", selected: true }),
      { ...makeZivpn({ name: "Décoché", host: "198.51.100.5", port: "5668", password: "secret-B", selected: false }) },
    ];
    const exported = buildConfigExport(profiles, emptyBalancers(), ["zivpn"], false);

    expect(exported.tunnels).toHaveLength(1);
    expect(exported.tunnels[0].profiles).toHaveLength(1);
    expect(exported.tunnels[0].profiles[0].name).toBe("Coché");
    expect(exported.tunnels[0].profiles[0]).not.toMatchObject({ host: "198.51.100.5" });
  });

  it("filtre chaque famille par selected et n'inclut que les profils cochés", () => {
    const profiles = emptyProfiles();
    profiles.zivpn = [
      makeZivpn({ name: "Z-A", host: "203.0.113.10", port: "5667", selected: true }),
      makeZivpn({ name: "Z-B", host: "203.0.113.11", port: "5668", selected: false }),
    ];
    profiles.hysteria = [
      { ...createProfile("hysteria"), kind: "hysteria", name: "H-A", host: "h.example.com", port: "443", auth: "auth-A", obfs: "obfs-A", uploadMbps: "10", downloadMbps: "50", selected: true } as TunnelProfile,
      { ...createProfile("hysteria"), kind: "hysteria", name: "H-B", host: "h.example.com", port: "443", auth: "auth-B", obfs: "obfs-B", uploadMbps: "10", downloadMbps: "50", selected: false } as TunnelProfile,
    ];
    const exported = buildConfigExport(profiles, emptyBalancers(), ["zivpn", "hysteria"], true);

    expect(exported.tunnels).toHaveLength(2);
    const zivpnTunnel = exported.tunnels.find((t) => t.kind === "zivpn")!;
    const hysteriaTunnel = exported.tunnels.find((t) => t.kind === "hysteria")!;
    expect(zivpnTunnel.profiles.map((p) => p.name)).toEqual(["Z-A"]);
    expect(hysteriaTunnel.profiles.map((p) => p.name)).toEqual(["H-A"]);
  });
});
