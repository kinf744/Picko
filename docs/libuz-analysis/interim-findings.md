# Constats intermédiaires — analyse locale de libuz_core

## Périmètre

L’analyse est effectuée en lecture seule dans le projet Android local. Aucun accès ni changement n’est effectué sur le VPS, le service UDP-ZIVPN/5667 ou le binaire de référence.

## Artefacts présents

Le projet contient `libuz_core.so`, `libhev-socks5-tunnel.so` et `libtun2socks.so`, tous sous `jniLibs/armeabi-v7a/`. Le binaire `libuz_core.so` est un ELF32 ARM EABI5 soft-float, construit avec Go et fortement stripped. Il dépend de `liblog.so`, `libdl.so` et `libc.so`, et expose peu ou pas de symboles dynamiques utiles.

Les fichiers `libhev-socks5-tunnel.so` et `libtun2socks.so` ont actuellement le même SHA-256 et le même BuildID, ce qui indique qu’ils sont des copies identiques dans l’APK local, et non deux moteurs distincts.

## Indices de fonctionnement de libuz_core

Les chaînes embarquées révèlent une pile Go comprenant notamment QUIC/HTTP3, TLS 1.3, `quic-go`, des références `quicv2`, `h3`, `0-RTT`, `multipath`, `sendmmsg` et `recvmmsg`. Elles contiennent aussi des marqueurs applicatifs `zivpn`, `zivpn_udp`, `udp-zivpn`, `HandshakeTLSConfig`, `Server mode`, `auth.Mode`, `auth.type`, `password`, `userpass`, `obfs`, `port hopping`, `udpEnabled`, `multipath` et `raw-control`.

Ces indices sont compatibles avec un client natif ZIVPN autonome intégrant sa propre pile QUIC/Hysteria-like et ne se limitant pas au relais TUN→SOCKS5. À ce stade, les chaînes ne suffisent pas à prouver la version exacte du protocole ni tous les paramètres de négociation.

## Hypothèse technique prioritaire

L’intégration actuelle sépare deux responsabilités : `libuz_core.so` établit le tunnel UDP ZIVPN et expose un SOCKS5 local, tandis que `libhev-socks5-tunnel.so`/`hev_jni.cpp` transfère le trafic TUN vers ce SOCKS5. L’analyse doit donc comparer prioritairement le lancement/configuration de `libuz_core.so` avec le wrapper KIGHMU, puis seulement le relais HEV qui semble déjà fonctionnel puisque le trafic ZIVPN passe sur l’appareil réel.

## Résultats Ghidra — première passe

Ghidra 12.1.2 a été installé depuis la release officielle NSA, avec OpenJDK 21. L’import headless de `libuz_core.so` a réussi en langage `ARM:LE:32:v7`, image base `0x10000`. L’analyse automatique a atteint la limite contrôlée de 120 secondes pendant la phase de décompilation, mais le projet a été sauvegardé et le script d’export a pu s’exécuter.

Ghidra a confirmé `main.main` à l’adresse `0x60dde4` comme point d’entrée Go reconnu. Les imports externes critiques incluent `__android_log_vprint` et `dlopen`. Les références textuelles repérées près des zones initialisées comprennent `/dev/log/main`, `/dev/socket/logdw`, `cannot create a socket`, `cannot connect to /dev/socket`, `init_tls: failed to dlopen main...` et `android_get_device_api_level`. Cela confirme une initialisation Android/Go spécifique et une résolution dynamique au moins partielle, mais ne prouve pas encore la logique exacte du handshake.

La limite de 120 secondes concerne l’analyse Ghidra, pas l’import du fichier. La prochaine passe doit utiliser le projet déjà créé, désactiver les analyseurs coûteux non nécessaires et examiner les fonctions autour de `main.main`, les références croisées vers les chaînes réseau et les appels `dlopen`/sockets.

## Références croisées Ghidra — libuz_core

La recherche brute dans les blocs mémoire a retrouvé des chaînes applicatives spécialisées, même lorsque l’analyse Go ne les typait pas automatiquement. Résultats confirmés : `ZIVPN_UDP_BRUTAL_DEBUG` à `0x617d76` avec une référence de donnée à `0x5133e0`; `udp-zivpn` à `0x610735`, `0x62d41a` et `0x62d439`; `HandshakeTLSConfig` à `0x6108d3`; `Server mode` à `0x6116d5`; `raw-control` à `0x61172d`; `udpEnabled` à `0x610f4b` avec référence à `0x607c88`; `auth.type` à `0x610798` avec référence à `0x60a338`; `userpass` à `0x60ffc5` avec plusieurs références locales; `quicv2` à `0x610dec`, `0x610df5` et `0x6115db` avec plusieurs références dans la zone de code; `multipath` à `0x611dd9`; et `recvwindow` à `0x735c35`/`0x735c6c`.

