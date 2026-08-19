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

## Analyse SSH/SlowDNS de Zamois-tun

- [x] Inventorier les modules, scripts et bibliothèques associés à SSH/SlowDNS
- [x] Identifier le format de configuration et les paramètres requis
- [x] Décrire le cycle Android : démarrage, TUN, relais et arrêt
- [x] Comparer l’architecture à la branche restaurée KIGHMU/ZIVPN
- [x] Proposer une intégration SlowDNS isolée avant toute modification de l’application

## Intégration SSH/SlowDNS mono-session

- [x] Vérifier la disponibilité et la provenance de `libdnstt.so` armeabi-v7a : compilation officielle ARMv7 ajoutée au workflow GitHub
- [x] Définir un profil SlowDNS indépendant sans balancer ni session parallèle
- [x] Ajouter les champs SSH, serveur DNS, nameserver et clé publique
- [x] Ajouter le moteur `dnstt → SSH → SOCKS5` dans le module Android natif
- [x] Réutiliser le relais HEV existant pour `TUN → SOCKS5`
- [x] Ajouter les diagnostics et l’arrêt ciblé des processus SlowDNS
- [x] Valider TypeScript et tests sans compilation Android locale
- [x] Corriger la chaîne GitHub Actions : dnstt Android nécessite le NDK et CGO pour l’édition de liens ARMv7
- [ ] Compiler uniquement par GitHub Actions
- [ ] Tester le tunnel réel sur Android avec un endpoint SlowDNS valide

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
- [x] Publier un nouvel APK via GitHub Actions uniquement
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


## Timeout handshake après démarrage réussi — 14 août 2026

- [x] Collecter le Diagnostic complet après l’échec `no recent network activity`
- [x] Vérifier les logs complets du binaire KIGHMU côté Android
- [ ] Vérifier les logs de `kighmu.service` côté VPS au même instant
- [ ] Vérifier que le serveur reçoit les paquets de l’appareil Android
- [x] Comparer l’hôte, la plage 20000-50000, Salamander et userpass
- [ ] Vérifier le format exact de l’authentification transmis au binaire
- [ ] Vérifier la compatibilité de la configuration YAML avec la version du binaire
- [ ] Reproduire le timeout avec le même binaire hors interface Android si possible
- [x] Vérifier le binding réseau et `LD_LIBRARY_PATH` du processus natif
- [ ] Vérifier le passage du descripteur TUN sans masquer l’erreur de handshake
- [x] Corriger le binaire ou la configuration uniquement après preuve dans les logs
- [x] Republier toute correction exclusivement via GitHub Actions
- [ ] Retester le trafic réel et le DNS après correction
- [ ] Ne pas modifier UDP-ZIVPN sur UDP/5667
- [ ] Ne pas déclarer le tunnel fonctionnel avant trafic réel confirmé

Le binaire démarre correctement depuis `libkighmu.so`, mais son client échoue ensuite avec `connect error: timeout: no recent network activity`. Le problème est maintenant localisé après le lancement natif et avant le handshake réussi.


## Permission réseau Android manquante — 14 août 2026

- [x] Ajouter `android.permission.ACCESS_NETWORK_STATE` dans la configuration Android
- [x] Vérifier que la permission apparaît dans le manifeste final de l’APK
- [x] Rendre le binding réseau tolérant si `activeNetwork` ou la permission est indisponible
- [x] Ajouter un Diagnostic distinct pour permission manquante, réseau absent et binding refusé
- [x] Republier via GitHub Actions uniquement
- [x] Vérifier l’artefact release unique armeabi-v7a
- [ ] Retester le démarrage du moteur KIGHMU
- [ ] Retester le handshake et le trafic réel
- [ ] Ne pas modifier UDP-ZIVPN sur UDP/5667
- [ ] Ne pas déclarer l’application prête avant trafic réel confirmé

