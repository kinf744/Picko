import { createEmptyProfile, type TunnelMethod, type VpnProfile } from "./profiles";
import { normalizeVpnSettings, type VpnRuntimeSettings } from "./settings-context";

export const KIGHMU_URI_PREFIX = "kighmu://";

export type KighmuDistributionPolicy = {
  mobileDataOnly: boolean;
  lockMobileCarrier: boolean;
  requireDeviceAttestation: boolean;
  blockRootedDevice: boolean;
  playStoreOnly: boolean;
  lockDeviceId: boolean;
  deviceId: string;
  expiresAt: string;
  preventTunnelOverride: boolean;
  readOnly: boolean;
  blockTorrent: boolean;
  gameModeOnly: boolean;
  userMessage: string;
};

export const DEFAULT_DISTRIBUTION_POLICY: KighmuDistributionPolicy = {
  mobileDataOnly: false,
  lockMobileCarrier: false,
  requireDeviceAttestation: false,
  blockRootedDevice: false,
  playStoreOnly: false,
  lockDeviceId: false,
  deviceId: "",
  expiresAt: "",
  preventTunnelOverride: false,
  readOnly: false,
  blockTorrent: false,
  gameModeOnly: false,
  userMessage: "",
};

export type KighmuConfigurationExport = {
  format: "kighmu-kmu";
  version: 2;
  exportedAt: string;
  profiles: VpnProfile[];
  settings: VpnRuntimeSettings;
  policy: KighmuDistributionPolicy;
};

const METHODS: TunnelMethod[] = ["zivpn-udp", "ssh-slowdns", "hysteria-udp", "xray", "v2ray-dns", "http-proxy-payload", "ssh-ssl-tls"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMethod(value: unknown): value is TunnelMethod {
  return typeof value === "string" && METHODS.includes(value as TunnelMethod);
}

export function normalizeDistributionPolicy(candidate: Partial<KighmuDistributionPolicy>): KighmuDistributionPolicy {
  const text = (value: unknown, maximum: number) => typeof value === "string" ? value.trim().slice(0, maximum) : "";
  const expiresAt = text(candidate.expiresAt, 40);
  const validExpiry = !expiresAt || Number.isFinite(Date.parse(expiresAt));
  return {
    mobileDataOnly: Boolean(candidate.mobileDataOnly),
    lockMobileCarrier: Boolean(candidate.lockMobileCarrier),
    requireDeviceAttestation: Boolean(candidate.requireDeviceAttestation),
    blockRootedDevice: Boolean(candidate.blockRootedDevice),
    playStoreOnly: Boolean(candidate.playStoreOnly),
    lockDeviceId: Boolean(candidate.lockDeviceId),
    deviceId: text(candidate.deviceId, 128).toUpperCase(),
    expiresAt: validExpiry ? expiresAt : "",
    preventTunnelOverride: Boolean(candidate.preventTunnelOverride),
    readOnly: Boolean(candidate.readOnly),
    blockTorrent: Boolean(candidate.blockTorrent),
    gameModeOnly: Boolean(candidate.gameModeOnly),
    userMessage: text(candidate.userMessage, 2_000),
  };
}

export function createConfigurationExport(profiles: VpnProfile[], settings: VpnRuntimeSettings, policy: Partial<KighmuDistributionPolicy> = {}): KighmuConfigurationExport {
  return {
    format: "kighmu-kmu",
    version: 2,
    exportedAt: new Date().toISOString(),
    profiles,
    settings,
    policy: normalizeDistributionPolicy(policy),
  };
}

export function stringifyConfigurationExport(profiles: VpnProfile[], settings: VpnRuntimeSettings, policy: Partial<KighmuDistributionPolicy> = {}) {
  return JSON.stringify(createConfigurationExport(profiles, settings, policy), null, 2);
}

function toBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return globalThis.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  let binary: string;
  try { binary = globalThis.atob(padded); }
  catch { throw new Error("Le lien kighmu:// n’est pas encodé dans un format compatible."); }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function createKighmuUri(profiles: VpnProfile[], settings: VpnRuntimeSettings, policy: Partial<KighmuDistributionPolicy> = {}) {
  return `${KIGHMU_URI_PREFIX}${toBase64Url(stringifyConfigurationExport(profiles, settings, policy))}`;
}

export function suggestedKmuFileName(name: string) {
  const normalized = name.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
  return `${normalized || "kighmu_config"}.kmu`;
}

function parseProfiles(value: unknown) {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Le fichier doit contenir entre 0 et 100 profils.");
  return value.map((source, index) => {
    if (!isRecord(source) || !isMethod(source.method)) throw new Error(`Le profil ${index + 1} utilise une méthode inconnue.`);
    const fallback = createEmptyProfile(source.method);
    const id = typeof source.id === "string" && source.id.trim() ? source.id.trim().slice(0, 128) : fallback.id;
    const name = typeof source.name === "string" ? source.name.trim().slice(0, 120) : fallback.name;
    return { ...fallback, ...source, id, name, method: source.method } as VpnProfile;
  });
}

export type ParsedKighmuConfiguration = {
  profiles: VpnProfile[];
  settings: VpnRuntimeSettings;
  policy: KighmuDistributionPolicy;
  source: "kmu" | "uri";
};

export function parseConfigurationImport(contents: string, options: { hardwareId?: string; now?: Date } = {}): ParsedKighmuConfiguration {
  const trimmed = contents.trim();
  const isUri = trimmed.toLowerCase().startsWith(KIGHMU_URI_PREFIX);
  const raw = isUri ? fromBase64Url(trimmed.slice(KIGHMU_URI_PREFIX.length)) : trimmed;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(isUri ? "Le lien kighmu:// ne contient pas une configuration lisible." : "Le fichier .kmu ne contient pas une configuration lisible."); }
  if (!isRecord(parsed)) throw new Error("La configuration .kmu importée est invalide.");

  const isKmu = parsed.format === "kighmu-kmu" && parsed.version === 2;
  if (!isKmu) throw new Error("Seuls les fichiers .kmu et les liens kighmu:// sont acceptés.");

  const policy = isRecord(parsed.policy) ? normalizeDistributionPolicy(parsed.policy) : DEFAULT_DISTRIBUTION_POLICY;
  const currentTime = options.now?.getTime() ?? Date.now();
  if (policy.expiresAt && Date.parse(policy.expiresAt) <= currentTime) throw new Error("Cette configuration Kighmu est expirée.");
  if (policy.lockDeviceId) {
    const currentId = options.hardwareId?.trim().toUpperCase();
    if (!policy.deviceId || !currentId || policy.deviceId !== currentId) throw new Error("Cette configuration est verrouillée pour un autre Hardware ID.");
  }

  return {
    profiles: parseProfiles(parsed.profiles),
    settings: normalizeVpnSettings(isRecord(parsed.settings) ? parsed.settings : {}),
    policy,
    source: isUri ? "uri" : "kmu",
  };
}
