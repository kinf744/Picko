export const FIXED_OBFS = "kighmu";

export type VpnValidationConfig = {
  host: string;
  port: string;
  obfs: string;
  username: string;
  password: string;
};

function isValidPort(port: string) {
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
  if (!config.host.trim()) errors.host = "Saisissez un Host ou une adresse IP.";
  if (!isValidPort(config.port)) errors.port = "Utilisez un port ou une plage, par exemple 6000-19999.";
  if (!config.username.trim()) errors.username = "L’identifiant KIGHMU est requis.";
  if (!config.password.trim()) errors.password = "Le mot de passe est requis.";
  return errors;
}
