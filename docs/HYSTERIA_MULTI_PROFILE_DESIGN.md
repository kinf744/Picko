# Extension Hysteria et correction ZiVPN

## Correctif de création ZiVPN

La validation d’un profil ZiVPN assigne actuellement `undefined` à la clé `name` lorsque le nom est valide. La fonction retourne alors un objet dont `Object.keys()` n’est jamais vide, ce qui bloque systématiquement l’enregistrement dans l’écran de configuration. La validation devra éliminer toutes les entrées sans message avant son retour, comme le fait déjà le chemin SSH SlowDNS.

Le contrôle natif devra aussi accepter une plage de ports ZiVPN lorsque l’interface l’accepte. Les moteurs ZiVPN et Hysteria recevront la valeur telle qu’elle est définie dans le profil, sans effectuer de conversion ambiguë.

## Modèle Hysteria

Un nouveau type `hysteria-udp` sera ajouté au modèle de profil commun. Il comportera un hôte Hysteria, un port ou une plage de ports, un mot de passe d’authentification, les débits montant et descendant en Mbps, ainsi qu’une clé d’obfuscation facultative. Les valeurs d’authentification et d’obfuscation seront stockées uniquement dans le stockage sécurisé, avec les secrets ZiVPN et SSH existants.

Les règles de validation exigeront l’hôte, une valeur de port ou plage valide, le mot de passe, et deux débits strictement positifs. L’obfuscation restera facultative, conformément au modèle du dépôt de référence.

## Exécution native et équilibrage

Le moteur `HysteriaTunnel` démarrera le client Hysteria local, avec un fichier JSON temporaire propre au profil. Ce client ouvrira un SOCKS5 sur une boucle locale et ne sera considéré sain qu’après une négociation SOCKS effective. Le moteur rejoindra ensuite la liste `LocalTunnel` existante.

`KighmuVpnService` démarrera séquentiellement les profils ZiVPN, SSH SlowDNS et Hysteria actifs. Le `LocalSocksBalancer` existant restera l’unique point d’entrée du relais TUN→SOCKS : il distribuera les nouveaux flux en rotation entre les SOCKS locaux sains et retirera puis réintégrera un tunnel selon ses contrôles de santé. Les flux en cours ne seront pas déplacés au milieu d’une session.

## Interface et validation

Le dialogue « Ajouter un profil » affichera une troisième option Hysteria UDP. Son formulaire simple présentera seulement les paramètres nécessaires au tunnel : nom, hôte, port ou plage, mot de passe, débit montant, débit descendant et Obfs facultatif. Les messages d’erreur seront affichés sous le champ concerné.

Les tests couvriront la création et la validation d’un profil ZiVPN complet, l’absence d’erreur fantôme quand tous les champs sont valides, les profils Hysteria valides et les erreurs Hysteria essentielles.
