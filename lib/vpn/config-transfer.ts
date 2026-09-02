import {
  createProfile,
  defaultBalancer,
  omitSecrets,
  secretFields,
  TUNNEL_KINDS,
  type TunnelBalancer,
  type TunnelKind,
  type TunnelProfile,
} from "./tunnel-profiles";
import { DEFAULT_EXPORT_RESTRICTIONS, normalizeExportRestrictions, type ExportRestrictions } from "./export-restrictions";
import { validateTunnelProfile } from "./validation";

const MAX_IMPORT_BYTES = 1_000_000;
const EXPORT_SCHEMA_VERSION = 2;
const CLIPBOARD_PREFIX = "kighmu://";
const CLIPBOARD_FINGERPRINT_SALT = "kighmu.vpn.config.fingerprint.v2";

export type ConfigExport = {
  schemaVersion: number;
  application: "KIGHMU VPN";
  exportedAt: string;
  containsSecrets: boolean;
  restrictions: ExportRestrictions;
  tunnels: Array<{ kind: TunnelKind; profiles: TunnelProfile[]; balancer: TunnelBalancer }>;
};

export type ImportResult = {
  tunnels: Array<{ kind: TunnelKind; profiles: TunnelProfile[]; balancer: TunnelBalancer }>;
  importedKinds: TunnelKind[];
  importedProfiles: number;
  skippedProfiles: number;
  containsSecrets: boolean;
  restrictions: ExportRestrictions;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isTunnelKind = (value: unknown): value is TunnelKind => typeof value === "string" && TUNNEL_KINDS.includes(value as TunnelKind);

function encodeClipboardBase64(value: string): string {
  const buffer = (globalThis as Record<string, unknown>).Buffer as { from?: (source: string, encoding: string) => { toString: (encoding: string) => string } } | undefined;
  if (buffer?.from) return buffer.from(value, "utf-8").toString("base64");
  if (typeof globalThis.btoa === "function") {
    const bytes = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_match, code: string) => String.fromCharCode(parseInt(code, 16)));
    return globalThis.btoa(bytes);
  }
  throw new Error("Encodage Clipboard indisponible sur cet appareil.");
}

