export type TunnelMode = "zivpn" | "slowdns";

export type VpnValidationConfig = {
  mode: TunnelMode;
  host: string;
  port: string;
  obfs: string;
  password: string;
  slowDnsSshHost: string;
  slowDnsUsername: string;
  slowDnsPassword: string;
  slowDnsServer: string;
  slowDnsPort: string;
  slowDnsNameserver: string;
  slowDnsPublicKey: string;
};

export function isValidPort(port: string) {
  const value = port.trim();
  if (/^\d+$/.test(value)) {
    const number = Number(value);
    return number >= 1 && number <= 65535;
  }
  const range = value.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!range) return false;
  const start = Number(range[1]);
  const end = Number(range[2]);
  return start >= 1 && end <= 65535 && start <= end;
}

export function validateVpnConfig(config: VpnValidationConfig) {
  const errors: Partial<Record<keyof VpnValidationConfig, string>> = {};
  if (config.mode === "zivpn") {
    if (!config.host.trim()) errors.host = "Saisissez un Host ou une adresse IP.";
    if (!isValidPort(config.port)) errors.port = "Utilisez un port ou une plage, par exemple 6000-19999.";
    if (!config.obfs.trim()) errors.obfs = "La clé Obfs est requise pour ce profil.";
    if (!config.password.trim()) errors.password = "Le mot de passe est requis.";
    return errors;
  }
  if (!config.slowDnsUsername.trim()) errors.slowDnsUsername = "L’identifiant SSH est requis.";
  if (!config.slowDnsPassword.trim()) errors.slowDnsPassword = "Le mot de passe SSH est requis.";
  if (!config.slowDnsServer.trim()) errors.slowDnsServer = "Le serveur DNS/UDP est requis.";
  if (!isValidPort(config.slowDnsPort)) errors.slowDnsPort = "Utilisez un port DNS valide, généralement 53.";
  if (!config.slowDnsNameserver.trim() || !/^[A-Za-z0-9.-]+$/.test(config.slowDnsNameserver.trim())) errors.slowDnsNameserver = "Le nameserver DNS est invalide.";
  if (!config.slowDnsPublicKey.trim()) errors.slowDnsPublicKey = "La clé publique dnstt est requise.";
  return errors;
}

import type { ProfileFieldErrors, TunnelProfile } from "./tunnel-profiles";

const isJsonObject = (value: string) => {
  try { return typeof JSON.parse(value) === "object" && value.trim().startsWith("{"); } catch { return false; }
};

const required = (errors: ProfileFieldErrors, field: string, value: string, label: string) => {
  if (!value.trim()) errors[field] = `${label} est requis.`;
};

export function validateTunnelProfile(profile: TunnelProfile): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};
  required(errors, "name", profile.name, "Le nom du profil");
  switch (profile.kind) {
    case "zivpn":
      required(errors, "host", profile.host, "Le Host ou l’adresse IP");
      if (!isValidPort(profile.port)) errors.port = "Utilisez un port ou une plage valide.";
      required(errors, "obfs", profile.obfs, "La clé Obfs");
      required(errors, "password", profile.password, "Le mot de passe");
      break;
    case "slowdns":
      required(errors, "dnsServer", profile.dnsServer, "Le serveur DNS/UDP");
      if (!isValidPort(profile.dnsPort)) errors.dnsPort = "Le port DNS est invalide.";
      if (!profile.nameserver.trim() || !/^[A-Za-z0-9.-]+$/.test(profile.nameserver.trim())) errors.nameserver = "Le nameserver DNS est invalide.";
      required(errors, "publicKey", profile.publicKey, "La clé publique dnstt");
      required(errors, "sshUsername", profile.sshUsername, "L’identifiant SSH");
      required(errors, "sshPassword", profile.sshPassword, "Le mot de passe SSH");
      break;
    case "hysteria":
      required(errors, "host", profile.host, "Le Host ou l’adresse IP");
      if (!isValidPort(profile.port)) errors.port = "Utilisez un port ou une plage valide.";
      required(errors, "auth", profile.auth, "L’authentification Hysteria");
      if (!/^\d+$/.test(profile.uploadMbps) || Number(profile.uploadMbps) < 1) errors.uploadMbps = "Le débit montant doit être supérieur à zéro.";
      if (!/^\d+$/.test(profile.downloadMbps) || Number(profile.downloadMbps) < 1) errors.downloadMbps = "Le débit descendant doit être supérieur à zéro.";
      break;
    case "xray-v2ray":
      if (profile.inputMode === "link") required(errors, "link", profile.link, "Le lien Xray/V2Ray");
      else if (!isJsonObject(profile.json)) errors.json = "La configuration Xray/V2Ray doit être un objet JSON valide.";
      break;
    case "v2ray-dns":
      required(errors, "dnsServer", profile.dnsServer, "Le serveur DNS");
      if (!isValidPort(profile.dnsPort)) errors.dnsPort = "Le port DNS est invalide.";
      if (!profile.nameserver.trim() || !/^[A-Za-z0-9.-]+$/.test(profile.nameserver.trim())) errors.nameserver = "Le nameserver DNS est invalide.";
      required(errors, "publicKey", profile.publicKey, "La clé publique dnstt");
      if (!isJsonObject(profile.json)) errors.json = "La configuration V2Ray DNS doit être un objet JSON valide.";
      break;
    case "v2ray-slowdns":
      required(errors, "dnsServer", profile.dnsServer, "Le serveur DNS/UDP");
      if (!isValidPort(profile.dnsPort)) errors.dnsPort = "Le port DNS est invalide.";
      if (!profile.nameserver.trim() || !/^[A-Za-z0-9.-]+$/.test(profile.nameserver.trim())) errors.nameserver = "Le nameserver DNS est invalide.";
      required(errors, "publicKey", profile.publicKey, "La clé publique dnstt");
      if (!isJsonObject(profile.json)) errors.json = "La configuration V2Ray+SlowDNS doit être un objet JSON valide.";
      break;
  }
  return errors;
}
