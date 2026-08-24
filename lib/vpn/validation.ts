import { hasXrayInput, xrayLinkScheme, type VpnProfile } from "./profiles";

export type VpnValidationConfig = Pick<VpnProfile, "host" | "port" | "obfs" | "password">;
export type HysteriaValidationConfig = Pick<VpnProfile, "hysteriaHost" | "hysteriaPort" | "hysteriaAuth" | "hysteriaUpMbps" | "hysteriaDownMbps">;
export type XrayValidationConfig = Pick<VpnProfile, "xrayMode" | "xrayLink" | "xrayJson">;
export type HttpProxyValidationConfig = Pick<VpnProfile, "sshHost" | "sshPort" | "sshUser" | "password" | "proxyHost" | "proxyPort" | "httpPayload">;
export type SshSslValidationConfig = Pick<VpnProfile, "sshHost" | "sshPort" | "sshUser" | "password" | "sslTlsVersion">;
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

function withoutEmptyErrors<T extends Record<string, string | undefined>>(errors: T) {
  return Object.fromEntries(Object.entries(errors).filter(([, value]) => Boolean(value))) as Partial<T>;
}

export function validateVpnConfig(config: VpnValidationConfig) {
  const errors: Partial<Record<keyof VpnValidationConfig, string>> = {};
  if (!config.host.trim()) errors.host = "Saisissez un Host ou une adresse IP.";
  if (!isValidPort(config.port, true)) errors.port = "Utilisez un port ou une plage, par exemple 6000-19999.";
  if (!config.obfs.trim()) errors.obfs = "La clé Obfs est requise pour ce profil.";
  if (!config.password.trim()) errors.password = "Le mot de passe est requis.";
  return errors;
}

function isValidMbps(value: string) {
  const number = Number(value.trim());
  return Number.isFinite(number) && number > 0 && number <= 100000;
}

export function validateHysteriaConfig(config: HysteriaValidationConfig) {
  const errors: Partial<Record<keyof HysteriaValidationConfig, string>> = {};
  if (!config.hysteriaHost.trim()) errors.hysteriaHost = "Saisissez le serveur Hysteria.";
  if (!isValidPort(config.hysteriaPort, true)) errors.hysteriaPort = "Utilisez un port ou une plage Hysteria valide.";
  if (!config.hysteriaAuth.trim()) errors.hysteriaAuth = "Le mot de passe Hysteria est requis.";
  if (!isValidMbps(config.hysteriaUpMbps)) errors.hysteriaUpMbps = "Utilisez un débit montant positif en Mbps.";
  if (!isValidMbps(config.hysteriaDownMbps)) errors.hysteriaDownMbps = "Utilisez un débit descendant positif en Mbps.";
  return errors;
}

export function validateHttpProxyConfig(config: HttpProxyValidationConfig) {
  const errors: Partial<Record<keyof HttpProxyValidationConfig, string>> = {};
  errors.sshHost = required(config.sshHost, "Saisissez le serveur SSH.");
  if (!isValidPort(config.sshPort)) errors.sshPort = "Utilisez un port SSH valide.";
  errors.sshUser = required(config.sshUser, "Saisissez l’utilisateur SSH.");
  errors.password = required(config.password, "Le mot de passe SSH est requis.");
  errors.proxyHost = required(config.proxyHost, "Saisissez le serveur du proxy HTTP.");
  if (!isValidPort(config.proxyPort)) errors.proxyPort = "Utilisez un port de proxy HTTP valide.";
  errors.httpPayload = required(config.httpPayload, "Saisissez le payload HTTP à envoyer au proxy.");
  return withoutEmptyErrors(errors);
}

export function validateSshSslConfig(config: SshSslValidationConfig) {
  const errors: Partial<Record<keyof SshSslValidationConfig, string>> = {};
  errors.sshHost = required(config.sshHost, "Saisissez le serveur SSL/TLS.");
  if (!isValidPort(config.sshPort)) errors.sshPort = "Utilisez un port SSL/TLS valide.";
  errors.sshUser = required(config.sshUser, "Saisissez l’utilisateur SSH.");
  errors.password = required(config.password, "Le mot de passe SSH est requis.");
  if (!["TLS", "TLSv1.2", "TLSv1.3"].includes(config.sslTlsVersion.trim() || "TLS")) errors.sslTlsVersion = "Choisissez TLS, TLSv1.2 ou TLSv1.3.";
  return withoutEmptyErrors(errors);
}

export function validateXrayConfig(config: XrayValidationConfig) {
  const errors: Partial<Record<keyof XrayValidationConfig, string>> = {};
  if (!hasXrayInput(config as VpnProfile)) {
    if (config.xrayMode === "json") errors.xrayJson = "Collez une configuration JSON Xray valide.";
    else errors.xrayLink = "Collez un lien vmess://, vless:// ou trojan://.";
  } else if (config.xrayMode === "link" && !["vmess", "vless", "trojan"].includes(xrayLinkScheme(config.xrayLink))) {
    errors.xrayLink = "Le lien doit commencer par vmess://, vless:// ou trojan://.";
  }
  if (config.xrayMode === "json" && config.xrayJson.trim()) {
    try {
      const parsed = JSON.parse(config.xrayJson) as { outbounds?: unknown };
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.outbounds)) errors.xrayJson = "Le JSON doit contenir un tableau outbounds.";
    } catch {
      errors.xrayJson = "Le JSON Xray est invalide.";
    }
  }
  return errors;
}

export function validateProfile(profile: VpnProfile): ProfileValidationErrors {
  const errors: ProfileValidationErrors = {
    name: required(profile.name, "Donnez un nom à ce profil."),
  };

  if (profile.method === "zivpn-udp") {
    Object.assign(errors, validateVpnConfig(profile));
  } else if (profile.method === "ssh-slowdns") {
    errors.sshHost = required(profile.sshHost, "Saisissez le serveur SSH.");
    if (!isValidPort(profile.sshPort)) errors.sshPort = "Utilisez un port SSH valide.";
    errors.sshUser = required(profile.sshUser, "Saisissez l’utilisateur SSH.");
    errors.password = required(profile.password, "Le mot de passe SSH est requis.");
    errors.dnsServer = required(profile.dnsServer, "Saisissez le résolveur DNS à utiliser.");
    if (!isValidPort(profile.dnsPort)) errors.dnsPort = "Utilisez un port DNS valide.";
    errors.nameserver = required(profile.nameserver, "Saisissez le domaine SlowDNS.");
    errors.publicKey = required(profile.publicKey, "Saisissez la clé publique DNSTT.");
  } else if (profile.method === "hysteria-udp") {
    Object.assign(errors, validateHysteriaConfig(profile));
  } else if (profile.method === "v2ray-dns") {
    Object.assign(errors, validateXrayConfig(profile));
    errors.dnsServer = required(profile.dnsServer, "Saisissez le résolveur DNS à utiliser.");
    if (!isValidPort(profile.dnsPort)) errors.dnsPort = "Utilisez un port DNS valide.";
    errors.nameserver = required(profile.nameserver, "Saisissez le domaine SlowDNS.");
    errors.publicKey = required(profile.publicKey, "Saisissez la clé publique DNSTT.");
  } else if (profile.method === "http-proxy-payload") {
    Object.assign(errors, validateHttpProxyConfig(profile));
  } else if (profile.method === "ssh-ssl-tls") {
    Object.assign(errors, validateSshSslConfig(profile));
  } else {
    Object.assign(errors, validateXrayConfig(profile));
  }

  return withoutEmptyErrors(errors) as ProfileValidationErrors;
}
