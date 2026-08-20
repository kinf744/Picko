export type TunnelMethod = "zivpn-udp" | "ssh-slowdns" | "hysteria-udp";

export type VpnProfile = {
  id: string;
  name: string;
  method: TunnelMethod;
  enabled: boolean;
  host: string;
  port: string;
  obfs: string;
  password: string;
  sshHost: string;
  sshPort: string;
  sshUser: string;
  dnsServer: string;
  dnsPort: string;
  nameserver: string;
  publicKey: string;
  hysteriaHost: string;
  hysteriaPort: string;
  hysteriaAuth: string;
  hysteriaUpMbps: string;
  hysteriaDownMbps: string;
  hysteriaObfs: string;
};

export type VpnProfileSecrets = Pick<VpnProfile, "obfs" | "password" | "hysteriaAuth" | "hysteriaObfs">;
export type StoredVpnProfile = Omit<VpnProfile, keyof VpnProfileSecrets>;

export const VpnMethodLabel: Record<TunnelMethod, string> = {
  "zivpn-udp": "ZiVPN UDP",
  "ssh-slowdns": "SSH SlowDNS",
  "hysteria-udp": "Hysteria UDP",
};

function makeId() {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyProfile(method: TunnelMethod): VpnProfile {
  return {
    id: makeId(),
    name: method === "zivpn-udp" ? "Profil ZiVPN" : method === "ssh-slowdns" ? "Profil SSH SlowDNS" : "Profil Hysteria",
    method,
    enabled: true,
    host: "",
    port: "",
    obfs: "",
    password: "",
    sshHost: "",
    sshPort: "22",
    sshUser: "",
    dnsServer: "8.8.8.8",
    dnsPort: "53",
    nameserver: "",
    publicKey: "",
    hysteriaHost: "",
    hysteriaPort: "443",
    hysteriaAuth: "",
    hysteriaUpMbps: "100",
    hysteriaDownMbps: "100",
    hysteriaObfs: "",
  };
}

export function stripSecrets(profile: VpnProfile): StoredVpnProfile {
  const { obfs: _obfs, password: _password, hysteriaAuth: _hysteriaAuth, hysteriaObfs: _hysteriaObfs, ...stored } = profile;
  return stored;
}

export function profileEndpoint(profile: VpnProfile) {
  if (profile.method === "ssh-slowdns") {
    return profile.sshHost ? `${profile.sshHost}:${profile.sshPort || "22"}` : "Serveur SSH non défini";
  }
  if (profile.method === "hysteria-udp") {
    return profile.hysteriaHost ? `${profile.hysteriaHost}:${profile.hysteriaPort || "443"}` : "Serveur Hysteria non défini";
  }
  return profile.host ? `${profile.host}:${profile.port || "—"}` : "Serveur ZiVPN non défini";
}
