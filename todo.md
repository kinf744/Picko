# Project TODO

## Fonctionnalités livrées

- [x] Définir l’architecture mobile portrait et les flux principaux
- [x] Construire l’écran d’accueil avec état du tunnel
- [x] Construire la configuration Host/IP, port ou plage, Obfs et mot de passe
- [x] Ajouter la validation locale et la persistance sécurisée de la configuration
- [x] Ajouter l’écran de diagnostic détaillé, filtrable et partageable sans secrets
- [x] Ajouter le modèle d’état connexion/déconnexion
- [x] Ajouter le module natif Android et le service VpnService
- [x] Intégrer le binaire KIGHMU armeabi-v7a et la remontée des erreurs natives
- [x] Vérifier le preview Expo et les tests unitaires déterministes
- [x] Retirer le titre « Votre tunnel » de l’écran d’accueil
- [x] Créer et vérifier les maquettes visuelles des écrans principaux

## Serveur KIGHMU et administration

- [x] Déployer KIGHMU Hysteria 2 séparément de UDP-ZIVPN
- [x] Configurer UDP/25000 et la redirection UDP 20000-50000
- [x] Maintenir UDP-ZIVPN sur UDP/5667 sans modification
- [x] Activer Salamander et userpass
- [x] Déployer le panneau HTTPS 9443
- [x] Installer et valider la commande terminale kighmu2
- [x] Valider les cinq options du panneau et la saisie visible unique du mot de passe
- [x] Comparer passivement les métadonnées de handshake KIGHMU et UDP-ZIVPN
- [ ] Tester le handshake et le trafic KIGHMU depuis un appareil Android
- [ ] Vérifier l’accès via la plage 20000-50000 depuis l’application Android

## Compilation et publication

- [x] Publier le code source sur GitHub Picko
- [x] Maintenir la compilation Android exclusivement via GitHub Actions
- [x] Cibler uniquement l’ABI armeabi-v7a
- [x] Vérifier un APK armeabi-v7a et la présence du binaire KIGHMU
- [x] Retirer l’archive de diagnostics redondante du workflow
- [x] Vérifier que le run #12 publie un seul artefact APK installable
- [x] Documenter la procédure de téléchargement depuis GitHub Actions

## Blocage Android signalé le 13 août 2026

- [x] Diagnostiquer le blocage sur l’écran de démarrage après installation
- [x] Vérifier les ressources splash/icon réellement embarquées dans l’APK
- [x] Vérifier qu’aucun placeholder Expo n’est utilisé au démarrage
- [x] Vérifier l’initialisation Expo Router et du bundle JavaScript
- [ ] Vérifier que le module natif VPN ne bloque pas le rendu initial
- [ ] Vérifier les erreurs Kotlin, AndroidManifest, Gradle et ressources générées
- [x] Appliquer un correctif avec un fallback de démarrage non bloquant
- [x] Publier un nouvel APK via GitHub Actions
- [x] Vérifier l’ABI armeabi-v7a et l’artefact du nouvel APK
- [ ] Installer le nouvel APK après désinstallation propre de l’ancien
- [ ] Confirmer l’ouverture complète de l’accueil et des écrans Configuration/Diagnostic
- [ ] Recueillir le journal Diagnostic et les logs système si le blocage persiste
- [ ] Tester l’autorisation VPN et la connexion réelle au serveur KIGHMU
- [ ] Ne pas déclarer l’application prête avant validation réelle sur Android

## Historique des limites de livraison

- [ ] Vérifier l’installation et la taille de l’APK sur un appareil compatible
- [ ] Tester la connexion réelle du tunnel sur Android armeabi-v7a
- [ ] Ne pas modifier UDP-ZIVPN pendant les essais
- [ ] Ne pas utiliser de compilation locale ou VPS pour la livraison
- [ ] Sauvegarder un checkpoint après correction Android validée
- [ ] Informer l’utilisateur du résultat final et des étapes de test restantes

## Documentation

- [x] Documenter l’installation, les permissions et les limites de la première version
- [x] Documenter le panneau kighmu2 et le panneau HTTPS
- [x] Documenter l’analyse comparative de handshake
- [x] Documenter la compilation exclusivement via GitHub Actions
- [x] Documenter la cause et le correctif du blocage Android
- [ ] Mettre à jour la procédure d’installation après correction

## Règles de sécurité de ce projet

- [x] Ne pas stocker les mots de passe, Obfs ou jetons GitHub dans le code
- [x] Ne pas modifier UDP-ZIVPN
- [x] Conserver le serveur KIGHMU séparé
- [x] Conserver l’architecture armeabi-v7a uniquement
- [x] Conserver un seul artefact APK installable dans le workflow
- [ ] Ne pas déclarer l’application prête tant que l’ouverture Android et le tunnel réel ne sont pas validés

