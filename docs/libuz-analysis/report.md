# Analyse locale de `libuz_core.so` et comparaison avec KIGHMU

**Projet :** KIGHMU VPN Android  
**Date :** 14 août 2026  
**Périmètre :** analyse locale en lecture seule, ABI `armeabi-v7a` uniquement. Le VPS et le service UDP-ZIVPN existant n’ont pas été modifiés.

## Résumé exécutif

L’analyse confirme que `libuz_core.so` n’est pas un simple relais TUN ou une bibliothèque JNI. Il s’agit d’un **exécutable Go Android autonome**, chargé comme bibliothèque native uniquement pour bénéficier de `nativeLibraryDir`, puis lancé par `ProcessBuilder`. Son point d’entrée est `main.main`; il embarque sa propre pile réseau, sa propre implémentation QUIC/TLS et un serveur SOCKS5 local. La chaîne TUN→SOCKS5 est assurée séparément par HEV.

Le binaire ZIVPN utilisé par notre APK est **bit pour bit identique** à celui du dépôt de référence Stivaros pour `armeabi-v7a` : les deux ont le SHA-256 `380a6b0c35189fe43b8282b91d7ec3a313d7d0f55777b6fb9fef5f4620990ba9`. La réussite observée sur le téléphone prouve donc que le binaire, son format de configuration et la chaîne Android de base sont compatibles avec le serveur ZIVPN.

La différence principale n’est pas le relais HEV. Les bibliothèques `libhev-socks5-tunnel.so` et `libtun2socks.so` du projet sont également identiques et le relais TUN→SOCKS5 a transmis le trafic réel. Les écarts critiques se situent plutôt dans **le moteur KIGHMU lui-même, son protocole, son format de configuration et son mode de lancement réseau**.

## 1. Outils utilisés et limites

Les utilitaires ELF et Go disponibles localement ont été utilisés : `file`, `readelf`, `objdump`, `strings`, `sha256sum`, `go version -m` et `go tool nm`, complétés par une comparaison du code Kotlin/JNI des deux dépôts. IDA Pro/Hex-Rays, Binary Ninja, Cutter/radare2, Frida et LLDB ne sont pas installés dans l’environnement local. Frida et LLDB nécessiteraient en outre un processus Android réellement lancé sur un appareil ou un émulateur compatible ; ils ne peuvent pas fournir une observation dynamique utile sur le seul fichier présent dans le sandbox.

L’analyse dynamique complète du handshake n’est donc pas déclarée comme effectuée. Les résultats ci-dessous sont fondés sur les métadonnées ELF, le build-info Go, les symboles exportés, les chaînes embarquées et le code source d’intégration validé par le test réel.

## 2. Comparaison des artefacts natifs

| Élément | KIGHMU VPN local | Dépôt Stivaros | Conclusion |
|---|---:|---:|---|
| `libuz_core.so` armeabi-v7a | 11 508 056 octets | 11 508 056 octets | Même taille |
| SHA-256 `libuz_core.so` armeabi-v7a | `380a6b0c…0990ba9` | `380a6b0c…0990ba9` | Copie identique |
| `libhev-socks5-tunnel.so` | 203 412 octets | 203 412 octets | Même bibliothèque |
| `libtun2socks.so` | 203 412 octets | 203 412 octets | Copie identique à HEV |
| ABI | ARM 32 bits, EABI5, soft-float | ARM 32 bits, EABI5, soft-float | Conforme à la contrainte |
| `libuz_core.so` arm64 | Absent du projet KIGHMU | Présent dans Stivaros | Sans impact pour la cible armeabi-v7a |

Un point important est que `libhev-socks5-tunnel.so` et `libtun2socks.so` ont le même SHA-256 dans les deux projets. Les deux noms désignent actuellement la même image HEV, et non deux moteurs différents.

## 3. Nature et provenance de `libuz_core.so`

Le build-info Go identifie les éléments suivants :

| Propriété | Valeur observée |
|---|---|
| Module principal | `github.com/apernet/hysteria/app` |
| Runtime Go | `go1.21.4` |
| Architecture | `GOOS=android`, `GOARCH=arm`, `GOARM=7` |
| Mode de build | `-buildmode=exe`, malgré l’extension `.so` |
| Bibliothèque QUIC | `github.com/apernet/quic-go` `v0.40.1-0.20231112225043-e7f3af208dee` |
| Révision incorporée | `405572dc6e335c29ab28011bcfa9e0db2c45a4b4` |
| Dépendances Android dynamiques | `liblog.so`, `libdl.so`, `libc.so` |
| Symboles dynamiques | Principalement `main.main`, runtime Go et interfaces libc |

Le suffixe `.so` est donc une convention d’empaquetage Android. Le fichier se comporte comme un **exécutable autonome** et non comme une bibliothèque à appeler directement depuis JNI. Cette architecture explique pourquoi le dépôt Stivaros le lance via `ProcessBuilder` avec les arguments `-s`, `--config` et une configuration JSON inline.

