# Design produit — KIGHMU VPN Android

## Positionnement

KIGHMU VPN est une application Android de tunnel réseau destinée à piloter le binaire KIGHMU armeabi-v7a. L’interface doit être lisible d’une seule main, calme en situation normale et très explicite lorsqu’une connexion échoue. Le style reprend les conventions d’une application mobile native : hiérarchie forte, grands contrôles tactiles, surfaces sobres, retours d’état immédiats et absence de décoration inutile.

## Écrans

### 1. Accueil — « Tunnel »

L’écran principal affiche l’état du tunnel sous forme d’un grand indicateur central : Déconnecté, Connexion en cours, Connecté ou Erreur. Il présente le profil actif sous forme de carte compacte avec l’adresse Host/IP, le port ou la plage, l’obfuscation activée sous forme masquée et le mot de passe non affiché. Le bouton principal est un contrôle large « Se connecter » ou « Déconnecter ». Une seconde action « Tester la configuration » vérifie les champs localement sans démarrer le tunnel. Un résumé du dernier événement de diagnostic apparaît sous le bouton, avec l’heure et un niveau de gravité.

### 2. Configuration — « Profil serveur »

La configuration contient quatre champs obligatoires ou conditionnels : Host/IP, Port ou plage de ports, Obfs et Mot de passe. Le champ Host/IP accepte une adresse IPv4, IPv6 ou un nom DNS. Le champ Port accepte un port numérique ou une plage au format `6000-19999`, avec validation des bornes 1–65535. Le champ Obfs utilise une saisie masquée et offre une action afficher/masquer. Le mot de passe est conservé dans le stockage sécurisé Android et n’est jamais écrit dans les logs. Un bouton « Enregistrer le profil » valide puis persiste les données locales. Une action « Réinitialiser » demande confirmation avant d’effacer le profil.

### 3. Journaux — « Diagnostic »

L’écran Diagnostic affiche une liste chronologique avec niveau, heure, composant et message. Les niveaux sont Information, Connexion, Avertissement et Erreur. Les secrets, mots de passe et valeurs Obfs sont systématiquement filtrés avant affichage. Les entrées incluent les étapes du tunnel : validation, résolution DNS, préparation du processus natif, demande d’autorisation VPN Android, démarrage, handshake, transport, déconnexion et erreur. L’utilisateur peut filtrer par niveau, copier les logs ou partager un rapport texte. Un identifiant de session de diagnostic facilite la comparaison entre essais.

### 4. Autorisation VPN Android

Avant le premier démarrage, l’application explique que le système Android doit autoriser la création d’une connexion VPN. L’écran utilise un panneau de confirmation clair et ne prétend pas que le tunnel est actif avant le retour positif du système. En cas de refus, l’utilisateur revient à l’accueil avec une erreur actionnable et un lien vers les journaux.

## Flux principaux

### Connexion réussie

L’utilisateur ouvre l’accueil, consulte le profil actif, appuie sur « Se connecter », puis accorde l’autorisation VPN Android si nécessaire. L’application valide les paramètres, démarre le composant natif, attend l’état connecté et remplace le bouton par « Déconnecter ». Chaque étape est journalisée sans secret.

### Configuration d’un nouveau serveur

L’utilisateur ouvre Configuration, saisit Host/IP, port ou plage, Obfs et mot de passe, puis appuie sur Enregistrer. Les valeurs sont validées côté interface. En cas d’erreur, le champ concerné reçoit un message local. En cas de succès, le profil est sauvegardé et l’utilisateur revient à l’accueil avec un résumé non sensible.

### Diagnostic d’une panne

L’utilisateur ouvre Diagnostic depuis l’accueil ou l’onglet dédié, filtre les erreurs, consulte la dernière session, puis copie ou partage le rapport. Le rapport contient l’état de l’appareil et les étapes techniques utiles, mais exclut le mot de passe, l’Obfs et les jetons.

## Palette de marque

La marque KIGHMU utilise un bleu nuit technique et un cyan de signal réseau. Le fond sombre principal est `#08111F`, la surface élevée `#101D2F`, le bleu d’action `#1D8CFF`, le cyan de statut `#32D6C7`, le texte principal `#F4F8FC`, le texte secondaire `#9DB0C5`, la bordure `#223650`, l’état connecté `#32D6C7`, l’avertissement `#F6B84B` et l’erreur `#FF6B6B`. Le mode clair conserve le bleu d’action mais utilise `#F6F9FC` comme fond et `#FFFFFF` comme surface.

## Règles d’interaction

Tous les contrôles principaux mesurent au moins 48 dp de hauteur. Les champs affichent leur unité ou format attendu. Les états de connexion sont toujours accompagnés d’un texte, jamais d’une couleur seule. Les transitions restent discrètes et ne retardent pas l’action. Les journaux sont consultables même lorsque le tunnel est déconnecté. Aucun écran ne demande de compte ou de synchronisation cloud, car le besoin exprimé est local à l’appareil.

## Limite technique assumée

Une application Expo/React Native peut construire l’interface, le stockage local et le modèle de diagnostic, mais le lancement réel d’un binaire Go et l’implémentation d’un `VpnService` Android nécessitent une couche native Android et un build de développement ou de production personnalisé. Cette intégration sera isolée derrière un adaptateur natif afin que l’interface reste testable dans Expo sans simuler un tunnel connecté en production.