## Dernière mise à jour

Le diagnostic a confirmé que les ressources natives splash Android versionnées étaient les placeholders Expo par défaut. Elles ont été remplacées par le splash KIGHMU et le nouvel APK GitHub Actions a réussi. L’ouverture sur l’appareil réel reste à confirmer.

## Checkpoints précédents

- `0fd5a956` — retrait du titre « Votre tunnel »
- `aab9e385` — workflow à artefact APK unique, run #12 réussi

## TODO de suivi du correctif

- [x] Lire les consignes Expo SplashScreen et le guide mobile avant modification
- [x] Auditer app.config.ts et les cinq ressources de branding
- [x] Auditer le point d’entrée Android et l’initialisation du module natif
- [x] Vérifier les logs de build et les ressources dans l’APK précédent
- [x] Corriger sans lancer de compilation Android locale
- [x] Publier le correctif vers GitHub
- [x] Attendre un run GitHub Actions réussi
- [ ] Faire installer uniquement le nouvel artefact
- [ ] Recevoir le résultat de l’ouverture sur le téléphone
- [ ] Recevoir le journal Diagnostic après ouverture
- [ ] Recevoir le résultat de l’autorisation VPN
- [ ] Recevoir le résultat de la connexion KIGHMU
- [ ] Créer le checkpoint final seulement après validation
- [x] Maintenir UDP-ZIVPN inchangé pendant toute la procédure
- [ ] Conserver l’application en statut « non prête » tant que le test réel n’est pas concluant

## État courant

- [ ] Blocage Android à l’écran splash résolu
- [ ] Nouvel APK installé et ouvert sur appareil réel
- [ ] Tunnel KIGHMU validé sur appareil réel
- [ ] Application déclarée prête

## À conserver pour le prochain test

- Serveur KIGHMU : `204.152.219.23`
- Port/range : `20000-50000` vers UDP/25000
- UDP-ZIVPN : UDP/5667, ne pas modifier
- Obfs et mot de passe : utiliser uniquement les valeurs déjà configurées côté utilisateur, sans les inscrire dans les logs
- Architecture APK attendue : `armeabi-v7a` uniquement

## Dernière action attendue

Corriger le blocage de démarrage, publier via GitHub Actions, puis demander à l’utilisateur de désinstaller l’ancienne version avant d’installer le nouvel APK.


## Blocage persistant après splash KIGHMU — 14 août 2026

- [ ] Diagnostiquer le blocage persistant après affichage du splash KIGHMU
- [ ] Auditer MainActivity, MainApplication et le point d’entrée Expo Router
- [ ] Vérifier le chargement du bundle JavaScript dans l’APK release
- [ ] Vérifier l’initialisation des providers avant l’affichage de l’accueil
- [ ] Vérifier que SecureStore et AsyncStorage ne retardent pas le premier rendu
- [ ] Vérifier que le module VPN natif ne bloque pas l’initialisation React Native
- [x] Ajouter un démarrage non bloquant avec affichage de l’accueil indépendant du tunnel
- [ ] Ajouter un fallback visible si l’initialisation native échoue
- [x] Publier le correctif uniquement via GitHub Actions
- [x] Vérifier le nouvel APK armeabi-v7a et son artefact unique
- [ ] Installer le nouvel APK après désinstallation propre
- [ ] Confirmer que l’accueil s’affiche après le splash KIGHMU
- [ ] Confirmer l’accès aux écrans Configuration et Diagnostic
- [ ] Recueillir logcat ou Diagnostic si le blocage persiste
- [ ] Tester l’autorisation VPN et le tunnel après résolution de l’ouverture
- [ ] Ne pas déclarer l’application prête avant validation réelle sur Android

## État courant du correctif

Le splash KIGHMU s’affiche désormais correctement, mais l’accueil React Native n’apparaît pas. Le blocage est donc situé après le splash et avant le premier rendu de l’interface. UDP-ZIVPN doit rester inchangé.


## Cause identifiée — APK debug autonome

- [x] Identifier que le workflow `assembleDebug` produisait un APK debug sans bundle JavaScript autonome
- [x] Remplacer `assembleDebug` par `assembleRelease` pour embarquer le bundle Expo/Metro
- [ ] Vérifier le nouvel APK release sur le téléphone et confirmer l’affichage de l’accueil
- [ ] Confirmer le tunnel KIGHMU après l’ouverture de l’accueil

Le nouveau workflow doit publier un artefact `kighmu-vpn-android-release-...`. L’ancien artefact `...-debug-...` ne doit plus être installé hors d’un environnement Metro connecté.