Le Diagnostic utilisateur confirme `Neither user 11761 nor current process has android.permission.ACCESS_NETWORK_STATE`. L’échec se produit dans `ConnectivityService` avant le handshake du binaire.


## Timeout de handshake persistant après binding réussi — 14 août 2026

- [ ] Collecter le Diagnostic complet de la tentative à 02:56
- [ ] Collecter les logs `kighmu.service` côté VPS au même instant
- [ ] Vérifier si les paquets UDP Android arrivent sur UDP/25000 ou la plage 20000-50000
- [ ] Vérifier si le serveur renvoie une réponse au client Android
- [ ] Auditer le format exact Host/Port/Obfs/userpass transmis au binaire
- [ ] Comparer la configuration Android avec un profil client KIGHMU connu fonctionnel
- [ ] Vérifier la compatibilité de la version du binaire armeabi-v7a avec le serveur
- [ ] Reproduire le handshake hors interface Android avec le même profil
- [ ] Vérifier les erreurs de résolution, QUIC, Salamander, TLS et authentification
- [ ] Corriger uniquement la configuration ou le binaire après preuve dans les logs
- [ ] Republier toute correction exclusivement via GitHub Actions
- [ ] Retester le handshake et le trafic réel
- [ ] Ne pas modifier UDP-ZIVPN sur UDP/5667
- [ ] Ne pas déclarer le tunnel fonctionnel avant trafic confirmé


## Résultat des tests Android — 14 août 2026

- [x] Confirmer l’ouverture de l’application et l’accès à Configuration/Diagnostic
- [x] Confirmer le démarrage de `libkighmu.so` en armeabi-v7a
- [x] Confirmer le binding au réseau physique après ajout de la permission
- [x] Reproduire le timeout `no recent network activity` avec journal nettoyé
- [x] Ne plus afficher « Tunnel actif » avant confirmation du handshake
- [x] Afficher « Échec de connexion » lorsque le processus natif termine ou retourne une erreur
- [ ] Auditer si `20000-50000` est accepté comme port par le binaire client
- [ ] Auditer le format `auth: utilisateur:mot_de_passe` attendu par le binaire
- [ ] Vérifier la réception UDP et la réponse du serveur au moment du test
- [x] Republier toute correction uniquement via GitHub Actions
- [ ] Retester le trafic réel avant toute déclaration de disponibilité
- [ ] Ne pas modifier UDP-ZIVPN sur UDP/5667


## Timeout persistant après correction de l’état — isolation réseau/protocole

- [ ] Capturer les paquets UDP reçus par KIGHMU pendant une tentative Android
- [ ] Capturer les réponses UDP envoyées par KIGHMU pendant cette tentative
- [ ] Comparer le port réellement utilisé avec UDP/25000 et la plage UDP/20000-50000
- [ ] Relever les logs `kighmu.service` exactement à l’heure du test
- [ ] Vérifier si le serveur voit le client Android ou seulement un silence réseau
- [ ] Vérifier le format d’authentification et d’Obfs transmis au binaire
- [ ] Tester temporairement un port unique connu pour isoler le port hopping
- [ ] Ne modifier aucun réglage UDP-ZIVPN pendant la capture
- [ ] Ne publier aucun nouvel APK avant preuve de la cause réseau/protocole


## Capture UDP à refaire

La première capture n’a pas produit de fichier exploitable, mais le serveur est confirmé actif sur UDP/25000 et UDP-ZIVPN reste actif sur UDP/5667. Une seconde capture doit être lancée en premier plan avec une fenêtre synchronisée avec la tentative Android. Aucun nouvel APK ne doit être publié avant cette preuve.

- [ ] Lancer une capture UDP fiable avec fichier confirmé
- [ ] Faire une tentative Android pendant la fenêtre de capture
- [ ] Lire les paquets reçus et émis
- [ ] Comparer avec les journaux KIGHMU

## Diagnostic synchronisé du timeout — 14 août 2026

