import { describe, expect, it } from "vitest";

import { formatDiagnosticTime, formatSshServerMessage, isNavigationDiagnostic, isSshBanner, isSshServerMessage, sanitizeDiagnosticMessage, sanitizeDiagnosticText, shouldSkipJournalEntry } from "../lib/vpn/diagnostic-format";

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

  it("distingue le message serveur post-authentification et préserve son contenu utile", () => {
    const message = "<b>VPS-PRO</b><br><font color='#16A34A'>Utilisateur : test</font> password: valeur";
    expect(isSshServerMessage("SSH_SERVER_MESSAGE")).toBe(true);
    expect(isSshBanner("SSH_SERVER_MESSAGE")).toBe(false);
    const safe = sanitizeDiagnosticMessage("SSH_SERVER_MESSAGE", message);
    expect(safe).toContain("VPS-PRO");
    expect(safe).toContain("password: ••••••");
    const segments = formatSshServerMessage(safe);
    expect(segments.some((segment) => segment.bold && segment.text.includes("VPS-PRO"))).toBe(true);
    expect(segments.some((segment) => segment.color === "#16a34a" && segment.text.includes("Utilisateur"))).toBe(true);
  });

  it("formate un horaire stable et gère une date invalide", () => {
    expect(formatDiagnosticTime("invalide")).toBe("--:--:--");
    expect(formatDiagnosticTime("2026-08-19T11:15:24.000Z")).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

describe("filtre anti-navigation du journal", () => {
  it("ignore les entrées info/connection liées à la navigation, au stockage et à l'import", () => {
    expect(shouldSkipJournalEntry("info", "STORAGE", "Profil enregistré")).toBe(true);
    expect(shouldSkipJournalEntry("connection", "IMPORT", "Configuration importée : 3 profil(s)")).toBe(true);
    expect(shouldSkipJournalEntry("info", "ROUTER", "screen focus /index")).toBe(true);
    expect(shouldSkipJournalEntry("info", "NATIVE", "Balayage vers l'onglet configuration")).toBe(true);
    expect(shouldSkipJournalEntry("info", "UI", "tab switch")).toBe(true);
  });

  it("garde toujours les warnings et erreurs, même liés à la navigation", () => {
    // Journal propre Option 1 : seules les lignes SSH passent
    expect(shouldSkipJournalEntry("warning", "STORAGE", "Une collection n'a pas pu être chargée.")).toBe(true);
    expect(shouldSkipJournalEntry("error", "NAVIGATION", "Échec de navigation")).toBe(true);
  });

  it("garde uniquement les entrées utiles du tunnel SSH (journal propre Option 1)", () => {
    expect(shouldSkipJournalEntry("connection", "SSH_BANNER", "SSH-2.0-OpenSSH_8.2p1")).toBe(false);
    expect(shouldSkipJournalEntry("connection", "SSH_SERVER_MESSAGE", "Response: HTTP/1.1 101 EDOZTUNNEL VPN")).toBe(false);
    expect(shouldSkipJournalEntry("warning", "SSH_SERVER_MESSAGE", "Server Message:\n\nThis server is owned by Edostunnel VPN")).toBe(false);
    expect(shouldSkipJournalEntry("success", "SSH", "Auth complete")).toBe(false);
    expect(shouldSkipJournalEntry("connection", "SSH", "DNS 8.8.8.8")).toBe(false);
    expect(shouldSkipJournalEntry("success", "SSH", "Connected")).toBe(false);
    // Les autres composants sont filtrés pour un journal épuré
    expect(shouldSkipJournalEntry("connection", "SESSION", "Journal de connexion réinitialisé pour UDP-ZIVPN.")).toBe(true);
    expect(shouldSkipJournalEntry("warning", "ANDROID", "L'autorisation VPN doit être confirmée dans la fenêtre système.")).toBe(true);
    expect(shouldSkipJournalEntry("error", "NATIVE", "Échec du démarrage natif : timeout")).toBe(true);
    expect(shouldSkipJournalEntry("info", "CATALOG", "UDP-ZIVPN : 2 profil(s) sélectionné(s)")).toBe(true);
  });
});
