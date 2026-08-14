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

  it("requires host, port and userpass while Obfs remains fixed", () => {
    const errors = validateVpnConfig({ host: "", port: "", obfs: "", password: "" });
    expect(Object.keys(errors).sort()).toEqual(["host", "password", "port"]);
  });
});
