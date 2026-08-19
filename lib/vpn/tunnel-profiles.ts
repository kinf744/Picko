export const TUNNEL_KINDS = [
  "zivpn",
  "slowdns",
  "hysteria",
  "http-payload",
  "ssh-tls",
  "v2ray-slowdns",
  "xray-v2ray",
] as const;

export type TunnelKind = (typeof TUNNEL_KINDS)[number];
export const ZIVPN_FIXED_OBFS = "hu``hqb`c";

export const TUNNEL_CATALOG: Record<TunnelKind, { label: string; shortLabel: string; description: string; accent: string }> = {
  zivpn: { label: "UDP-ZIVPN", shortLabel: "ZIVPN", description: "UDP avec Obfs et plage de ports", accent: "#1687F8" },
  slowdns: { label: "SSH / SlowDNS", shortLabel: "SlowDNS", description: "SSH sur tunnel DNS", accent: "#7357E8" },
  hysteria: { label: "Hysteria UDP", shortLabel: "Hysteria", description: "UDP haute performance", accent: "#04A777" },
  "http-payload": { label: "HTTP Proxy + Payload", shortLabel: "HTTP Payload", description: "Proxy HTTP puis SSH", accent: "#C66B17" },
  "ssh-tls": { label: "SSH SSL/TLS", shortLabel: "SSH TLS", description: "SSH à travers TLS", accent: "#0D86A8" },
  "v2ray-slowdns": { label: "V2Ray + SlowDNS", shortLabel: "V2 + DNS", description: "V2Ray simple encapsulé par SlowDNS", accent: "#B14CCD" },
  "xray-v2ray": { label: "Xray / V2Ray", shortLabel: "Xray", description: "Liens ou JSON Xray/V2Ray", accent: "#D34B5C" },
};

export type TunnelBalancer = {
  enabled: boolean;
  strategy: "round-robin";
  healthCheck: boolean;
};

export type ProfileBase = {
  id: string;
  kind: TunnelKind;
  name: string;
  selected: boolean;
  createdAt: number;
  updatedAt: number;
};

export type ZivpnProfile = ProfileBase & {
  kind: "zivpn";
  host: string;
  port: string;
  password: string;
};

export type SlowDnsProfile = ProfileBase & {
  kind: "slowdns";
  dnsServer: string;
  dnsPort: string;
  nameserver: string;
  publicKey: string;
  sshUsername: string;
  sshPassword: string;
};

export type HysteriaProfile = ProfileBase & {
  kind: "hysteria";
  host: string;
  port: string;
  auth: string;
  obfs: string;
  uploadMbps: string;
  downloadMbps: string;
};

export type HttpPayloadProfile = ProfileBase & {
  kind: "http-payload";
  proxyHost: string;
  proxyPort: string;
  payload: string;
  sshHost: string;
  sshPort: string;
  sshUsername: string;
  sshPassword: string;
};

export type SshTlsProfile = ProfileBase & {
  kind: "ssh-tls";
  tlsHost: string;
  tlsPort: string;
  sni: string;
  sshUsername: string;
  sshPassword: string;
};

export type XrayProfile = ProfileBase & {
  kind: "xray-v2ray";
  inputMode: "link" | "json";
  link: string;
  json: string;
};

export type V2RaySlowDnsProfile = ProfileBase & {
  kind: "v2ray-slowdns";
  dnsServer: string;
  dnsPort: string;
  nameserver: string;
  publicKey: string;
  inputMode: "link";
  link: string;
};

export type TunnelProfile = ZivpnProfile | SlowDnsProfile | HysteriaProfile | HttpPayloadProfile | SshTlsProfile | XrayProfile | V2RaySlowDnsProfile;
export type ProfileFieldErrors = Record<string, string>;

