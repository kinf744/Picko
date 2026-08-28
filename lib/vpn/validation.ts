import { getActiveLang, translate, type TranslationKey } from "../i18n";

// Messages de validation traduits au moment du contrôle (langue active).
const tv = (key: TranslationKey, params?: Record<string, string | number>) => translate(getActiveLang(), key, params);

export type TunnelMode = "zivpn" | "slowdns";

export type VpnValidationConfig = {
  mode: TunnelMode;
  host: string;
  port: string;
  password: string;
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
    if (!config.host.trim()) errors.host = tv("valid.f.host");
    if (!isValidPort(config.port)) errors.port = tv("valid.port.rangeExample");
    if (!config.password.trim()) errors.password = tv("valid.required", { field: tv("valid.f.password") });
    return errors;
  }
  if (!config.slowDnsUsername.trim()) errors.slowDnsUsername = tv("valid.required", { field: tv("valid.f.sshUser") });
  if (!config.slowDnsPassword.trim()) errors.slowDnsPassword = tv("valid.required", { field: tv("valid.f.sshPassword") });
  if (!config.slowDnsServer.trim()) errors.slowDnsServer = tv("valid.required", { field: tv("valid.f.dnsServer") });
  if (!isValidPort(config.slowDnsPort)) errors.slowDnsPort = tv("valid.port.dnsExample");
  if (!config.slowDnsNameserver.trim() || !/^[A-Za-z0-9.-]+$/.test(config.slowDnsNameserver.trim())) errors.slowDnsNameserver = tv("valid.nameserver");
  if (!config.slowDnsPublicKey.trim()) errors.slowDnsPublicKey = tv("valid.required", { field: tv("valid.f.publicKey") });
  return errors;
}

import type { ProfileFieldErrors, TunnelProfile } from "./tunnel-profiles";

const isJsonObject = (value: string) => {
  try { return typeof JSON.parse(value) === "object" && value.trim().startsWith("{"); } catch { return false; }
};
const isSupportedV2RayLink = (value: string) => /^(vmess|vless|trojan):\/\//i.test(value.trim());

const requiredI18n = (errors: ProfileFieldErrors, field: string, value: string, labelKey: TranslationKey) => {
  if (!value.trim()) errors[field] = tv("valid.required", { field: tv(labelKey) });
};

export function validateTunnelProfile(profile: TunnelProfile): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};
  requiredI18n(errors, "name", profile.name, "valid.f.name");
  switch (profile.kind) {
    case "zivpn":
      requiredI18n(errors, "host", profile.host, "valid.f.host");
      if (!isValidPort(profile.port)) errors.port = tv("valid.port.range");
      requiredI18n(errors, "password", profile.password, "valid.f.password");
      if (!/^\d+$/.test(profile.uploadMbps) || Number(profile.uploadMbps) < 1) errors.uploadMbps = tv("valid.upMbps");
      if (!/^\d+$/.test(profile.downloadMbps) || Number(profile.downloadMbps) < 1) errors.downloadMbps = tv("valid.downMbps");
      break;
    case "slowdns":
      requiredI18n(errors, "dnsServer", profile.dnsServer, "valid.f.dnsServer");
      if (!isValidPort(profile.dnsPort)) errors.dnsPort = tv("valid.port.dns");
      if (!profile.nameserver.trim() || !/^[A-Za-z0-9.-]+$/.test(profile.nameserver.trim())) errors.nameserver = tv("valid.nameserver");
      requiredI18n(errors, "publicKey", profile.publicKey, "valid.f.publicKey");
      requiredI18n(errors, "sshUsername", profile.sshUsername, "valid.f.sshUser");
      requiredI18n(errors, "sshPassword", profile.sshPassword, "valid.f.sshPassword");
      break;
    case "hysteria":
      requiredI18n(errors, "host", profile.host, "valid.f.host");
      if (!isValidPort(profile.port)) errors.port = tv("valid.port.range");
      requiredI18n(errors, "auth", profile.auth, "valid.f.auth");
      if (!/^\d+$/.test(profile.uploadMbps) || Number(profile.uploadMbps) < 1) errors.uploadMbps = tv("valid.upMbps");
      if (!/^\d+$/.test(profile.downloadMbps) || Number(profile.downloadMbps) < 1) errors.downloadMbps = tv("valid.downMbps");
      break;
    case "http-payload":
      requiredI18n(errors, "proxyHost", profile.proxyHost, "valid.f.proxyHost");
      if (!isValidPort(profile.proxyPort)) errors.proxyPort = tv("valid.port.proxy");
      requiredI18n(errors, "payload", profile.payload, "valid.f.payload");
      requiredI18n(errors, "sshHost", profile.sshHost, "valid.f.sshHost");
      if (!isValidPort(profile.sshPort)) errors.sshPort = tv("valid.port.ssh");
      requiredI18n(errors, "sshUsername", profile.sshUsername, "valid.f.sshUser");
      requiredI18n(errors, "sshPassword", profile.sshPassword, "valid.f.sshPassword");
      break;
    case "ssh-tls":
      requiredI18n(errors, "tlsHost", profile.tlsHost, "valid.f.tlsHost");
      if (!isValidPort(profile.tlsPort)) errors.tlsPort = tv("valid.port.tls");
      if (profile.sni.trim() && !/^[A-Za-z0-9.-]+$/.test(profile.sni.trim())) errors.sni = tv("valid.sni");
      requiredI18n(errors, "sshUsername", profile.sshUsername, "valid.f.sshUser");
      requiredI18n(errors, "sshPassword", profile.sshPassword, "valid.f.sshPassword");
      break;
    case "xray-v2ray":
      if (profile.inputMode === "link") requiredI18n(errors, "link", profile.link, "valid.f.link");
      else if (!isJsonObject(profile.json)) errors.json = tv("valid.json");
      break;
    case "v2ray-slowdns":
      requiredI18n(errors, "dnsServer", profile.dnsServer, "valid.f.dnsServer");
      if (!isValidPort(profile.dnsPort)) errors.dnsPort = tv("valid.port.dns");
      if (!profile.nameserver.trim() || !/^[A-Za-z0-9.-]+$/.test(profile.nameserver.trim())) errors.nameserver = tv("valid.nameserver");
      requiredI18n(errors, "publicKey", profile.publicKey, "valid.f.publicKey");
      if (!isSupportedV2RayLink(profile.link)) errors.link = tv("valid.linkFormat");
      break;
  }
  return errors;
}
