# Profils de tunnel, SSH SlowDNS et équilibrage

## Objectif

Picko doit pouvoir conserver plusieurs profils locaux, créer un profil par un dialogue simple, puis établir une connexion VPN au moyen d’un ou plusieurs tunnels sélectionnés. Les méthodes prises en charge sont **ZiVPN UDP** et **SSH SlowDNS**. Lorsque les deux méthodes sont sélectionnées, le trafic est distribué par flux entre leurs proxys SOCKS locaux et les nouveaux flux sont basculés vers les tunnels encore sains.

## Modèle de profil

Chaque profil comprend un identifiant, un nom, une méthode, un état de sélection et les paramètres propres à la méthode. Les données non sensibles sont conservées dans `AsyncStorage`. Les secrets sont stockés par identifiant de profil dans `SecureStore` et ne sont jamais ajoutés aux journaux ni aux exports de diagnostic.

| Méthode | Paramètres visibles | Secrets |
| --- | --- | --- |
| `zivpn-udp` | Nom, hôte, port | Obfs, mot de passe |
| `ssh-slowdns` | Nom, hôte SSH, port SSH, utilisateur SSH, résolveur DNS, nom de domaine, clé publique DNSTT | Mot de passe SSH |

## Dialogue de création

L’écran Configuration présente les profils existants, un choix des profils actifs et un bouton **Ajouter un profil**. Ce bouton ouvre un dialogue léger proposant exactement deux actions : **ZiVPN UDP** et **SSH SlowDNS**. Le second dialogue affiche seulement les champs nécessaires à la méthode retenue. La même présentation est utilisée pour modifier un profil existant.

## Routage et basculement

Le module natif reçoit un document JSON décrivant les profils actifs et le mode de routage. Il démarre chaque tunnel, attend son port SOCKS local et transmet la liste des ports disponibles à un balancier local. Le TUN Android se connecte uniquement au balancier.

Le balancier sélectionne les ports actifs en rotation par connexion. Il teste périodiquement le handshake SOCKS de chaque port et retire un port après plusieurs échecs consécutifs. Un port redevenu sain est réintégré. Cette stratégie évite de couper les flux déjà établis : seuls les nouveaux flux changent de tunnel. Si un seul tunnel est disponible, le balancier reste actif et sert ce tunnel unique.

> L’équilibrage distribue des **connexions** ; il ne tente pas de déplacer une connexion TCP déjà ouverte, ce qui préserverait mal l’intégrité du flux.

## Tunnel SSH SlowDNS

Le moteur démarre le client DNSTT sur une boucle locale, connecte SSH à ce flux local à l’aide de `sshlib`, puis crée un transfert dynamique SOCKS. Les sockets DNSTT et SSH sont explicitement protégées de la boucle VPN Android. Le binaire DNSTT ciblé est l’artefact `armeabi-v7a` publié par le projet de référence ; son empreinte SHA-256 est vérifiée avant son ajout au projet.

## Contraintes de sûreté

Les valeurs sensibles sont masquées dans les journaux. Les paramètres JSON ne sont écrits que dans le cache privé de l’application et sont supprimés à l’arrêt. Le module continue de limiter le build Android à `armeabi-v7a`, afin d’être cohérent avec les binaires natifs déjà sélectionnés dans Picko.
