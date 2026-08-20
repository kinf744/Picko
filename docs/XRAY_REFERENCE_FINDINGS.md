# Constats de référence Xray

Source principale : https://github.com/kinf744/Zamois-tun

Le dépôt de référence contient un moteur Xray dans `app/src/main/java/com/kighmu/vpn/engines/XrayVpnEngine.kt`. Il lance un binaire avec `run -c <config>`, attend un SOCKS local jusqu’à 5 secondes, normalise les inbounds SOCKS vers `127.0.0.1`, nettoie les règles `geoip:`/`geosite:` et prend en charge les protocoles VMess, VLESS et Trojan ainsi que les transports WS, gRPC, XHTTP, H2/HTTP, HTTPUpgrade, KCP et TCP, avec TLS ou Reality.

Le modèle de profil de référence est `app/src/main/java/com/kighmu/vpn/profiles/XrayVpnProfile.kt`. Il distingue un mode `link` et un mode `json`. Les liens pratiques sont `vmess://`, `vless://` et `trojan://`. Les champs de référence incluent le serveur, port, UUID/mot de passe, transport, chemin/host WS, TLS/SNI, fingerprint, Reality publicKey/shortId, service gRPC et flow VLESS.

Le workflow de référence `.github/workflows/build_xray.yml` utilise Xray-core, Go 1.22, Android NDK r26, `GOOS=android GOARCH=arm GOARM=7`, `CGO_ENABLED=1`, `-trimpath`, `-ldflags=-s -w`, puis une compression UPX facultative. Le dépôt suit `app/src/main/jniLibs/armeabi-v7a/libxray.so` et `arm64-v8a/libxray.so`. Le binaire armeabi-v7a de référence utilisé pour Picko est un ELF ARM 32-bit PIE statiquement lié, SHA-256 `fda84be50822809f34943c8e7387b53a64df81a51fdbd03105eddf16a50c2a06`, taille 7 067 748 octets.

État Picko : les champs Xray en mode lien/JSON, la validation, le stockage sécurisé, le formulaire, le parseur Android, `XrayTunnel.kt`, le raccordement à `KighmuVpnService` et le binaire de référence ont été ajoutés. Les tests TypeScript ont réussi avec 11 tests passants et 1 test ignoré ; le contrôle TypeScript a réussi ; l’assemblage `:app:assembleRelease` a réussi. Le build reste `armeabi-v7a` uniquement, comme la base Picko.


## Vérification du 20 août 2026

La branche `main` de Zamois-tun pointe sur le commit `d64405f5f72595733961f330bd71060df46832fd`, intitulé `feat(zivpn): retire Xray du tunnel UDP — HEV -> LB_PORT -> uz_core direct`. Le dépôt contient toujours le moteur Xray et son binaire, mais le commit récent confirme qu’il sépare explicitement Xray du chemin ZiVPN/UDP. La comparaison de ce choix avec le relais générique de Picko est nécessaire lorsque le SOCKS Xray est prêt sans que le trafic circule.


## Correctif de passage de trafic

La comparaison avec `XrayVpnProfileEditDialog.kt` de Zamois-tun a révélé que le parseur Picko avait des divergences déterminantes après l’ouverture du SOCKS local : le SNI et le Host ne basculaient pas vers le serveur lorsque les paramètres étaient absents, `serviceName` n’était pas utilisé comme chemin gRPC, SplitHTTP était écrit en XHTTP, les réglages XHTTP/SplitHTTP/KCP étaient incomplets, le mode Reality pouvait être dégradé en TLS et les informations utilisateur étaient décodées une seconde fois.

`XrayTunnel.kt` aligne désormais ces éléments sur le générateur de Zamois-tun : chemins `path`/`serviceName`, repli SNI/Host, Reality explicite, TLS/Reality avec fingerprint, XHTTP et SplitHTTP distincts, KCP complet, Mux désactivé, et conservation des UUID/mots de passe URI. Cette correction cible le cas où Xray ouvre son SOCKS mais échoue à établir un flux effectif avec le serveur distant.
