# Optimisation client des tunnels

## Périmètre

Cette passe optimise exclusivement l’exécution **côté Android**. Les sept familles conservent leurs processus, leurs fichiers de configuration, leurs secrets et leurs ports locaux indépendants. Le VPS, les services existants et le binaire/configuration UDP-ZIVPN demeurent inchangés.

| Famille | Optimisation retenue | Limite volontaire |
|---|---|---|
| UDP-ZIVPN | Aucune mutation du binaire ni de sa configuration ; conservation du relais et du cycle de vie déjà validés | La consigne de ne pas toucher UDP-ZIVPN prévaut sur toute modification de paramètres internes |
| SSH/SlowDNS | Pont local TCP optimisé : sockets locales configurées, tampon de 64 Kio, absence de flush redondant et délais conservateurs | La cadence et le protocole DNS restent ceux de `dnstt` et du serveur existant |
| Hysteria UDP | Configuration client explicite : reprise de connexion courte, délai de handshake, maintien de session SOCKS et découverte MTU active ; débits conservés par profil | Les débits doivent refléter la connexion réelle du téléphone ; aucune valeur artificiellement élevée n’est imposée |
| HTTP Proxy+Payload | Délais limités uniquement pendant le handshake HTTP, puis flux durable sans timeout inactif ; pont SSH local optimisé | Le payload demeure entièrement contrôlé par le profil et n’est pas réécrit hors variables prévues |
| SSH SSL/TLS | Délai limité pendant le handshake TLS, validation TLS/SNI préservée et pont SSH local optimisé | Aucun contournement de validation de certificat ou abaissement de TLS n’est introduit |
| V2Ray+SlowDNS | Supervision locale `dnstt`, SOCKS Xray avec UDP activé et attente de démarrage adaptée à ARMv7 | La configuration Xray fournie par l’utilisateur reste la source de vérité du protocole sortant |
| Xray/V2Ray | SOCKS local exclusivement lié à `127.0.0.1`, UDP explicite et supervision plus tolérante au démarrage | Aucun paramètre de transport, chiffrement, Reality ou TLS du JSON utilisateur n’est remplacé |

## Améliorations communes

Les ponts locaux TCP des familles SSH/SlowDNS, HTTP Proxy+Payload, SSH SSL/TLS et le balancier intra-famille utiliseront une configuration homogène : `TCP_NODELAY`, maintien de connexion, tailles de tampon adaptées au trafic local et copies de flux par blocs de 64 Kio. La sélection de secours du balancier sera également corrigée pour parcourir chaque profil disponible une seule fois, sans saut induit par le compteur round-robin.

> Les améliorations de transport local réduisent la surcharge du client. Elles ne garantissent pas un débit donné : la radio mobile, le chemin réseau, le serveur distant et la configuration propre à chaque profil restent déterminants.

## Réglages Hysteria

Hysteria v1 permet de définir côté client les débits annoncés, les tentatives de démarrage, le délai de handshake, les délais SOCKS, la découverte PMTU et Fast Open. La documentation indique que les débits annoncés doivent correspondre au débit réel de la connexion cliente ; des valeurs arbitrairement élevées peuvent dégrader les performances. Fast Open reste désactivé, car il raccourcit un aller-retour au prix d’une sémantique SOCKS/TUN dégradée. [1]

## Validation prévue

Les modifications seront validées par TypeScript, les tests de profils et un build release `armeabi-v7a` dans GitHub Actions. Une mesure de débit ou de latence utile nécessitera ensuite des essais comparatifs sur le même téléphone et le même réseau, sans modifier le VPS.

## Références

[1]: https://v1.hysteria.network/docs/advanced-usage/ "Hysteria v1 — Advanced Usage"