Les chaînes embarquées indiquent la présence de `quic-go`, HTTP/3, QUIC v2, TLS 1.3, 0-RTT, multipath, `sendmmsg`/`recvmmsg`, SOCKS5, `zivpn_udp`, `udp-zivpn`, `Zivpnudp-Auth`, `ZIVPN_UDP_BRUTAL_DEBUG`, `raw-control`, `udpEnabled`, `obfs`, `userpass`, `down_mbps`, `up_mbps` et `recvwindow`. Ces marqueurs établissent que le client ZIVPN contient une pile de transport spécialisée, et ne constituent pas une preuve suffisante de la version exacte du protocole Hysteria.

## 4. Différence de base entre ZIVPN et KIGHMU

Le build-info du binaire KIGHMU local révèle une base différente :

| Propriété | `libuz_core.so` ZIVPN | Binaire KIGHMU |
|---|---|---|
| Module | `github.com/apernet/hysteria/app` | `github.com/apernet/hysteria/app/v2` |
| Bibliothèque QUIC | snapshot de novembre 2023 | snapshot d’août 2026 |
| Runtime Go | `go1.21.4` | version non affichée dans le résumé, build moderne |
| Interface de lancement | `main.main`, commande ZIVPN spécialisée | client Hysteria v2 avec YAML |
| Transport observé | marqueurs ZIVPN, QUIC v2, réglages custom | Hysteria v2/Salamander et configuration TUN native |
| Type de fichier | ELF PIE empaqueté sous `.so` | ELF PIE exécutable empaqueté comme binaire natif |

Cette différence est déterminante. Même si les deux projets proviennent de l’écosystème Hysteria, ils ne sont pas nécessairement interchangeables au niveau de la négociation, de l’authentification, de l’obfuscation ou des paramètres QUIC. **Copier les réglages de ZIVPN dans KIGHMU ne transforme pas KIGHMU en ZIVPN**, et remplacer uniquement le relais TUN ne corrige pas une incompatibilité du moteur ou du serveur.

## 5. Comparaison du lancement Android

Le dépôt Stivaros lance chaque canal ZIVPN selon cette séquence : résolution du serveur, sélection du réseau physique, `bindProcessToNetwork`, création du JSON inline, lancement de `libuz_core.so`, définition de `LD_LIBRARY_PATH`, puis attente du port SOCKS5 local. Pour le profil simple, le port local est `7778`; pour plusieurs plages, Stivaros crée plusieurs processus ZIVPN sur des ports distincts et place un balanceur Kotlin sur `7777`.

L’intégration actuelle KIGHMU de test reprend correctement la majorité de cette séquence, mais plusieurs différences subsistent :

| Point | Stivaros ZIVPN fonctionnel | Intégration actuelle KIGHMU de test | Importance |
|---|---|---|---|
| Réseau physique | Binding réalisé avant chaque lancement de canal | Binding global avant le processus | À conserver et à journaliser |
| Exclusion de l’application du TUN | Oui | Oui | Correctif confirmé |
| Chemin natif | `nativeLibraryDir` | `nativeLibraryDir` | Correctif confirmé |
| `LD_LIBRARY_PATH` | Défini vers `nativeLibraryDir` | Défini vers `nativeLibraryDir` | Correctif confirmé |
| `HOME`/`TMPDIR` | `/data/local/tmp` dans Stivaros | `cacheDir` dans l’APK KIGHMU | Différence à tester pour KIGHMU |
| Configuration ZIVPN | JSON inline passé après `--config` | Même forme | Compatible avec le test réussi |
| Relais TUN | HEV vers SOCKS5 | HEV vers SOCKS5 | Fonctionnel en pratique |
| Plages multiples | Processus multiples + balanceur `7777` | Un seul processus sur `7778` | Non bloquant pour un seul range |
| Détection de disponibilité | Vérification du processus, du port et des logs | Vérification du port et des logs | À renforcer côté KIGHMU |

La différence `HOME`/`TMPDIR` mérite un test ciblé, car les chaînes de `libuz_core.so` référencent `$HOME/.zivpn` et des fichiers de configuration auxiliaires. Stivaros utilise `/data/local/tmp`, alors que notre service de test utilise le cache privé de l’application. Pour ZIVPN, le test réel montre que cette différence n’empêche pas la connexion ; pour KIGHMU, elle doit rester séparée de l’analyse du protocole.

## 6. Comparaison JNI et relais TUN

Le wrapper JNI actuel appelle `hev_socks5_tunnel_main_from_str(config, fd)` dans un thread POSIX, conserve le descripteur TUN détaché et arrête le relais via `hev_socks5_tunnel_quit()`. Le code de Stivaros utilise le même contrat JNI et les mêmes symboles HEV. Le relais lit un fichier YAML HEV contenant une adresse virtuelle `198.18.0.1`, le port SOCKS5 local et `udp: udp`.

