export type ExportRestrictions = {
  lockConfiguration: boolean;
  lockPolicyControls: boolean;
  mobileDataOnly: boolean;
  lockMobileOperator: boolean;
  requireDeviceAttestation: boolean;
  blockRootedDevice: boolean;
  bindDeviceId: boolean;
  allowedHardwareIds: string[];
  allowedMobileOperators: string[];
  expiresAt: string | null;
  sshBindToDevice: boolean;
  blockTorrent: boolean;
  userNote: string;
};

export const DEFAULT_EXPORT_RESTRICTIONS: ExportRestrictions = {
  lockConfiguration: false,
  lockPolicyControls: false,
  mobileDataOnly: false,
  lockMobileOperator: false,
  requireDeviceAttestation: false,
  blockRootedDevice: false,
  bindDeviceId: false,
  allowedHardwareIds: [],
  allowedMobileOperators: [],
  expiresAt: null,
  sshBindToDevice: false,
  blockTorrent: false,
  userNote: "",
};

const booleanKeys = [
  "lockConfiguration",
  "lockPolicyControls",
  "mobileDataOnly",
  "lockMobileOperator",
  "requireDeviceAttestation",
  "blockRootedDevice",
  "bindDeviceId",
  "sshBindToDevice",
  "blockTorrent",
] as const;

const normalizeList = (value: unknown, normalizeItem: (item: string) => string | null) => {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,;]+/) : [];
  return Array.from(new Set(raw.map((item) => typeof item === "string" ? normalizeItem(item) : null).filter((item): item is string => Boolean(item)))).slice(0, 80);
};

export const normalizeHardwareIds = (value: unknown) => normalizeList(value, (item) => {
  const normalized = item.trim().replace(/\s+/g, "").toUpperCase();
  return /^[A-F0-9]{32}$/.test(normalized) ? normalized : null;
});

export const normalizeMobileOperators = (value: unknown) => normalizeList(value, (item) => {
  const normalized = item.trim().replace(/\s+/g, " ").toUpperCase();
  return /^[A-Z0-9._ -]{2,80}$/.test(normalized) ? normalized : null;
});

export function normalizeExportRestrictions(value: unknown): ExportRestrictions {
  const source = typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result = { ...DEFAULT_EXPORT_RESTRICTIONS };
  booleanKeys.forEach((key) => { result[key] = source[key] === true; });
  const expiry = typeof source.expiresAt === "string" ? source.expiresAt.trim() : "";
  result.expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : null;
  result.allowedHardwareIds = normalizeHardwareIds(source.allowedHardwareIds);
  result.allowedMobileOperators = normalizeMobileOperators(source.allowedMobileOperators);
  result.userNote = typeof source.userNote === "string" ? source.userNote.trim().slice(0, 600) : "";
  return result;
}

export function restrictionCount(restrictions: ExportRestrictions) {
  return booleanKeys.filter((key) => restrictions[key]).length + Number(Boolean(restrictions.expiresAt)) + Number(Boolean(restrictions.userNote)) + Number(restrictions.allowedHardwareIds.length > 0) + Number(restrictions.allowedMobileOperators.length > 0);
}
