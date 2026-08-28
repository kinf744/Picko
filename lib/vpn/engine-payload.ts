import type { AppSettings } from "../app-settings";
import { ZIVPN_FIXED_OBFS, type TunnelKind, type TunnelProfile } from "./tunnel-profiles";

/**
 * Adaptateur de charge utile pour `native.startVpn(...)`.
 *
 * L'interface (#154) décrit ses profils avec un champ `kind` et ses propres
 * noms de champs. Le moteur natif libopol (repris de la branche tunnels-7)
 * lit un tableau `profiles` où chaque entrée porte un champ `method` et le
 * schéma défini par `TunnelProfile.kt`. Ce module traduit l'un vers l'autre.
 *
 * C'est le SEUL point de contact entre le frontend et le moteur : aucun écran
 * n'est modifié, seule la charge utile envoyée au natif est adaptée.
 *
 * Schéma cible (noms de champs + champs requis par `validate()`) :
 *   modules/kighmu-vpn-native/android/src/main/java/.../TunnelProfile.kt
 */

/** Correspondance `kind` (#154)  ->  `method` (moteur natif). */
const KIND_TO_METHOD: Record<TunnelKind, string> = {
  zivpn: "zivpn-udp",
  slowdns: "ssh-slowdns",
  hysteria: "hysteria-udp",
  "http-payload": "http-proxy-payload",
  "ssh-tls": "ssh-ssl-tls",
  "v2ray-slowdns": "v2ray-dns",
  "xray-v2ray": "xray",
};

/** Profil au format attendu par `TunnelProfile.parseMany` côté natif. */
export type EngineProfile = Record<string, string>;

/** Traduit un profil #154 vers le schéma du moteur natif. */
export function toEngineProfile(profile: TunnelProfile): EngineProfile {
  const base = { id: profile.id, name: profile.name, method: KIND_TO_METHOD[profile.kind] };
  switch (profile.kind) {
    case "zivpn":
      // #154 ne stocke pas l'obfs (constante fixe) ; le moteur l'exige non vide.
      return { ...base, host: profile.host, port: profile.port, password: profile.password, obfs: ZIVPN_FIXED_OBFS };
    case "slowdns":
      // Le SSH transite par le pont DNSTT local : `sshHost`/`sshPort` ne servent
      // qu'à satisfaire `validate()`, leur valeur n'est pas utilisée pour la connexion.
      return {
        ...base,
        sshHost: "127.0.0.1",
        sshPort: "22",
        sshUser: profile.sshUsername,
        password: profile.sshPassword,
        dnsServer: profile.dnsServer,
        dnsPort: profile.dnsPort,
        nameserver: profile.nameserver,
        publicKey: profile.publicKey,
      };
    case "hysteria":
      return {
        ...base,
        hysteriaHost: profile.host,
        hysteriaPort: profile.port,
        hysteriaAuth: profile.auth,
        hysteriaObfs: profile.obfs,
        hysteriaUpMbps: profile.uploadMbps,
        hysteriaDownMbps: profile.downloadMbps,
      };
    case "http-payload":
      return {
        ...base,
        proxyHost: profile.proxyHost,
        proxyPort: profile.proxyPort,
        httpPayload: profile.payload,
        sshHost: profile.sshHost,
        sshPort: profile.sshPort,
        sshUser: profile.sshUsername,
        password: profile.sshPassword,
      };
    case "ssh-tls":
      // Le moteur ouvre le transport TLS vers `sshHost:sshPort` puis y fait passer le SSH.
      return {
        ...base,
        sshHost: profile.tlsHost,
        sshPort: profile.tlsPort,
        sslSni: profile.sni,
        sshUser: profile.sshUsername,
        password: profile.sshPassword,
      };
    case "v2ray-slowdns":
      // #154 impose le mode lien ; le moteur `v2ray-dns` combine Xray (lien) + SlowDNS.
      return {
        ...base,
        xrayMode: "link",
        xrayLink: profile.link,
        dnsServer: profile.dnsServer,
        dnsPort: profile.dnsPort,
        nameserver: profile.nameserver,
        publicKey: profile.publicKey,
      };
    case "xray-v2ray":
      return {
        ...base,
        xrayMode: profile.inputMode,
        xrayLink: profile.link,
        xrayJson: profile.json,
      };
  }
  // Inatteignable : les 7 familles sont couvertes ci-dessus. Le typage `never`
  // provoque une erreur de compilation si une nouvelle famille est ajoutée sans mappage.
  const exhaustive: never = profile;
  throw new Error(`Type de tunnel non pris en charge : ${JSON.stringify(exhaustive)}`);
}