Le test réel sur Android a confirmé que cette chaîne fonctionne : `libuz_core.so` écoute sur `127.0.0.1:7778`, HEV démarre, le TUN est relié au SOCKS5 et le trafic Internet passe. Il n’existe donc pas de preuve actuelle que le wrapper JNI ou le relais HEV soit la cause du timeout KIGHMU.

## 7. Causes probables du timeout KIGHMU

La capture réseau antérieure indiquait que le binaire KIGHMU démarrait mais qu’aucun paquet UDP utile n’était observé vers le VPS. Après validation de ZIVPN dans la même application, le diagnostic se resserre sur les points suivants.

Premièrement, le binaire KIGHMU et `libuz_core.so` ne partagent pas la même base applicative : KIGHMU utilise `app/v2`, tandis que ZIVPN utilise `app`. Le format YAML, la structure `tun.fileDescriptor`, l’authentification et l’obfuscation Salamander doivent donc être validés contre **la version exacte du serveur KIGHMU**, et non contre le comportement de ZIVPN.

Deuxièmement, l’ancien lancement KIGHMU créait un YAML avec un descripteur TUN intégré, une adresse `100.100.100.101/30`, des routes IPv4/IPv6 strictes et `disablePathMTUDiscovery: false`. ZIVPN, lui, crée un TUN Android standard puis envoie seulement son descripteur au relais HEV. Cette différence de chemin de données peut expliquer un démarrage apparent sans trafic si le moteur KIGHMU n’accepte pas exactement la forme du descripteur ou de la configuration produite.

Troisièmement, la configuration KIGHMU doit distinguer trois éléments sans ambiguïté : l’adresse du serveur, la plage de port hopping et le mot de passe Salamander. Le profil ZIVPN utilise un champ `obfs` et un champ `auth` dans un JSON spécialisé ; KIGHMU utilise un bloc YAML `obfs.type=salamander`, `obfs.salamander.password` et `auth`. Une valeur d’obfuscation correcte pour ZIVPN ne prouve donc pas que le bloc Salamander KIGHMU est valide.

Quatrièmement, la validation actuelle de KIGHMU annonce trop tôt certains états et ne dispose pas encore d’un contrôle de santé équivalent au port SOCKS5 ZIVPN. Le moteur KIGHMU doit être déclaré connecté uniquement après un événement de handshake explicite ou une activité réseau observable, et non après le seul démarrage du processus.

## 8. Recommandations techniques, par ordre de priorité

| Priorité | Recommandation | Motif |
|---:|---|---|
| 1 | Ajouter un mode d’intégration KIGHMU isolé, sans modifier le code ZIVPN fonctionnel | Préserver la référence de régression |
| 2 | Journaliser la commande effective, le chemin natif, `HOME`, `TMPDIR`, `LD_LIBRARY_PATH`, l’ABI et le code de sortie, sans journaliser les secrets | Rendre le lancement reproductible |
| 3 | Tester KIGHMU avec `HOME` et `TMPDIR` alignés sur Stivaros, puis avec le cache privé, en comparant uniquement les paquets et logs | Éliminer une différence d’environnement |
| 4 | Vérifier le schéma YAML attendu par la révision KIGHMU réellement compilée | Éviter de mélanger Hysteria `app` et `app/v2` |
| 5 | Ajouter un contrôle de santé KIGHMU : processus vivant, socket/activité UDP, log handshake, trafic TUN | Éviter les faux positifs d’état connecté |
| 6 | Comparer les paramètres QUIC et Salamander avec le serveur KIGHMU dédié, pas avec UDP-ZIVPN | Les deux services doivent rester séparés |
| 7 | N’envisager un changement de binaire KIGHMU qu’après preuve dans les logs et captures | Respecter la contrainte de compilation GitHub Actions et préserver le VPS |

## Conclusion

L’analyse locale établit que **l’APK ZIVPN fonctionnel utilise le même `libuz_core.so` que Stivaros et le même relais HEV**, ce qui explique la réussite immédiate du tunnel. Le manque principal de KIGHMU n’est pas une bibliothèque Android manquante évidente. Il est beaucoup plus probablement lié à l’écart entre son moteur Hysteria `app/v2`, son format YAML/TUN/Salamander, sa version de `quic-go` et le serveur KIGHMU, auquel s’ajoutent les différences d’environnement de processus.

La prochaine correction raisonnable est donc une **intégration KIGHMU diagnostique isolée**, avec environnement et logs exhaustifs, sans toucher à ZIVPN. Il ne faut pas remplacer KIGHMU par `libuz_core` dans la version de production si l’objectif reste de disposer d’un moteur distinct et plus performant ; ZIVPN doit rester la référence de fonctionnement et de trafic pendant les essais.

## Références locales

