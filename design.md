# KIGHMU VPN — Direction de design 2026

## Intention

KIGHMU VPN devient un **poste de contrôle réseau personnel** : calme au repos, direct pendant une action et précis quand une erreur survient. L’interface ne cherche pas à imiter un terminal ni à masquer les informations utiles derrière des décorations. Elle donne d’abord le statut, puis le tunnel choisi, puis l’action suivante.

> Une personne doit pouvoir ouvrir l’application, identifier l’état du VPN, choisir une famille et déclencher l’action principale sans parcourir une grille technique dense.

L’application reste en portrait 9:16. Tous les contrôles importants sont atteignables du pouce, les secrets restent masqués et les sept familles de tunnel conservent strictement leurs profils et leurs runtimes séparés.

## Écrans

| Écran | Contenu principal | Action prioritaire |
|---|---|---|
| **Tunnel** | État de connexion, famille active, résumé des profils sélectionnés, balancier et dernier événement | Connecter ou déconnecter |
| **Configuration** | Sélecteur de famille, collections de profils, balancier local et éditeur de profil | Ajouter, modifier ou sélectionner un profil |
| **Diagnostic** | Résumé de session, filtres, journal chronologique et partage expurgé | Comprendre ou partager une panne sans secret |

## Direction visuelle

Le langage visuel s’appelle **Signal Control**. Il associe un fond bleu ardoise très sombre, des surfaces légèrement relevées, un bleu électrique réservé aux actions, et un vert menthe réservé aux états de connexion confirmés. L’accent ne sert jamais à décorer ; il indique une sélection, une action ou un succès réel.

Les panneaux sont structurés par des espacements et des différences de surface, plutôt que par une accumulation de bordures. Les formes sont arrondies sans excès : 14 px pour les champs et boutons, 20 px pour les panneaux de statut. Les libellés sont en casse naturelle ; les majuscules sont réservées aux micro-libellés de contexte.

## Design system

### Couleurs

| Jeton | Sombre | Clair | Usage |
|---|---:|---:|---|
| `background` | `#071321` | `#F4F7FB` | Canevas de l’application |
| `surface` | `#0D1E31` | `#FFFFFF` | Cartes et formulaires |
| `surfaceRaised` | `#132942` | `#EAF1F8` | Zone de statut et contrôles actifs secondaires |
| `primary` | `#3B82F6` | `#2563EB` | Action principale et sélection |
| `success` | `#35D0AA` | `#0C9D77` | Tunnel effectivement connecté |
| `warning` | `#F5B74B` | `#B26A00` | Attention et dégradation |
| `error` | `#FF6E7A` | `#D83A52` | Erreur et action destructive |
| `foreground` | `#F6F9FD` | `#102235` | Texte principal |
| `muted` | `#9AAEC3` | `#61758A` | Annotation et métadonnées |
| `border` | `#213B58` | `#D9E4EF` | Séparateur sobre et état focus |

### Typographie et rythme

Le titre d’écran est à 30–32 px et 800 ; les titres de section sont à 17–20 px et 700 ; le corps est à 14–16 px avec un interligne d’au moins 1,35 ; les métadonnées sont à 11–12 px. La grille d’espacement adopte 4, 8, 12, 16, 20, 24 et 32 px. Les éléments tactiles ont au moins 48 px de hauteur.

### Composants

| Composant | Rôle | États obligatoires |
|---|---|---|
| Carte d’état | Montrer l’état réseau et l’action en cours | Repos, connexion, connecté, erreur |
| Sélecteur de famille | Choisir une seule famille sans ambiguïté | Repos, actif, pression |
| CTA de connexion | Déclencher ou arrêter le tunnel | Prêt, connexion, connecté, erreur, désactivé |
| Carte de profil | Résumer un profil sans afficher de secret | Non sélectionné, sélectionné, indisponible |
| Ligne de journal | Afficher niveau, composant, heure, message | Information, connexion, avertissement, erreur |
| Champ de formulaire | Regrouper label, aide, saisie et erreur | Repos, focus, erreur, secret masqué |

## Composition des écrans

### Tunnel

L’écran commence par une barre de marque compacte, puis une **carte d’état dominante**. Elle affiche une puce de statut, le libellé de connexion, le nom de la famille active et une phrase d’aide. Sous la carte, un sélecteur horizontal de familles donne accès aux sept tunnels sans ressembler à une série de cases à cocher. La famille choisie garde une couleur d’accent et un repère textuel.

Le résumé des profils devient une carte structurée : compteur, profils visibles, endpoint non sensible, état du balancier et raccourci clair vers Configuration. Le bouton Connecter/Déconnecter reste collé visuellement au bas du contenu et est la seule action pleine largeur de l’écran. Le dernier événement de diagnostic est présenté dans une carte discrète, actionnable.

### Configuration

L’écran débute par une introduction courte et un rail de familles. La zone de gestion distingue clairement : **profils**, **sélection pour cette famille** et **balancier**. Les cartes de profil montrent un indicateur de sélection, un endpoint non sensible et des actions secondaires compactes. Les formulaires sont regroupés par transport, accès et réglages avancés ; ils conservent les validations actuelles et les valeurs sensibles masquées.

### Diagnostic

Le diagnostic présente d’abord une carte de session avec le nombre d’événements, puis une rangée de filtres en chips. Le journal devient une chronologie respirante : niveau sous forme de badge, composant et heure sur une ligne, message lisible sous la ligne. Le partage et l’effacement sont séparés, avec l’action destructive reléguée en bas. Les secrets restent filtrés avant affichage et partage.

## Flux clés

| Flux | Chemin |
|---|---|
| Connexion | Tunnel → choisir une famille → vérifier les profils → Connecter → autorisation Android si nécessaire → état connecté ou diagnostic |
| Nouveau profil | Configuration → choisir une famille → Ajouter un profil → compléter les groupes de champs → Enregistrer → sélectionner le profil |
| Balancier | Configuration → choisir une famille → sélectionner au moins deux profils → activer le balancier → revenir au Tunnel → Connecter |
| Dépannage | Tunnel → dernier événement ou Diagnostic → filtre Erreurs → lire/coller le rapport expurgé |

## Critères de réussite

- L’état et l’action principale sont identifiables en moins de trois secondes.
- Aucun composant visuel ne modifie les providers, les profils, les secrets, les tunnels ou les mécanismes natifs.
- Les écrans utilisent exclusivement les tokens, espacements et composants du design system.
- La lisibilité reste bonne sur un écran de 360 px de large et les actions clés restent accessibles à une main.
- TypeScript, les tests existants et le build `armeabi-v7a` GitHub Actions restent valides.
