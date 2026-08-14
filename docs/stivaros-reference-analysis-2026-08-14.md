# Référence externe : dépôt Stivaros `kinf744/Zamois-tun`

Sources consultées le 14 août 2026 :

- https://github.com/kinf744/Zamois-tun
- https://raw.githubusercontent.com/kinf744/Zamois-tun/main/app/src/main/AndroidManifest.xml
- https://raw.githubusercontent.com/kinf744/Zamois-tun/main/app/build.gradle
- https://raw.githubusercontent.com/kinf744/Zamois-tun/main/app/src/main/java/com/kighmu/vpn/vpn/KighmuVpnService.kt
- https://raw.githubusercontent.com/kinf744/Zamois-tun/main/app/src/main/java/com/kighmu/vpn/engines/ZivpnEngine.kt
- https://raw.githubusercontent.com/kinf744/Zamois-tun/main/app/src/main/java/com/kighmu/vpn/engines/MultiZivpnEngine.kt
- https://raw.githubusercontent.com/kinf744/Zamois-tun/main/app/src/main/java/com/kighmu/vpn/engines/XrayVpnEngine.kt
- https://raw.githubusercontent.com/kinf744/Zamois-tun/main/app/src/main/java/com/kighmu/vpn/engines/HevTun2Socks.kt

## Constats vérifiés

Le dépôt Stivaros est une application Android Kotlin native. Son `app/build.gradle` cible `arm64-v8a` et `armeabi-v7a`, active `packagingOptions { jniLibs { useLegacyPackaging true } }`, et embarque des bibliothèques dans `app/src/main/jniLibs/<abi>/`, notamment `libuz_core.so`, `libxray.so`, `libtun2socks.so` et `libhev-socks5-tunnel.so`.

Le manifeste Stivaros utilise `android:extractNativeLibs="true"`. Le service VPN est déclaré avec `android.permission.BIND_VPN_SERVICE`, `foregroundServiceType="connectedDevice"`, `exported="false"` et `stopWithTask="false"`.

`ZivpnEngine` récupère le chemin `context.applicationInfo.nativeLibraryDir`, construit `File(nativeDir, "libuz_core.so")`, puis lance ce fichier avec `ProcessBuilder(uzBin.absolutePath, ...)`. Il définit aussi `LD_LIBRARY_PATH` vers `nativeDir`, `HOME` et `TMPDIR`, lie le processus au réseau physique via `ConnectivityManager.bindProcessToNetwork`, redirige les flux de sortie et attend jusqu’à deux secondes qu’un port SOCKS local soit disponible.

`XrayVpnEngine` suit la même stratégie prioritaire : `nativeLibraryDir/libxray.so`, avec une extraction depuis les assets seulement en fallback. Il appelle `libxray.so` via `Runtime.getRuntime().exec`, puis attend activement que le port SOCKS soit réellement ouvert avant de considérer le moteur prêt.

`HevTun2Socks` ne lance pas un exécutable depuis `filesDir`. Il charge la bibliothèque JNI (`System.loadLibrary("hev_jni")` ou le chargeur Java dédié), écrit uniquement un fichier de configuration dans `cacheDir`, puis appelle le service JNI avec le descripteur TUN et le port SOCKS.

Le `KighmuVpnService` Stivaros initialise le service en foreground, utilise des coroutines IO, conserve le descripteur TUN, démarre le moteur, surveille les processus et les ports locaux, et collecte des informations de crash comprenant `nativeLibraryDir`, les ABI et les fichiers natifs présents.

## Implication pour KIGHMU VPN

Le correctif actuellement en préparation pour KIGHMU — binaire ELF placé sous `jniLibs/armeabi-v7a/libkighmu.so`, `nativeLibraryDir`, `useLegacyPackaging=true` et lancement via `ProcessBuilder` — correspond à la stratégie réellement utilisée par Stivaros. Le point critique supplémentaire à comparer est `android:extractNativeLibs="true"`, absent ou non confirmé dans la configuration KIGHMU actuelle. Il faudra également ajouter `LD_LIBRARY_PATH=nativeLibraryDir`, une attente de disponibilité du moteur et un diagnostic de la présence, taille, ABI et permission du fichier natif avant d’évaluer le handshake réseau.

Cette analyse est une référence technique ; elle ne justifie aucune modification de UDP-ZIVPN sur le VPS et ne prouve pas encore que le tunnel KIGHMU Android fonctionne.