[1]: ./elf-inventory.txt "Inventaire ELF et symboles des bibliothèques armeabi-v7a"
[2]: ./libuz-static-details.txt "Sections, symboles dynamiques et chaînes de libuz_core"
[3]: ./binary-provenance.txt "Hashes, tailles et provenance Git des binaires"
[4]: ./kighmu-buildinfo.txt "Build-info Go du binaire KIGHMU"
[5]: ./go-buildinfo-and-entry.txt "Build-info et indices de point d’entrée libuz_core"
[6]: ./kighmu-launch-history.txt "Ancien lancement Android du moteur KIGHMU"
[7]: ./reference-zivpn-commit.txt "Évolution de l’intégration ZIVPN dans Stivaros"
[8]: ../modules/kighmu-vpn-native/android/src/main/java/expo/modules/kighmuvpnnative/KighmuVpnService.kt "Service Android ZIVPN de test dans KIGHMU VPN"
[9]: ../modules/kighmu-vpn-native/android/src/main/cpp/hev_jni.cpp "Wrapper JNI HEV local"
[10]: /home/ubuntu/Zamois-tun/app/src/main/java/com/kighmu/vpn/engines/ZivpnEngine.kt "Lancement ZIVPN dans Stivaros"
[11]: /home/ubuntu/Zamois-tun/app/src/main/java/com/kighmu/vpn/engines/HevTun2Socks.kt "Relais HEV dans Stivaros"

## 11. Résultats Ghidra approfondis

Ghidra 12.1.2 a été installé localement avec OpenJDK 21. Les deux exécutables ont été importés dans des projets séparés en langage `ARM:LE:32:v7`, en lecture seule pour l’analyse. Les copies analysées ont conservé leurs hashes SHA-256 documentés précédemment ; les fichiers originaux du dépôt n’ont pas été modifiés.

L’analyse automatique complète d’un exécutable Go ARM de cette taille dépasse la fenêtre pratique du sandbox lorsqu’elle active la décompilation des switches. Elle a néanmoins importé et sauvegardé les projets, identifié `main.main`, les imports Android et `dlopen`, puis exécuté les scripts d’extraction. Le résultat est donc exploitable pour les indices structuraux, mais il ne constitue pas une décompilation exhaustive de toutes les fonctions.

| Élément confirmé par Ghidra | `libuz_core.so` | KIGHMU |
|---|---:|---:|
| Langage processeur | `ARM:LE:32:v7` | `ARM:LE:32:v7` |
| Image base | `0x10000` | `0x10000` |
| Entrée `main.main` | `0x60DDE4` | `0xB1EC18` |
| Imports critiques | `__android_log_vprint`, `dlopen` | `__android_log_vprint`, `dlopen` |
| Appels directs visibles depuis `main.main` | `FUN_00608398`, `FUN_000E87B4` | `FUN_002C78DC`, `FUN_00B03A98` |
| JNI explicite détecté | Non observé dans l’entrée Go | Non observé dans l’entrée Go |

La reconstruction de `main.main` produite par Ghidra contient surtout la vérification de pile du runtime Go et un appel vers une fonction interne. Les fonctions anonymes `FUN_...` ne doivent pas être renommées arbitrairement en « handshake » ou « initialisation réseau » sans références croisées supplémentaires. La différence d’adresses et de tailles entre les deux entrées confirme seulement que les exécutables sont issus de builds différents.

La recherche brute dans les blocs mémoire a en revanche retrouvé des chaînes applicatives spécialisées de libuz : `ZIVPN_UDP_BRUTAL_DEBUG`, `udp-zivpn`, `HandshakeTLSConfig`, `Server mode`, `raw-control`, `udpEnabled`, `auth.type`, `userpass`, `quicv2`, `multipath` et `recvwindow`. Plusieurs possèdent des références de données vers les zones de code ou de structures, notamment `ZIVPN_UDP_BRUTAL_DEBUG` à `0x617D76` référencé depuis `0x5133E0`, `udpEnabled` à `0x610F4B` référencé depuis `0x607C88`, `auth.type` à `0x610798` référencé depuis `0x60A338`, et `quicv2` à `0x610DEC`/`0x610DF5`/`0x6115DB` avec plusieurs références dans la zone `0x54...`.

> **Interprétation prudente :** ces chaînes prouvent que le binaire contient des chemins de configuration et des marqueurs de fonctionnalités ZIVPN/QUIC. Elles ne prouvent pas, à elles seules, que chaque option est activée dans le profil utilisé par l’application ni qu’elle explique directement la performance observée.

Ghidra a aussi retrouvé les chaînes Android `/dev/log/main`, `/dev/socket/logdw`, `android_get_device_api_level` et des messages relatifs à `dlopen`. Cela est cohérent avec l’utilisation d’un runtime Go Android et d’une résolution dynamique de composants TLS ou système. Aucune fonction `JNI_OnLoad` n’a été identifiée comme point d’entrée du moteur Go ; l’architecture observée reste celle d’un exécutable Go lancé par arguments, avec JNI réservé au relais HEV séparé.