/**
 * Réglages moteurs émis sous la clé `settings` (sibling de `profiles`).
 * Les noms de clés DOIVENT être identiques à ceux lus par `VpnRuntimeSettings.parse()`
 * (modules/kighmu-vpn-native/.../VpnRuntimeSettings.kt:30-54) : une clé mal
 * orthographiée retomberait silencieusement sur le défaut natif.
 *
 * ⚠️ `debugMode` est volontairement ABSENT : le réglage applicatif
 * `verboseDiagnostics` ne concerne que la rétention locale des logs et ne doit
 * jamais basculer le debug moteur natif (défaut false).
 */
export type EngineSettings = {
  customDnsEnabled: boolean;
  dnsPrimary: string;
  dnsSecondary: string;
  mtu: number;
  wakeLockEnabled: boolean;
  profileNameInNotification: boolean;
  httpPingEnabled: boolean;
  httpPingUrl: string;
  httpPingIntervalMs: number;
  httpPingTimeoutMs: number;
  reconnectAfterFailures: number;
  alwaysReconnect: boolean;
};

/** Clamps entiers miroir des `coerceIn(...)` natifs (arrondit les demi-mesures). */
const clampInt = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, Math.round(value)));

/** Repli identiques aux défauts de la data class native (VpnRuntimeSettings.kt:9-16),
 * utilisés quand la valeur saisie est vide/invalide — même comportement que le natif. */
const NATIVE_FALLBACK = {
  dnsPrimary: "1.1.1.1",
  dnsSecondary: "1.0.0.1",
  httpPingUrl: "https://www.google.com/generate_204",
} as const;

const cleanDns = (value: string, fallback: string): string => {
  const trimmed = String(value ?? "").trim().slice(0, 255);
  return trimmed.length > 0 ? trimmed : fallback;
};

// Miroir de VpnRuntimeSettings.kt:34-36 : schéma http(s) + hôte non vide, sinon repli.
const cleanHttpUrl = (value: string): string => {
  const trimmed = String(value ?? "").trim();
  return /^https?:\/\/[^\s/:?#]+/i.test(trimmed) ? trimmed : NATIVE_FALLBACK.httpPingUrl;
};

/** Traduit AppSettings vers l'objet `settings` du moteur (clamps JS = défense en profondeur,
 * le natif re-clampe de toute façon). */
export function toEngineSettings(settings: AppSettings): EngineSettings {
  // Le timeout est plafonné par min(60000, intervalle), exactement comme le natif.
  const interval = clampInt(settings.httpPingIntervalMs, 1_000, 120_000);
  return {
    customDnsEnabled: settings.customDnsEnabled === true,
    dnsPrimary: cleanDns(settings.dnsPrimary, NATIVE_FALLBACK.dnsPrimary),
    dnsSecondary: cleanDns(settings.dnsSecondary, NATIVE_FALLBACK.dnsSecondary),
    mtu: clampInt(settings.mtu, 1280, 1500),
    wakeLockEnabled: settings.wakeLockEnabled === true,
    profileNameInNotification: settings.profileNameInNotification !== false,
    httpPingEnabled: settings.httpPingEnabled !== false,
    httpPingUrl: cleanHttpUrl(settings.httpPingUrl),
    httpPingIntervalMs: interval,
    httpPingTimeoutMs: clampInt(settings.httpPingTimeoutMs, 1_000, Math.min(60_000, interval)),
    reconnectAfterFailures: clampInt(settings.reconnectAfterFailures, 0, 20),
    alwaysReconnect: settings.alwaysReconnect !== false,
  };
}

/**
 * Construit la chaîne JSON passée à `native.startVpn(...)`.
 *
 * Sans `settings`, émet uniquement `{ profiles }` : le moteur garde alors ses
 * défauts natifs — c'est le comportement historique, conservé pour les tests.
 * Avec `settings`, émet `{ profiles, settings }` : les valeurs deviennent
 * autoritaires côté natif (défauts AppSettings = défauts natifs → neutre).
 */
export function buildEnginePayload(profiles: TunnelProfile[], settings?: AppSettings): string {
  const payload = settings === undefined
    ? { profiles: profiles.map(toEngineProfile) }
    : { profiles: profiles.map(toEngineProfile), settings: toEngineSettings(settings) };
  return JSON.stringify(payload);
}