import { describe, expect, it } from "vitest";
import { createEmptyProfile } from "../lib/vpn/profiles";
import { validateHysteriaConfig, validateProfile, validateVpnConfig, type VpnValidationConfig } from "../lib/vpn/validation";

const valid: VpnValidationConfig = { host: "203.0.113.10", port: "6000-19999", obfs: "salamander-key", password: "secret" };

describe("validateVpnConfig", () => {
  it("accepts a host, a single port and the required secrets", () => {
    expect(validateVpnConfig({ ...valid, port: "443" })).toEqual({});
  });

  it("accepts an ordered port range within the valid range", () => {
    expect(validateVpnConfig(valid)).toEqual({});
  });

  it("rejects reversed, zero and out-of-range ports", () => {
    expect(validateVpnConfig({ ...valid, port: "19999-6000" }).port).toBeTruthy();
    expect(validateVpnConfig({ ...valid, port: "0" }).port).toBeTruthy();
    expect(validateVpnConfig({ ...valid, port: "1-65536" }).port).toBeTruthy();
  });

  it("requires all connection values", () => {
    const errors = validateVpnConfig({ host: "", port: "", obfs: "", password: "" });
    expect(Object.keys(errors).sort()).toEqual(["host", "obfs", "password", "port"]);
  });
});

describe("validateProfile", () => {
  it("accepts a complete ZiVPN profile without an undefined-name error", () => {
    const profile = {
      ...createEmptyProfile("zivpn-udp"),
      name: "UDP principal",
      host: "203.0.113.10",
      port: "443",
      obfs: "salamander-key",
      password: "secret",
    };
    expect(validateProfile(profile)).toEqual({});
  });

  it("accepts a complete SSH SlowDNS profile", () => {
    const profile = {
      ...createEmptyProfile("ssh-slowdns"),
      name: "DNS primaire",
      sshHost: "ssh.example.test",
      sshPort: "22",
      sshUser: "alice",
      password: "secret",
      dnsServer: "8.8.8.8",
      dnsPort: "53",
      nameserver: "tunnel.example.test",
      publicKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    };
    expect(validateProfile(profile)).toEqual({});
  });

  it("requires the SSH and DNSTT parameters for a SlowDNS profile", () => {
    const errors = validateProfile(createEmptyProfile("ssh-slowdns"));
    expect(errors.sshHost).toBeTruthy();
    expect(errors.sshUser).toBeTruthy();
    expect(errors.password).toBeTruthy();
    expect(errors.nameserver).toBeTruthy();
    expect(errors.publicKey).toBeTruthy();
  });

  it("accepts a complete Hysteria profile with port hopping", () => {
    const profile = {
      ...createEmptyProfile("hysteria-udp"),
      name: "Hysteria principal",
      hysteriaHost: "hysteria.example.test",
      hysteriaPort: "20000-50000",
      hysteriaAuth: "hysteria-secret",
      hysteriaUpMbps: "100",
      hysteriaDownMbps: "200",
      hysteriaObfs: "optional-obfs",
    };
    expect(validateProfile(profile)).toEqual({});
  });

  it("requires the essential Hysteria parameters", () => {
    const errors = validateHysteriaConfig({
      hysteriaHost: "",
      hysteriaPort: "70000",
      hysteriaAuth: "",
      hysteriaUpMbps: "0",
      hysteriaDownMbps: "",
    });
    expect(Object.keys(errors).sort()).toEqual(["hysteriaAuth", "hysteriaDownMbps", "hysteriaHost", "hysteriaPort", "hysteriaUpMbps"]);
  });
});


describe("validation HTTP Proxy et SSH SSL/TLS", () => {
  it("accepte un profil HTTP Proxy payload complet", () => {
    const profile = {
      ...createEmptyProfile("http-proxy-payload"),
      name: "HTTP Proxy principal",
      sshHost: "ssh.example.test",
      sshPort: "22",
      sshUser: "alice",
      password: "secret",
      proxyHost: "proxy.example.test",
      proxyPort: "8080",
      httpPayload: "CONNECT [host]:[port] HTTP/1.1[crlf]Host: [host]:[port][crlf][crlf]",
    };
    expect(validateProfile(profile)).toEqual({});
  });

  it("accepte un profil SSH SSL/TLS avec SNI", () => {
    const profile = {
      ...createEmptyProfile("ssh-ssl-tls"),
      name: "SSH TLS principal",
      sshHost: "tls.example.test",
      sshPort: "443",
      sshUser: "alice",
      password: "secret",
      sslSni: "cdn.example.test",
      sslTlsVersion: "TLSv1.2",
    };
    expect(validateProfile(profile)).toEqual({});
  });

  it("requiert les paramètres HTTP et SSH SSL/TLS essentiels", () => {
    const httpErrors = validateProfile({ ...createEmptyProfile("http-proxy-payload"), name: "HTTP incomplet" });
    expect(httpErrors.proxyHost).toBeTruthy();
    expect(httpErrors.httpPayload).toBeUndefined();
    expect(httpErrors.sshHost).toBeTruthy();
    const tlsErrors = validateProfile({ ...createEmptyProfile("ssh-ssl-tls"), name: "TLS incomplet", sslTlsVersion: "SSLv3" });
    expect(tlsErrors.sshHost).toBeTruthy();
    expect(tlsErrors.sslTlsVersion).toBeTruthy();
  });
});

describe("validation V2Ray DNS", () => {
  it("accepte un profil V2Ray DNS complet", () => {
    const profile = {
      ...createEmptyProfile("v2ray-dns"),
      name: "V2Ray DNS principal",
      xrayMode: "link" as const,
      xrayLink: "vless://11111111-1111-1111-1111-111111111111@example.test:443?type=ws&security=tls&path=%2F#v2dns",
      dnsServer: "8.8.8.8",
      dnsPort: "53",
      nameserver: "tunnel.example.test",
      publicKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    };
    expect(validateProfile(profile)).toEqual({});
  });

  it("requiert Xray et les paramètres DNSTT", () => {
    const errors = validateProfile({ ...createEmptyProfile("v2ray-dns"), name: "V2Ray DNS incomplet" });
    expect(errors.xrayLink).toBeTruthy();
    expect(errors.nameserver).toBeTruthy();
    expect(errors.publicKey).toBeTruthy();
  });
});

describe("validation Xray", () => {
  it("accepte un lien VLESS complet", () => {
    const profile = {
      ...createEmptyProfile("xray"),
      name: "Xray VLESS",
      xrayMode: "link" as const,
      xrayLink: "vless://11111111-1111-1111-1111-111111111111@example.test:443?type=ws&security=tls&path=%2F#xray",
    };
    expect(validateProfile(profile)).toEqual({});
  });

  it("accepte un JSON Xray avec outbounds et rejette un schéma de lien inconnu", () => {
    const jsonProfile = {
      ...createEmptyProfile("xray"),
      name: "Xray JSON",
      xrayMode: "json" as const,
      xrayJson: JSON.stringify({ inbounds: [], outbounds: [{ protocol: "freedom" }] }),
    };
    expect(validateProfile(jsonProfile)).toEqual({});
    const invalidLink = { ...createEmptyProfile("xray"), name: "Xray invalide", xrayLink: "ss://not-supported" };
    expect(validateProfile(invalidLink).xrayLink).toBeTruthy();
  });
});
