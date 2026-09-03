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
const EXPORT_SCHEMA_VERSION = 3;
const CLIPBOARD_PREFIX = "kighmu://";
const CLIPBOARD_FINGERPRINT_SALT = "kighmu.vpn.config.fingerprint.v2";
const ENCRYPTED_VERSION = 3;
const PBKDF2_ITERATIONS = 120_000;
const PBKDF2_SALT_LEN = 16;
const AES_IV_LEN = 12;

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
  if (!subtle?.digest) throw new Error("Clipboard sécurisé indisponible: crypto.subtle requis");
  const digest = await subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function b64FromBytes(bytes: Uint8Array): string {
  const buf = (globalThis as Record<string, unknown>).Buffer as { from?: (src: Uint8Array) => { toString: (enc: string) => string } } | undefined;
  if (buf?.from) return (buf.from(bytes) as unknown as { toString: (e: string) => string }).toString("base64");
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return globalThis.btoa(bin);
}

function bytesFromB64(b64: string): Uint8Array {
  const buf = (globalThis as Record<string, unknown>).Buffer as { from?: (src: string, enc: string) => Uint8Array } | undefined;
  if (buf?.from) return (buf.from(b64, "base64") as unknown as Uint8Array);
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomBytes(len: number): Uint8Array {
  const out = new Uint8Array(len);
  const g = globalThis as unknown as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } };
  if (g.crypto?.getRandomValues) { g.crypto.getRandomValues(out); return out; }
  for (let i = 0; i < len; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

async function deriveAesKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) throw new Error("crypto.subtle indisponible: chiffrement impossible");
  const enc = new TextEncoder();
  const baseKey = await subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt: salt as unknown as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export type EncryptedEnvelope = { v: number; salt: string; iv: string; ct: string };

export async function encryptConfigJson(plainJson: string, password: string): Promise<string> {
  if (!password || password.length < 8) throw new Error("Mot de passe requis (8 caractères minimum) pour chiffrer la configuration.");
  const salt = randomBytes(PBKDF2_SALT_LEN);
  const iv = randomBytes(AES_IV_LEN);
  const key = await deriveAesKey(password, salt);
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto!.subtle!;
  const pt = new TextEncoder().encode(plainJson);
  const ctBuf = await subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as ArrayBuffer }, key, pt);
  const envelope: EncryptedEnvelope = { v: ENCRYPTED_VERSION, salt: b64FromBytes(salt), iv: b64FromBytes(iv), ct: b64FromBytes(new Uint8Array(ctBuf)) };
  return JSON.stringify(envelope);
}

export async function decryptConfigJson(envelopeStr: string, password: string): Promise<string> {
  if (!password) throw new Error("Mot de passe requis pour déchiffrer cette configuration.");
  let env: EncryptedEnvelope;
  try { env = JSON.parse(envelopeStr) as EncryptedEnvelope; } catch { throw new Error("Enveloppe chiffrée invalide."); }
  if (env.v !== ENCRYPTED_VERSION || !env.salt || !env.iv || !env.ct) throw new Error("Enveloppe chiffrée invalide (version).");
  const salt = bytesFromB64(env.salt);
  const iv = bytesFromB64(env.iv);
  const ct = bytesFromB64(env.ct);
  const key = await deriveAesKey(password, salt);
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto!.subtle!;
  try {
    const ptBuf = await subtle.decrypt({ name: "AES-GCM", iv: iv as unknown as ArrayBuffer }, key, ct as unknown as ArrayBuffer);
    return new TextDecoder().decode(ptBuf);
  } catch { throw new Error("Déchiffrement échoué: mot de passe incorrect ou fichier altéré."); }
}

