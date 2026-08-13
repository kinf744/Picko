#!/usr/bin/env bash
# Configure une plage UDP publique redirigée vers un unique port KIGHMU.
# Exemple : sudo ./configure-kighmu-porthop.sh 20000-50000 25000

set -Eeuo pipefail
umask 077

CONFIG_ROOT="/etc/kighmu"
SERVICE_NAME="kighmu"
RANGE="${1:-}"
TARGET_PORT="${2:-}"

fail() {
  printf 'Erreur : %s\n' "$*" >&2
  exit 1
}

[[ "${EUID}" -eq 0 ]] || fail "lancez ce script en root"
command -v nft >/dev/null 2>&1 || fail "nft est requis"
command -v systemctl >/dev/null 2>&1 || fail "systemctl est requis"
[[ "$RANGE" =~ ^([0-9]+)-([0-9]+)$ ]] || fail "usage : sudo $0 20000-50000 25000"
START="${BASH_REMATCH[1]}"
END="${BASH_REMATCH[2]}"
[[ "$TARGET_PORT" =~ ^[0-9]+$ ]] || fail "port cible invalide"
(( START >= 1024 && END <= 65535 && START < END )) || fail "plage invalide"
(( TARGET_PORT >= START && TARGET_PORT <= END )) || fail "le port cible doit appartenir à la plage"
systemctl is-active --quiet "$SERVICE_NAME" || fail "le service ${SERVICE_NAME} doit être actif"

if ss -lunpH | awk -v target="$TARGET_PORT" '{split($5,a,":"); if (a[length(a)] == target && $0 !~ /kighmu/) found=1} END {exit found ? 0 : 1}'; then
  fail "le port UDP ${TARGET_PORT} est déjà utilisé par un autre service"
fi

mkdir -p "$CONFIG_ROOT"
cp -p "$CONFIG_ROOT/config.yaml" "$CONFIG_ROOT/config.yaml.before-porthop-$(date +%Y%m%d%H%M%S)"
sed -i -E "s/^listen: :.*/listen: :${TARGET_PORT}/" "$CONFIG_ROOT/config.yaml"
sed -i -E "s/^Port    :.*/Port    : ${RANGE}/" "$CONFIG_ROOT/android-test-profile.txt"

cat > "$CONFIG_ROOT/porthop.nft" <<EOF
table inet kighmu_porthop {
  chain prerouting {
    type nat hook prerouting priority dstnat; policy accept;
EOF
if (( START < TARGET_PORT )); then
  printf '    iifname "eth0" udp dport %s-%s redirect to :%s\n' "$START" "$((TARGET_PORT - 1))" "$TARGET_PORT" >> "$CONFIG_ROOT/porthop.nft"
fi
if (( TARGET_PORT < END )); then
  printf '    iifname "eth0" udp dport %s-%s redirect to :%s\n' "$((TARGET_PORT + 1))" "$END" "$TARGET_PORT" >> "$CONFIG_ROOT/porthop.nft"
fi
cat >> "$CONFIG_ROOT/porthop.nft" <<'EOF'
  }
}
EOF
chmod 600 "$CONFIG_ROOT/porthop.nft"

mkdir -p "/etc/systemd/system/${SERVICE_NAME}.service.d"
cat > "/etc/systemd/system/${SERVICE_NAME}.service.d/porthop.conf" <<EOF
[Service]
AmbientCapabilities=CAP_NET_BIND_SERVICE
ExecStartPre=+/bin/sh -c '/usr/sbin/nft delete table inet kighmu_porthop 2>/dev/null || true'
ExecStartPre=+/usr/sbin/nft -f ${CONFIG_ROOT}/porthop.nft
ExecStopPost=+/bin/sh -c '/usr/sbin/nft delete table inet kighmu_porthop 2>/dev/null || true'
EOF

systemctl daemon-reload
systemctl restart "$SERVICE_NAME"
sleep 3
systemctl is-active --quiet "$SERVICE_NAME" || {
  journalctl -u "$SERVICE_NAME" -n 80 --no-pager >&2 || true
  fail "le service KIGHMU n’a pas redémarré"
}

printf 'KIGHMU écoute sur UDP/%s ; la plage UDP/%s est redirigée vers ce port.\n' "$TARGET_PORT" "$RANGE"