- [x] Lancer une capture VPS synchronisée avec un essai Android
- [x] Vérifier directement les paquets entrants vers UDP/25000
- [x] Vérifier la présence des règles nftables de redirection 20000-50000 vers 25000
- [x] Ajouter une configuration client explicite `transport.udp` pour le port hopping si nécessaire
- [ ] Republier via GitHub Actions après correction de configuration
- [ ] Retester avec capture synchronisée et confirmer le handshake
- [ ] Vérifier le trafic réel dans le TUN après handshake

Constat intermédiaire : pendant la capture du 14 août 2026 à 11:20–11:22 UTC, aucun paquet entrant n’a atteint directement UDP/25000 et aucun journal KIGHMU correspondant n’a été produit. Les règles nftables de port hopping existent bien. Le YAML Android utilise actuellement `server: host:port` et ne déclare pas explicitement `transport.udp`; la prochaine vérification porte sur la construction de l’adresse multi-port et sur la section transport documentée par Hysteria 2.

## Bug de déconnexion complète — 14 août 2026

- [x] Auditer l’arrêt du service `VpnService` et du processus KIGHMU
- [x] Vérifier la fermeture du descripteur TUN et la libération de la liaison réseau
- [x] Vérifier l’arrêt de la notification VPN et le retour d’état React Native
- [x] Rendre `stopVpn()` idempotent et résistant aux appels répétés
- [ ] Ajouter ou renforcer les tests déterministes du cycle déconnexion
- [x] Republier la correction uniquement via GitHub Actions
- [ ] Faire vérifier sur Android que le VPN se déconnecte entièrement
- [ ] Vérifier que UDP-ZIVPN sur UDP/5667 reste inchangé

## Blocage pendant connexion — arrêt immédiat et relance — 14 août 2026

- [x] Auditer si `startVpn()` bloque le thread du service pendant le handshake
- [x] Auditer les courses entre `ACTION_START`, `ACTION_STOP` et `onDestroy()`
- [x] Rendre l’arrêt immédiat sans attendre la fin du handshake
- [x] Empêcher une ancienne tentative de réécrire l’état après une nouvelle tentative
- [x] Autoriser une relance propre après interruption de connexion
- [ ] Ajouter des tests déterministes de génération/annulation de tentative
- [x] Republier uniquement via GitHub Actions
- [ ] Faire tester interruption puis reconnexion sur appareil Android

## Comparaison Stivaros pour le cycle d’arrêt — 14 août 2026

- [x] Cloner Stivaros en lecture seule et repérer son service VPN
- [x] Comparer les chemins START, STOP, `onDestroy()` et le traitement du processus natif
- [x] Identifier le mécanisme qui rend l’interruption et la reconnexion rapides
- [x] Rendre le bouton Annuler pressable pendant l’état `connecting`
- [x] Ajouter une action Arrêter dans la notification VPN comme voie de secours
- [x] Adapter uniquement le mécanisme d’arrêt nécessaire à KIGHMU
- [x] Publier la correction exclusivement via GitHub Actions
- [ ] Faire valider sur Android l’interruption pendant la connexion puis la reconnexion

## Timeout handshake confirmé après correction de déconnexion — 14 août 2026

- [x] Analyser le Diagnostic Android de 13:58:56–13:59:02
- [x] Lancer une capture UDP synchronisée sur le VPS pendant une nouvelle tentative Android
- [x] Identifier l’absence de paquet Android vers la plage KIGHMU et de réponse du VPS pendant la tentative
- [ ] Comparer l’adresse multi-port, l’authentification et Salamander entre client et serveur
- [x] Exclure le package KIGHMU de son propre TUN avant `establish()` pour éviter une boucle UDP
- [x] Corriger uniquement la cause démontrée puis publier via GitHub Actions
- [ ] Confirmer le handshake et le trafic réel avant de déclarer le tunnel opérationnel

