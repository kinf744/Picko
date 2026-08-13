#!/usr/bin/env bash
# Installe un serveur KIGHMU de test distinct du service UDP-ZIVPN existant.
# Le binaire serveur doit être fourni localement : ce script ne télécharge aucun exécutable.

set -Eeuo pipefail
umask 077

SERVICE_NAME="kighmu"
INSTALL_ROOT="/etc/kighmu"
INSTALL_BIN="/usr/local/bin/kighmu"
DEFAULT_LISTEN="24443"

fail() {
  printf 'Erreur : %s\n' "$*" >&2
  exit 1
}

require_root() {
  [[ "${EUID}" -eq 0 ]] || fail "lancez ce script en root"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "commande requise introuvable : $1"
}

validate_listen() {
  local value="$1"
  if [[ "$value" =~ ^([0-9]+)-([0-9]+)$ ]]; then
    local first="${BASH_REMATCH[1]}"
    local last="${BASH_REMATCH[2]}"
    (( first >= 1024 && last <= 65535 && first <= last ))
  else
    [[ "$value" =~ ^[0-9]+$ ]] && (( value >= 1024 && value <= 65535 ))
  fi
}

yaml_scalar() {
  printf "'%s'" "${1//\'/\'\'}"
}

main() {
  require_root
  require_command openssl
  require_command systemctl
  require_command install
  command -v nft >/dev/null 2>&1 || command -v iptables >/dev/null 2>&1 || fail "nft ou iptables est requis pour le port hopping"

  local source_binary="${1:-}"
  [[ -n "$source_binary" ]] || fail "usage : sudo $0 /chemin/vers/kighmu-linux-amd64"
  [[ -f "$source_binary" && -x "$source_binary" ]] || fail "binaire KIGHMU introuvable ou non exécutable : $source_binary"
  [[ ! -e "/etc/systemd/system/${SERVICE_NAME}.service" ]] || fail "le service ${SERVICE_NAME} existe déjà ; il ne sera pas remplacé"

  printf '%s\n' "Préparation d’un serveur KIGHMU distinct. Aucun service UDP-ZIVPN ne sera modifié."

  local listen host password obfs
  read -r -p "Port UDP ou plage dédiée [${DEFAULT_LISTEN}] : " listen
  listen="${listen:-$DEFAULT_LISTEN}"
  validate_listen "$listen" || fail "port ou plage invalide : $listen"

  read -r -p "Domaine ou IP à utiliser dans l’application Android : " host
  [[ -n "$host" ]] || fail "un domaine ou une IP est requis"

  read -r -s -p "Mot de passe KIGHMU (authentification) : " password
  printf '\n'
  [[ -n "$password" ]] || fail "le mot de passe est requis"

  read -r -s -p "Mot de passe Salamander (Obfs) : " obfs
  printf '\n'
  [[ -n "$obfs" ]] || fail "le mot de passe Salamander est requis"

  mkdir -p "$INSTALL_ROOT"
  install -m 0755 "$source_binary" "$INSTALL_BIN"

  openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 3650 \
    -keyout "$INSTALL_ROOT/server.key" \
    -out "$INSTALL_ROOT/server.crt" \
    -subj "/CN=${host}" >/dev/null 2>&1
  chmod 600 "$INSTALL_ROOT/server.key"
  chmod 644 "$INSTALL_ROOT/server.crt"

  cat > "$INSTALL_ROOT/config.yaml" <<EOF
listen: :${listen}
tls:
  cert: ${INSTALL_ROOT}/server.crt
  key: ${INSTALL_ROOT}/server.key
obfs:
  type: salamander
  salamander:
    password: $(yaml_scalar "$obfs")
auth:
  type: password
  password: $(yaml_scalar "$password")
quic:
  maxIdleTimeout: 30s
  disablePathMTUDiscovery: false
disableUDP: false
EOF
  chmod 600 "$INSTALL_ROOT/config.yaml"

  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=KIGHMU Hysteria 2 test server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${INSTALL_BIN} server --config ${INSTALL_ROOT}/config.yaml
WorkingDirectory=${INSTALL_ROOT}
Restart=on-failure
RestartSec=3
RestartPreventExitStatus=0
AmbientCapabilities=CAP_NET_BIND_SERVICE CAP_NET_ADMIN
NoNewPrivileges=true
LimitNOFILE=1048576
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

  cat > "$INSTALL_ROOT/android-test-profile.txt" <<EOF
Host/IP : ${host}
Port    : ${listen}
Obfs    : ${obfs}
Password: ${password}
TLS     : certificat auto-signé accepté par le client de développement
EOF
  chmod 600 "$INSTALL_ROOT/android-test-profile.txt"

  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME"
  sleep 2
  systemctl is-active --quiet "$SERVICE_NAME" || {
    journalctl -u "$SERVICE_NAME" -n 80 --no-pager >&2 || true
    fail "KIGHMU n’a pas démarré ; le service UDP-ZIVPN n’a pas été modifié"
  }

  printf '\nServeur KIGHMU actif sur UDP/%s.\n' "$listen"
  printf 'Ouvrez le port ou la plage UDP/%s dans le pare-feu du VPS, puis récupérez le profil avec :\n' "$listen"
  printf '  sudo cat %s/android-test-profile.txt\n' "$INSTALL_ROOT"
  printf 'Vérification : sudo systemctl status %s --no-pager\n' "$SERVICE_NAME"
}

main "$@"
