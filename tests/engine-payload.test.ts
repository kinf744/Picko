import { describe, expect, it } from "vitest";
import { ZIVPN_FIXED_OBFS, TUNNEL_KINDS, createProfile, type TunnelProfile } from "../lib/vpn/tunnel-profiles";
import { buildEnginePayload, toEngineProfile } from "../lib/vpn/engine-payload";

// Profils entièrement renseignés pour chaque famille (mêmes valeurs de référence
// que tests/tunnel-profiles.test.ts) — toutes valides côté #154.
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

// Champ `method` attendu par le moteur natif pour chaque famille #154.
const EXPECTED_METHOD: Record<TunnelProfile["kind"], string> = {
  zivpn: "zivpn-udp",
  slowdns: "ssh-slowdns",
  hysteria: "hysteria-udp",
  "http-payload": "http-proxy-payload",
  "ssh-tls": "ssh-ssl-tls",
  "v2ray-slowdns": "v2ray-dns",
  "xray-v2ray": "xray",
};

// Champs que `TunnelProfile.validate()` exige non vides côté natif, par `method`.
// Référence : modules/kighmu-vpn-native/.../TunnelProfile.kt (bloc validate()).
const REQUIRED_ENGINE_FIELDS: Record<string, string[]> = {
  "zivpn-udp": ["host", "port", "obfs", "password"],
  "ssh-slowdns": ["sshHost", "sshPort", "sshUser", "password", "dnsServer", "dnsPort", "nameserver", "publicKey"],
  "hysteria-udp": ["hysteriaHost", "hysteriaPort", "hysteriaAuth", "hysteriaUpMbps", "hysteriaDownMbps"],
  "http-proxy-payload": ["sshHost", "sshPort", "sshUser", "password", "proxyHost", "proxyPort", "httpPayload"],
  "ssh-ssl-tls": ["sshHost", "sshPort", "sshUser", "password"],
  "v2ray-dns": ["xrayMode", "xrayLink", "dnsServer", "dnsPort", "nameserver", "publicKey"],
  "xray": ["xrayMode", "xrayJson"], // configured() utilise le mode JSON
};

describe("adaptateur de charge utile moteur natif", () => {
  it("traduit chaque famille #154 vers le bon `method` natif", () => {
    TUNNEL_KINDS.forEach((kind) => {
      expect(toEngineProfile(configured(kind)).method).toBe(EXPECTED_METHOD[kind]);
    });
  });

  it("renseigne tous les champs requis par validate() côté natif, sans valeur vide", () => {
    TUNNEL_KINDS.forEach((kind) => {
      const engine = toEngineProfile(configured(kind));
      expect(engine.id).toBeTruthy();
      expect(engine.name).toBeTruthy();
      REQUIRED_ENGINE_FIELDS[engine.method].forEach((field) => {
        expect(engine[field], `${kind} → ${engine.method}.${field}`).toBeTruthy();
      });
    });
  });

  it("injecte l'obfs fixe ZIVPN que #154 ne stocke pas", () => {
    expect(toEngineProfile(configured("zivpn")).obfs).toBe(ZIVPN_FIXED_OBFS);
  });

  it("injecte l'hôte SSH local pour SlowDNS (transport via le pont DNSTT)", () => {
    const engine = toEngineProfile(configured("slowdns"));
    expect(engine.sshHost).toBe("127.0.0.1");
    expect(engine.sshPort).toBe("22");
    expect(engine.sshUser).toBe("demo");
    expect(engine.password).toBe("demo-password");
  });

  it("renomme les champs Hysteria vers le préfixe attendu par le moteur", () => {
    const engine = toEngineProfile(configured("hysteria"));
    expect(engine.hysteriaHost).toBe("198.51.100.12");
    expect(engine.hysteriaPort).toBe("20000-50000");
    expect(engine.hysteriaAuth).toBe("demo-auth");
    expect(engine.hysteriaUpMbps).toBe("10");
    expect(engine.hysteriaDownMbps).toBe("50");
  });

  it("mappe HTTP payload → httpPayload et les identifiants SSH", () => {
    const engine = toEngineProfile(configured("http-payload"));
    expect(engine.httpPayload).toBe("CONNECT [host]:[port] HTTP/1.1[crlf][crlf]");
    expect(engine.proxyHost).toBe("198.51.100.13");
    expect(engine.sshHost).toBe("ssh.demo.example");
    expect(engine.sshUser).toBe("demo");
    expect(engine.password).toBe("demo-password");
  });

  it("mappe SSH SSL/TLS : tlsHost/tlsPort → sshHost/sshPort et sni → sslSni", () => {
    const engine = toEngineProfile(configured("ssh-tls"));
    expect(engine.sshHost).toBe("198.51.100.15");
    expect(engine.sshPort).toBe("443");
    expect(engine.sslSni).toBe("tls.demo.example");
    expect(engine.sshUser).toBe("demo");
    expect(engine.password).toBe("demo-password");
  });

  it("force le mode lien pour V2Ray+SlowDNS et conserve les champs DNS", () => {
    const engine = toEngineProfile(configured("v2ray-slowdns"));
    expect(engine.xrayMode).toBe("link");
    expect(engine.xrayLink).toContain("vless://");
    expect(engine.dnsServer).toBe("198.51.100.14");
    expect(engine.nameserver).toBe("t.demo.example");
    expect(engine.publicKey).toBe("0123456789abcdef");
  });

  it("reporte le mode d'entrée Xray/V2Ray (lien ou JSON)", () => {
    const jsonProfile = configured("xray-v2ray");
    const engineJson = toEngineProfile(jsonProfile);
    expect(engineJson.xrayMode).toBe("json");
    expect(engineJson.xrayJson).toContain("outbounds");

    if (jsonProfile.kind !== "xray-v2ray") throw new Error("Profil Xray attendu");
    const linkProfile: TunnelProfile = { ...jsonProfile, inputMode: "link", link: "vmess://abc", json: "" };
    const engineLink = toEngineProfile(linkProfile);
    expect(engineLink.xrayMode).toBe("link");
    expect(engineLink.xrayLink).toBe("vmess://abc");
  });

  it("n'expose aucun nom de champ propre au frontend #154", () => {
    // Le moteur ignore les clés inconnues, mais leur présence signalerait un mappage oublié.
    const frontendOnly = ["kind", "selected", "createdAt", "updatedAt", "sshUsername", "sshPassword", "tlsHost", "tlsPort", "sni", "payload", "auth", "uploadMbps", "downloadMbps", "inputMode", "link", "json"];
    TUNNEL_KINDS.forEach((kind) => {
      const engine = toEngineProfile(configured(kind));
      frontendOnly.forEach((field) => {
        expect(engine[field], `${kind} ne doit pas exposer ${field}`).toBeUndefined();
      });
    });
  });

  it("emballe les profils sélectionnés sous la clé `profiles` attendue par parseMany", () => {
    const selected = [configured("zivpn"), configured("hysteria")];
    const payload = JSON.parse(buildEnginePayload(selected));
    expect(Object.keys(payload)).toEqual(["profiles"]);
    expect(payload.profiles).toHaveLength(2);
    expect(payload.profiles[0].method).toBe("zivpn-udp");
    expect(payload.profiles[1].method).toBe("hysteria-udp");
  });
});