Résultat de capture : entre 13:34:08 et 13:34:13 UTC, aucun paquet associé au téléphone n’a atteint UDP/25000 ni la plage 20000-50000. Le serveur KIGHMU est actif sur UDP/25000 et les règles de redirection sont présentes. Cette absence, alors que le binaire Android est lancé, indique que le flux QUIC du processus applicatif est probablement repris par son propre TUN avant de sortir du téléphone. Le correctif exclut désormais le package KIGHMU du TUN et déclare le réseau physique sous-jacent avant l’établissement de l’interface.

## Mode de test client UDP-ZIVPN — comparaison avec KIGHMU

- [x] Cloner et analyser Zamois-tun en lecture seule
- [x] Identifier le binaire UDP-ZIVPN, l’ABI et les bibliothèques associées
- [x] Identifier la configuration, le format des paramètres et le lanceur natif
- [x] Définir un mode de test client isolé sans modifier le serveur UDP-ZIVPN/5667
- [x] Remplacer temporairement le moteur KIGHMU par ZIVPN dans l’APK de test
- [x] Retirer entièrement le binaire KIGHMU de l’APK de test
- [x] Valider TypeScript/tests sans compilation Android locale
- [ ] Compiler uniquement via GitHub Actions
- [ ] Tester la connexion ZIVPN réelle sur Android
- [ ] Comparer le résultat avec le diagnostic KIGHMU
- [ ] Restaurer ou conserver explicitement le mode choisi après comparaison

## Contrainte confirmée — intégration applicative SSH/SlowDNS uniquement

- [ ] Ne réaliser aucune modification sur le VPS, ses services, ses règles réseau ou l’accès SSH
- [ ] Limiter la validation à l’intégration applicative, à l’APK armeabi-v7a et au workflow GitHub Actions

## Aperçu visuel des tunnels

- [x] Préparer des profils de démonstration locaux, sans identifiants ni secrets réels
- [x] Capturer l’écran Tunnel avec le profil UDP-ZIVPN
- [x] Capturer la configuration SSH/SlowDNS mono-session
- [x] Capturer l’écran Diagnostic et présenter l’ensemble des tunnels

## Validation réelle rapportée — SSH/SlowDNS

- [x] Enregistrer la confirmation utilisateur du fonctionnement réel du tunnel SSH/SlowDNS mono-session

## Extension multi-profils et tunnels indépendants

- [x] Analyser les moteurs Hysteria, V2Ray DNS, V2Ray SlowDNS et Xray/V2Ray du dépôt Zamois-tun en lecture seule
- [x] Définir un modèle de tunnel indépendant, sans partage de fichiers binaires, de processus ou de paramètres secrets
- [x] Définir une collection de profils séparée par tunnel et un balancier optionnel limité au tunnel choisi
- [x] Ajouter le balancier multi-profils pour UDP-ZIVPN
- [x] Ajouter le balancier multi-profils pour SSH/SlowDNS
- [x] Intégrer Hysteria UDP comme tunnel indépendant
- [x] Intégrer V2Ray DNS et V2Ray+SlowDNS comme tunnels indépendants
- [x] Intégrer Xray/V2Ray comme tunnel indépendant
- [x] Repenser l’onglet Tunnel pour choisir explicitement le moteur avant connexion
- [x] Ajouter tests unitaires de l’isolation des profils et de la sélection du balancier
- [x] Corriger le workflow Hysteria v1 : utiliser Go 1.20 séparément du compilateur dnstt
- [x] Corriger les erreurs Kotlin relevées lors du premier assemblage multi-tunnels GitHub Actions
- [x] Compiler et vérifier l’APK armeabi-v7a exclusivement via GitHub Actions — run 32166608757 réussi, artefact release disponible

## Aperçu visuel actualisé — catalogue multi-tunnels

