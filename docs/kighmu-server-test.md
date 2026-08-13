# Serveur KIGHMU de test pour Android

Le fichier joint par l’utilisateur installe **Hysteria 1.3.4** et génère une configuration JSON Hysteria 1. Il n’est pas compatible avec le client Android KIGHMU actuel : l’application démarre un client Hysteria 2, avec une authentification par mot de passe et l’obfuscation Salamander.

Le script `scripts/deploy-kighmu-server.sh` prépare un service `kighmu.service` indépendant. Il ne désactive pas UFW, ne supprime pas de règles existantes, ne crée pas de redirection NAT de plage de ports et refuse d’écraser un service KIGHMU déjà présent. Il ne télécharge pas non plus de binaire : le binaire serveur KIGHMU amd64 validé doit être fourni explicitement.

## Préparation sûre

Avant toute exécution, vérifier que le binaire transmis implémente bien le serveur KIGHMU/Hysteria 2 attendu et que son interface de commande accepte `server --config <fichier>`. Utiliser un port UDP libre et dédié, par exemple `24443`, différent des ports employés par UDP-ZIVPN. Ouvrir uniquement ce port dans le pare-feu du VPS ; ne pas modifier le service UDP-ZIVPN ni ses règles de redirection.

```bash
sudo bash scripts/deploy-kighmu-server.sh /chemin/vers/kighmu-linux-amd64
```

Le script demande ensuite l’hôte, le port, le mot de passe d’authentification et le mot de passe Salamander. Il crée un certificat auto-signé réservé au test, démarre `kighmu.service` et enregistre le profil à saisir dans l’application sous `/etc/kighmu/android-test-profile.txt` avec des permissions strictes.

## Paramètres Android correspondants

| Champ de l’application | Valeur issue du serveur |
|---|---|
| Host/IP | Domaine ou IP renseigné lors de l’installation |
| Port | Port UDP KIGHMU dédié, par exemple `24443` |
| Obfs | Mot de passe Salamander |
| Password | Mot de passe d’authentification Hysteria 2 |

Le client Android accepte actuellement le certificat auto-signé uniquement parce que la configuration de développement définit `tls.insecure: true`. Cette tolérance est suffisante pour un test contrôlé, mais doit être remplacée par un certificat de confiance avant toute diffusion.

## État du déploiement de test

Un serveur KIGHMU Hysteria 2 distinct a été déployé sur le VPS le 13 août 2026. Il écoute sur UDP `24443` avec le service systemd `kighmu.service`, tandis que le service UDP-ZIVPN est resté actif et inchangé sur UDP `5667`. Le binaire vérifié est `/root/kighmu-work/20260813/bin/kighmu-native-amd64` (SHA-256 `0f278195d695d9fe60dfbffc15192444dd170df9791c54010e4fc3ad0f69c9ae`).

Un test local du protocole a confirmé l’authentification Hysteria 2, Salamander, le relais UDP annoncé par le serveur et une connexion TCP relayée vers `1.1.1.1:443`. Les secrets du profil Android sont conservés uniquement dans `/etc/kighmu/android-test-profile.txt` avec les permissions `0600`; ils ne sont pas enregistrés dans ce dépôt.

## Validation obligatoire

Un service qui démarre ne prouve pas encore que le tunnel fonctionne. Après installation de l’APK Android armeabi-v7a, il faut accorder l’autorisation VPN, saisir le profil de test, examiner les journaux KIGHMU, puis vérifier un accès TCP et UDP à travers le tunnel. Le service UDP-ZIVPN doit rester intact pendant ces essais.

## Références

[1] [Hysteria 2 — Full Server Config](https://v2.hysteria.network/docs/advanced/Full-Server-Config/)

[2] [Hysteria 2 — Full Client Config](https://v2.hysteria.network/docs/advanced/Full-Client-Config/)

[3] [Hysteria 2 — Protocol](https://v2.hysteria.network/docs/developers/Protocol/)
