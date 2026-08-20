import type { VpnProfile } from "./profiles";

export type VpnValidationConfig = Pick<VpnProfile, "host" | "port" | "obfs" | "password">;
export type ProfileValidationErrors = Partial<Record<keyof VpnProfile, string>>;

export function isValidPort(port: string, allowRange = false) {
  const value = port.trim();
  if (/^\d+$/.test(value)) {
    const number = Number(value);
    return number >= 1 && number <= 65535;
  }
  if (!allowRange) return false;
  const range = value.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!range) return false;
  const start = Number(range[1]);
  const end = Number(range[2]);
  return start >= 1 && end <= 65535 && start <= end;
}

function required(value: string, message: string) {
  return value.trim() ? undefined : message;
}

export function validateVpnConfig(config: VpnValidationConfig) {
  const errors: Partial<Record<keyof VpnValidationConfig, string>> = {};
  if (!config.host.trim()) errors.host = "Saisissez un Host ou une adresse IP.";
  if (!isValidPort(config.port, true)) errors.port = "Utilisez un port ou une plage, par exemple 6000-19999.";
  if (!config.obfs.trim()) errors.obfs = "La clé Obfs est requise pour ce profil.";
  if (!config.password.trim()) errors.password = "Le mot de passe est requis.";
  return errors;
}

export function validateProfile(profile: VpnProfile): ProfileValidationErrors {
  const errors: ProfileValidationErrors = {};
  errors.name = required(profile.name, "Donnez un nom à ce profil.");

  if (profile.method === "zivpn-udp") {
    Object.assign(errors, validateVpnConfig(profile));
    return errors;
  }

  errors.sshHost = required(profile.sshHost, "Saisissez le serveur SSH.");
  if (!isValidPort(profile.sshPort)) errors.sshPort = "Utilisez un port SSH valide.";
  errors.sshUser = required(profile.sshUser, "Saisissez l’utilisateur SSH.");
  errors.password = required(profile.password, "Le mot de passe SSH est requis.");
  errors.dnsServer = required(profile.dnsServer, "Saisissez le résolveur DNS à utiliser.");
  if (!isValidPort(profile.dnsPort)) errors.dnsPort = "Utilisez un port DNS valide.";
  errors.nameserver = required(profile.nameserver, "Saisissez le domaine SlowDNS.");
  errors.publicKey = required(profile.publicKey, "Saisissez la clé publique DNSTT.");
  return Object.fromEntries(Object.entries(errors).filter(([, value]) => value)) as ProfileValidationErrors;
}