- [x] Préparer un profil SSH/SlowDNS fictif, sans adresse ni identifiants réels
- [x] Capturer l’écran Tunnel avec les six familles et la sélection active
- [x] Capturer la gestion de profils SSH/SlowDNS et son balancier optionnel
- [x] Capturer le formulaire SSH/SlowDNS complet avec valeurs de démonstration

## Correction — V2Ray DNS distinct de V2Ray+SlowDNS

- [x] Recenser et retirer V2Ray DNS des profils, du moteur, des binaires, des tests et de l’interface
- [x] Simplifier V2Ray+SlowDNS à un profil V2Ray et aux seuls paramètres dnstt nécessaires
- [x] Conserver dnstt/SlowDNS uniquement dans le moteur V2Ray+SlowDNS
- [x] Clarifier les champs et libellés de V2Ray+SlowDNS dans l’interface
- [x] Ajouter des tests garantissant l’absence de V2Ray DNS
- [x] Compiler et vérifier l’APK armeabi-v7a exclusivement via GitHub Actions — run 32171030806 réussi

## HTTP Proxy+Payload et SSH SSL/TLS multi-profils

- [x] Analyser en lecture seule les moteurs HTTP Proxy+Payload et SSH SSL/TLS de Zamois-tun
- [x] Définir deux contrats de profils isolés et les paramètres nécessaires de chaque tunnel
- [x] Ajouter le balancier multi-profils HTTP Proxy+Payload sans mélange inter-tunnels
- [x] Ajouter le balancier multi-profils SSH SSL/TLS sans mélange inter-tunnels
- [x] Ajouter le moteur HTTP Proxy+Payload indépendant et ses fichiers runtime propres
- [x] Ajouter le moteur SSH SSL/TLS indépendant et ses fichiers runtime propres
- [x] Ajouter les deux familles au sélecteur de tunnels et aux formulaires de configuration
- [x] Ajouter tests de validation et d’isolement pour les deux nouveaux tunnels
- [x] Compiler et vérifier l’APK armeabi-v7a exclusivement via GitHub Actions — run 32171030806 réussi

## Refonte de l’onglet Tunnel — sélection par cases à cocher

- [x] Remplacer les cartes actuelles par une grille compacte de cases à cocher
- [x] Imposer la sélection exclusive d’un seul tunnel à la fois
- [x] Afficher les sept tunnels disponibles avec des libellés simples
- [x] Ajouter un bouton principal Connecter/Déconnecter sous la grille
- [x] Conserver un accès secondaire aux profils et au balancier du tunnel sélectionné
- [x] Vérifier le rendu et les interactions sur mobile
- [x] Compiler et vérifier l’APK armeabi-v7a exclusivement via GitHub Actions — run 32171030806 réussi

## Aperçu visuel complet — sept tunnels

- [x] Préparer des profils locaux fictifs pour UDP-ZIVPN, SSH/SlowDNS, Hysteria, HTTP Proxy+Payload, SSH SSL/TLS, V2Ray+SlowDNS et Xray/V2Ray
- [x] Capturer la grille de sélection à cases à cocher
- [x] Capturer les formulaires UDP-ZIVPN, SSH/SlowDNS et Hysteria UDP
- [x] Capturer les formulaires HTTP Proxy+Payload et SSH SSL/TLS
- [x] Capturer les formulaires V2Ray+SlowDNS et Xray/V2Ray
- [x] Présenter les vues de configuration sans divulguer de secrets réels

## Taille de l’APK release armeabi-v7a