function decodeClipboardBase64(value: string): string {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) throw new Error("Le Clipboard KIGHMU contient un Base64 invalide.");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const buffer = (globalThis as Record<string, unknown>).Buffer as { from?: (source: string, encoding: string) => { toString: (encoding: string) => string } } | undefined;
  if (buffer?.from) return buffer.from(padded, "base64").toString("utf-8");
  if (typeof globalThis.atob === "function") {
    const bytes = globalThis.atob(padded);
    try { return decodeURIComponent(Array.from(bytes).map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")); } catch { return bytes; }
  }
  throw new Error("Décodage Clipboard indisponible sur cet appareil.");
}

function unwrapClipboardPayload(raw: string): string {
  const content = raw.trim();
  return content.startsWith(CLIPBOARD_PREFIX) ? decodeClipboardBase64(content.slice(CLIPBOARD_PREFIX.length)) : content;
}

async function fingerprintClipboardPayload(json: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${CLIPBOARD_FINGERPRINT_SALT}|${json}`);
  const subtle = (globalThis as { crypto?: { subtle?: { digest?: (alg: string, data: ArrayBuffer | Uint8Array) => Promise<ArrayBuffer> } } }).crypto?.subtle;
  if (subtle?.digest) {
    const digest = await subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  }
  let h1 = 0xdeadbeef ^ data.length;
  let h2 = 0x41c6ce57 ^ data.length;
  for (let i = 0; i < data.length; i++) {
    const ch = data[i];
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return ((h2 >>> 0).toString(16) + (h1 >>> 0).toString(16).padStart(8, "0")).slice(0, 32);
}

type DirectVlessClipboard = {
  type: "VLESS";
  name: string;
  sshTunnelConfig: { sshConfig: { port: number } };
  vlessTunnelConfig: { v2rayConfig: { host: string; port: number; uuid: string; tls: boolean; wsPath: string; wsHeaderHost: string } };
  kighmuRestrictions?: ExportRestrictions;
};

function normalizeProfile(kind: TunnelKind, source: unknown): TunnelProfile | null {
  if (!isRecord(source)) return null;
  const base = createProfile(kind) as Record<string, unknown>;
  Object.keys(base).forEach((key) => {
    if (key in source) base[key] = source[key];
  });
  const now = Date.now();
  base.id = `${kind}-${now}-${Math.random().toString(36).slice(2, 8)}`;
  base.kind = kind;
  base.name = typeof base.name === "string" && base.name.trim() ? base.name.trim().slice(0, 120) : `Profil importé ${kind}`;
  base.selected = Boolean(base.selected);
  base.createdAt = now;
  base.updatedAt = now;
  const profile = base as TunnelProfile;
  const errors = validateTunnelProfile(profile);
  const nonSecretErrors = Object.keys(errors).filter((field) => !secretFields(profile).includes(field));
  return nonSecretErrors.length === 0 ? profile : null;
}

function normalizeBalancer(value: unknown): TunnelBalancer {
  if (!isRecord(value)) return defaultBalancer();
  return {
    enabled: Boolean(value.enabled),
    strategy: "round-robin",
    healthCheck: value.healthCheck !== false,
  };
}

function directVlessClipboard(config: ConfigExport): DirectVlessClipboard | null {
  if (!config.containsSecrets || config.tunnels.length !== 1) return null;
  const [tunnel] = config.tunnels;
  const [profile] = tunnel.profiles;
  if (tunnel.kind !== "xray-v2ray" || tunnel.profiles.length !== 1 || profile.kind !== "xray-v2ray" || profile.inputMode !== "link" || !/^vless:\/\//i.test(profile.link.trim())) return null;
  try {
    const link = new URL(profile.link.trim());
    const host = link.hostname.trim();
    const uuid = decodeURIComponent(link.username).trim();
    if (!host || !uuid) return null;
    const query = link.searchParams;
    return {
      type: "VLESS",
      name: profile.name.trim() || "VLESS",
      sshTunnelConfig: { sshConfig: { port: 80 } },
      vlessTunnelConfig: {
        v2rayConfig: {
          host,
          port: Number(link.port) || 443,
          uuid,
          tls: query.get("security") === "tls" || query.get("tls") === "true",
          wsPath: query.get("path") || "/",
          wsHeaderHost: query.get("host") || query.get("sni") || host,
        },
      },
      kighmuRestrictions: normalizeExportRestrictions(config.restrictions),
    };
  } catch { return null; }
}

function importDirectVless(value: unknown): ImportResult | null {
  if (!isRecord(value) || String(value.type).toUpperCase() !== "VLESS" || !isRecord(value.vlessTunnelConfig) || !isRecord(value.vlessTunnelConfig.v2rayConfig)) return null;
  const config = value.vlessTunnelConfig.v2rayConfig;
  const host = typeof config.host === "string" ? config.host.trim() : "";
  const uuid = typeof config.uuid === "string" ? config.uuid.trim() : "";
  if (!host || !uuid) return null;
  const port = Number(config.port) || 443;
  const tls = config.tls === true;
  const wsPath = typeof config.wsPath === "string" && config.wsPath.trim() ? config.wsPath.trim() : "/";
  const wsHeaderHost = typeof config.wsHeaderHost === "string" && config.wsHeaderHost.trim() ? config.wsHeaderHost.trim() : host;
  const name = typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 120) : "Profil VLESS importé";
  const link = `vless://${encodeURIComponent(uuid)}@${host}:${port}?type=ws&security=${tls ? "tls" : "none"}&path=${encodeURIComponent(wsPath)}&host=${encodeURIComponent(wsHeaderHost)}#${encodeURIComponent(name)}`;
  const profile = normalizeProfile("xray-v2ray", { name, inputMode: "link", link });
  if (!profile) return null;
  return {
    tunnels: [{ kind: "xray-v2ray", profiles: [profile], balancer: defaultBalancer() }],
    importedKinds: ["xray-v2ray"],
    importedProfiles: 1,
    skippedProfiles: 0,
    containsSecrets: true,
    restrictions: normalizeExportRestrictions(value.kighmuRestrictions ?? value.restrictions),
  };
}

export function buildConfigExport(
  profilesByKind: Record<TunnelKind, TunnelProfile[]>,
  balancersByKind: Record<TunnelKind, TunnelBalancer>,
  kinds: TunnelKind[],
  includeSecrets = false,
  restrictions: ExportRestrictions = DEFAULT_EXPORT_RESTRICTIONS,
): ConfigExport {
  const uniqueKinds = TUNNEL_KINDS.filter((kind) => kinds.includes(kind));
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    application: "KIGHMU VPN",
    exportedAt: new Date().toISOString(),
    containsSecrets: includeSecrets,
    restrictions: normalizeExportRestrictions(restrictions),
    tunnels: uniqueKinds.map((kind) => ({
      kind,
      profiles: profilesByKind[kind]
        .filter((profile) => profile.selected !== false)
        .map((profile) => includeSecrets ? { ...profile } : omitSecrets(profile)),
      balancer: { ...balancersByKind[kind] },
    })),
  };
}