## 12. Conséquence pour KIGHMU

L’installation et la première analyse Ghidra ne révèlent pas une bibliothèque Android manquante évidente dans KIGHMU. Les deux binaires partagent les imports Android principaux, mais leurs entrées et leurs graphes internes sont distincts. Le fait que ZIVPN fonctionne dans la même APK renforce l’hypothèse précédente : le problème KIGHMU doit être recherché dans son protocole `app/v2`, la construction YAML, la combinaison `server/auth/obfs`, la gestion du descripteur TUN ou l’environnement réseau du processus, et non dans le relais HEV déjà validé.

La prochaine analyse Ghidra utile est ciblée : retrouver les call sites autour des chaînes `HandshakeTLSConfig`, `auth.type`, `quicv2` et `udpEnabled`, puis décompiler seulement les fonctions contenant ces références. Une analyse dynamique Frida/LLDB reste séparée et nécessite un processus Android réel ; elle ne peut pas être remplacée honnêtement par une exécution x86 du fichier ARM.

## 13. Décompilation ciblée et call graphs

La décompilation ciblée a retrouvé la chaîne `auth.type` à `0x610798`, avec une référence de donnée à `0x60A338` depuis la fonction `FUN_00609D34`. Cette fonction appelle notamment `FUN_00603FF0`, `FUN_000EA428`, `FUN_000EA438`, `FUN_000E87B4`, `FUN_0007AD40`, `FUN_00077BD8`, `FUN_001AD580` et `FUN_0006F918`. Le pseudo-code reconstruit montre des branches qui inspectent des chaînes de longueur 3, 4, 5, 7 et 8, avec des valeurs comme `cmd`, `http`, `https` et d’autres chemins de parsing. Il gère aussi des erreurs structurées lorsque des champs attendus sont absents. Cette fonction ressemble donc davantage à un **parseur/routeur de configuration ou d’URL** qu’à la négociation QUIC elle-même. Cette interprétation est très probable, mais les types Go d’origine ne sont pas récupérés.

Les chaînes `HandshakeTLSConfig` et `udpEnabled` ont été retrouvées, mais leurs références n’ont pas été transformées en fonctions nommées par Ghidra dans la passe ciblée. Elles restent des points d’entrée prioritaires pour une analyse interactive plus fine ou une nouvelle passe limitée aux adresses de données concernées.

Le graphe d’appels depth-3 généré automatiquement depuis `main.main` donne les métriques suivantes :

| Métrique | libuz | KIGHMU |
|---|---:|---:|
| Fonctions reconnues | 4 603 | 3 322 |
| Nœuds atteignables à profondeur 3 | 39 | 40 |
| Arêtes atteignables à profondeur 3 | 42 | 43 |
| Arêtes sortantes de `main.main` | 2 | 2 |
| Degré sortant maximal | 26 | 27 |
| Degré entrant maximal | 4 | 4 |

Ces chiffres montrent une forme de démarrage Go comparable dans les trois premiers niveaux, mais ils ne prouvent ni une équivalence du protocole ni une supériorité de performance. Les adresses ne sont pas comparables directement puisque les deux exécutables sont issus de builds différents.

## 14. Préparation de l’instrumentation dynamique

Les outils hôte `adb`, `lldb` et `frida-tools` sont installés localement. Un script Frida en lecture seule est disponible dans `docs/libuz-analysis/frida-observe-network.js`. Il observe le chargement des modules natifs, `dlopen`, `connect`, `sendto`, `recvfrom`, `sendmsg`, `recvmsg` et les options de socket, sans modifier les arguments ni le trafic.

La commande `adb devices -l` ne détecte actuellement aucun appareil Android. L’instrumentation dynamique ne peut donc pas encore être exécutée. Elle nécessitera un appareil autorisé avec débogage USB, ou un émulateur ARM compatible avec l’APK armeabi-v7a et un agent Frida correspondant à l’architecture. Cette absence d’appareil est une limite opérationnelle, non un résultat négatif sur le binaire.

## 15. Analyse locale complète sans appareil

L’analyse locale a été étendue aux wrappers JNI, à HEV, au packaging Android et à une tentative d’émulation ARM. Aucun élément ne montre qu’une dépendance Android essentielle manque à libuz : son ELF partagé dépend de `liblog`, `libdl` et `libc`, exactement comme le binaire KIGHMU PIE. La chaîne ZIVPN est toutefois plus complète au niveau de l’intégration : elle sépare le moteur QUIC/UDP (`libuz_core`) du relais TUN→SOCKS5 (`libhev-socks5-tunnel`), attend une socket SOCKS locale, puis démarre le relais avec un descripteur TUN déjà établi.

