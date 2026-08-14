# Cartographie locale de `libuz_core.so` et spécification d’intégration KIGHMU

## Objectif et méthode

Cette étude traite `libuz_core.so` comme **référence fonctionnelle**. Elle ne cherche pas à copier du code propriétaire ni à modifier le binaire ZIVPN. Les éléments ont été récupérés localement par inspection ELF, `go version -m`, chaînes compilées, imports dynamiques, projets Ghidra ARM:LE:32:v7 et comparaison avec le code Kotlin/JNI déjà présent dans Stivaros et KIGHMU.

Les principaux artefacts sont [`libuz-metrics.txt`](./libuz-metrics.txt), [`ghidra-libuz-architecture.txt`](./ghidra-libuz-architecture.txt), [`elf-inventory.txt`](./elf-inventory.txt), [`libuz-static-details.txt`](./libuz-static-details.txt), [`interim-findings.md`](./interim-findings.md) et [`report.md`](./report.md).

## 1. Identité et architecture ELF

| Élément | Observation locale |
|---|---|
| Fichier | `libuz_core.so` |
| Taille | 11 508 056 octets |
| Architecture | ARM 32 bits, little-endian, EABI5, armeabi-v7a |
| Type | ELF `DYN`, bibliothèque partagée |
| Entry point | `0x5a268` |
| Dépendances directes | `liblog.so`, `libdl.so`, `libc.so` |
| Fonctions Ghidra | 4 603 fonctions identifiées |
| Références externes Ghidra | 48 références externes principales |
| Runtime | Go 1.21.4 |
| Base Go | `github.com/apernet/hysteria/app` |
| QUIC | `github.com/apernet/quic-go` fork/version `v0.40.1-0.20231112225043-e7f3af208dee` |

Le binaire est fortement statique du point de vue applicatif : le moteur Hysteria, QUIC, TLS, SOCKS5, DNS, congestion control et port hopping sont compilés dans le même fichier. Les seules dépendances Android visibles sont le journal, le chargeur dynamique et la libc. Il n’existe donc pas de bibliothèque Hysteria Android supplémentaire à fournir pour le chemin principal de libuz.

## 2. Interfaces et fonctions observables

Le stripping supprime les noms internes Go, mais Ghidra reconstruit 4 603 fonctions et conserve les interfaces dynamiques. Le symbole public `main.main` est présent. Les fonctions internes sont généralement anonymes (`FUN_xxxxx`), ce qui impose de les qualifier par leurs chaînes, leurs appels sortants et leurs références croisées plutôt que par leur nom d’origine.

Les familles fonctionnelles visibles dans les chaînes et types Go sont les suivantes :

| Famille | Indices observés |
|---|---|
| Entrée CLI/configuration | `main.main`, `cmd.clientConfig`, `cmd.clientConfigTransport`, `cmd.clientConfigTransportUDP`, `configFile`, `ConfigFileUsed`, `cobra`, `viper`, `mapstructure` |
| Hysteria | `github.com/apernet/hysteria/app`, `core`, `extras`, `Hysteria-UDP`, `Hysteria-PR`, `Hysteria-UDPidle_timeout` |
| QUIC/TLS | `HandshakeTLSConfig`, `HandshakeComplete`, `quicv2`, `raw-control`, `quic-go`, `tls.QUICConn`, `quic.Transport`, `TransportParameters` |
| Obfuscation | `obfs.Obfuscator`, `obfs.SalamanderObfuscator`, `obfsPacketConn`, `salamander`, `obfs-password` |
| Authentification | `auth`, `auth.password`, `auth.userpass`, `UserPassAuthenticator`, `PasswordAuthenticator`, `HYSTERIA-PR-unauthorized` |
| SOCKS5 | `SOCKS5`, `socks5.Server`, `socks5.Datagram`, `socks5.Request`, `SOCKS5 server listening` |
| UDP/port hopping | `udpEnabled`, `UDPIdleTimeout`, `udphop.udpPacket`, `udpIO`, `UDPConn`, `port`, `hopInterval`, `Hysteria-UDP` |
| Fenêtres/congestion | `recvwindow`, `recvwindowconn`, `BandwidthConfig`, `bbr.Bandwidth`, `bandwidthSampler`, `MultipathTCP` |
| DNS/résolution | `getaddrinfo`, `getnameinfo`, `res_search`, `dnsConfig`, `DNSStartInfo`, `DNSDoneInfo`, `resolver` |
| Système/threads | `pthread_create`, `pthread_mutex_*`, `pthread_cond_*`, `pthread_key_create`, `pthread_sigmask`, `nanosleep`, `dlopen`, `dlsym` |
| Journal | `__android_log_vprint`, `log-format`, `logging`, `DEBUG`, `ERROR`, `PANIC`, `HYSTERIA-PR-unauthorized` |

