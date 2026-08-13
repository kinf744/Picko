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
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import fcntl


ROOT = Path("/etc/kighmu")
CONFIG_FILE = ROOT / "config.yaml"
USERS_FILE = ROOT / "android-users.json"
LOCK_FILE = ROOT / "android-users.lock"
PROFILE_FILE = ROOT / "android-test-profile.txt"
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
USE_COLOR = sys.stdout.isatty()
RESET = "\033[0m" if USE_COLOR else ""
RED = "\033[31m" if USE_COLOR else ""
GREEN = "\033[32m" if USE_COLOR else ""
YELLOW = "\033[33m" if USE_COLOR else ""
CYAN = "\033[36m" if USE_COLOR else ""
MAGENTA = "\033[35m" if USE_COLOR else ""
BOLD = "\033[1m" if USE_COLOR else ""


def now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def expiry_date(record: dict[str, str]) -> date | None:
    value = record.get("expiresAt", "")
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def is_active(record: dict[str, str]) -> bool:
    expiry = expiry_date(record)
    return expiry is None or expiry >= date.today()


def read_days(prompt: str = "Durée en jours (1-3650) : ") -> int | None:
    raw = input(prompt).strip()
    if not raw.isdigit() or not 1 <= int(raw) <= 3650:
        fail("durée invalide")
        return None
    return int(raw)


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
        if is_active(users[username]):
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
    if not any(is_active(record) for record in new.values()):
        raise RuntimeError("au moins un compte KIGHMU Android non expiré doit rester actif")
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
        expiry = record.get("expiresAt", "sans expiration")
        state = "ACTIF" if is_active(record) else "EXPIRÉ"
        print(f"- {username:<24} {state:<8} expire : {expiry}")


def create_user() -> None:
    username = input("Nom d’utilisateur (3-32, lettres/chiffres/._-) : ").strip()
    if not USERNAME_RE.fullmatch(username):
        fail("nom d’utilisateur invalide")
        return
    password = input("Mot de passe KIGHMU (visible) : ").strip()
    if not 8 <= len(password) <= 128:
        fail("le mot de passe doit comporter entre 8 et 128 caractères")
        return
    days = read_days()
    if days is None:
        return
    with exclusive_lock():
        users = load_users()
        if username in users:
            fail("ce compte existe déjà")
            return
        updated = dict(users)
        updated[username] = {
            "password": password,
            "createdAt": now(),
            "expiresAt": (date.today() + timedelta(days=days)).isoformat(),
        }
        try:
            apply_users(users, updated)
        except RuntimeError as error:
            fail(f"création annulée : {error}")
            return
    host, port = profile()
    print(f"{GREEN}✅ UTILISATEUR KIGHMU CRÉÉ{RESET}")
    print(f"Serveur : {host}")
    print(f"Port     : {port}")
    print(f"Password : {username}:{password}")
    print("Obfs     : conservez la valeur Salamander configurée pour le serveur.")


def revoke_user() -> None:
    with exclusive_lock():
        users = load_users()
        if not users:
            fail("aucun compte Android enregistré")
            return
        ordered = sorted(users.items(), key=lambda item: (item[1].get("expiresAt", "9999-12-31"), item[0]))
        print("Utilisateurs (sélectionnez un numéro) :")
        for index, (name, record) in enumerate(ordered, start=1):
            print(f"{index}. {name} | expire : {record.get('expiresAt', 'sans expiration')}")
        raw = input(f"Numéro à supprimer (1-{len(ordered)}) : ").strip()
        if not raw.isdigit() or not 1 <= int(raw) <= len(ordered):
            fail("numéro invalide")
            return
        username = ordered[int(raw) - 1][0]
        if len(users) == 1 and is_active(users[username]):
            fail("impossible de supprimer le dernier compte KIGHMU actif")
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


def renew_user() -> None:
    username = input("Nom du compte à prolonger : ").strip()
    days = read_days("Nombre de jours à ajouter (1-3650) : ")
    if days is None:
        return
    with exclusive_lock():
        users = load_users()
        if username not in users:
            fail("compte introuvable")
            return
        updated = dict(users)
        current_expiry = expiry_date(updated[username]) or date.today()
        base = max(date.today(), current_expiry)
        updated[username] = dict(updated[username])
        updated[username]["expiresAt"] = (base + timedelta(days=days)).isoformat()
        try:
            apply_users(users, updated)
        except RuntimeError as error:
            fail(f"prolongation annulée : {error}")
            return
    print(f"Compte {username} prolongé jusqu’au {updated[username]['expiresAt']}.")