| Écart local observé | ZIVPN fonctionnel | Ancien chemin KIGHMU | Importance estimée |
|---|---|---|---|
| Chemin de trafic | Moteur → SOCKS local → HEV → TUN | Moteur directement avec YAML TUN | Élevée |
| Preuve avant état connecté | Socket `127.0.0.1:7778` attendue | État connecté publié immédiatement | Élevée pour le diagnostic |
| Réseau de contrôle | Processus lié au réseau physique et package exclu du VPN | Ancienne version sans cette séquence complète | Élevée pour le timeout |
| Configuration | JSON inline libuz avec champs ZIVPN spécifiques | YAML KIGHMU avec `fileDescriptor` | Élevée, à vérifier avec la version exacte |
| MTU | 1400 | 1500 | Moyenne, dépend du chemin QUIC/UDP |
| Relais natif | HEV avec fonctions SOCKS5/UDP explicites | Non utilisé dans le chemin KIGHMU | Élevée pour le trafic après handshake |
| ABI/loader | ELF ARMv7 partagé chargé par `nativeLibraryDir` | ELF ARMv7 PIE lancé comme binaire | À vérifier sur Android réel, statiquement cohérent |

La conclusion locale la plus solide est que **KIGHMU ne manque pas nécessairement d’une bibliothèque**, mais que son chemin Android combine le handshake, le TUN et le processus natif dans une séquence différente de ZIVPN. Les améliorations prioritaires sont donc : lier le processus au réseau physique avant le handshake, vérifier la configuration réellement acceptée par le binaire, ne publier `connected` qu’après une preuve de handshake, et capturer séparément les erreurs de parsing, de socket et de TUN.

L’émulation QEMU ARM échoue avant le démarrage sur l’absence de `/system/bin/linker`. Il est donc possible de simuler localement la génération de configuration, l’ordre des appels et les erreurs de loader, mais pas d’affirmer localement le comportement cryptographique ou le handshake Android sans sysroot bionic compatible. Cette limite est documentée explicitement plutôt que masquée par une exécution Linux non représentative.

## 16. Recentrage : libuz comme référence fonctionnelle

Le code source Stivaros montre le contrat exact de libuz : l’application lance `libuz_core.so` avec `-s <obfs>` et `--config <JSON inline>`. Le JSON contient `server: host:portRange`, `obfs`, `auth`, un serveur SOCKS local, `insecure`, les fenêtres de réception et les limites de débit. libuz ne reçoit pas le descripteur TUN ; il ouvre un SOCKS local. HEV reçoit ensuite le TUN et relaie vers ce SOCKS. Le processus libuz est lié au réseau physique avant son lancement.

Le chemin KIGHMU historique est différent : le service construit un YAML, lance `client --config <fichier>`, puis transmet un `fileDescriptor` TUN au client via la configuration. Le client KIGHMU doit donc réussir simultanément le parsing YAML, l’initialisation TUN par descripteur et la connexion QUIC/UDP. Cette surface d’échec est beaucoup plus grande que celle de libuz.

### Indice statique prioritaire : provenance du patch TUN

Le dépôt contient `native-patches/tun-file-descriptor.patch`, qui ajoute le champ Go `FileDescriptor int` avec le tag `mapstructure:"fileDescriptor"`. Pourtant, la recherche brute Ghidra dans la copie KIGHMU analysée ne retrouve pas la chaîne `fileDescriptor`, alors qu’elle retrouve `Hysteria-UDP`, `udpEnabled`, `salamander`, `disablePathMTUDiscovery`, `auth`, `password`, `server`, `client`, `tun` et `TUNGETIFF`.

> **Hypothèse prioritaire, confiance moyenne à élevée :** le binaire KIGHMU embarqué dans l’APK peut avoir été compilé sans le patch `fileDescriptor`, ou depuis une révision différente du code source. Dans ce cas, le YAML Android transmet une clé que le binaire ne reconnaît pas. Cela expliquerait pourquoi libuz fonctionne avec le même service VPN alors que KIGHMU échoue, même si le binding réseau physique est correct.

Cette absence de chaîne n’est pas une preuve absolue, car une optimisation ou une représentation différente peut modifier les chaînes conservées. Elle est cependant suffisamment distinctive pour justifier une vérification locale de provenance avant tout changement de protocole : comparer le `Go BuildID`, les tags de build, le hash du binaire et la présence du patch dans la révision ayant produit l’APK.

### Autres écarts prioritaires

Le binaire libuz de référence contient `quicv2`, `raw-control`, `recvwindow`, `multipath` et `ZIVPN_UDP_BRUTAL_DEBUG`, tandis que KIGHMU contient `Hysteria-UDP`, `HYSTERIA-PR`, `udpEnabled` et des marqueurs Hysteria/Salamander plus génériques. Il ne faut pas copier ces chaînes, mais vérifier dans le code source KIGHMU si le client utilise réellement le même mode de port hopping et les mêmes paramètres de transport que le serveur.

