# Analyse d’intégration multi-profils et multi-tunnels

## Portée demandée

L’application doit proposer des profils séparés et un balancier optionnel **dans le tunnel sélectionné**, pour les familles UDP-ZIVPN, SSH/SlowDNS, Hysteria UDP, V2Ray DNS, V2Ray+SlowDNS et Xray/V2Ray. Une seule famille de tunnel doit posséder le TUN Android à la fois ; ses profils sélectionnés peuvent fournir plusieurs sorties SOCKS locales derrière un balancier propre à cette famille.

## État de l’application KIGHMU

Le code actuel ne dispose que de deux modes (`zivpn`, `slowdns`) et d’un profil global. Le pont TypeScript envoie déjà un JSON unique au module natif, ce qui permet une migration vers un contrat versionné. Le `VpnService` n’héberge qu’un processus UDP-ZIVPN ou un moteur SSH/SlowDNS ; il faudra le remplacer par un routeur de familles de tunnel et un registre de sessions actif.

## Éléments confirmés dans Zamois-tun

Référence analysée en lecture seule : <https://github.com/kinf744/Zamois-tun> (branche `main`, commit observé `d64405f`).

| Famille demandée | Mécanisme de référence | Ressource ARMv7 confirmée | Décision d’intégration |
|---|---|---:|---|
| UDP-ZIVPN | Moteurs par profil + SOCKS local + balancier | `libuz_core.so` | Conserver le moteur existant et ajouter un orchestrateur isolé |
| SSH/SlowDNS | Sessions dnstt + SSH + SOCKS local par profil | dnstt construit dans notre workflow | Ajouter un orchestrateur dédié, sans réemploi d’état entre profils |
| Hysteria UDP | Binaire client SOCKS par profil + balancier | Workflow de compilation officiel ARMv7 présent | Construire une copie dédiée via GitHub Actions |
| Xray/V2Ray | Xray local, config JSON ou lien, SOCKS local | `libxray.so` ARMv7 présent | Isoler la configuration et le binaire de la famille |
| V2Ray DNS | La référence repose sur Xray avec config JSON spécifique | `libxray.so` ARMv7 présent | Créer un moteur et un espace de config propres |
| V2Ray+SlowDNS | dnstt local relié à Xray local | dnstt + `libxray.so` | Créer un orchestrateur combiné, avec fichiers runtime propres |

## Contraintes d’isolement retenues

Chaque famille aura une collection de profils indépendante, des secrets stockés sous des clés dédiées et des fichiers runtime propres. Les processus recevront des noms de fichier de configuration et des ports locaux uniques, attachés à leur famille et leur identifiant de profil. Le balancier ne recevra que les ports SOCKS produits par la famille sélectionnée ; il ne mélange jamais les sorties de deux familles de tunnel.

Le relais TUN Android reste nécessairement unique, car Android n’autorise qu’une interface VPN active pour l’application. Il pointera vers le SOCKS unique de la famille choisie, directement pour un profil ou via le balancier de cette famille pour plusieurs profils. Cette infrastructure commune ne partage ni secrets, ni profils, ni processus de tunnel.

## Points à corriger par rapport à la référence

Le balancier de référence ouvre un health check externe vers `1.1.1.1:443` et comporte des nettoyages globaux agressifs. L’intégration KIGHMU doit éviter les `killall`, `pkill` et les ports constants, car ils compromettraient l’indépendance des moteurs. Elle utilisera des ports éphémères et un arrêt ciblé de ses propres processus.

Le dépôt de référence contient le workflow de construction de Hysteria v1.3.5 ARMv7, mais pas le fichier `libhysteria.so` dans ses bibliothèques packagées. KIGHMU devra donc le produire dans GitHub Actions avant l’assemblage APK, sans compilation locale. Les bibliothèques et fichiers de runtime des familles Xray/V2Ray seront nommés séparément pour ne pas être partagés entre les modes demandés.
