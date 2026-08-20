export type TunnelMethod = "zivpn-udp" | "ssh-slowdns" | "hysteria-udp" | "xray" | "v2ray-dns";
export type XrayInputMode = "link" | "json";

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
  xrayMode: XrayInputMode;
  xrayLink: string;
  xrayJson: string;
};

export type VpnProfileSecrets = Pick<VpnProfile, "obfs" | "password" | "hysteriaAuth" | "hysteriaObfs" | "xrayLink" | "xrayJson">;
export type StoredVpnProfile = Omit<VpnProfile, keyof VpnProfileSecrets>;

export const VpnMethodLabel: Record<TunnelMethod, string> = {
  "zivpn-udp": "ZiVPN UDP",
  "ssh-slowdns": "SSH SlowDNS",
  "hysteria-udp": "Hysteria UDP",
  xray: "Xray",
  "v2ray-dns": "V2Ray DNS",
};

function makeId() {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyProfile(method: TunnelMethod): VpnProfile {
  return {
    id: makeId(),
    name: method === "zivpn-udp" ? "Profil ZiVPN" : method === "ssh-slowdns" ? "Profil SSH SlowDNS" : method === "hysteria-udp" ? "Profil Hysteria" : method === "v2ray-dns" ? "Profil V2Ray DNS" : "Profil Xray",
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
    xrayMode: "link",
    xrayLink: "",
    xrayJson: "",
  };
}

export function stripSecrets(profile: VpnProfile): StoredVpnProfile {
  const { obfs: _obfs, password: _password, hysteriaAuth: _hysteriaAuth, hysteriaObfs: _hysteriaObfs, xrayLink: _xrayLink, xrayJson: _xrayJson, ...stored } = profile;
  return stored;
}

export function profileEndpoint(profile: VpnProfile) {
  if (profile.method === "ssh-slowdns") {
    return profile.sshHost ? `${profile.sshHost}:${profile.sshPort || "22"}` : "Serveur SSH non défini";
  }
  if (profile.method === "hysteria-udp") {
    return profile.hysteriaHost ? `${profile.hysteriaHost}:${profile.hysteriaPort || "443"}` : "Serveur Hysteria non défini";
  }
  if (profile.method === "xray") {
    return profile.xrayMode === "json" ? (profile.xrayJson.trim() ? "Configuration JSON Xray" : "JSON Xray non défini") : (profile.xrayLink.trim() ? "Lien Xray configuré" : "Lien Xray non défini");
  }
  if (profile.method === "v2ray-dns") {
    const xray = profile.xrayMode === "json" ? "JSON Xray" : (profile.xrayLink.trim() ? "Lien Xray" : "Xray non défini");
    return profile.nameserver.trim() ? `${xray} via ${profile.nameserver.trim()}` : `${xray} — domaine SlowDNS non défini`;
  }
  return profile.host ? `${profile.host}:${profile.port || "—"}` : "Serveur ZiVPN non défini";
}

export function hasXrayInput(profile: VpnProfile) {
  return profile.xrayMode === "json" ? Boolean(profile.xrayJson.trim()) : Boolean(profile.xrayLink.trim());
}

export function normalizeXrayMode(profile: VpnProfile): VpnProfile {
  return { ...createEmptyProfile("xray"), ...profile, xrayMode: profile.xrayMode === "json" ? "json" : "link" };
}

export function xrayLinkScheme(link: string) {
  return link.trim().split(":", 1)[0].toLowerCase();
}
