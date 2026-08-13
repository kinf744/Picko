# Comparaison passive des handshakes UDP — KIGHMU et UDP-ZIVPN

**Date :** 13 août 2026. Cette analyse a été conduite sur le VPS autorisé, sans redémarrer ni modifier le service UDP-ZIVPN. Les secrets d’Obfs, d’authentification et les contenus de paquets ne figurent pas dans ce document.

## Méthode

KIGHMU a été testé localement avec un compte Android `userpass` de test, sur `127.0.0.1:25000`, tandis qu’une capture `tcpdump` était réalisée sur l’interface loopback. La commande `kighmu ping` a ensuite établi une connexion TCP vers `1.1.1.1:443` via le proxy. Pour UDP-ZIVPN, l’analyse repose sur la trace serveur existante `zivpn_client184_20s.txt`, produite lors d’un trafic client antérieur et lue passivement.

| Point de comparaison | KIGHMU observé | UDP-ZIVPN observé |
|---|---|---|
| Moteur serveur | KIGHMU basé sur Hysteria 2 | Binaire UDP-ZIVPN non modifié |
| Authentification testée | `userpass`, compte identifié par le serveur | Non décodable dans la trace chiffrée/obfusquée |
| Obfuscation KIGHMU | Salamander, validée par connexion serveur | Mécanisme interne non déterminé par la capture seule |
| Handshake | Connexion serveur confirmée par le journal KIGHMU | Paquets initiaux courts visibles, mais contenu applicatif non interprétable |
| Port d’écoute KIGHMU | UDP `25000` | UDP-ZIVPN local `5667` derrière ses redirections existantes |
| Port hopping | Plage publique KIGHMU `20000-50000` redirigée vers `25000` | Trace historique : 226 ports de destination distincts observés, notamment autour de `7158-7197` |

## Résultats observables

Le test KIGHMU a réussi. Le client a signalé la connexion au serveur, puis la connexion à la destination TCP avec un délai de contrôle de **2,08 ms** sur loopback. Le journal serveur a identifié le compte de test, ce qui confirme que le handshake Hysteria 2, Salamander et `userpass` ont été acceptés. Un avertissement TCP ultérieur vers la destination distante ne remet pas en cause le handshake : la connexion proxy avait déjà été établie.

La capture KIGHMU a montré **15 paquets UDP** sur loopback pendant l’échange initial. Les datagrammes client-vers-serveur observés étaient principalement de **1 258 octets** de charge UDP, tandis que les réponses courtes du serveur étaient principalement de **50 octets**, avec une réponse de **99 octets**. Les sommes de contrôle UDP signalées comme incorrectes sont attendues dans une capture locale lorsque le calcul est différé par l’offload réseau.

La trace UDP-ZIVPN existante contient **786 paquets UDP** et **226 ports de destination** distincts. Les paquets client-vers-serveur initiaux visibles dans l’échantillon sont courts, typiquement de **47 à 56 octets**, et les réponses serveur sont très souvent de **1 447 octets**. Cette forme est cohérente avec un trafic utilisant un port hopping et des datagrammes proches du MTU ; elle ne permet pas, à elle seule, d’identifier de façon fiable le protocole applicatif ou de reconstruire l’authentification.

> La comparaison porte sur des métadonnées : ports, sens, taille, cadence et journaux de service. Les charges QUIC et UDP-ZIVPN sont chiffrées ou obfusquées ; elles ne doivent pas être interprétées comme du texte ni servir à extraire des identifiants.

## Conclusion pratique

KIGHMU dispose maintenant d’un handshake Hysteria 2 validé localement avec Salamander et `userpass`, ainsi que d’une plage de ports publique configurée séparément. UDP-ZIVPN présente dans la trace historique un comportement de dispersion de ports et des paquets proches du MTU, mais son format interne exact reste non démontré par une analyse passive.

La validation décisive reste un essai **depuis l’APK Android** sur la plage `20000-50000`, avec un compte créé via `kighmu2`. Cette étape permettra de confirmer simultanément le TUN Android, l’authentification userpass, Salamander et le port hopping externe.
