# KIGHMU VPN Android

Application Android KIGHMU VPN construite avec Expo SDK 54, React Native, TypeScript et un module natif Kotlin. L’application fournit un écran Tunnel, une configuration Host/IP, port ou plage de ports, Obfs et mot de passe, ainsi qu’un écran Diagnostic alimenté par les événements du service VPN natif.

## Architecture

L’interface est écrite en **TypeScript/React Native** avec Expo Router et NativeWind. Le pont natif et le service Android `VpnService` sont écrits en **Kotlin**. Le moteur réseau KIGHMU embarqué est un binaire **Go** compilé pour `armeabi-v7a` ; le projet Android conserve également la configuration permettant d’ajouter `arm64-v8a` lorsque le binaire correspondant est disponible.

Les secrets de connexion sont conservés localement via SecureStore. Ils ne doivent jamais être écrits dans les journaux, dans Git, dans une URL distante ou dans un artefact CI.

## Compilation Android : GitHub uniquement

La compilation Android officielle est effectuée exclusivement par GitHub Actions. Le workflow se trouve dans `.github/workflows/build-android.yml` et se déclenche à chaque push ou pull request vers `main`, ainsi que manuellement depuis l’onglet **Actions**.

Après un push, ouvrir le dépôt GitHub, sélectionner **Actions**, puis le workflow **Build Android**. Le workflow installe Node.js, pnpm et Java 17, installe les dépendances avec le lockfile, exécute le contrôle TypeScript et les tests Vitest, puis lance `android/gradlew assembleDebug`. L’APK est publié dans la section **Artifacts** du run sous le nom `kighmu-vpn-android-debug-<commit>`.

Aucune compilation APK sur le sandbox local ou sur le VPS n’est considérée comme une livraison. Ces environnements peuvent servir à diagnostiquer le code, mais l’APK officiel doit provenir d’un run GitHub Actions réussi.

## Validation avant utilisation

Un run CI réussi confirme la compilation et les tests automatisés. Il ne remplace pas encore un test sur téléphone Android réel : il faut installer l’APK téléchargé depuis GitHub Actions, accorder l’autorisation VPN système, tester une connexion avec une configuration de développement, vérifier les états Tunnel/Diagnostic et confirmer l’arrêt propre du service.

L’application ne doit pas être considérée comme prête tant qu’un APK GitHub Actions n’a pas été généré et vérifié sur un appareil Android compatible.
