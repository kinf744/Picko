# Project TODO

- [x] Définir l’architecture d’interface mobile portrait et les flux principaux
- [x] Définir l’identité visuelle KIGHMU VPN
- [x] Construire l’écran d’accueil avec état du tunnel
- [x] Construire le formulaire Host/IP, port ou plage, Obfs et mot de passe
- [x] Ajouter la validation locale des champs et des plages de ports
- [x] Persister la configuration locale sans exposer les secrets
- [x] Ajouter le stockage sécurisé du mot de passe et de l’Obfs
- [x] Ajouter l’écran de journaux détaillés et filtrables
- [x] Ajouter la copie et le partage d’un rapport de diagnostic expurgé
- [x] Ajouter le modèle d’état du tunnel et les transitions connexion/déconnexion
- [x] Ajouter l’adaptateur natif Android pour le binaire armeabi-v7a
- [x] Ajouter le service Android VpnService et la demande d’autorisation système
- [x] Ajouter l’intégration du binaire KIGHMU dans le build Android
- [x] Ajouter la remontée des erreurs du composant natif vers les journaux
- [x] Tester l’interface sur le preview Expo et les tests unitaires déterministes
- [ ] Vérifier le build Android armeabi-v7a sur un appareil réel ou émulateur compatible
- [x] Documenter l’installation, les permissions et les limites de la première version

- [x] Définir le contrat Native Module pour demander l’autorisation VPN, démarrer, arrêter et recevoir les logs
- [x] Ajouter le service Android VpnService avec notification persistante et arrêt propre
- [x] Ajouter le pont React Native vers VpnService
- [x] Intégrer le binaire KIGHMU armeabi-v7a dans le packaging Android
- [x] Transmettre Host/IP, port ou plage, Obfs et mot de passe au moteur natif sans les journaliser
- [x] Remonter les événements natifs et erreurs détaillées dans l’écran Diagnostic
- [x] Produire un build Android personnalisé incluant le module natif
- [ ] Tester l’autorisation système et la connexion réelle sur Android
- [ ] Ne déclarer l’application prête qu’après validation sur un appareil Android compatible

- [x] Vérifier le dépôt GitHub Picko et son état initial
- [x] Nettoyer les secrets, caches, builds et artefacts privés avant publication
- [x] Ajouter un workflow GitHub Actions de build Android armeabi-v7a/arm64
- [x] Configurer les artefacts APK et les journaux de compilation GitHub
- [x] Pousser le code source complet de l’application vers GitHub
- [x] Vérifier le premier workflow GitHub Actions et corriger ses erreurs
- [x] Ne conserver aucune compilation Android locale ou VPS comme mécanisme de livraison
- [x] Documenter la procédure de compilation exclusivement via GitHub Actions

- [x] Cibler uniquement l’architecture Android armeabi-v7a pour l’APK personnel
- [x] Compiler et vérifier l’APK armeabi-v7a exclusivement via GitHub Actions
- [ ] Vérifier la taille et l’installation de l’APK armeabi-v7a sur un appareil compatible

- [x] Comparer le script Hysteria 1 joint avec le protocole KIGHMU Hysteria 2 du client Android
- [x] Préparer un script de déploiement KIGHMU séparé sans modifier le serveur UDP-ZIVPN existant
- [ ] Tester le handshake et le trafic du tunnel KIGHMU depuis un appareil Android armeabi-v7a
- [x] Déployer le serveur KIGHMU Hysteria 2 séparé et vérifier le handshake local sur UDP/24443

- [x] Auditer les conflits de ports et règles réseau avant d’utiliser 2000-5000 pour KIGHMU
- [x] Configurer le port hopping KIGHMU Hysteria 2 sur la plage 2000-5000 sans modifier UDP-ZIVPN
- [ ] Vérifier le handshake KIGHMU sur une plage de ports depuis l’application Android

- [x] Auditer les collisions UDP et les règles existantes sur la plage 20000-50000
- [x] Configurer KIGHMU sur UDP/25000 avec une redirection dédiée 20000-50000 vers 25000
- [ ] Vérifier l’accès KIGHMU via la plage 20000-50000 sans modifier UDP-ZIVPN
