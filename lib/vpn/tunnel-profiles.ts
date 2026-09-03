import { getActiveLang, translate, tNow, type Translator } from "../i18n";

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

/**
 * Catalogue des familles : les libellés affichables vivent dans le dictionnaire
 * i18n (clés `tunnels.<kind>.label|shortLabel|description`) ; seules les données
 * stables (accent) restent ici. Les accesseurs ci-dessous prennent un traducteur
 * réactif (hook useLang) ou retombent sur la langue active hors React.
 */
const TUNNEL_ACCENTS: Record<TunnelKind, string> = {
  zivpn: "#1687F8",
  slowdns: "#7357E8",
  hysteria: "#04A777",
  "http-payload": "#C66B17",
  "ssh-tls": "#0D86A8",
  "v2ray-slowdns": "#B14CCD",
  "xray-v2ray": "#D34B5C",
};

export type TunnelCatalogEntry = { label: string; shortLabel: string; description: string; accent: string };

function localizedCatalog(kind: TunnelKind, t: Translator): TunnelCatalogEntry {
  return {
    label: t(`tunnels.${kind}.label`),
    shortLabel: t(`tunnels.${kind}.shortLabel`),
    description: t(`tunnels.${kind}.description`),
    accent: TUNNEL_ACCENTS[kind],
  };
}

/** Entrée liée à la langue active (contexte non React : logs, exports). */
export function tunnelCatalog(kind: TunnelKind): TunnelCatalogEntry {
  return localizedCatalog(kind, tNow());
}

/** Accès statique aux couleurs d'accent (indépendant de la langue). */
export function tunnelAccent(kind: TunnelKind): string {
  return TUNNEL_ACCENTS[kind];
}

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
  uploadMbps: string;
  downloadMbps: string;
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

function secureIdSuffix(): string {
  try {
    const g = globalThis as unknown as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } };
    if (g.crypto?.getRandomValues) {
      const a = new Uint32Array(2);
      g.crypto.getRandomValues(a);
      return (a[0].toString(36) + a[1].toString(36)).slice(0, 6);
    }
  } catch {}
  return Math.random().toString(36).slice(2, 8);
}

const makeBase = <K extends TunnelKind>(kind: K): ProfileBase & { kind: K } => ({
  id: `${kind}-${Date.now()}-${secureIdSuffix()}`,
  kind,
  name: translate(getActiveLang(), "tunnels.defaultName", { short: translate(getActiveLang(), `tunnels.${kind}.shortLabel` as const) }),
  selected: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export function createProfile(kind: TunnelKind): TunnelProfile {
  const base = makeBase(kind);
  switch (kind) {
    case "zivpn": return { ...base, kind, host: "", port: "6000-19999", password: "", uploadMbps: "10", downloadMbps: "50" }; // port par défaut directement utilisable
    case "slowdns": return { ...base, kind, dnsServer: "8.8.8.8", dnsPort: "53", nameserver: "", publicKey: "", sshUsername: "", sshPassword: "" }; // DNS public par défaut
    case "hysteria": return { ...base, kind, host: "", port: "20000-50000", auth: "", obfs: "", uploadMbps: "10", downloadMbps: "50" }; // plage UDP par défaut
    case "http-payload": return { ...base, kind, proxyHost: "", proxyPort: "8080", payload: "CONNECT [host]:[port] HTTP/1.1[crlf]Host: [host]:[port][crlf]Proxy-Connection: Keep-Alive[crlf][crlf]", sshHost: "", sshPort: "22", sshUsername: "", sshPassword: "" };
    case "ssh-tls": return { ...base, kind, tlsHost: "", tlsPort: "443", sni: "", sshUsername: "", sshPassword: "" };
    case "v2ray-slowdns": return { ...base, kind, dnsServer: "8.8.8.8", dnsPort: "53", nameserver: "", publicKey: "", inputMode: "link", link: "" }; // DNS public par défaut
    case "xray-v2ray": return { ...base, kind, inputMode: "link", link: "", json: "" };
  }
}

export function cloneTunnelProfile(profile: TunnelProfile, timestamp = Date.now()): TunnelProfile {
  return {
    ...profile,
    id: `${profile.kind}-${timestamp}-${secureIdSuffix()}`,
    name: translate(getActiveLang(), "tunnels.copySuffix", { name: profile.name }),
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

/** Résumé d'accès d'un profil ; passez le traducteur du hook useLang pour un rendu réactif. */
export function profileEndpoint(profile: TunnelProfile, t: Translator = tNow()): string {
  switch (profile.kind) {
    case "zivpn": return profile.host ? `${profile.host}:${profile.port || "—"}` : t("tunnels.endpoint.unset");
    case "slowdns": return profile.dnsServer ? `${profile.dnsServer}:${profile.dnsPort || "53"}` : t("tunnels.endpoint.unset");
    case "hysteria": return profile.host ? `${profile.host}:${profile.port || "—"}` : t("tunnels.endpoint.unset");
    case "http-payload": return profile.proxyHost ? `${profile.proxyHost}:${profile.proxyPort || "8080"}` : t("tunnels.endpoint.unset");
    case "ssh-tls": return profile.tlsHost ? `${profile.tlsHost}:${profile.tlsPort || "443"}` : t("tunnels.endpoint.unset");
    case "v2ray-slowdns": return profile.link ? t("tunnels.endpoint.v2rayDnsLink") : t("tunnels.endpoint.linkUnset");
    case "xray-v2ray": return profile.inputMode === "link" ? (profile.link ? t("tunnels.endpoint.xrayLink") : t("tunnels.endpoint.linkUnset")) : (profile.json ? t("tunnels.endpoint.xrayJson") : t("tunnels.endpoint.jsonUnset"));
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
