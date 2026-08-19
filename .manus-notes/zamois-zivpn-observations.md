# Observations externes — Zamois-tun UDP-ZIVPN

Source analysée : https://github.com/kinf744/Zamois-tun, branche `main`, commit `d64405f5f72595733961f330bd71060df46832fd` (consulté le 19 août 2026).

- Le dernier commit annoncé décrit un chemin direct « HEV → LB_PORT → uz_core » pour le tunnel UDP-ZIVPN.
- `ZivpnEngine` fixe un port de relais local `LB_PORT` à `7777 + index × 100` et le SOCKS local `BASE_UZ_PORT` à `7778 + index × 100`.
- La configuration transmise à `libuz_core.so` contient un SOCKS sur `127.0.0.1`, `recvwindowconn=65536`, `recvwindow=262144`, `disable_mtu_discovery=true`, `down_mbps=50`, `up_mbps=10`.
- Le TUN est établi avec MTU 1400 pour ZIVPN et le serveur ZIVPN est exclu du routage pour limiter les boucles UDP.
- Le relais HEV est démarré vers le port final : `LB_PORT` pour un moteur, ou le port du balancier en cas de plusieurs moteurs.
- Le balancier Kotlin local active `tcpNoDelay` pour ses sockets et utilise des buffers de relais de 8192 octets.

La comparaison SHA-256 des bibliothèques `armeabi-v7a` confirme que les composants critiques sont identiques entre les deux projets : `libuz_core.so` (`380a6b0c35189fe43b8282b91d7ec3a313d7d0f55777b6fb9fef5f4620990ba9`) et `libtun2socks.so`/`libhev-socks5-tunnel.so` (`8a9269912562a2601b9886473d9b3f8d6d99cb084046adbab22b15708cb9932d`). Une différence de version de ces binaires ne peut donc pas expliquer l’écart observé.

Le chemin à profil unique de KIGHMU ne passe pas par `SocksProfileBalancer` : l’interface appelle le catalogue `version: 3`, mais le balancier n’est activé que lorsque plusieurs profils sont sélectionnés. Les optimisations de balancier ne pourront donc aider que les connexions multi-profils.

Ces observations ne prouvent pas encore une cause de débit : l’analyse doit comparer les configurations, les binaires et les mesures réelles sur le même appareil/réseau.
