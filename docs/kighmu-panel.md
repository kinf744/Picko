# Panneau de comptes KIGHMU Android

Le panneau KIGHMU gère uniquement les comptes du serveur Hysteria 2 utilisés par l’application Android. Il ne lit, ne modifie ni ne supprime les comptes SSH, ZIVPN, V2Ray ou les services UDP-ZIVPN existants.

## Accès

Le service écoute en HTTPS sur le port `9443`. Après l’installation, ouvrir `https://IP_DU_VPS:9443` dans un navigateur et accepter l’avertissement de certificat auto-signé réservé au test. Saisir ensuite le code d’administration défini lors du déploiement, soit `kighmu2` pour la première installation demandée.

Le code d’administration et la clé de session sont stockés uniquement dans `/etc/kighmu/panel.env` avec les permissions `0600`. Ils ne sont ni affichés dans le panneau ni ajoutés au dépôt. Le panneau applique une limite de cinq échecs de connexion par adresse IP pendant cinq minutes et utilise des cookies de session HTTPS `Secure`, `HttpOnly` et `SameSite=Strict`.

## Comptes client

Le panneau crée et révoque des comptes Hysteria 2 `userpass`. Après création d’un utilisateur `alice` avec le mot de passe choisi, entrer les valeurs suivantes dans l’APK :

| Champ Android | Valeur |
|---|---|
| Host/IP | Adresse du VPS |
| Port | `20000-50000` |
| Obfs | Valeur Salamander déjà fournie pour le serveur |
| Password | `alice:mot_de_passe_choisi` |

Le premier compte créé déclenche la migration contrôlée de l’authentification KIGHMU depuis le mot de passe unique vers `userpass`. Le serveur est redémarré, puis le panneau vérifie son état. En cas d’échec, il restaure la configuration KIGHMU et la liste précédente de comptes.

## Déploiement

Le script doit être exécuté avec le mot de passe d’administration transmis via une variable d’environnement, et non enregistré dans l’historique Git :

```bash
sudo PANEL_ADMIN_PASSWORD='votre-code' bash deploy-kighmu-panel.sh /chemin/vers/kighmu-panel.py
```

Le service est nommé `kighmu-panel.service`. Son diagnostic est disponible avec :

```bash
sudo systemctl status kighmu-panel --no-pager
sudo journalctl -u kighmu-panel -n 100 --no-pager
```

## Menu terminal `kighmu2`

Pour une gestion directe depuis une session root SSH sur le VPS, la commande `kighmu2` ouvre un menu interactif. Il permet de créer, lister et révoquer les mêmes comptes KIGHMU Android, d’afficher le profil à saisir dans l’APK et de contrôler l’état des services. Il ne demande pas le code du panneau web, car l’accès root SSH constitue déjà l’autorisation d’administration du serveur.

```bash
kighmu2
```

Les commandes `kighmu2 --list` et `kighmu2 --status` sont disponibles pour un contrôle non interactif. Le menu ne touche pas aux comptes SSH, ZIVPN ou V2Ray, et refuse de révoquer le dernier compte KIGHMU Android actif.