- [x] Télécharger l’artefact release GitHub Actions et mesurer sa taille réelle — 50,86 Mio
- [x] Établir la répartition par bibliothèques natives, code et ressources
- [x] Identifier les fichiers redondants ou supprimables sans retirer de tunnel
- [x] Appliquer les optimisations de packaging compatibles avec armeabi-v7a
- [x] Compiler l’APK optimisé exclusivement via GitHub Actions — 44,54 Mio, soit un gain de 6,32 Mio
- [x] Retirer les modules Expo audio, vidéo, notifications, image et maintien d’écran non utilisés
- [x] Retirer leurs plugins de configuration et vérifier les imports applicatifs
- [x] Évaluer puis désactiver la nouvelle architecture React Native si la compatibilité VPN est conservée
- [x] Restaurer la nouvelle architecture React Native, exigée par Reanimated dans la configuration actuelle
- [x] Compiler l’APK après retrait des modules non utilisés exclusivement via GitHub Actions — run 32178614899, 44,54 Mio
- [x] Vérifier l’objectif de moins de 40 Mo et documenter l’écart éventuel — 4,54 Mio au-dessus de la cible

## Optimisation approfondie des tunnels

- [x] Auditer les paramètres de démarrage, délais, relais et diagnostics des sept familles de tunnel
- [x] Définir les optimisations client sûres et isolées pour UDP-ZIVPN sans modifier son binaire ni le VPS
- [x] Définir les optimisations client sûres et isolées pour SSH/SlowDNS
- [x] Définir les optimisations client sûres et isolées pour Hysteria UDP
- [x] Définir les optimisations client sûres et isolées pour HTTP Proxy+Payload et SSH SSL/TLS
- [x] Définir les optimisations client sûres et isolées pour V2Ray+SlowDNS et Xray/V2Ray
- [x] Implémenter uniquement les améliorations compatibles avec les contrats de configuration actuels
- [x] Valider TypeScript, les tests de profils et la propreté du diff sans compilation Android locale
- [x] Compiler l’APK armeabi-v7a exclusivement dans GitHub Actions et examiner les diagnostics de build — run 32181541074 réussi, 44,54 Mio
- [x] Documenter les gains mesurés et les validations réelles restant à effectuer sur appareil Android — compatibilité compilée ; essais réseau réels encore nécessaires

## Refonte UI/UX mobile professionnelle

- [x] Créer et valider un skill UI/UX mobile, design system et implémentation frontend réutilisable
- [x] Auditer les écrans Tunnel, Configuration et Diagnostic existants
- [x] Définir une direction visuelle mobile portrait, une hiérarchie et des flux cohérents
- [x] Écrire le design system KIGHMU VPN : palette, typographie, espacements, composants et états
- [x] Refondre l’onglet Tunnel sans modifier la logique VPN ni les sept familles
- [x] Refondre l’onglet Configuration avec des formulaires lisibles et adaptés à une main
- [x] Refondre l’onglet Diagnostic avec une lecture claire des événements et des erreurs sans secrets
- [x] Valider l’interface au format mobile, TypeScript et les tests sans compilation Android locale — revue des layouts portrait, TypeScript et 11 tests réussis
- [ ] Vérifier visuellement la refonte sur un appareil Android avant de la considérer comme validée en conditions réelles
- [x] Compiler la refonte armeabi-v7a exclusivement avec GitHub Actions — run 32186454750 réussi, APK 44,54 Mio
- [x] Retirer de Configuration le bloc visuel récapitulatif de famille et le contrôle de balancier, sans modifier la logique VPN

## En-tête expert, import-export et confidentialité

- [x] Remplacer l’en-tête actuel par le nom KIGHMU VPN centré et un menu à trois points
- [x] Ajouter un menu Importer une configuration avec contrôle des fichiers et confirmation
- [x] Ajouter un export de configuration sélectif par famille de tunnel, sans secrets par défaut
- [x] Ajouter une réinitialisation globale explicitement confirmée
- [x] Ajouter une politique de confidentialité détaillée et obligatoire au premier lancement
- [x] Bloquer les fonctions VPN tant que la politique n’est pas acceptée et fermer l’accès après refus
- [x] Tester les données importées/exportées, le consentement et l’absence de régression des profils — 14 tests réussis
- [x] Compiler l’APK armeabi-v7a exclusivement dans GitHub Actions — run 32194474757 réussi, APK 44,57 Mio

## Comparaison import-export avec Zamois-tun

