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
