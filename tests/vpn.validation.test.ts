import { describe, expect, it } from "vitest";
import { validateVpnConfig, type VpnValidationConfig } from "../lib/vpn/validation";

const validZivpn: VpnValidationConfig = {
  mode: "zivpn",
  host: "203.0.113.10",
  port: "6000-19999",
  password: "secret",
  slowDnsUsername: "",
  slowDnsPassword: "",
  slowDnsServer: "",
  slowDnsPort: "53",
  slowDnsNameserver: "",
  slowDnsPublicKey: "",
};

const validSlowDns: VpnValidationConfig = {
  ...validZivpn,
  mode: "slowdns",
  slowDnsUsername: "vpnuser",
  slowDnsPassword: "secret",
  slowDnsServer: "203.0.113.10",
  slowDnsPort: "53",
  slowDnsNameserver: "t.example.com",
  slowDnsPublicKey: "example-public-key",
};

describe("validation des profils VPN", () => {
  it("accepte un profil UDP-ZIVPN complet", () => {
    expect(validateVpnConfig(validZivpn)).toEqual({});
  });

  it("accepte un profil SSH/SlowDNS mono-session complet", () => {
    expect(validateVpnConfig(validSlowDns)).toEqual({});
  });

  it("refuse une plage ZIVPN inversée", () => {
    expect(validateVpnConfig({ ...validZivpn, port: "19999-6000" }).port).toBeTruthy();
  });

  it("refuse un profil SlowDNS sans clé publique", () => {
    expect(validateVpnConfig({ ...validSlowDns, slowDnsPublicKey: "" }).slowDnsPublicKey).toBeTruthy();
  });

  it("refuse un port DNS SlowDNS invalide", () => {
    expect(validateVpnConfig({ ...validSlowDns, slowDnsPort: "0" }).slowDnsPort).toBeTruthy();
  });
});