Les chaînes `down_mbps` et `up_mbps` n’ont pas été retrouvées sous cette forme exacte. Cela ne prouve pas l’absence de contrôle de débit : le binaire peut utiliser une autre nomenclature, des clés encodées, ou des structures sans chaîne correspondante. Les nombreuses occurrences de `timeout`, `socks5` et `obfs` confirment des sous-systèmes distincts, mais elles ne suffisent pas à déterminer leur logique sans décompilation ciblée.

La recherche de chaînes révèle aussi un bloc de messages Android autour de `dlopen`, `/dev/log/main`, `/dev/socket/logdw` et `android_get_device_api_level`, cohérent avec le runtime Go Android observé précédemment.

## Décompilation Ghidra de `main.main`

La reconstruction Ghidra de `main.main` est minimale, ce qui est attendu pour un exécutable Go ARM stripped : les noms internes ne sont pas récupérés. Pour libuz, l’entrée est `0x60dde4`; les appels identifiés directement sont `FUN_00608398` et `FUN_000e87b4`. Pour KIGHMU, l’entrée est `0xB1EC18`; les appels directs sont `FUN_002C78DC` et `FUN_00B03A98`. Dans les deux cas, Ghidra reconstruit la boucle de vérification de pile Go et une branche vers une fonction interne, sans fournir à ce stade une preuve de différence protocolaire.

Il ne faut pas interpréter les fonctions anonymes comme équivalentes sur la seule proximité du rôle apparent. La comparaison fiable doit utiliser les références croisées vers les chaînes et les appels externes, ainsi que les structures de configuration observées dans le code source d’intégration.

## Analyse entièrement locale sans appareil Android

Les copies immuables analysées ont les hashes suivants : `libuz_core.so` = `380a6b0c35189fe43b8282b91d7ec3a313d7d0f55777b6fb9fef5f4620990ba9`; KIGHMU = `c0290fb4bf18eca19f3aee157a5125d6231b5f9d9cb6a74bfc8ace19aa0ae000`. Les deux sont ARMv7 little-endian et dépendent de `liblog.so`, `libdl.so` et `libc.so`. libuz est un ELF DYN partagé ; KIGHMU est un ELF DYN PIE exécutable. Les imports Android directs sont principalement `__android_log_vprint` et `dlopen`.

Le wrapper `hev_jni.cpp` expose uniquement `TProxyStartService`, `TProxyStopService` et `TProxyGetStats`. Il lit un fichier HEV, transmet le descripteur TUN au thread natif `hev_socks5_tunnel_main_from_str`, puis appelle `hev_socks5_tunnel_quit` et `pthread_join` à l’arrêt. `libhev-socks5-tunnel.so` et `libtun2socks.so` présents dans le projet ont le même SHA-256, ce qui indique deux copies du même moteur HEV et non deux implémentations différentes. Le moteur HEV exporte explicitement `hev_socks5_client_handshake`, `hev_socks5_client_connect`, `hev_socks5_tunnel_main_from_str`, `hev_config_init_from_file`, `sendmmsg`, `recvmmsg`, `sendmsg` et `recvmsg`.

Le mode ZIVPN actuel établit le TUN en MTU 1400 avec `10.0.0.2/24`, exclut le package de son propre VPN, lie le processus au réseau physique, lance libuz depuis `nativeLibraryDir` avec `LD_LIBRARY_PATH`, `HOME` et `TMPDIR`, attend le SOCKS local `127.0.0.1:7778`, puis démarre HEV sur le descripteur TUN. L’ancien chemin KIGHMU établissait le TUN en MTU 1500 avec `100.100.100.101/30`, lançait `client --config <fichier YAML>` immédiatement, et déclarait connecté avant une preuve de handshake ou de trafic. Cette différence de séquence est un écart d’intégration important.

Ghidra retrouve dans KIGHMU `Hysteria-UDP`, `HYSTERIA-PR`, `udpEnabled`, `salamander`, `obfs`, `disablePathMTUDiscovery`, `auth`, `password`, `server`, `client`, `tun`, `quic`, `TUNGETIFF` et `Hysteria`. En revanche, les marqueurs `HandshakeTLSConfig`, `fileDescriptor`, `recvwindow`, `down_mbps` et `up_mbps` ne sont pas présents sous ces formes exactes. Pour libuz, `HandshakeTLSConfig`, `udpEnabled`, `quicv2`, `raw-control`, `recvwindow`, `multipath` et `ZIVPN_UDP_BRUTAL_DEBUG` sont présents. Cela suggère des bases de configuration et des fonctionnalités compilées différentes ; ce n’est pas une preuve suffisante d’un protocole différent sans traçage des fonctions concernées.

QEMU ARM est installé localement, mais l’exécution directe échoue sur `Could not open '/system/bin/linker'` car le sandbox ne contient pas le runtime bionic Android. Cette simulation confirme la limite de l’environnement : l’ELF est lisible statiquement, mais son exécution ne peut pas être remplacée honnêtement par une exécution Linux x86 ou un simple QEMU sans sysroot Android correspondant.
