import { describe, expect, it } from "vitest";

import { formatDiagnosticTime, isNavigationDiagnostic, isSshBanner, sanitizeDiagnosticText } from "../lib/vpn/diagnostic-format";

describe("format du journal Diagnostic", () => {
  it("masque les valeurs sensibles dans les sorties de tunnel", () => {
    expect(sanitizeDiagnosticText("password: super-secret auth=token-123")).toBe("password: •••••• auth=••••••");
  });

  it("masque les liens, UUID et payloads sans exposer les valeurs", () => {
    const value = "vless://11111111-1111-4111-8111-111111111111@node.example:443?type=ws&path=%2Fsecret CONNECT /private HTTP/1.1";
    const sanitized = sanitizeDiagnosticText(value);
    expect(sanitized).not.toContain("vless://");
    expect(sanitized).not.toContain("11111111-1111-4111-8111-111111111111");
    expect(sanitized).toContain("[payload HTTP masqué]");
  });

  it("classe le stockage et la navigation hors du journal de connexion", () => {
    expect(isNavigationDiagnostic("STORAGE")).toBe(true);
    expect(isNavigationDiagnostic("CATALOG")).toBe(false);
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
