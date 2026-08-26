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
5. **Réseau dédié Wi-Fi Direct (technique PdaNet, confirmée par analyse de l'APK officiel)** : `WifiP2pManager.createGroup()` crée le réseau `DIRECT-xx-…` sans hotspot système ni permission privilégiée ; adresse du propriétaire FIXE `192.168.49.1` ; SSID/passphrase lus via `requestGroupInfo`. Permissions : `NEARBY_WIFI_DEVICES` (13+) ou `ACCESS_FINE_LOCATION` (≤12), demandées à l'exécution.
6. **Proxy de partage LAN** (`LanShareGateway`) : un seul port TCP sur `0.0.0.0` parlant **HTTP CONNECT/forme absolue** (réglages proxy Wi-Fi Android/iOS) **et SOCKS5** (PC/apps, détection au premier octet 0x05). Chaque connexion cliente est relayée vers le balancier local → tunnels actifs : le trafic sort par le VPN **et le DNS des clients est résolu côté tunnel** (anti-fuite). C'est la méthode de partage la plus fiable sans root car elle ne dépend pas du routage système : les clients se connectent volontairement au proxy.
7. **Script PAC** : la passerelle répond `200` avec un script `FindProxyForURL` à toute requête HTTP locale (`/wpad.dat` ou navigation vers `http://<ip>:<port>/`) — configuration client en un seul champ sur Windows/ChromeOS (même mécanisme que le PAC de PdaNet).
8. **Port par défaut 8000** (port historique PdaNet) ; IP affichée en priorité : `192.168.49.1` quand le réseau Wi-Fi Direct est actif.

## Pourquoi pas de mode root ?

Décision produit : l'objectif est un fonctionnement sans root sur le parc réel de l'utilisateur. Un mode root (ip_forward + iptables fwmark/MASQUERADE + REJECT IPv6 FORWARD) reste possible ultérieurement mais n'est pas inclus.
