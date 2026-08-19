export type DiagnosticLevel = "info" | "connection" | "warning" | "error";

const secretPattern = /((?:password|mot de passe|auth|obfs|token|secret|private[_ -]?key)\s*(?:=|:|\s)\s*)([^\s,;]+)/gi;

export function sanitizeDiagnosticText(value: string, maximum = 420) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(secretPattern, "$1••••••")
    .trim()
    .slice(0, maximum);
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