- [x] Auditer les fichiers, flux et interfaces d’import-export du dépôt Zamois-tun
- [x] Comparer les flux de Zamois-tun avec le format JSON sélectif et sécurisé de KIGHMU VPN
- [x] Corriger le menu KIGHMU VPN uniquement avec des améliorations compatibles avec les sept familles isolées
- [x] Valider les flux corrigés par TypeScript et tests sans compilation Android locale — 14 tests réussis
- [x] Compiler les écrans import-export corrigés exclusivement dans GitHub Actions — run 32195979660 réussi, APK 44,57 Mio

## Correction erreur Paramètres et aperçu

- [x] Supprimer toute demande de secret ou variable distante liée aux Paramètres locaux
- [x] Vérifier que l’icône Paramètres et l’écran Paramètres sont présents sans configuration sensible
- [x] Capturer un aperçu de l’en-tête et de l’écran Paramètres
- [x] Confirmer à l’utilisateur que la demande de secret est corrigée

## Icône de notification VPN Android

- [x] Auditer l’icône et le canal de notification utilisés par le service VPN
- [x] Remplacer l’icône d’alerte par un symbole VPN moderne, lisible en monochrome
- [x] Vérifier les états en connexion, actif et arrêt sans modifier la logique du tunnel
- [x] Valider TypeScript et les tests
- [x] Documenter que la validation finale de l’icône doit se faire sur un APK GitHub Actions installé sur Android

## Synchronisation GitHub Actions

- [x] Comparer la branche locale avec GitHub Picko
- [x] Vérifier les fichiers modifiés non poussés et le workflow Android
- [x] Pousser les modifications locales vers GitHub sans inclure de secrets
- [x] Déclencher et suivre le workflow GitHub Actions armeabi-v7a
- [x] Vérifier l’artefact APK et documenter le résultat — run 32203673360 réussi, 45,61 Mio

## Ajustements des formulaires de tunnel

- [x] Encoder la valeur Obfs fixe de ZIVPN et retirer son champ de configuration
- [x] Rendre les mots de passe visibles avant et après la saisie dans tous les tunnels
- [x] Accepter un lien VMess, VLESS ou Trojan pour V2Ray+DNS à la place du JSON brut
- [x] Retirer le champ Hôte SSH du formulaire SlowDNS et conserver une configuration compatible
- [x] Valider les modèles et démarrer le build GitHub Actions armeabi-v7a — run 32206904075 réussi

## Restrictions configurables à l’export

- [x] Ajouter les options de verrouillage et de restrictions réseau au format exporté
- [x] Ajouter les options appareil, expiration, SSH lié à l’appareil et anti-torrent
- [x] Ajouter une note utilisateur facultative et la sélection de familles de tunnel
- [x] Rendre l’interface d’export cohérente avec le design Signal Control
- [x] Valider l’import, les tests et la compilation GitHub Actions — run 32206904075 réussi, 45,61 Mio

## Restrictions Hardware ID, opérateur et root

- [x] Exposer un Hardware ID local copiable dans les Paramètres
- [x] Ajouter une liste d’Hardware ID autorisés au format d’export
- [x] Ajouter l’option d’autoriser seulement certains opérateurs mobiles
- [x] Ajouter l’option de bloquer les appareils rootés
- [x] Appliquer les contrôles locaux lors de l’utilisation d’une configuration restreinte
- [x] Valider les tests et compiler exclusivement avec GitHub Actions — run 32211022651 réussi

## Clonage de profils multi-tunnels

- [x] Ajouter une action Cloner à chaque profil de tunnel
- [x] Créer un nouvel identifiant, un nom de copie et conserver les valeurs propres au tunnel
- [x] Respecter le verrouillage de configuration importée
- [x] Ajouter les tests de régression et compiler exclusivement avec GitHub Actions — run 32211022651 réussi

## Simplification de l’onglet Tunnel

