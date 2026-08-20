export type TunnelMethod = "zivpn-udp" | "ssh-slowdns";

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
};

export type VpnProfileSecrets = Pick<VpnProfile, "obfs" | "password">;
export type StoredVpnProfile = Omit<VpnProfile, keyof VpnProfileSecrets>;

export const VpnMethodLabel: Record<TunnelMethod, string> = {
  "zivpn-udp": "ZiVPN UDP",
  "ssh-slowdns": "SSH SlowDNS",
};

function makeId() {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyProfile(method: TunnelMethod): VpnProfile {
  return {
    id: makeId(),
    name: method === "zivpn-udp" ? "Profil ZiVPN" : "Profil SSH SlowDNS",
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
  };
}

export function stripSecrets(profile: VpnProfile): StoredVpnProfile {
  const { obfs: _obfs, password: _password, ...stored } = profile;
  return stored;
}

export function profileEndpoint(profile: VpnProfile) {
  if (profile.method === "ssh-slowdns") {
    return profile.sshHost ? `${profile.sshHost}:${profile.sshPort || "22"}` : "Serveur SSH non défini";
  }
  return profile.host ? `${profile.host}:${profile.port || "—"}` : "Serveur ZiVPN non défini";
}