Le client KIGHMU généré précédemment ne déclare pas explicitement `transport.udp`/`hopInterval`, alors que la configuration serveur utilise un port hopping nftables. Cette omission est une candidate secondaire. L’absence de paquets entrant au VPS indique toutefois qu’il faut d’abord vérifier le parsing/initialisation locale et la provenance du binaire avant d’accuser le firewall ou le serveur.

### Conclusion opérationnelle

La comparaison doit maintenant suivre cet ordre : **(1)** vérifier que le binaire KIGHMU contient réellement le support `fileDescriptor` attendu par le patch ; **(2)** valider que le YAML produit utilise les clés reconnues par cette révision ; **(3)** vérifier explicitement le mode de port hopping dans le code source ; **(4)** seulement ensuite modifier la configuration Android. libuz sert de référence d’architecture d’intégration, pas de code à décompiler ou copier aveuglément.

## 17. Vérification de provenance et du port range

Les deux copies locales du binaire KIGHMU — `assets/bin/kighmu-native-armeabi-v7a` et la copie d’analyse Ghidra — sont strictement identiques : SHA-256 `c0290fb4bf18eca19f3aee157a5125d6231b5f9d9cb6a74bfc8ace19aa0ae000`, Go BuildID `8ly-gpm9r8dBoW6veI6j/W0Pr1CW2T8sXu7jTmjpW/FNZNPCb8rWiDbaiUjsPz/9AM7OvjyLJlANAtcyymE` et Build ID ELF `e8e8c122c0c3f4e7a11bcc5732895a66e8a0bfcf`. Il n’existe pas de seconde copie locale divergente permettant d’attribuer l’échec à une différence entre APK et analyse.

Le validateur local confirme que les générateurs connus préservent `20000-50000`, `6000-19999` et `25000` dans les chaînes `host:port` de libuz JSON et KIGHMU YAML. Cette validation est structurelle uniquement : le parser Go exact de KIGHMU n’est pas présent dans le dépôt local, donc elle ne prouve pas que la révision du binaire accepte effectivement un range. La prochaine vérification de source doit porter sur la fonction qui transforme `server` en adresse UDP et sur l’activation du port hopping côté client.

Aucune reconstruction KIGHMU n’est lancée à ce stade. Le dépôt local contient le patch TUN, mais pas le code Go complet nécessaire pour produire un nouveau binaire vérifiable. Recompiler sans la source exacte risquerait de créer un binaire incompatible et ne fournirait aucune preuve utile.

## 18. Première adaptation KIGHMU basée sur la cartographie libuz

Le mode de test ZIVPN a été remplacé dans le service Android par le service KIGHMU historique, et `libkighmu.so` armeabi-v7a a été réintroduit dans `jniLibs/armeabi-v7a`. Les bibliothèques `libuz_core.so`, HEV et tun2socks restent présentes mais ne sont pas utilisées par le chemin KIGHMU.

Les changements appliqués sont limités à l’intégration Android : validation stricte d’un port unitaire ou d’une plage, conservation textuelle de `host:port-range`, Obfs et authentification nettoyés sans exposition dans les logs, MTU 1400 côté VPN et YAML TUN, `disablePathMTUDiscovery: true`, `hopInterval: 30s`, binding au réseau physique avant le lancement, exclusion de l’application du TUN, `LD_LIBRARY_PATH` vers `nativeLibraryDir`, et fermeture idempotente du processus/fd TUN.

Le service ne publie plus l’état connecté immédiatement après `ProcessBuilder.start()`. Il attend jusqu’à 15 secondes une indication de handshake dans les logs natifs (`handshake complete/established/succeeded`, `tunnel is ready` ou `connected to`). En cas d’absence, il remonte une erreur et nettoie le processus, le TUN et le binding réseau. Cette logique réduit les faux positifs UI, mais reste une preuve indirecte tant que le binaire ne fournit pas un événement de trafic vérifiable.

Les validations locales TypeScript, Vitest et `git diff --check` réussissent. L’APK n’a pas été compilé localement, conformément à la contrainte GitHub Actions. Le binaire réintroduit est identique à la copie historique et à l’asset existant ; son SHA-256 est `c0290fb4bf18eca19f3aee157a5125d6231b5f9d9cb6a74bfc8ace19aa0ae000`. La chaîne `fileDescriptor` n’est pas visible dans ce binaire, donc le prochain build GitHub doit être considéré comme un test d’intégration et non comme une preuve de compatibilité YAML.

## 19. Validation GitHub Actions de la première APK KIGHMU modifiée

Le workflow `31820187145` a d’abord échoué à `:kighmu-vpn-native:compileReleaseKotlin` avec `Unresolved reference: fail` à la ligne 66. Le helper manquant a été ajouté dans `KighmuVpnService.kt`, puis les contrôles TypeScript et Vitest ont réussi localement.

