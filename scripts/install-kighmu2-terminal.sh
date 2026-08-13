#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE="${1:-}"
TARGET="/usr/local/bin/kighmu2"

[[ "${EUID}" -eq 0 ]] || { printf 'Lancez ce script en root.\n' >&2; exit 1; }
[[ -f "$SOURCE" ]] || { printf 'Usage : sudo %s /chemin/vers/kighmu2-terminal.py\n' "$0" >&2; exit 1; }
install -m 0700 "$SOURCE" "$TARGET"
ln -sfn "$TARGET" /usr/bin/kighmu2
printf 'Commande installée : %s\n' "$TARGET"
printf 'Ouvrez le menu avec : kighmu2\n'