export async function buildClipboardPayloadAsync(config: ConfigExport): Promise<string> {
  const json = JSON.stringify(directVlessClipboard(config) ?? config);
  if (json.length > MAX_IMPORT_BYTES) throw new Error("La configuration est trop volumineuse pour le Clipboard.");
  const signature = await fingerprintClipboardPayload(json);
  return `${CLIPBOARD_PREFIX}${encodeClipboardBase64(JSON.stringify({ payload: json, signature }))}`;
}

export function buildClipboardPayload(config: ConfigExport): string {
  const json = JSON.stringify(directVlessClipboard(config) ?? config);
  if (json.length > MAX_IMPORT_BYTES) throw new Error("La configuration est trop volumineuse pour le Clipboard.");
  return `${CLIPBOARD_PREFIX}${encodeClipboardBase64(json)}`;
}

export async function parseConfigImportAsync(raw: string): Promise<ImportResult> {
  const content = unwrapClipboardPayload(raw);
  if (content.length > MAX_IMPORT_BYTES) throw new Error("Le fichier dépasse la taille maximale autorisée (1 Mo).");
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("Le fichier ou Clipboard ne contient pas un JSON valide."); }
  if (isRecord(parsed) && typeof parsed.payload === "string" && typeof parsed.signature === "string") {
    const expected = await fingerprintClipboardPayload(parsed.payload);
    if (expected !== parsed.signature) throw new Error("L’empreinte du payload ne correspond pas : configuration altérée.");
    return parseConfigImport(parsed.payload);
  }
  return parseConfigImport(content);
}

export function parseConfigImport(raw: string): ImportResult {
  const content = unwrapClipboardPayload(raw);
  if (content.length > MAX_IMPORT_BYTES) throw new Error("Le fichier dépasse la taille maximale autorisée (1 Mo).");
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("Le fichier ou Clipboard ne contient pas un JSON valide."); }
  const directVless = importDirectVless(parsed);
  if (directVless) return directVless;
  if (!isRecord(parsed) || ![1, EXPORT_SCHEMA_VERSION].includes(Number(parsed.schemaVersion)) || parsed.application !== "KIGHMU VPN" || !Array.isArray(parsed.tunnels)) {
    throw new Error("Le fichier n’est pas une configuration KIGHMU VPN compatible.");
  }
  const tunnels: ImportResult["tunnels"] = [];
  let importedProfiles = 0;
  let skippedProfiles = 0;
  parsed.tunnels.forEach((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.profiles)) return;
    const kind = entry.kind;
    if (!isTunnelKind(kind)) return;
    const profiles = entry.profiles.map((profile) => normalizeProfile(kind, profile)).filter((profile): profile is TunnelProfile => profile !== null);
    skippedProfiles += entry.profiles.length - profiles.length;
    importedProfiles += profiles.length;
    tunnels.push({ kind, profiles, balancer: normalizeBalancer(entry.balancer) });
  });
  if (tunnels.length === 0) throw new Error("Aucune famille de tunnel importable n’a été trouvée.");
  return {
    tunnels,
    importedKinds: tunnels.map((tunnel) => tunnel.kind),
    importedProfiles,
    skippedProfiles,
    containsSecrets: parsed.containsSecrets === true,
    restrictions: normalizeExportRestrictions(parsed.restrictions),
  };
}
