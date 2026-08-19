# Comparaison Zamois-tun — tunnels et journaux

Source consultée : https://github.com/kinf744/Zamois-tun, branche main, commit d64405f (consultation du 19 août 2026). Clone local : `/home/ubuntu/zamois-tun-analysis/`.

## Constats techniques

Le moteur Hysteria de Zamois sépare le serveur de la chaîne `portHopping`, tandis que KIGHMU concatène actuellement le champ brut `port` dans `server: "$host:$port"`. Une plage comme `20000-50000` devient donc un endpoint invalide dans KIGHMU Hysteria.

Le moteur Xray de Zamois préserve les paramètres de transport (`ws`, `grpc`, `xhttp`, `h2`, `httpupgrade`, `kcp`), TLS et Reality. KIGHMU réduit actuellement les liens VMess/VLESS/Trojan à un outbound minimal et perd des paramètres comme `type`, `security`, `host`, `path`, `sni`, `reality` ou `grpc`, ce qui peut expliquer des échecs de connexion.

Le moteur SlowDNS de Zamois sépare le démarrage dnstt et SSH, utilise un proxy de bannière SSH, des contrôles de santé et un filtrage des messages dnstt. KIGHMU attend principalement que le processus reste vivant et transmet une partie de ses sorties brutes, ce qui est moins robuste et produit du bruit.

La référence HTTP Payload protège le socket proxy, interprète `[split]` et `[delay]`, valide les réponses CONNECT/HTTP et maintient un pont bannière SSH. La référence SSH TLS possède une chaîne TLS/SNI et un pont SSH structurée ; ces deux familles KIGHMU sont plus proches de la référence que Hysteria/Xray mais restent à tester sur appareil.

KIGHMU possède déjà `uploadMbps` et `downloadMbps` dans le modèle Hysteria, mais pas dans le modèle ZIVPN. Le service KIGHMU conserve aussi `down_mbps:50` et `up_mbps:10` en dur dans `buildUzConfig`.

## Journaux

Le préfixe `[KIGHMU]` est ajouté par l’interface `app/(tabs)/diagnostic.tsx`. `diagnostic-format.ts` ne masque actuellement que des motifs simples `password/auth/obfs/token/secret/private_key`; il ne couvre pas suffisamment UUID, liens VMess/VLESS/Trojan, payloads HTTP ou fragments JSON. `vpn-context.tsx` mélange dans un flux plat les événements de connexion, les sorties natives et les événements de navigation/stockage. Zamois filtre davantage les sorties dnstt et sépare les étapes des moteurs.

Ces constats proviennent de la lecture des fichiers locaux du clone et de la page GitHub publique ; ils ne constituent pas encore une validation de fonctionnement sur appareil Android réel.

## Vérification Hysteria v1.3.5

Le workflow GitHub Actions de KIGHMU construit explicitement `HyNetwork/hysteria` en `v1.3.5` vers `libhysteria-hysteria.so`; il ne faut donc pas appliquer la syntaxe Hysteria2. La documentation officielle Hysteria v1 confirme que le client accepte `server:host:20000-50000`, que le port hopping est UDP et qu’il est contrôlé par `hop_interval` (10 secondes par défaut). Le format client compatible comprend `auth_str`, `obfs`, `up_mbps`, `down_mbps`, `server_name`, `insecure` et `socks5.disable_udp=false` [1] [2].

Références :
[1]: https://v1.hysteria.network/docs/port-hopping/ — Hysteria v1 Port Hopping
[2]: https://v1.hysteria.network/docs/advanced-usage/ — Hysteria v1 Advanced Usage
[3]: https://v1.hysteria.network/docs/quick-start/ — Hysteria v1 Quick Start
