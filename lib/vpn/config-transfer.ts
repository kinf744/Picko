import { createProfile, defaultBalancer, omitSecrets, secretFields, TUNNEL_KINDS, type TunnelBalancer, type TunnelKind, type TunnelProfile } from "./tunnel-profiles";
import { validateTunnelProfile } from "./validation";

const MAX_IMPORT_BYTES = 1_000_000;
const EXPORT_SCHEMA_VERSION = 1;

export type ConfigExport = {
  schemaVersion: number;
  application: "KIGHMU VPN";
  exportedAt: string;
  containsSecrets: boolean;
  tunnels: Array<{ kind: TunnelKind; profiles: TunnelProfile[]; balancer: TunnelBalancer }>;
};

export type ImportResult = {
  tunnels: Array<{ kind: TunnelKind; profiles: TunnelProfile[]; balancer: TunnelBalancer }>;
  importedKinds: TunnelKind[];
  importedProfiles: number;
  skippedProfiles: number;
  containsSecrets: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isTunnelKind = (value: unknown): value is TunnelKind => typeof value === "string" && TUNNEL_KINDS.includes(value as TunnelKind);

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

export function buildConfigExport(
  profilesByKind: Record<TunnelKind, TunnelProfile[]>,
  balancersByKind: Record<TunnelKind, TunnelBalancer>,
  kinds: TunnelKind[],
  includeSecrets = false,
): ConfigExport {
  const uniqueKinds = TUNNEL_KINDS.filter((kind) => kinds.includes(kind));
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    application: "KIGHMU VPN",
    exportedAt: new Date().toISOString(),
    containsSecrets: includeSecrets,
    tunnels: uniqueKinds.map((kind) => ({
      kind,
      profiles: profilesByKind[kind].map((profile) => includeSecrets ? { ...profile } : omitSecrets(profile)),
      balancer: { ...balancersByKind[kind] },
    })),
  };
}

export function parseConfigImport(raw: string): ImportResult {
  if (raw.length > MAX_IMPORT_BYTES) throw new Error("Le fichier dépasse la taille maximale autorisée (1 Mo).");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Le fichier ne contient pas un JSON valide."); }
  if (!isRecord(parsed) || parsed.schemaVersion !== EXPORT_SCHEMA_VERSION || parsed.application !== "KIGHMU VPN" || !Array.isArray(parsed.tunnels)) {
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
  };
}
