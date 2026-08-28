import { describe, expect, it } from "vitest";
import { TUNNEL_KINDS, cloneTunnelProfile, createProfile, defaultBalancer, omitSecrets, profileEndpoint, type TunnelProfile } from "../lib/vpn/tunnel-profiles";
import { validateTunnelProfile } from "../lib/vpn/validation";

const configured = (kind: TunnelProfile["kind"]): TunnelProfile => {
  const profile = createProfile(kind);
  switch (profile.kind) {
    case "zivpn": return { ...profile, name: "ZIVPN A", host: "198.51.100.10", port: "6000-19999", password: "demo-password" };
    case "slowdns": return { ...profile, name: "SlowDNS A", dnsServer: "198.51.100.11", dnsPort: "53", nameserver: "t.demo.example", publicKey: "0123456789abcdef", sshUsername: "demo", sshPassword: "demo-password" };
    case "hysteria": return { ...profile, name: "Hysteria A", host: "198.51.100.12", port: "20000-50000", auth: "demo-auth", obfs: "demo-obfs", uploadMbps: "10", downloadMbps: "50" };
    case "http-payload": return { ...profile, name: "HTTP Payload A", proxyHost: "198.51.100.13", proxyPort: "8080", payload: "CONNECT [host]:[port] HTTP/1.1[crlf][crlf]", sshHost: "ssh.demo.example", sshPort: "22", sshUsername: "demo", sshPassword: "demo-password" };
    case "ssh-tls": return { ...profile, name: "SSH TLS A", tlsHost: "198.51.100.15", tlsPort: "443", sni: "tls.demo.example", sshUsername: "demo", sshPassword: "demo-password" };
    case "v2ray-slowdns": return { ...profile, name: "V2 SlowDNS A", dnsServer: "198.51.100.14", dnsPort: "5353", nameserver: "t.demo.example", publicKey: "0123456789abcdef", inputMode: "link", link: "vless://00000000-0000-0000-0000-000000000000@v2.demo.example:443" };
    case "xray-v2ray": return { ...profile, name: "Xray A", inputMode: "json", link: "", json: "{\"inbounds\":[],\"outbounds\":[]}" };
  }
};

describe("modèle de profils multi-tunnels", () => {
  it("crée un profil isolé pour chacune des sept familles", () => {
    expect(TUNNEL_KINDS).toHaveLength(7);
    expect(TUNNEL_KINDS).not.toContain("v2ray-dns");
    TUNNEL_KINDS.forEach((kind) => {
      const profile = createProfile(kind);
      expect(profile.kind).toBe(kind);
      expect(profile.id).toContain(kind);
      expect(profile.selected).toBe(false);
    });
  });

  it("pré-remplit les valeurs par défaut utilisables (ports ZIVPN/Hysteria, DNS publics)", () => {
    const zivpn = createProfile("zivpn");
    if (zivpn.kind !== "zivpn") throw new Error("Profil ZIVPN attendu");
    expect(zivpn.port).toBe("6000-19999");

    const hysteria = createProfile("hysteria");
    if (hysteria.kind !== "hysteria") throw new Error("Profil Hysteria attendu");
    expect(hysteria.port).toBe("20000-50000");

    const slowdns = createProfile("slowdns");
    if (slowdns.kind !== "slowdns") throw new Error("Profil SlowDNS attendu");
    expect(slowdns.dnsServer).toBe("8.8.8.8");

    const v2dns = createProfile("v2ray-slowdns");
    if (v2dns.kind !== "v2ray-slowdns") throw new Error("Profil V2Ray+SlowDNS attendu");
    expect(v2dns.dnsServer).toBe("8.8.8.8");

    // Les valeurs par défaut sont directement valides côté moteur.
    expect(validateTunnelProfile({ ...zivpn, host: "198.51.100.10", password: "secret", name: "ZIVPN" }).port).toBeUndefined();
    expect(validateTunnelProfile({ ...hysteria, host: "198.51.100.12", auth: "a", obfs: "o", name: "H" }).port).toBeUndefined();
  });

  it("initialise et valide les débits UDP-ZIVPN", () => {
    const profile = createProfile("zivpn");
    if (profile.kind !== "zivpn") throw new Error("Profil ZIVPN attendu");
    expect(profile.uploadMbps).toBe("10");
    expect(profile.downloadMbps).toBe("50");
    expect(validateTunnelProfile({ ...profile, host: "198.51.100.10", port: "6000-19999", password: "secret", name: "ZIVPN" })).toEqual({});
    expect(validateTunnelProfile({ ...profile, host: "198.51.100.10", port: "6000-19999", password: "secret", uploadMbps: "0", name: "ZIVPN" }).uploadMbps).toBeTruthy();
  });

  it("valide une configuration complète pour chaque famille", () => {
    TUNNEL_KINDS.forEach((kind) => expect(validateTunnelProfile(configured(kind))).toEqual({}));
  });

  it("n’accepte pas un JSON Xray invalide", () => {
    const xray = configured("xray-v2ray");
    if (xray.kind !== "xray-v2ray") throw new Error("Profil Xray attendu");
    expect(validateTunnelProfile({ ...xray, inputMode: "json", json: "pas du json" }).json).toBeTruthy();
  });

  it("exige un lien VMess, VLESS ou Trojan pour V2Ray+SlowDNS", () => {
    const v2 = configured("v2ray-slowdns");
    if (v2.kind !== "v2ray-slowdns") throw new Error("Profil V2Ray+SlowDNS attendu");
    expect(validateTunnelProfile({ ...v2, link: "configuration-json" }).link).toBeTruthy();
    expect(validateTunnelProfile(v2)).toEqual({});
  });

  it("retire les secrets avant persistance publique", () => {
    const zivpn = configured("zivpn");
    const publicProfile = omitSecrets(zivpn);
    expect(publicProfile.kind).toBe("zivpn");
    if (publicProfile.kind === "zivpn") {
      expect(publicProfile.password).toBe("");
    }
    const httpPayload = configured("http-payload");
    if (httpPayload.kind === "http-payload") {
      const publicHttp = omitSecrets(httpPayload);
      if (publicHttp.kind === "http-payload") {
        expect(publicHttp.payload).toBe("");
        expect(publicHttp.sshPassword).toBe("");
      }
    }
  });

  it("clone un profil sans modifier sa famille ni réutiliser son identité", () => {
    const source = { ...configured("slowdns"), selected: true };
    const clone = cloneTunnelProfile(source, 1_700_000_000_000);
    expect(clone.kind).toBe("slowdns");
    expect(clone.id).not.toBe(source.id);
    expect(clone.name).toBe("SlowDNS A — copie");
    expect(clone.selected).toBe(false);
    if (clone.kind === "slowdns" && source.kind === "slowdns") expect(clone.sshPassword).toBe(source.sshPassword);
  });

  it("prépare un balancier local désactivé et sans stratégie inter-tunnels", () => {
    expect(defaultBalancer()).toEqual({ enabled: false, strategy: "round-robin", healthCheck: true });
  });

  it("présente un endpoint non sensible dans la liste de profils", () => {
    expect(profileEndpoint(configured("zivpn"))).toBe("198.51.100.10:6000-19999");
    expect(profileEndpoint(configured("http-payload"))).toBe("198.51.100.13:8080");
    expect(profileEndpoint(configured("ssh-tls"))).toBe("198.51.100.15:443");
    expect(profileEndpoint(configured("xray-v2ray"))).toBe("JSON Xray/V2Ray");
  });
});
