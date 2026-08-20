import { describe, expect, it } from "vitest";
import { validateVpnConfig, type VpnValidationConfig } from "../lib/vpn/validation";

const valid: VpnValidationConfig = { host: "203.0.113.10", port: "6000-19999", obfs: "salamander-key", password: "secret" };

describe("validateConfig", () => {
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

import { createEmptyProfile } from "../lib/vpn/profiles";
import { validateProfile } from "../lib/vpn/validation";

describe("validateProfile", () => {
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
});
