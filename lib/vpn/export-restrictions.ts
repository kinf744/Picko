export type ExportRestrictions = {
  lockConfiguration: boolean;
  lockPolicyControls: boolean;
  mobileDataOnly: boolean;
  lockMobileOperator: boolean;
  requireDeviceAttestation: boolean;
  blockRootedDevice: boolean;
  bindDeviceId: boolean;
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

export function normalizeExportRestrictions(value: unknown): ExportRestrictions {
  const source = typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result = { ...DEFAULT_EXPORT_RESTRICTIONS };
  booleanKeys.forEach((key) => { result[key] = source[key] === true; });
  const expiry = typeof source.expiresAt === "string" ? source.expiresAt.trim() : "";
  result.expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : null;
  result.userNote = typeof source.userNote === "string" ? source.userNote.trim().slice(0, 600) : "";
  return result;
}

export function restrictionCount(restrictions: ExportRestrictions) {
  return booleanKeys.filter((key) => restrictions[key]).length + Number(Boolean(restrictions.expiresAt)) + Number(Boolean(restrictions.userNote));
}
