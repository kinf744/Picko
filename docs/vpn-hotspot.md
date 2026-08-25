# Hotspot Share — analyse technique et limites Android

## Architecture VPN de l'application (rappel)

- `KighmuVpnService` étend `android.net.VpnService` : interface `tun 10.0.0.2/24`, route `0.0.0.0/0`, DNS du moteur, l'app s'exclut elle-même du tunnel (`addDisallowedApplication`).
- Les 7 familles de tunnels créent des **proxys SOCKS5 locaux** ; `LocalSocksBalancer` les agréger (multi-profils) et le relais natif `ZivpnTun2Socks` pousse le trafic du tun vers ces proxys.
- Le port SOCKS courant est exposé (`KighmuVpnService.currentBalancerPort`) pour la sonde d'IP de sortie.

## Ce qu'Android permet SANS root

| Capacité | Sans root |
|---|---|
| Forcer le trafic des clients hotspot dans le tun d'un VpnService tiers | ❌ (iptables/routing réservés à root) |
| Activer/couper le hotspot par code | ❌ `TETHER_PRIVILEGED` (système) → panneau/réglages système |
| Lister les clients connectés | ❌ APIs privilégiées |
| Trafic **par client** | ❌ → total appareil via `TrafficStats` |
| Partager le tunnel d'un **VPN tiers** | ❌ le tun appartient à l'UID de son app |
| Routage automatique des clients vers un VPN actif | ✅ **selon l'appareil** : Android 11+ le fait souvent, 13+ plus systématiquement (décision du système, non contrôlable) |

## Fonctionnement livré (100 % sans root)

1. **Armement** (« Partager le VPN ») + ouverture du panneau système pour activer le point d'accès.
2. **Kill switch applicatif** : si le tunnel tombe pendant que le partage est armé → alerte immédiate + raccourci réglages (l'app ne peut pas couper le hotspot elle-même).
3. **Sonde d'IP de sortie** (`probeVpnExitIp`) : requête HTTP envoyée **dans le tunnel réel** via le SOCKS local ; l'utilisateur la compare depuis un client (api.ipify.org) pour vérifier que le trafic client passe bien par le VPN.
4. **Trafic global** de l'appareil (deltas TrafficStats), honnêteté totale sur les limites (chaque ligne d'interface l'énonce).

## Pourquoi pas de mode root ?

Décision produit : l'objectif est un fonctionnement sans root sur le parc réel de l'utilisateur. Un mode root (ip_forward + iptables fwmark/MASQUERADE + REJECT IPv6 FORWARD) reste possible ultérieurement mais n'est pas inclus.
