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
