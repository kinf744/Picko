# Constats de référence Xray

Source principale : https://github.com/kinf744/Zamois-tun

Le dépôt de référence contient un moteur Xray dans `app/src/main/java/com/kighmu/vpn/engines/XrayVpnEngine.kt`. Il lance un binaire avec `run -c <config>`, attend un SOCKS local jusqu’à 5 secondes, normalise les inbounds SOCKS vers `127.0.0.1`, nettoie les règles `geoip:`/`geosite:` et prend en charge les protocoles VMess, VLESS et Trojan ainsi que les transports WS, gRPC, XHTTP, H2/HTTP, HTTPUpgrade, KCP et TCP, avec TLS ou Reality.

Le modèle de profil de référence est `app/src/main/java/com/kighmu/vpn/profiles/XrayVpnProfile.kt`. Il distingue un mode `link` et un mode `json`. Les liens pratiques sont `vmess://`, `vless://` et `trojan://`. Les champs de référence incluent le serveur, port, UUID/mot de passe, transport, chemin/host WS, TLS/SNI, fingerprint, Reality publicKey/shortId, service gRPC et flow VLESS.

Le workflow de référence `.github/workflows/build_xray.yml` utilise Xray-core, Go 1.22, Android NDK r26, `GOOS=android GOARCH=arm GOARM=7`, `CGO_ENABLED=1`, `-trimpath`, `-ldflags=-s -w`, puis une compression UPX facultative. Le dépôt suit `app/src/main/jniLibs/armeabi-v7a/libxray.so` et `arm64-v8a/libxray.so`. Le binaire armeabi-v7a de référence utilisé pour Picko est un ELF ARM 32-bit PIE statiquement lié, SHA-256 `fda84be50822809f34943c8e7387b53a64df81a51fdbd03105eddf16a50c2a06`, taille 7 067 748 octets.

État Picko : les champs Xray en mode lien/JSON, la validation, le stockage sécurisé, le formulaire, le parseur Android, `XrayTunnel.kt`, le raccordement à `KighmuVpnService` et le binaire de référence ont été ajoutés. Les tests TypeScript ont réussi avec 11 tests passants et 1 test ignoré ; le contrôle TypeScript a réussi ; l’assemblage `:app:assembleRelease` a réussi. Le build reste `armeabi-v7a` uniquement, comme la base Picko.