Le workflow corrigé `31820805134` a réussi : validation TypeScript/tests, compilation release Gradle et dépôt de l’artefact APK unique. L’APK contient `assets/index.android.bundle`, uniquement `lib/armeabi-v7a/` pour les bibliothèques natives, et `lib/armeabi-v7a/libkighmu.so`. Le Go BuildID et l’ELF BuildID du binaire KIGHMU embarqué correspondent à la copie source ; la différence de SHA-256 provient du traitement de packaging Gradle. L’APK contient aussi les bibliothèques ZIVPN/HEV comme ressources natives héritées, mais le service courant KIGHMU ne les lance pas.

Le build Android a été réalisé exclusivement par GitHub Actions. L’installation sur appareil, le handshake KIGHMU et le trafic réel restent non validés.

## 20. Vérification VPS de l’Obfs KIGHMU

Une inspection SSH strictement en lecture seule a confirmé que `kighmu.service` est actif avec `/usr/local/bin/kighmu server --config /etc/kighmu/config.yaml`. Le serveur écoute sur UDP/25000 ; UDP-ZIVPN écoute séparément sur UDP/5667. La configuration contient bien les sections `obfs.salamander` et `auth.userpass`.

La comparaison masquée montre que la valeur client `kighmu` ne correspond pas au secret Salamander actif : longueur côté serveur 32 caractères, empreinte différente de celle de `kighmu`. Le timeout Android est donc très probablement expliqué par un Obfs client incorrect, avant même de conclure à un défaut du moteur KIGHMU. Aucun secret n’a été écrit dans le rapport, le TODO ou les journaux ; aucun service distant n’a été modifié.

## 21. Audit nftables/iptables VPS

L’audit SSH en lecture seule montre que la migration nftables KIGHMU est déjà en place. La table `inet kighmu_porthop` contient une chaîne NAT `prerouting` qui redirige UDP/20000-24999 et UDP/25001-50000 vers UDP/25000 ; UDP/25000 est donc laissé au service directement. `kighmu.service` et `zivpn.service` sont actifs, avec KIGHMU sur UDP/25000 et UDP-ZIVPN sur UDP/5667.

La table iptables legacy ne porte pas la redirection KIGHMU ; elle contient toutefois des chaînes Docker et d’autres règles système. Sa suppression globale serait dangereuse et n’est pas nécessaire pour KIGHMU. Le timeout Android n’est donc pas expliqué par l’absence d’une table nftables KIGHMU. Le point Obfs Salamander incorrect reste la cause prioritaire à corriger côté client.

## 22. Obfs Salamander fixé à `kighmu`

Après confirmation explicite, `/etc/kighmu/config.yaml` a été sauvegardé sur le VPS, puis uniquement `obfs.salamander.password` a été remplacé par `kighmu`. Seul `kighmu.service` a été redémarré. Le service est actif sur UDP/25000, la table nftables de port hopping est inchangée et le processus UDP-ZIVPN/5667 est resté inchangé.

Côté Android, la valeur `kighmu` est maintenant définie dans le service natif Kotlin et le moteur ignore les anciennes valeurs utilisateur. Le profil local utilise également cette constante, la validation ne demande plus l’Obfs comme saisie, et l’écran Configuration l’affiche comme valeur fixe. TypeScript, Vitest et `git diff --check` réussissent localement. Le build Android doit rester exclusivement GitHub Actions.

## 23. Build Android avec Obfs fixe

Le commit `e2b6aca` fixe l’Obfs Salamander `kighmu` dans le service Kotlin, le profil local et l’interface de configuration. TypeScript, Vitest et le contrôle de diff ont réussi localement. Le workflow GitHub Actions `31825477151` a réussi exclusivement avec `assembleRelease` et a publié un artefact unique non expiré : `kighmu-vpn-android-release-e2b6aca71c5e31d74c47aa732564f70e81fe6e2e`, de 29 994 757 octets. L’installation Android et le handshake après la reconfiguration serveur restent à tester.

## 24. Diagnostic du timeout et correction du port hopping

La capture VPS réalisée pendant le test Android montre zéro paquet destiné à UDP/25000 ou à la plage 20000-50000 provenant du téléphone. Le serveur KIGHMU est actif, son port hopping nftables est chargé, et aucun journal de connexion n’est généré. Le YAML Android utilisait la plage directement dans `server: host:20000-50000`, alors que le contrat attendu sépare le socket serveur et la plage de hopping.

Le correctif Android utilise maintenant `server: host:25000` lorsque l’utilisateur saisit une plage et place cette plage sous `transport.udp.hopPorts`, tout en conservant `hopInterval: 30s`. Un log masqué indique la destination et l’état du hopping sans secret. `git diff --check`, TypeScript et Vitest réussissent. Le test Android et le build GitHub Actions restent à effectuer.