export function isEncryptedEnvelope(raw: string): boolean {
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    return v.v === ENCRYPTED_VERSION && typeof v.salt === "string" && typeof v.iv === "string" && typeof v.ct === "string";
  } catch { return false; }
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
  let suffix = "";
  try {
    const g = globalThis as unknown as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } };
    if (g.crypto?.getRandomValues) { const a = new Uint32Array(1); g.crypto.getRandomValues(a); suffix = a[0].toString(36).slice(0, 6); }
  } catch {}
  if (!suffix) suffix = Math.random().toString(36).slice(2, 8);
  base.id = `${kind}-${now}-${suffix}`;
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
  includeSecrets = true,
  restrictions: ExportRestrictions = DEFAULT_EXPORT_RESTRICTIONS,
): ConfigExport {
  // L'UI exporte toujours avec secrets (tunnels inutilisables sans). Le paramètre
  // reste pour compatibilité tests: false permet de tester omitSecrets.
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
        .map((profile) => (includeSecrets ? { ...profile } : omitSecrets(profile))),
      balancer: { ...balancersByKind[kind] },
    })),
  };
}

export async function buildClipboardPayloadAsync(config: ConfigExport, password: string): Promise<string> {
  const json = JSON.stringify(directVlessClipboard(config) ?? config);
  if (json.length > MAX_IMPORT_BYTES) throw new Error("La configuration est trop volumineuse pour le Clipboard.");
  const encrypted = await encryptConfigJson(json, password);
  return `${CLIPBOARD_PREFIX}${encodeClipboardBase64(encrypted)}`;
}

export function buildClipboardPayload(config: ConfigExport): string {
  // Compatibilité tests: ancien format non chiffré (déprécié). Préférer buildClipboardPayloadAsync avec mot de passe.
  const json = JSON.stringify(directVlessClipboard(config) ?? config);
  if (json.length > MAX_IMPORT_BYTES) throw new Error("La configuration est trop volumineuse pour le Clipboard.");
  return `${CLIPBOARD_PREFIX}${encodeClipboardBase64(json)}`;
}

export async function buildEncryptedFilePayload(config: ConfigExport, password: string): Promise<string> {
  const json = JSON.stringify(config);
  if (json.length > MAX_IMPORT_BYTES) throw new Error("La configuration est trop volumineuse.");
  return encryptConfigJson(json, password);
}

export async function parseConfigImportAsync(raw: string, password?: string): Promise<ImportResult> {
  const content = unwrapClipboardPayload(raw);
  if (content.length > MAX_IMPORT_BYTES) throw new Error("Le fichier dépasse la taille maximale autorisée (1 Mo).");
  // Enveloppe chiffrée v3
  if (isEncryptedEnvelope(content)) {
    if (!password) throw new Error("Cette configuration est chiffrée: mot de passe requis.");
    const decrypted = await decryptConfigJson(content, password);
    return parseConfigImport(decrypted);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("Le fichier ou Clipboard ne contient pas un JSON valide."); }
  if (isRecord(parsed) && typeof parsed.payload === "string" && typeof parsed.signature === "string") {
    const expected = await fingerprintClipboardPayload(parsed.payload);
    if (expected !== parsed.signature) throw new Error("L’empreinte du payload ne correspond pas : configuration altérée.");
    return parseConfigImport(parsed.payload);
  }
  return parseConfigImport(content);
}

export async function parseEncryptedFileImport(raw: string, password: string): Promise<ImportResult> {
  if (isEncryptedEnvelope(raw.trim())) {
    const decrypted = await decryptConfigJson(raw.trim(), password);
    return parseConfigImport(decrypted);
  }
  // Compatibilité ancien fichier non chiffré v2
  return parseConfigImport(raw);
}

export function parseConfigImport(raw: string): ImportResult {
  const content = unwrapClipboardPayload(raw);
  if (content.length > MAX_IMPORT_BYTES) throw new Error("Le fichier dépasse la taille maximale autorisée (1 Mo).");
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("Le fichier ou Clipboard ne contient pas un JSON valide."); }
  const directVless = importDirectVless(parsed);
  if (directVless) return directVless;
  if (!isRecord(parsed) || ![1, 2, EXPORT_SCHEMA_VERSION].includes(Number(parsed.schemaVersion)) || parsed.application !== "KIGHMU VPN" || !Array.isArray(parsed.tunnels)) {
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
