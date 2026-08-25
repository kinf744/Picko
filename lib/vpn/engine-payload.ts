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
  // Inatteignable : les sept familles sont couvertes ci-dessus. Le typage `never`
  // provoque une erreur de compilation si une nouvelle famille est ajoutée sans mappage.
  const exhaustive: never = profile;
  throw new Error(`Type de tunnel non pris en charge : ${JSON.stringify(exhaustive)}`);
}

/** Construit la chaîne JSON passée à `native.startVpn(...)`. */
export function buildEnginePayload(profiles: TunnelProfile[]): string {
  return JSON.stringify({ profiles: profiles.map(toEngineProfile) });
}
