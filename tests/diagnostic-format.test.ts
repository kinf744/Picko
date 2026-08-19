import { describe, expect, it } from "vitest";

import { formatDiagnosticTime, isSshBanner, sanitizeDiagnosticText } from "../lib/vpn/diagnostic-format";

describe("format du journal Diagnostic", () => {
  it("masque les valeurs sensibles dans les sorties de tunnel", () => {
    expect(sanitizeDiagnosticText("password: super-secret auth=token-123")).toBe("password: •••••• auth=••••••");
  });

  it("conserve les bannières SSH reçues sans classifier les autres événements comme bannière", () => {
    expect(isSshBanner("SSH_BANNER")).toBe(true);
    expect(isSshBanner("SSH_TLS")).toBe(false);
    expect(sanitizeDiagnosticText("SSH-2.0-OpenSSH_9.6p1 Ubuntu", 240)).toBe("SSH-2.0-OpenSSH_9.6p1 Ubuntu");
  });

  it("formate un horaire stable et gère une date invalide", () => {
    expect(formatDiagnosticTime("invalide")).toBe("--:--:--");
    expect(formatDiagnosticTime("2026-08-19T11:15:24.000Z")).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
