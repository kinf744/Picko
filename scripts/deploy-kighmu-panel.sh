#!/usr/bin/env bash
# Installe le panneau KIGHMU Android. Le mot de passe admin vient uniquement
# de la variable PANEL_ADMIN_PASSWORD, jamais du dépôt ni de la ligne de commande.

set -Eeuo pipefail
umask 077

PANEL_SOURCE="${1:-}"
PANEL_ROOT="/opt/kighmu-panel"
KIGHMU_ROOT="/etc/kighmu"
PANEL_PORT="${PANEL_PORT:-9443}"

fail() { printf 'Erreur : %s\n' "$*" >&2; exit 1; }
[[ "${EUID}" -eq 0 ]] || fail "lancez ce script en root"
[[ -n "${PANEL_ADMIN_PASSWORD:-}" ]] || fail "PANEL_ADMIN_PASSWORD est requis dans l’environnement"
[[ -f "$PANEL_SOURCE" ]] || fail "usage : sudo PANEL_ADMIN_PASSWORD=... $0 /chemin/kighmu-panel.py"
[[ "$PANEL_PORT" =~ ^[0-9]+$ ]] && (( PANEL_PORT >= 1024 && PANEL_PORT <= 65535 )) || fail "port du panneau invalide"
command -v openssl >/dev/null || fail "openssl est requis"
command -v systemctl >/dev/null || fail "systemctl est requis"

install -d -m 0750 "$PANEL_ROOT" "$KIGHMU_ROOT"
install -m 0700 "$PANEL_SOURCE" "$PANEL_ROOT/kighmu-panel.py"
session_secret="$(openssl rand -hex 32)"
cat > "$KIGHMU_ROOT/panel.env" <<EOF
PANEL_ADMIN_PASSWORD=${PANEL_ADMIN_PASSWORD}
PANEL_SESSION_SECRET=${session_secret}
PANEL_BIND=0.0.0.0
PANEL_PORT=${PANEL_PORT}
PANEL_CERT=${KIGHMU_ROOT}/panel.crt
PANEL_KEY=${KIGHMU_ROOT}/panel.key
EOF
chmod 600 "$KIGHMU_ROOT/panel.env"

if [[ ! -f "$KIGHMU_ROOT/panel.crt" || ! -f "$KIGHMU_ROOT/panel.key" ]]; then
  host="$(awk -F: '/^Host\/IP/{gsub(/ /,"",$2); print $2}' "$KIGHMU_ROOT/android-test-profile.txt" | head -1)"
  openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 3650 -keyout "$KIGHMU_ROOT/panel.key" -out "$KIGHMU_ROOT/panel.crt" -subj "/CN=${host:-kighmu-panel}" >/dev/null 2>&1
  chmod 600 "$KIGHMU_ROOT/panel.key"
  chmod 644 "$KIGHMU_ROOT/panel.crt"
fi

cat > /etc/systemd/system/kighmu-panel.service <<EOF
[Unit]
Description=KIGHMU Android User Control Panel
After=network-online.target kighmu.service
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${PANEL_ROOT}
EnvironmentFile=${KIGHMU_ROOT}/panel.env
ExecStart=/usr/bin/python3 ${PANEL_ROOT}/kighmu-panel.py
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full
ReadWritePaths=${KIGHMU_ROOT}
UMask=0077
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now kighmu-panel.service
sleep 2
systemctl is-active --quiet kighmu-panel.service || { journalctl -u kighmu-panel.service -n 80 --no-pager >&2; fail "le panneau n’a pas démarré"; }
printf 'Panneau KIGHMU actif : https://%s:%s\n' "$(awk -F: '/^Host\/IP/{gsub(/ /,"",$2); print $2}' "$KIGHMU_ROOT/android-test-profile.txt" | head -1)" "$PANEL_PORT"
