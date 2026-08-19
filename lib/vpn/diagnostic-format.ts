export type DiagnosticLevel = "info" | "connection" | "warning" | "error";

const secretPattern = /((?:password|mot de passe|auth|auth_str|obfs|token|secret|private[_ -]?key|uuid|pkey|publicKey|sshPassword)\s*(?:=|:|\s)\s*)([\s\S]*?)(?=(?:[,;}]|\s+[A-Za-z_][A-Za-z0-9_]*\s*[:=]|$))/gi;
const tunnelLinkPattern = /\b(?:vmess|vless|trojan):\/\/[^\s"'<>]+/gi;
const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const httpPayloadPattern = /\b(?:CONNECT|GET|POST|PUT|PATCH|DELETE)\s+[^\r\n]{0,240}/gi;

export function sanitizeDiagnosticText(value: string, maximum = 420) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(tunnelLinkPattern, "[lien de tunnel masqué]")
    .replace(uuidPattern, "[UUID masqué]")
    .replace(secretPattern, "$1••••••")
    .replace(httpPayloadPattern, "[payload HTTP masqué]")
    .replace(/(\"(?:password|auth|obfs|uuid|privateKey|publicKey)\"\s*:\s*)\"[^\"]*\"/gi, "$1\"••••••\"")
    .trim()
    .slice(0, maximum);
}

export function isNavigationDiagnostic(component: string) {
  return new Set(["NAVIGATION", "STORAGE", "IMPORT", "EXPORT", "UI"]).has(component.trim().toUpperCase());
}

export function isSshBanner(component: string) {
  return component === "SSH_BANNER";
}

export function formatDiagnosticTime(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "--:--:--" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function diagnosticTone(level: DiagnosticLevel) {
  if (level === "error") return "error";
  if (level === "warning") return "warning";
  if (level === "connection") return "connection";
  return "info";
}