## 3. Dépendances et initialisation

L’initialisation visible suit une structure Go Android classique. Le loader Android charge l’ELF, les constructeurs Go préparent le runtime, puis `main.main` initialise la CLI et la configuration. Le binaire utilise `dlopen`/`dlsym` et plusieurs primitives pthread, ce qui explique pourquoi `LD_LIBRARY_PATH` doit pointer vers `applicationInfo.nativeLibraryDir`, même si les dépendances principales sont système.

Les imports réseau/DNS montrent une résolution par libc et un contrôle de sockets natif. Les imports de threads montrent que le moteur ne doit pas être exécuté sur le thread principal Android. Le lanceur Stivaros respecte cette contrainte en utilisant `ProcessBuilder` puis un thread séparé pour consommer les logs. KIGHMU doit appliquer la même règle pour toutes les opérations de démarrage, attente et arrêt.

## 4. Contrat de lancement réel

Le contrat validé dans Stivaros est :

```text
libuz_core.so -s <obfs> --config <JSON inline>
```

Le JSON contient au minimum :

```json
{
  "server": "host:port-ou-range",
  "obfs": "<clé Salamander>",
  "auth": "<mot-de-passe ou user:password>",
  "socks5": {"listen": "127.0.0.1:7778"},
  "insecure": true,
  "recvwindowconn": 65536,
  "recvwindow": 262144,
  "disable_mtu_discovery": true,
  "down_mbps": 50,
  "up_mbps": 10
}
```

L’ordre qui fonctionne est essentiel :

```text
Réseau physique disponible
        ↓
Processus Android lié au réseau physique
        ↓
libuz_core lancé avec JSON inline
        ↓
SOCKS5 local 127.0.0.1:7778 détecté
        ↓
HEV chargé et configuré
        ↓
TUN Android établi, fd transféré à HEV
        ↓
Trafic TUN → HEV → SOCKS5 → libuz → QUIC/UDP → serveur
```

Libuz ne reçoit pas le descripteur TUN. Il fournit un point SOCKS local. HEV reçoit le descripteur TUN. Cette séparation réduit la surface d’échec par rapport à KIGHMU, qui tente historiquement de faire gérer le TUN directement au client Hysteria.

## 5. Réseau, QUIC, UDP et obfuscation

Les chaînes et types compilés confirment un transport QUIC complet avec TLS QUIC, fenêtres de flux, gestion des timeouts de handshake, congestion BBR, paquets UDP et port hopping. Les indices `quicv2`, `raw-control`, `udpEnabled`, `UDPIdleTimeout`, `udphop.udpPacket`, `hopInterval`, `recvwindow` et `disable_mtu_discovery` doivent être traités comme des **capacités compilées**, pas comme une preuve que chaque option est activée dans chaque invocation.

La présence de `obfs.SalamanderObfuscator` et `obfsPacketConn` indique que l’Obfs est appliqué au niveau de la connexion UDP/QUIC avant le transport Hysteria. Côté KIGHMU, l’exigence importante est de vérifier l’ordre : résolution/adresse → UDP socket → wrapper Salamander → QUIC/TLS → authentification. Une obfuscation appliquée après la création incorrecte du transport, ou un mot de passe envoyé dans un mauvais champ, empêche le serveur de reconnaître le premier paquet.

La présence de `sendmmsg`/`recvmmsg` et de buffers réseau dans HEV concerne surtout le relais TUN→SOCKS. Elle explique la bonne performance de la chaîne ZIVPN, mais ne prouve pas que KIGHMU doive incorporer HEV dans son propre protocole. Le gain principal à intégrer à KIGHMU est la séparation stricte du contrôle réseau et du TUN.