const makeBase = <K extends TunnelKind>(kind: K): ProfileBase & { kind: K } => ({
  id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  kind,
  name: `Profil ${TUNNEL_CATALOG[kind].shortLabel}`,
  selected: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export function createProfile(kind: TunnelKind): TunnelProfile {
  const base = makeBase(kind);
  switch (kind) {
    case "zivpn": return { ...base, kind, host: "", port: "", password: "" };
    case "slowdns": return { ...base, kind, dnsServer: "", dnsPort: "53", nameserver: "", publicKey: "", sshUsername: "", sshPassword: "" };
    case "hysteria": return { ...base, kind, host: "", port: "", auth: "", obfs: "", uploadMbps: "10", downloadMbps: "50" };
    case "http-payload": return { ...base, kind, proxyHost: "", proxyPort: "8080", payload: "CONNECT [host]:[port] HTTP/1.1[crlf]Host: [host]:[port][crlf]Proxy-Connection: Keep-Alive[crlf][crlf]", sshHost: "", sshPort: "22", sshUsername: "", sshPassword: "" };
    case "ssh-tls": return { ...base, kind, tlsHost: "", tlsPort: "443", sni: "", sshUsername: "", sshPassword: "" };
    case "v2ray-slowdns": return { ...base, kind, dnsServer: "", dnsPort: "53", nameserver: "", publicKey: "", inputMode: "link", link: "" };
    case "xray-v2ray": return { ...base, kind, inputMode: "link", link: "", json: "" };
  }
}

export function cloneTunnelProfile(profile: TunnelProfile, timestamp = Date.now()): TunnelProfile {
  return {
    ...profile,
    id: `${profile.kind}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    name: `${profile.name} — copie`,
    selected: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  } as TunnelProfile;
}

export function defaultBalancer(): TunnelBalancer {
  return { enabled: false, strategy: "round-robin", healthCheck: true };
}

/** Le round robin est automatique dès que deux profils de la famille active sont sélectionnés. */
export function shouldUseRoundRobin(selectedProfileCount: number): boolean {
  return selectedProfileCount >= 2;
}

export function profileEndpoint(profile: TunnelProfile): string {
  switch (profile.kind) {
    case "zivpn": return profile.host ? `${profile.host}:${profile.port || "—"}` : "Non configuré";
    case "slowdns": return profile.dnsServer ? `${profile.dnsServer}:${profile.dnsPort || "53"}` : "Non configuré";
    case "hysteria": return profile.host ? `${profile.host}:${profile.port || "—"}` : "Non configuré";
    case "http-payload": return profile.proxyHost ? `${profile.proxyHost}:${profile.proxyPort || "8080"}` : "Non configuré";
    case "ssh-tls": return profile.tlsHost ? `${profile.tlsHost}:${profile.tlsPort || "443"}` : "Non configuré";
    case "v2ray-slowdns": return profile.link ? "Lien V2Ray+DNS" : "Lien non configuré";
    case "xray-v2ray": return profile.inputMode === "link" ? (profile.link ? "Lien Xray/V2Ray" : "Lien non configuré") : (profile.json ? "JSON Xray/V2Ray" : "JSON non configuré");
  }
}

export function secretFields(profile: TunnelProfile): string[] {
  switch (profile.kind) {
    case "zivpn": return ["password"];
    case "slowdns": return ["sshPassword"];
    case "hysteria": return ["auth", "obfs"];
    case "http-payload": return ["payload", "sshPassword"];
    case "ssh-tls": return ["sshPassword"];
    case "v2ray-slowdns": return ["link"];
    case "xray-v2ray": return ["link", "json"];
  }
}

export function omitSecrets(profile: TunnelProfile): TunnelProfile {
  const copy = { ...profile } as Record<string, unknown>;
  secretFields(profile).forEach((field) => { copy[field] = ""; });
  return copy as TunnelProfile;
}

export function withSecrets(profile: TunnelProfile, secrets: Record<string, string>): TunnelProfile {
  return { ...profile, ...secrets } as TunnelProfile;
}
