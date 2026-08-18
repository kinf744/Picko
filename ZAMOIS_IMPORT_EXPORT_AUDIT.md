# Audit comparatif — import et export Zamois-tun

Le dépôt [Zamois-tun](https://github.com/kinf744/Zamois-tun) sépare les trois entrées du menu global : **importer**, **exporter** et **réinitialiser**. Son menu à trois points ouvre des activités distinctes pour l’import et l’export plutôt qu’une fenêtre compacte unique. Cette structure est plus adaptée lorsqu’un export contient plusieurs choix. [1]

| Élément observé | Intérêt pour KIGHMU VPN | Décision |
|---|---|---|
| Écran dédié à l’import | Clarifie le choix de fichier et le résultat de l’import | À reprendre sous forme d’écran dédié |
| Écran dédié à l’export | Donne assez d’espace au choix des tunnels et aux options | À reprendre sous forme d’écran dédié |
| Cases par tunnel | Correspond à la sélection par famille demandée | Déjà présente dans KIGHMU ; à déplacer vers l’écran dédié |
| Nom de fichier | Rend le partage plus compréhensible | À ajouter |
| Confirmation d’import | Évite l’écrasement silencieux | Déjà présente ; à conserver |
| Export cloud avec jeton GitHub | Ajouterait des secrets tiers, un transfert réseau et une dépendance distante | Écarté |
| Mot de passe d’export constant | N’offre pas une protection suffisante pour un fichier partagé | Écarté |
| Verrouillage matériel/opérateur | Réduit la portabilité et n’est pas nécessaire à un export personnel multi-profils | Écarté |

## Correction retenue

KIGHMU VPN conservera un **seul menu à trois options**, mais l’import et l’export ouvriront des écrans dédiés. L’export permettra de choisir une ou plusieurs familles de tunnel, de définir le nom du fichier et de décider explicitement si les secrets sont inclus. L’import restera local, limité à un JSON KIGHMU VPN validé, avec aperçu du nombre de profils et confirmation Ajouter ou Remplacer.

> Les fichiers standards ne contiendront pas de secrets. L’inclusion des secrets restera volontaire et explicitement signalée avant le partage.

## Références

[1] [Menu principal Zamois-tun](https://github.com/kinf744/Zamois-tun/blob/main/app/src/main/java/com/kighmu/vpn/ui/activities/MainActivity.kt)

[2] [ImportActivity Zamois-tun](https://github.com/kinf744/Zamois-tun/blob/main/app/src/main/java/com/kighmu/vpn/ui/activities/ImportActivity.kt)

[3] [ExportActivity Zamois-tun](https://github.com/kinf744/Zamois-tun/blob/main/app/src/main/java/com/kighmu/vpn/ui/activities/ExportActivity.kt)

[4] [ConfigManager Zamois-tun](https://github.com/kinf744/Zamois-tun/blob/main/app/src/main/java/com/kighmu/vpn/config/ConfigManager.kt)
