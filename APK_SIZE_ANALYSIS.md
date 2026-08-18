# Analyse de taille — APK release armeabi-v7a

L’artefact release du run GitHub Actions `32171030806` mesure **53 331 308 octets**, soit **50,86 Mio**. L’objectif de 40 Mio correspond à 41 943 040 octets : l’APK dépasse donc la cible de **10,86 Mio**.

| Élément empaqueté | Taille APK compressée | Observation |
|---|---:|---|
| `libxray-v2ray.so` | 6,74 Mio | Binaire Xray/V2Ray indépendant, déjà compressé/interne et non compressible par ZIP |
| `libxray-v2rayslowdns.so` | 6,74 Mio | Binaire Xray propre à V2Ray+SlowDNS, identique mais gardé séparé par exigence d’isolation |
| `libhysteria-hysteria.so` | 6,56 Mio | Client Hysteria v1 ARMv7 construit dans GitHub Actions |
| `libuz_core.so` | 4,22 Mio | Moteur UDP-ZIVPN demandé |
| Deux `libdnstt` séparées | 6,37 Mio | Un client par famille SlowDNS, compressible par l’APK mais dupliqué pour l’isolation |
| Classes DEX | 7,38 Mio | React Native, Expo et dépendances Java/Kotlin ; R8 est désactivé dans la version analysée |
| Bundle JavaScript | 2,77 Mio | Stocké sans compression dans l’APK actuel |
| Ressources et autres bibliothèques | ~10,1 Mio | Ressources, Hermes, React Native et bibliothèques natives de support |

## Conclusion mesurée

Les moteurs de tunnel représentent l’essentiel de la taille. Les deux copies Xray constituent à elles seules environ **13,48 Mio** de l’APK compressé. Elles sont volontairement distinctes afin que Xray/V2Ray et V2Ray+SlowDNS ne partagent ni binaire runtime, ni processus, ni fichiers de configuration.

## Optimisations sans suppression de tunnel

Les mesures suivantes peuvent être appliquées puis validées exclusivement via GitHub Actions : activer R8 (`minifyEnabled`) et la suppression de ressources inutilisées, compresser le bundle JavaScript et exclure les décodeurs GIF/WebP qui ne sont utilisés par aucune ressource applicative. Ces optimisations visent le code, le bundle et les dépendances facultatives ; elles ne suppriment aucun des sept tunnels ni les binaires isolés.

> L’objectif de moins de 40 Mio dépendra du gain réel obtenu avec R8 et la compression du bundle. Si le seuil reste dépassé, la contrainte déterminante sera l’isolement des deux copies Xray et des deux clients dnstt ; les retirer ou les mutualiser réduirait la taille mais contredirait l’exigence actuelle d’indépendance des fichiers de tunnel.
