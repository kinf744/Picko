import { createEmptyProfile, type TunnelMethod, type VpnProfile } from "./profiles";
import { normalizeVpnSettings, type VpnRuntimeSettings } from "./settings-context";

export type PickoConfigurationExport = {
  format: "picko-vpn-config";
  version: 1;
  exportedAt: string;
  profiles: VpnProfile[];
  settings: VpnRuntimeSettings;
};

const METHODS: TunnelMethod[] = ["zivpn-udp", "ssh-slowdns", "hysteria-udp", "xray", "v2ray-dns", "http-proxy-payload", "ssh-ssl-tls"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMethod(value: unknown): value is TunnelMethod {
  return typeof value === "string" && METHODS.includes(value as TunnelMethod);
}

export function createConfigurationExport(profiles: VpnProfile[], settings: VpnRuntimeSettings): PickoConfigurationExport {
  return { format: "picko-vpn-config", version: 1, exportedAt: new Date().toISOString(), profiles, settings };
}

export function stringifyConfigurationExport(profiles: VpnProfile[], settings: VpnRuntimeSettings) {
  return JSON.stringify(createConfigurationExport(profiles, settings), null, 2);
}

export function parseConfigurationImport(contents: string): { profiles: VpnProfile[]; settings: VpnRuntimeSettings } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("Le fichier ne contient pas un JSON valide.");
  }
  if (!isRecord(parsed) || parsed.format !== "picko-vpn-config" || parsed.version !== 1) {
    throw new Error("Ce fichier n’est pas une sauvegarde Picko compatible.");
  }
  if (!Array.isArray(parsed.profiles) || parsed.profiles.length > 100) {
    throw new Error("Le fichier doit contenir entre 0 et 100 profils.");
  }
  const profiles = parsed.profiles.map((source, index) => {
    if (!isRecord(source) || !isMethod(source.method)) throw new Error(`Le profil ${index + 1} utilise une méthode inconnue.`);
    const fallback = createEmptyProfile(source.method);
    const id = typeof source.id === "string" && source.id.trim() ? source.id.trim().slice(0, 128) : fallback.id;
    const name = typeof source.name === "string" ? source.name.trim().slice(0, 120) : fallback.name;
    return { ...fallback, ...source, id, name, method: source.method } as VpnProfile;
  });
  return { profiles, settings: normalizeVpnSettings(isRecord(parsed.settings) ? parsed.settings : {}) };
}
