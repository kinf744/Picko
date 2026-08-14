# Diagnostic du timeout KIGHMU — 14 août 2026

## Résultat de la capture synchronisée

Une capture de 90 secondes a été réalisée sur le VPS pendant un essai Android synchronisé, le 14 août 2026 entre environ 11:20 et 11:22 UTC. Elle contient 47 434 paquets UDP, mais aucun paquet entrant vers `204.152.219.23:25000` : le comptage ciblé `udp and dst host 204.152.219.23 and dst port 25000` retourne **0**. Le journal systemd de KIGHMU ne contient aucune entrée correspondant à cette tentative.

La capture globale contient surtout du trafic d’autres clients et services. Elle ne permet donc pas d’identifier un handshake Android arrivé sur KIGHMU. Le timeout Android est cohérent avec l’absence de réponse serveur, mais la cause immédiate peut être une adresse/port client incorrecte ou un paquet bloqué avant le VPS.

## État serveur vérifié

Le processus actif est `/usr/local/bin/kighmu server --config /etc/kighmu/config.yaml` et écoute sur `*:25000`. Le service possède un drop-in `porthop.conf` qui charge `/etc/kighmu/porthop.nft`. Les règles nftables actives redirigent UDP `20000-24999` et `25001-50000` vers `25000`. UDP-ZIVPN sur `5667` n’a pas été modifié.

## Comparaison avec Hysteria 2

La documentation officielle Hysteria 2 autorise une adresse client multi-port sous la forme `host:20000-50000`, et recommande une section `transport.udp` avec `hopInterval` (par défaut 30 secondes). Elle documente aussi `auth: username:password` pour un serveur `userpass`, ainsi que `obfs.type: salamander` et `obfs.salamander.password`.

Le YAML généré par `KighmuVpnService.kt` utilise actuellement `server: 'host:port'`, ce qui peut accepter la plage si la valeur reçue est conservée telle quelle, mais il ne déclare pas explicitement `transport.udp`. La prochaine correction candidate est d’ajouter cette section explicitement et de vérifier que le champ port n’est ni normalisé ni encodé d’une manière qui détruit le format `20000-50000`.

## Conclusion intermédiaire

Le serveur et le port hopping sont présents. Le test synchronisé ne montre toutefois aucun datagramme entrant sur le port d’écoute, et aucun handshake ne peut donc avoir été traité par KIGHMU. Il faut corriger ou rendre explicite la configuration client, puis refaire une capture synchronisée. Aucune modification n’a été apportée à UDP-ZIVPN.

## Références

[1]: https://v2.hysteria.network/docs/advanced/Port-Hopping/ "Hysteria 2 — Port Hopping"
[2]: https://v2.hysteria.network/docs/advanced/Full-Client-Config/ "Hysteria 2 — Full Client Config"
