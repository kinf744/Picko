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
