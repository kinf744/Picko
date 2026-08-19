export type DiagnosticLevel = "info" | "connection" | "warning" | "error";
export type ServerMessageSegment = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; color?: string };

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
  return component.trim().toUpperCase() === "SSH_BANNER";
}

export function isSshServerMessage(component: string) {
  return component.trim().toUpperCase() === "SSH_SERVER_MESSAGE";
}

export function sanitizeDiagnosticMessage(component: string, value: string) {
  return sanitizeDiagnosticText(value, isSshServerMessage(component) ? 6_000 : 420);
}

const namedMessageColors: Record<string, string> = {
  blue: "#2563EB", cyan: "#0891B2", green: "#16A34A", orange: "#D97706", pink: "#DB2777", purple: "#7C3AED", red: "#DC2626", teal: "#0F766E", yellow: "#CA8A04",
};

function decodeHtmlEntities(value: string) {
  return value.replace(/&(nbsp|amp|lt|gt|quot|#39);/gi, (_match, entity: string) => ({ nbsp: " ", amp: "&", lt: "<", gt: ">", quot: "\"", "#39": "'" }[entity.toLowerCase()] ?? ""));
}

function allowedMessageColor(value?: string) {
  const candidate = (value ?? "").trim().toLowerCase();
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(candidate)) return candidate;
  return namedMessageColors[candidate];
}

/** Parses a deliberately small, safe HTML subset used by optional SSH MOTD messages. */
export function formatSshServerMessage(value: string): ServerMessageSegment[] {
  const segments: ServerMessageSegment[] = [];
  const stack: Array<Omit<ServerMessageSegment, "text">> = [{}];
  const append = (text: string) => {
    if (!text) return;
    const style = stack[stack.length - 1];
    const previous = segments[segments.length - 1];
    if (previous && previous.bold === style.bold && previous.italic === style.italic && previous.underline === style.underline && previous.color === style.color) previous.text += decodeHtmlEntities(text);
    else segments.push({ text: decodeHtmlEntities(text), ...style });
  };
  const tokens = value.replace(/\r\n?/g, "\n").split(/(<[^>]{1,240}>)/g);
  for (const token of tokens) {
    if (!token) continue;
    if (!token.startsWith("<") || !token.endsWith(">")) { append(token); continue; }
    const closing = /^<\s*\//.test(token);
    const name = token.match(/^<\s*\/?\s*([a-z0-9]+)/i)?.[1]?.toLowerCase();
    if (!name) continue;
    if (name === "br") { append("\n"); continue; }
    if (name === "p" || name === "div") { if (closing) append("\n"); continue; }
    if (closing) { if (stack.length > 1) stack.pop(); continue; }
    const parent = stack[stack.length - 1];
    const color = allowedMessageColor(token.match(/(?:color\s*=|color\s*:)\s*["']?\s*(#[0-9a-f]{3,8}|[a-z]+)/i)?.[1]);
    stack.push({ ...parent, bold: parent.bold || name === "b" || name === "strong", italic: parent.italic || name === "i" || name === "em", underline: parent.underline || name === "u", color: color ?? parent.color });
  }
  return segments.length ? segments : [{ text: value }];
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