## Test réel du tunnel KIGHMU — utilisateur VPS valide

- [ ] Saisir Host `204.152.219.23` dans Configuration
- [ ] Saisir la plage `20000-50000` dans Port/Range
- [ ] Saisir exactement l’Obfs Salamander configuré côté serveur
- [ ] Saisir le profil userpass au format `utilisateur:mot_de_passe`
- [ ] Enregistrer la configuration localement
- [ ] Accorder l’autorisation Android VPN lors de la première connexion
- [ ] Connecter le tunnel KIGHMU depuis l’appareil réel
- [ ] Vérifier l’état connecté et la notification VPN
- [ ] Vérifier une navigation ou une requête réseau après connexion
- [ ] Ouvrir Diagnostic et relever les étapes prepare, TUN, binaire, handshake et trafic
- [ ] Partager le Diagnostic expurgé sans mot de passe ni Obfs
- [ ] Vérifier que UDP-ZIVPN reste inchangé sur UDP/5667
- [ ] Ne pas déclarer l’application prête avant confirmation du trafic réel
- [ ] Corriger et republier via GitHub Actions uniquement si le Diagnostic révèle un défaut
- [ ] Confirmer la déconnexion propre après le test
- [ ] Révoquer ou remplacer le compte de test après validation si nécessaire

Le test utilise un compte KIGHMU valide créé avec `kighmu2`. Les secrets ne doivent pas être inscrits dans le dépôt, le TODO ou les journaux partagés.


## Erreur d’exécution du binaire Android — 14 août 2026

- [x] Auditer le mode du fichier KIGHMU après extraction dans `filesDir`
- [x] Corriger l’attribut exécutable du binaire `kighmu-native-armeabi-v7a`
- [x] Vérifier que le lancement natif n’utilise pas un fichier copié sans permission `execute`
- [x] Ajouter une validation explicite du fichier exécutable avant démarrage
- [x] Ajouter un message Diagnostic précis si la permission d’exécution échoue
- [x] Publier un nouvel APK uniquement via GitHub Actions
- [x] Vérifier l’ABI et le binaire dans le nouvel artefact release
- [ ] Installer le nouvel APK après désinstallation propre
- [ ] Retester l’autorisation VPN et le démarrage du moteur KIGHMU
- [ ] Vérifier le handshake, le TUN et le trafic réel
- [ ] Confirmer que UDP-ZIVPN sur UDP/5667 reste inchangé
- [ ] Ne pas déclarer l’application prête avant un tunnel réel réussi

Le Diagnostic utilisateur confirme `Cannot run program ... error=13, Permission denied` après le démarrage de `VpnService`. Le profil et la plage de ports sont donc atteints ; l’échec se produit au lancement du moteur local.


## Error=13 persistant après réapplication du mode exécutable

- [x] Confirmer les contraintes Android/SELinux du répertoire `filesDir` sur l’appareil réel
- [ ] Vérifier si le montage du stockage applicatif est `noexec`
- [x] Vérifier le mode et le chemin réellement utilisés par `ProcessBuilder`
- [x] Éviter de dépendre uniquement de `File.setExecutable()`
- [x] Évaluer l’intégration du binaire comme bibliothèque native armeabi-v7a ou un lanceur natif
- [x] Préserver le passage du descripteur TUN et des paramètres Salamander/userpass
- [x] Ajouter un diagnostic distinguant `noexec`, ABI incorrecte et permission POSIX
- [ ] Publier un nouvel APK via GitHub Actions uniquement
- [ ] Retester le démarrage du moteur sans modifier UDP-ZIVPN
- [ ] Confirmer le handshake et le trafic avant de déclarer l’application prête

Le second test réel reproduit exactement `error=13, Permission denied` malgré `setExecutable(true, false)` et `canExecute()`. Le problème semble lié à la politique d’exécution du chemin `filesDir`, et non aux paramètres du compte KIGHMU.


## Comparaison Stivaros — corrections à intégrer

- [x] Ajouter `android:extractNativeLibs="true"` au manifeste final Android
- [x] Définir `LD_LIBRARY_PATH` vers `applicationInfo.nativeLibraryDir` pour le processus KIGHMU
- [x] Vérifier la présence et l’exécution de `libkighmu.so` avant `ProcessBuilder.start()`
- [x] Publier un nouvel APK release uniquement via GitHub Actions
- [ ] Retester le moteur et comparer le Diagnostic après installation propre

Le dépôt Stivaros utilise la même stratégie native recommandée : `jniLibs/<abi>`, `nativeLibraryDir`, `useLegacyPackaging=true`, `android:extractNativeLibs=true` et `LD_LIBRARY_PATH` configuré pour les moteurs exécutés par `ProcessBuilder`.
