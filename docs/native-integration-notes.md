# Notes d’intégration native

La documentation Android indique que `VpnService.prepare(Context)` doit être appelé avant le démarrage, qu’un utilisateur doit autoriser la première connexion, qu’un seul VPN peut être actif à la fois et que le service doit créer une interface avec `Builder.establish()`. Le service doit être déclaré avec `android.permission.BIND_VPN_SERVICE` et l’action `android.net.VpnService`.

Source : [Android VpnService](https://developer.android.com/reference/android/net/VpnService).

La documentation Expo indique qu’Expo Go ne peut pas charger du code natif personnalisé. Un development build ou un build de production personnalisé est nécessaire. Pour un module utilisé par une seule application, Expo recommande un module local dans `modules/`, écrit avec l’Expo Modules API et du Kotlin côté Android.

Sources : [Expo Modules API](https://docs.expo.dev/modules/overview/) ; [Add custom native code](https://docs.expo.dev/workflow/customizing/).

Le binaire KIGHMU Hysteria 2 possède déjà un mode `tun` basé sur `github.com/apernet/sing-tun`. Son API accepte un champ `FileDescriptor`, qui permet de viser le descripteur de l’interface Android VpnService. La branche native de développement a été étendue pour transmettre ce champ depuis la configuration YAML jusqu’à `tun.Options`. Le binaire ARMv7 recompilé porte l’empreinte SHA-256 `c0290fb4bf18eca19f3aee157a5125d6231b5f9d9cb6a74bfc8ace19aa0ae000`.

La validation réelle reste obligatoire : il faudra construire un APK avec module natif, installer sur Android armeabi-v7a, autoriser le VPN, vérifier que le descripteur transmis au processus Go reste ouvert après exec, puis tester le handshake et le trafic TCP/UDP. Tant que ces essais ne sont pas réussis, l’application ne doit pas être déclarée prête.