def remove_expired() -> None:
    with exclusive_lock():
        users = load_users()
        expired = [name for name, record in users.items() if not is_active(record)]
        if not expired:
            print("Aucun compte expiré à supprimer.")
            return
        print("Comptes expirés : " + ", ".join(sorted(expired)))
        if input("Supprimer ces comptes ? (oui/non) : ").strip().lower() != "oui":
            print("Suppression annulée.")
            return
        updated = {name: record for name, record in users.items() if name not in expired}
        try:
            apply_users(users, updated)
        except RuntimeError as error:
            fail(f"suppression annulée : {error}")
            return
    print(f"{len(expired)} compte(s) expiré(s) supprimé(s).")


def show_profile() -> None:
    host, port = profile()
    print("\n=== Profil Android ===")
    print(f"Host/IP : {host}")
    print(f"Port    : {port}")
    print("Password: nom_utilisateur:mot_de_passe")
    print("Obfs    : conserver la valeur Salamander configurée pour le serveur.")


def show_status() -> None:
    users = load_users()
    active_count = sum(is_active(record) for record in users.values())
    host, port = profile()
    print(f"\n{CYAN}-------------- STATUT KIGHMU --------------{RESET}")
    print(f"Profil Android : {host}:{port}")
    print(f"Comptes Android : {active_count} actif(s), {len(users) - active_count} expiré(s)")
    for service in ("kighmu.service", "kighmu-panel.service", "zivpn.service"):
        result = subprocess.run(["/usr/bin/systemctl", "is-active", service], capture_output=True, text=True, timeout=10)
        state = result.stdout.strip() or "inconnu"
        color = GREEN if state == "active" else RED
        print(f"{service:<24} {color}{state}{RESET}")
    rules = subprocess.run(["/usr/sbin/nft", "list", "table", "inet", "kighmu_porthop"], capture_output=True, text=True, timeout=10)
    hopping = "ACTIF" if rules.returncode == 0 else "INACTIF"
    print("Port hopping 20000-50000 : " + (GREEN if hopping == "ACTIF" else RED) + hopping + RESET)
    print(f"{CYAN}---------------------------------------------{RESET}")


def print_title() -> None:
    if sys.stdout.isatty():
        os.system("clear")
    print(f"{CYAN}{BOLD}╔═══════════════════════════════════════╗{RESET}")
    print(f"{CYAN}║       KIGHMU CONTROL PANEL v2         ║{RESET}")
    print(f"{CYAN}║       Hysteria 2 — Android users      ║{RESET}")
    print(f"{CYAN}{BOLD}╚═══════════════════════════════════════╝{RESET}")


def pause() -> None:
    input("\nAppuyez sur Entrée pour continuer...")


def install_or_status_kighmu() -> None:
    print_title()
    print(f"{MAGENTA}{BOLD}[1] INSTALLATION / ÉTAT KIGHMU{RESET}\n")
    if not CONFIG_FILE.exists() or not Path("/usr/local/bin/kighmu").exists():
        fail("KIGHMU n’est pas installé. Utilisez le script de déploiement KIGHMU prévu.")
        pause()
        return
    result = subprocess.run(["/usr/bin/systemctl", "is-active", "--quiet", "kighmu.service"], timeout=10)
    if result.returncode != 0:
        if input("KIGHMU est inactif. L’activer maintenant ? (oui/non) : ").strip().lower() == "oui":
            enable_kighmu()
    show_status()
    print(f"\n{YELLOW}Cette option ne télécharge rien et ne modifie ni le pare-feu global ni UDP-ZIVPN.{RESET}")
    pause()


def diagnostic_kighmu() -> None:
    print("\n=== DIAGNOSTIC KIGHMU ===")
    show_status()
    print("\n--- Dernières lignes du service KIGHMU ---")
    logs = subprocess.run(["/usr/bin/journalctl", "-u", "kighmu.service", "-n", "25", "--no-pager"], capture_output=True, text=True, timeout=15)
    print(logs.stdout[-5000:] or "Aucun journal disponible.")


def repair_kighmu() -> None:
    if not CONFIG_FILE.exists() or not Path("/usr/local/bin/kighmu").exists():
        fail("KIGHMU n’est pas installé ; utilisez l’option 1 pour contrôler son état")
        return
    if input("Réparer uniquement KIGHMU et sa redirection dédiée 20000-50000 ? (oui/non) : ").strip().lower() != "oui":
        print("Réparation annulée.")
        return
    subprocess.run(["/usr/bin/systemctl", "reset-failed", "kighmu.service"], capture_output=True, text=True, timeout=10)
    try:
        restart_kighmu()
        rules = subprocess.run(["/usr/sbin/nft", "list", "table", "inet", "kighmu_porthop"], capture_output=True, text=True, timeout=10)
        if rules.returncode != 0:
            raise RuntimeError("la table de redirection KIGHMU est absente après redémarrage")
        print("KIGHMU et sa redirection dédiée sont actifs. Aucun service UDP-ZIVPN ni pare-feu global n’a été modifié.")
    except RuntimeError as error:
        fail(f"KIGHMU reste inactif : {error}")


