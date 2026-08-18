# Analyse de taille — APK release armeabi-v7a

Le dernier artefact release validé, produit exclusivement dans GitHub Actions par le run [`32178614899`](https://github.com/kinf744/Picko/actions/runs/32178614899), mesure **46 701 873 octets**, soit **44,54 Mio**. Par rapport au run `32171030806` (**50,86 Mio**), les optimisations de release ont retiré **6,32 Mio**. La cible de **40 Mio** (41 943 040 octets) reste dépassée de **4 758 833 octets**, soit **4,54 Mio**.

| Élément empaqueté | Taille APK compressée | Observation |
|---|---:|---|
| `libxray-v2ray.so` | 6,74 Mio | Binaire Xray/V2Ray indépendant, déjà compressé/interne et non compressible par ZIP |
| `libxray-v2rayslowdns.so` | 6,74 Mio | Binaire Xray propre à V2Ray+SlowDNS, identique mais gardé séparé par exigence d’isolation |
| `libhysteria-hysteria.so` | 6,56 Mio | Client Hysteria v1 ARMv7 construit dans GitHub Actions |
| `libuz_core.so` | 4,22 Mio | Moteur UDP-ZIVPN demandé |
| Deux `libdnstt` séparées | 6,37 Mio | Un client par famille SlowDNS, compressible par l’APK mais dupliqué pour l’isolation |
| Classes DEX | ~7,38 Mio avant optimisation | React Native, Expo et dépendances Java/Kotlin ; R8 est maintenant activé |
| Bundle JavaScript | 2,77 Mio avant optimisation | Compression du bundle maintenant activée |
| Ressources et autres bibliothèques | ~10,1 Mio | Ressources, Hermes, React Native et bibliothèques natives de support |

## Conclusion mesurée

Les moteurs de tunnel représentent l’essentiel de la taille. Les deux copies Xray constituent à elles seules environ **13,48 Mio** de l’APK compressé. Elles sont volontairement distinctes afin que Xray/V2Ray et V2Ray+SlowDNS ne partagent ni binaire runtime, ni processus, ni fichiers de configuration.

## Optimisations appliquées sans suppression de tunnel

Les mesures suivantes sont déjà actives et validées dans GitHub Actions : R8 (`minifyEnabled`), suppression de ressources inutilisées, compression du bundle JavaScript et désactivation des décodeurs GIF/WebP. Les modules Expo audio, vidéo, notifications, image et maintien d’écran ne sont pas présents dans les dépendances ni la configuration. Ces optimisations ne suppriment aucun des sept tunnels ni les binaires isolés.

## Conclusion et limite résiduelle

Le passage volontaire à l’ancienne architecture React Native a été testé, mais le build a échoué : la version retenue de `react-native-reanimated` exige `newArchEnabled=true`. Il ne s’agit donc pas d’une voie de réduction compatible sans modifier ou remplacer une dépendance centrale de l’interface.

> Avec les sept familles strictement isolées, l’objectif de moins de 40 Mio n’est pas atteignable par de simples réglages de packaging. Les deux copies Xray représentent environ **13,48 Mio** à elles seules, auxquelles s’ajoutent les deux clients dnstt séparés, Hysteria et UDP-ZIVPN. Passer sous 40 Mio imposerait soit de mutualiser des binaires partagés entre familles — contraire à l’isolation actuelle — soit de retirer une famille ou de reconstruire certains moteurs avec une réduction fonctionnelle à évaluer séparément.
