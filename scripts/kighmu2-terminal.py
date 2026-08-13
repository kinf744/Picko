#!/usr/bin/env python3
"""Menu terminal KIGHMU Android — comptes Hysteria 2 userpass uniquement."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from datetime import UTC, datetime
from getpass import getpass
from pathlib import Path

import fcntl


ROOT = Path("/etc/kighmu")
CONFIG_FILE = ROOT / "config.yaml"
USERS_FILE = ROOT / "android-users.json"
LOCK_FILE = ROOT / "android-users.lock"
PROFILE_FILE = ROOT / "android-test-profile.txt"
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")


def now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def fail(message: str) -> None:
    print(f"Erreur : {message}", file=sys.stderr)


@contextmanager
def exclusive_lock():
    ROOT.mkdir(parents=True, exist_ok=True)
    with LOCK_FILE.open("a+") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def atomic_write(path: Path, content: str) -> None:
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        handle.write(content)
        temporary = Path(handle.name)
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def load_users() -> dict[str, dict[str, str]]:
    if not USERS_FILE.exists():
        return {}
    try:
        data = json.loads(USERS_FILE.read_text(encoding="utf-8"))
        users = data.get("users", {})
        if not isinstance(users, dict):
            raise ValueError("structure users invalide")
        return {str(name): record for name, record in users.items() if isinstance(record, dict)}
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise RuntimeError(f"registre utilisateurs illisible : {error}") from error


def render_auth(users: dict[str, dict[str, str]]) -> str:
    lines = ["auth:", "  type: userpass", "  userpass:"]
    for username in sorted(users):
        lines.append(f"    {json.dumps(username)}: {json.dumps(users[username]['password'])}")
    return "\n".join(lines) + "\n"


def replace_auth(config: str, users: dict[str, dict[str, str]]) -> str:
    pattern = re.compile(r"(?ms)^auth:\n.*?(?=^[A-Za-z][A-Za-z0-9]*:\n|\Z)")
    output, count = pattern.subn(render_auth(users), config, count=1)
    if count != 1:
        raise RuntimeError("bloc auth introuvable dans /etc/kighmu/config.yaml")
    return output


def restart_kighmu() -> None:
    restart = subprocess.run(["/usr/bin/systemctl", "restart", "kighmu.service"], capture_output=True, text=True, timeout=30)
    active = subprocess.run(["/usr/bin/systemctl", "is-active", "--quiet", "kighmu.service"], capture_output=True, text=True, timeout=10)
    if restart.returncode != 0 or active.returncode != 0:
        details = (restart.stderr or restart.stdout or "service inactif").strip()
        raise RuntimeError(details[:400])


def apply_users(old: dict[str, dict[str, str]], new: dict[str, dict[str, str]]) -> None:
    if not new:
        raise RuntimeError("au moins un compte KIGHMU Android doit rester actif")
    current = CONFIG_FILE.read_text(encoding="utf-8")
    updated = replace_auth(current, new)
    config_backup = ROOT / f"config.yaml.kighmu2-backup-{int(time.time())}"
    users_backup = USERS_FILE.with_suffix(".json.kighmu2-backup")
    shutil.copy2(CONFIG_FILE, config_backup)
    if USERS_FILE.exists():
        shutil.copy2(USERS_FILE, users_backup)
    try:
        document = {"version": 1, "updatedAt": now(), "users": new}
        atomic_write(USERS_FILE, json.dumps(document, ensure_ascii=False, indent=2) + "\n")
        atomic_write(CONFIG_FILE, updated)
        restart_kighmu()
    except Exception:
        shutil.copy2(config_backup, CONFIG_FILE)
        if users_backup.exists():
            shutil.copy2(users_backup, USERS_FILE)
        else:
            USERS_FILE.unlink(missing_ok=True)
        subprocess.run(["/usr/bin/systemctl", "restart", "kighmu.service"], capture_output=True, text=True, timeout=30)
        raise


def profile() -> tuple[str, str]:
    host, port = "inconnu", "inconnu"
    try:
        for line in PROFILE_FILE.read_text(encoding="utf-8").splitlines():
            if line.startswith("Host/IP"):
                host = line.split(":", 1)[1].strip()
            if line.startswith("Port"):
                port = line.split(":", 1)[1].strip()
    except OSError:
        pass
    return host, port


def list_users() -> None:
    users = load_users()
    print("\n=== Comptes KIGHMU Android ===")
    if not users:
        print("Aucun compte Android. Créez le premier compte avec l’option 1.")
        return
    for username, record in sorted(users.items()):
        print(f"- {username:<32} créé : {record.get('createdAt', 'inconnu')}")


def create_user() -> None:
    username = input("Nom d’utilisateur (3-32, lettres/chiffres/._-) : ").strip()
    if not USERNAME_RE.fullmatch(username):
        fail("nom d’utilisateur invalide")
        return
    password = getpass("Mot de passe du compte : ")
    confirm = getpass("Confirmer le mot de passe : ")
    if password != confirm:
        fail("les mots de passe ne correspondent pas")
        return
    if not 8 <= len(password) <= 128:
        fail("le mot de passe doit comporter entre 8 et 128 caractères")
        return
    with exclusive_lock():
        users = load_users()
        if username in users:
            fail("ce compte existe déjà")
            return
        updated = dict(users)
        updated[username] = {"password": password, "createdAt": now()}
        try:
            apply_users(users, updated)
        except RuntimeError as error:
            fail(f"création annulée : {error}")
            return
    print(f"Compte {username} créé. Dans l’APK, Password = {username}:votre_mot_de_passe")


def revoke_user() -> None:
    username = input("Nom du compte à révoquer : ").strip()
    with exclusive_lock():
        users = load_users()
        if username not in users:
            fail("compte introuvable")
            return
        if len(users) == 1:
            fail("impossible de révoquer le dernier compte actif")
            return
        confirm = input(f"Révoquer définitivement {username} ? (oui/non) : ").strip().lower()
        if confirm != "oui":
            print("Révocation annulée.")
            return
        updated = dict(users)
        del updated[username]
        try:
            apply_users(users, updated)
        except RuntimeError as error:
            fail(f"révocation annulée : {error}")
            return
    print(f"Compte {username} révoqué.")


def show_profile() -> None:
    host, port = profile()
    print("\n=== Profil Android ===")
    print(f"Host/IP : {host}")
    print(f"Port    : {port}")
    print("Password: nom_utilisateur:mot_de_passe")
    print("Obfs    : conserver la valeur Salamander configurée pour le serveur.")


def show_status() -> None:
    print("\n=== État des services ===")
    for service in ("kighmu.service", "kighmu-panel.service", "zivpn.service"):
        result = subprocess.run(["/usr/bin/systemctl", "is-active", service], capture_output=True, text=True, timeout=10)
        print(f"{service:<24} {result.stdout.strip() or 'inconnu'}")


def menu() -> None:
    while True:
        print("\n╔══════════════════════════════════════╗")
        print("║       KIGHMU2 — Comptes Android      ║")
        print("╠══════════════════════════════════════╣")
        print("║ 1. Créer un compte Android           ║")
        print("║ 2. Lister les comptes                ║")
        print("║ 3. Révoquer un compte                ║")
        print("║ 4. Afficher le profil Android        ║")
        print("║ 5. État des services                 ║")
        print("║ 0. Quitter                           ║")
        print("╚══════════════════════════════════════╝")
        choice = input("Choix : ").strip()
        if choice == "1":
            create_user()
        elif choice == "2":
            list_users()
        elif choice == "3":
            revoke_user()
        elif choice == "4":
            show_profile()
        elif choice == "5":
            show_status()
        elif choice == "0":
            return
        else:
            fail("choix invalide")


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit("Lancez kighmu2 en root ou avec sudo.")
    if "--list" in sys.argv:
        list_users()
    elif "--status" in sys.argv:
        show_status()
    elif "--help" in sys.argv or "-h" in sys.argv:
        print("Usage : kighmu2 [--list|--status]")
    else:
        menu()


if __name__ == "__main__":
    main()