## 6. Configuration et authentification

Le serveur KIGHMU utilise `auth.type: userpass`. Le client doit donc transmettre la valeur sous la forme attendue par la révision KIGHMU : soit `utilisateur:mot_de_passe`, soit une structure distincte si le code source l’impose. Une chaîne contenant seulement le mot de passe ne doit pas être considérée comme équivalente à l’identifiant userpass.

Le port range est conservé textuellement par les générateurs Android connus : `host:20000-50000` n’est ni réduit à `20000`, ni transformé en entier. Toutefois, le parser Go KIGHMU exact n’est pas disponible dans le dépôt local. Il reste donc nécessaire de vérifier dans le code source la fonction qui transforme l’adresse en `UDPAddr` et celle qui active `hopInterval`/port hopping.

Le YAML KIGHMU historique contient `fileDescriptor`, `disablePathMTUDiscovery`, `server`, `auth`, `obfs`, `tls` et `tun`. La recherche dans le binaire KIGHMU local ne retrouve pas la chaîne `fileDescriptor`, alors que le patch source l’ajoute explicitement avec `mapstructure:"fileDescriptor"`. C’est l’indice le plus important d’un possible décalage entre le binaire utilisé et la source corrigée.

## 7. Architecture générale à reproduire dans KIGHMU

| Composant à conserver ou adapter | Exigence pour KIGHMU |
|---|---|
| Processus Android | Démarrage hors thread principal, logs consommés séparément |
| Réseau de contrôle | `setUnderlyingNetworks`, exclusion du package du TUN et `bindProcessToNetwork` avant le handshake |
| Configuration | Vérifier les clés réellement reconnues par la révision du binaire |
| Auth | Confirmer le format userpass exact et ne jamais le tronquer |
| Port range | Préserver la chaîne et vérifier l’activation côté client |
| TUN | Confirmer que le binaire contient le support `fileDescriptor` avant de lui transmettre un fd |
| MTU | Commencer avec une valeur cohérente avec le chemin validé, par exemple 1400, puis mesurer |
| État UI | Ne déclarer connecté qu’après handshake ou preuve de trafic, jamais après `ProcessBuilder.start()` |
| Arrêt | Fermer le fd TUN, arrêter le relais/processus, libérer le binding réseau et invalider la génération |
| Logs | Distinguer parsing, loader, socket, handshake, auth, TUN et trafic |

## 8. Conclusion et niveaux de confiance

La conclusion de confiance élevée est que **libuz fonctionne grâce à un contrat d’intégration précis**, non simplement parce qu’il s’agit d’un autre binaire Hysteria : il sépare le moteur QUIC/UDP du relais TUN, utilise une configuration JSON inline connue, lie son contrôle au réseau physique et attend une socket locale avant d’activer le TUN.

La conclusion de confiance moyenne à élevée est que le KIGHMU embarqué peut être incompatible avec son propre YAML Android, notamment parce que `fileDescriptor` est absent du binaire alors qu’il est ajouté par le patch source. La conclusion de confiance moyenne est que l’absence de transport UDP/port hopping explicite peut expliquer l’échec si le parser KIGHMU ne l’active pas implicitement.

La décompilation ne permet pas de récupérer le code source original complet : le binaire est stripped, et `go tool nm` confirme l’absence de section de symboles. La cartographie produite est donc une spécification fonctionnelle et d’interopérabilité. Elle permet de corriger KIGHMU légitimement, mais ne permet pas d’affirmer le contenu exact de chaque fonction interne sans la source Go correspondant au BuildID analysé.

## 9. Recommandation d’intégration

La prochaine modification KIGHMU devrait être minimale et isolée : utiliser le patch TUN seulement après avoir confirmé que le binaire est produit depuis cette source, vérifier le port range dans le parser réel, conserver le binding réseau physique avant tout socket de contrôle, et ajouter une preuve de handshake avant l’état connecté. Il n’est pas recommandé d’intégrer des fonctions libuz par copie binaire ; il faut reprendre les invariants d’architecture et les implémenter dans le code source KIGHMU.
