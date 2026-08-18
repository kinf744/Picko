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

Le catalogue de cinq tunnels utilise désormais une grille visible sans défilement horizontal sur un écran mobile de 390 px : UDP-ZIVPN, SSH/SlowDNS, Hysteria UDP, V2Ray+SlowDNS et Xray/V2Ray. Le mode choisi est la seule famille pouvant être connectée ; le balancier ne reçoit que les profils sélectionnés de cette famille.

## Aperçu SSH/SlowDNS multi-profils

La sélection de la carte SlowDNS ouvre une collection indépendante : le profil de démonstration affiche uniquement son nom et son endpoint réservé, tandis que les identifiants, la clé publique et le mot de passe restent masqués. L’écran rappelle que le balancier round-robin est disponible uniquement à partir de deux profils SlowDNS sélectionnés et ne peut inclure aucun profil des cinq autres familles.

Le formulaire illustré présente dans l’ordre : le nom du profil, le serveur et le port DNS/UDP, le nameserver, la clé publique dnstt, le libellé SSH, l’identifiant SSH et un mot de passe rendu visuellement masqué. Les hôtes et les valeurs de clé sont réservés à la démonstration et ne correspondent pas à une infrastructure utilisateur.

Sur l’onglet Tunnel, les cinq cartes restent visibles simultanément. La sélection SlowDNS affiche son profil isolé ; en touchant Hysteria, la carte passe au vert et l’écran bascule vers la collection Hysteria vide sans modifier la collection SlowDNS. Ce comportement illustre l’absence de mélange entre familles et le balancier désactivé tant qu’une collection n’a pas deux profils sélectionnés.

## Extension HTTP Proxy+Payload et SSH SSL/TLS

Le catalogue mobile présente désormais sept cartes visibles à une main : UDP-ZIVPN, SSH/SlowDNS, Hysteria UDP, HTTP Proxy+Payload, SSH SSL/TLS, V2Ray+SlowDNS et Xray/V2Ray. Les deux nouveaux tunnels s’insèrent dans la même grille, mais possèdent chacun leur collection de profils et leur réglage de balancier isolés.

## Sélecteur à cases à cocher

L’onglet Tunnel a remplacé la grille de cartes par un panneau sombre compact. Les sept familles s’affichent avec une case à cocher carrée ; une seule case est active à la fois et désigne la famille reliée au bouton principal. Le bouton Connecter/Déconnecter se situe directement sous la grille, tandis que la carte des profils et du balancier de la famille sélectionnée reste visible plus bas.

## Aperçu de configuration des sept familles

Les premières vues de démonstration confirment que Hysteria UDP et UDP-ZIVPN ouvrent deux collections distinctes, chacune avec son intitulé, son compteur de profils, son interrupteur de balancier et son état vide local. Aucune donnée d’un profil, aucun secret et aucune sortie SOCKS ne passe d’une collection à l’autre.

Le formulaire UDP-ZIVPN de démonstration montre un nom de profil, un hôte/adresse IP, un port ou une plage, l’Obfs et le mot de passe. Les champs sensibles sont de type mot de passe et aucun exemple réel n’a été saisi.

La vue SSH/SlowDNS présente séparément le serveur DNS/UDP, le port DNS, le nameserver, la clé publique dnstt, le libellé SSH, l’identifiant et le mot de passe. Les valeurs affichées reposent sur les réseaux de documentation et le mot de passe reste masqué dans l’interface native.

Hysteria UDP possède sa propre collection vide dans l’aperçu, avec son libellé de haute performance, son bouton de création de profil et son balancier local. La bascule depuis SlowDNS ne transfère ni le profil DNS sélectionné ni ses valeurs de connexion.

Le formulaire Hysteria UDP affiche un hôte, un port ou une plage UDP, l’authentification, un Obfs facultatif et les débits montant/descendant. Les secrets d’authentification et d’Obfs sont rendus dans des champs masqués.

Le formulaire HTTP Proxy+Payload contient le proxy HTTP, son port, un payload HTTP avec les variables documentées, puis la cible SSH, son port, l’identifiant et le mot de passe. Le payload présenté est un exemple générique `CONNECT` et le mot de passe ne s’affiche pas en clair.

La collection SSH SSL/TLS possède un libellé propre, un balancier local et ne partage aucune sélection avec HTTP Proxy+Payload. Son formulaire de démonstration est préparé séparément.

Le formulaire SSH SSL/TLS montre l’hôte et port TLS, un SNI facultatif, puis les identifiants SSH. L’interface précise que le certificat TLS est validé avant l’ouverture de la session SSH.

Le formulaire V2Ray+SlowDNS contient uniquement le serveur DNS/UDP, le port, le nameserver, la clé publique dnstt et la configuration V2Ray. Il reste distinct de V2Ray DNS, qui n’est plus proposé dans le catalogue.

La sélection Xray/V2Ray ouvre une septième collection sans profil ni balancier partagé avec V2Ray+SlowDNS. La carte Xray et son libellé « Liens ou JSON Xray/V2Ray » rendent sa configuration indépendante visible dans le même écran.

Le formulaire Xray/V2Ray propose un nom de profil puis deux formats alternatifs : un lien `vless://`, `vmess://` ou `trojan://`, ou une configuration JSON. Aucun lien ni secret réel n’a été renseigné dans l’aperçu.