def uninstall_kighmu() -> None:
    print_title()
    print(f"{RED}{BOLD}[5] DÉSINSTALLATION KIGHMU{RESET}\n")
    print("Cette option arrête et retire uniquement KIGHMU, son panneau et ses règles nftables dédiées.")
    print("UDP-ZIVPN, ses services, ses utilisateurs et le pare-feu global restent inchangés.")
    if input("Saisissez DESINSTALLER-KIGHMU pour confirmer : ").strip() != "DESINSTALLER-KIGHMU":
        print("Désinstallation annulée.")
        return
    backup = Path(f"/root/kighmu-uninstall-backup-{int(time.time())}")
    backup.mkdir(mode=0o700)
    if ROOT.exists():
        shutil.copytree(ROOT, backup / "etc-kighmu", dirs_exist_ok=True)
    for source in (Path("/usr/local/bin/kighmu"), Path("/usr/local/bin/kighmu2"), Path("/usr/bin/kighmu2")):
        if source.exists() or source.is_symlink():
            shutil.copy2(source.resolve(), backup / source.name, follow_symlinks=True)
    for service in ("kighmu-panel.service", "kighmu.service"):
        subprocess.run(["/usr/bin/systemctl", "disable", "--now", service], capture_output=True, text=True, timeout=30, check=False)
    subprocess.run(["/usr/sbin/nft", "delete", "table", "inet", "kighmu_porthop"], capture_output=True, text=True, timeout=10, check=False)
    shutil.rmtree("/etc/systemd/system/kighmu.service.d", ignore_errors=True)
    for unit in (Path("/etc/systemd/system/kighmu.service"), Path("/etc/systemd/system/kighmu-panel.service")):
        unit.unlink(missing_ok=True)
    for path in (ROOT, Path("/opt/kighmu-panel"), Path("/usr/local/bin/kighmu"), Path("/usr/local/bin/kighmu2"), Path("/usr/bin/kighmu2")):
        if path.is_dir() and not path.is_symlink():
            shutil.rmtree(path, ignore_errors=True)
        else:
            path.unlink(missing_ok=True)
    subprocess.run(["/usr/bin/systemctl", "daemon-reload"], capture_output=True, text=True, timeout=30, check=False)
    print(f"KIGHMU a été désinstallé. Sauvegarde locale : {backup}")
    print("UDP-ZIVPN n’a pas été modifié.")
    pause()


def enable_kighmu() -> None:
    result = subprocess.run(["/usr/bin/systemctl", "enable", "--now", "kighmu.service"], capture_output=True, text=True, timeout=30)
    if result.returncode == 0:
        print("KIGHMU est actif.")
    else:
        fail((result.stderr or result.stdout or "échec d’activation").strip())


def menu() -> None:
    while True:
        print_title()
        show_status()
        print(f"{GREEN}{BOLD}[01]{RESET} {BOLD}{MAGENTA}➜{RESET} {YELLOW}Installation / état KIGHMU{RESET}")
        print(f"{GREEN}{BOLD}[02]{RESET} {BOLD}{MAGENTA}➜{RESET} {YELLOW}Créer un utilisateur KIGHMU{RESET}")
        print(f"{GREEN}{BOLD}[03]{RESET} {BOLD}{MAGENTA}➜{RESET} {YELLOW}Supprimer un utilisateur KIGHMU{RESET}")
        print(f"{GREEN}{BOLD}[04]{RESET} {BOLD}{MAGENTA}➜{RESET} {YELLOW}Fix KIGHMU (service + port hopping dédié){RESET}")
        print(f"{GREEN}{BOLD}[05]{RESET} {BOLD}{MAGENTA}➜{RESET} {YELLOW}Désinstaller KIGHMU (sauvegarde + suppression isolée){RESET}")
        print(f"{RED}[00] ➜ Quitter{RESET}\n")
        choice = input(f"{BOLD}{YELLOW}Entrez votre choix [0-5] : {RESET}").strip()
        if choice == "1":
            install_or_status_kighmu()
        elif choice == "2":
            create_user()
            pause()
        elif choice == "3":
            revoke_user()
            pause()
        elif choice == "4":
            repair_kighmu()
            pause()
        elif choice == "5":
            uninstall_kighmu()
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