- [x] Retirer le bloc Dernier événement de l’onglet Tunnel
- [x] Retirer le bloc Profils sélectionnés et son raccourci Gérer
- [x] Préserver le choix du tunnel, le bouton de connexion et l’accès aux profils par l’onglet Configuration
- [x] Valider les tests et compiler exclusivement avec GitHub Actions — run 32211022651 réussi

## Simplification de l’onglet Configuration

- [x] Retirer l’action Réinitialiser les profils locaux de Configuration
- [x] Préserver les profils enregistrés et la réinitialisation globale confirmée du menu principal
- [x] Valider les tests et compiler exclusivement avec GitHub Actions — run 32211022651 réussi

## Partage par presse-papiers

- [x] Ajouter la création d’une configuration dans le presse-papiers depuis Exporter
- [x] Ajouter l’import d’une configuration depuis le presse-papiers
- [x] Conserver les avertissements de sécurité lorsque les secrets sont inclus
- [x] Valider les tests et compiler exclusivement avec GitHub Actions — run 32211022651 réussi, 45,63 Mio

## Refonte du journal Diagnostic

- [x] Remplacer les panneaux actuels par un journal de connexion chronologique
- [x] Structurer les étapes de tunnel, réseau et SSH en lignes lisibles
- [x] Capturer et afficher uniquement une bannière SSH réellement reçue
- [x] Filtrer secrets et données sensibles avant persistance ou affichage
- [x] Valider les tests et compiler exclusivement avec GitHub Actions — run 32212277311 réussi, 45,63 Mio

## Analyse de performance UDP-ZIVPN

- [x] Inventorier le chemin client UDP-ZIVPN de KIGHMU VPN et de Zamois-tun
- [x] Comparer binaire, relais TUN, sockets, buffers et gestion de plage de ports
- [ ] Établir les causes prouvées de ralentissement avant toute modification
- [ ] Définir des correctifs client sûrs sans modifier le serveur ni UDP-ZIVPN
- [ ] Mesurer sur appareil Android réel après compilation GitHub Actions

Le binaire `libuz_core.so` et la bibliothèque HEV armeabi-v7a sont identiques par SHA-256 dans les deux dépôts. La configuration ZIVPN envoyée au moteur est également identique, notamment les fenêtres de réception, la désactivation de découverte MTU et les plafonds `50/10 Mbps`. Les écarts encore présents concernent l’interface VPN : KIGHMU impose un MTU de 1400 et s’appuie sur l’exclusion de son package et le binding du réseau physique ; Zamois-tun peut établir son interface à MTU 1500 et exclut explicitement l’IP du serveur de ses routes. Le balancier KIGHMU ne participe pas lorsqu’un seul profil est sélectionné. Aucun de ces éléments ne constitue encore une cause de débit prouvée sans mesure sur le même appareil et réseau.

## Écart A/B confirmé — UDP-ZIVPN

- [x] Enregistrer le test de téléchargement comparatif : même serveur et même réseau, Zamois-tun environ deux fois plus rapide que KIGHMU
- [ ] Auditer les différences restantes de création TUN, MTU, routes et mode de descripteur Android
- [x] Appliquer un correctif de chemin réseau KIGHMU réversible, sans modifier libuz_core, le serveur ou la configuration de protocole
- [ ] Valider TypeScript, les tests et la compilation GitHub Actions armeabi-v7a
- [ ] Faire répéter le test A/B d’une minute sur le nouvel APK

Le correctif aligne le chemin UDP-ZIVPN du catalogue sur le parcours multi-profil de Zamois-tun : MTU TUN et HEV de 1500, mode bloquant explicite, bypass VPN et statut non mesuré pour le réseau physique, ainsi qu’un relais SOCKS local direct même avec un seul profil. Les valeurs Obfs, auth, fenêtres de réception, plafonds, libuz_core et VPS restent inchangés. Son effet doit être confirmé par le nouvel essai A/B.
