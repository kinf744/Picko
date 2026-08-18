# Aperçu visuel local — KIGHMU VPN

Les captures de démonstration ont été préparées dans l’aperçu web local, sans utiliser de paramètres VPS ni de secrets réels.

| Écran | État affiché | Élément vérifié |
|---|---|---|
| Configuration UDP-ZIVPN | Formulaire Host/IP, port/plage, Obfs et mot de passe | Mode historique conservé |
| Configuration SSH/SlowDNS | Serveur DNS/UDP, port, nameserver, clé publique dnstt, libellé SSH, identifiant et mot de passe | Session SSH unique, sans balancier ni tunnel parallèle |
| Tunnel | Écran d’accueil avec action de connexion et accès rapide à la configuration/diagnostic | Point d’entrée commun aux deux modes |
| Diagnostic | Journal local et filtres Tous/Erreurs/Avertissements/Connexion | Secrets masqués lors de l’affichage et du partage |

Les données visibles dans le formulaire SlowDNS sont exclusivement fictives et ne doivent pas être utilisées pour établir une connexion.

## Évolution multi-profils

Le catalogue de six tunnels utilise désormais une grille visible sans défilement horizontal sur un écran mobile de 390 px : UDP-ZIVPN, SSH/SlowDNS, Hysteria UDP, V2Ray DNS, V2Ray+SlowDNS et Xray/V2Ray. Le mode choisi est la seule famille pouvant être connectée ; le balancier ne reçoit que les profils sélectionnés de cette famille.
