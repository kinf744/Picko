#!/usr/bin/env python3
"""Panneau local KIGHMU : gestion de comptes Hysteria 2 userpass.

Le processus doit être lancé par systemd avec PANEL_ADMIN_PASSWORD et
PANEL_SESSION_SECRET dans /etc/kighmu/panel.env, permissions 0600.
"""

from __future__ import annotations

import hashlib
import hmac
import html
import json
import os
import re
import secrets
import shutil
import ssl
import subprocess
import tempfile
import threading
import time
from datetime import UTC, datetime
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path("/etc/kighmu")
CONFIG_FILE = ROOT / "config.yaml"
USERS_FILE = ROOT / "android-users.json"
PROFILE_FILE = ROOT / "android-test-profile.txt"
ADMIN_PASSWORD = os.environ.get("PANEL_ADMIN_PASSWORD", "")
SESSION_SECRET = os.environ.get("PANEL_SESSION_SECRET", "")
HOST = os.environ.get("PANEL_BIND", "0.0.0.0")
PORT = int(os.environ.get("PANEL_PORT", "9443"))
CERT_FILE = Path(os.environ.get("PANEL_CERT", str(ROOT / "panel.crt")))
KEY_FILE = Path(os.environ.get("PANEL_KEY", str(ROOT / "panel.key")))
SESSION_TTL = 3600
MAX_FAILURES = 5
FAILURE_WINDOW = 300
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
LOCK = threading.RLock()
SESSIONS: dict[str, tuple[float, str]] = {}
FAILED_LOGINS: dict[str, tuple[int, float]] = {}


def utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def session_key(token: str) -> str:
    return hmac.new(SESSION_SECRET.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()


def atomic_write(path: Path, content: str, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        handle.write(content)
        temporary = Path(handle.name)
    os.chmod(temporary, mode)
    temporary.replace(path)


def load_users() -> dict[str, dict[str, str]]:
    if not USERS_FILE.exists():
        return {}
    try:
        document = json.loads(USERS_FILE.read_text(encoding="utf-8"))
        users = document.get("users", {})
        if not isinstance(users, dict):
            raise ValueError("structure users invalide")
        return {str(name): value for name, value in users.items() if isinstance(value, dict)}
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise RuntimeError(f"registre utilisateurs illisible : {error}") from error


def save_users(users: dict[str, dict[str, str]]) -> None:
    document = {"version": 1, "updatedAt": utc_now(), "users": users}
    atomic_write(USERS_FILE, json.dumps(document, ensure_ascii=False, indent=2) + "\n")


def render_userpass_block(users: dict[str, dict[str, str]]) -> str:
    lines = ["auth:", "  type: userpass", "  userpass:"]
    for name in sorted(users):
        password = users[name].get("password", "")
        lines.append(f"    {json.dumps(name)}: {json.dumps(password)}")
    return "\n".join(lines) + "\n"


def replace_auth_block(config: str, users: dict[str, dict[str, str]]) -> str:
    pattern = re.compile(r"(?ms)^auth:\n.*?(?=^[A-Za-z][A-Za-z0-9]*:\n|\Z)")
    updated, count = pattern.subn(render_userpass_block(users), config, count=1)
    if count != 1:
        raise RuntimeError("bloc auth introuvable dans config.yaml")
    return updated


def restart_kighmu() -> tuple[bool, str]:
    restart = subprocess.run(
        ["/usr/bin/systemctl", "restart", "kighmu.service"],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    active = subprocess.run(
        ["/usr/bin/systemctl", "is-active", "--quiet", "kighmu.service"],
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    message = (restart.stderr or restart.stdout or "").strip()[:400]
    return restart.returncode == 0 and active.returncode == 0, message


def apply_users(previous: dict[str, dict[str, str]], updated: dict[str, dict[str, str]]) -> None:
    if not updated:
        raise RuntimeError("au moins un compte KIGHMU Android doit rester actif")
    with LOCK:
        current_config = CONFIG_FILE.read_text(encoding="utf-8")
        generated_config = replace_auth_block(current_config, updated)
        config_backup = ROOT / f"config.yaml.panel-backup-{int(time.time())}"
        users_backup = USERS_FILE.with_suffix(".json.panel-backup")
        shutil.copy2(CONFIG_FILE, config_backup)
        if USERS_FILE.exists():
            shutil.copy2(USERS_FILE, users_backup)
        else:
            users_backup.unlink(missing_ok=True)
        try:
            save_users(updated)
            atomic_write(CONFIG_FILE, generated_config)
            success, details = restart_kighmu()
            if not success:
                raise RuntimeError(details or "KIGHMU n’est pas devenu actif")
        except Exception:
            shutil.copy2(config_backup, CONFIG_FILE)
            if users_backup.exists():
                shutil.copy2(users_backup, USERS_FILE)
            else:
                USERS_FILE.unlink(missing_ok=True)
            restart_kighmu()
            raise


def profile_endpoint() -> tuple[str, str]:
    host = "non défini"
    port = "non défini"
    try:
        for line in PROFILE_FILE.read_text(encoding="utf-8").splitlines():
            if line.startswith("Host/IP"):
                host = line.split(":", 1)[1].strip()
            elif line.startswith("Port"):
                port = line.split(":", 1)[1].strip()
    except OSError:
        pass
    return host, port


def form_value(values: dict[str, list[str]], field: str) -> str:
    return values.get(field, [""])[0].strip()


class PanelHandler(BaseHTTPRequestHandler):
    server_version = "KIGHMU-Panel"

    def log_message(self, format: str, *args: object) -> None:
        # Ne pas journaliser les corps de requêtes, qui peuvent contenir des mots de passe.
        self.server.logger.info("%s - %s", self.client_address[0], format % args)

    def send_html(self, status: HTTPStatus, content: str, headers: dict[str, str] | None = None) -> None:
        payload = content.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
        if headers:
            for key, value in headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(payload)

    def redirect(self, location: str, cookie: str | None = None) -> None:
        headers = {"Location": location}
        if cookie:
            headers["Set-Cookie"] = cookie
        self.send_html(HTTPStatus.SEE_OTHER, "", headers)

    def read_form(self) -> dict[str, list[str]]:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("longueur invalide")
        if length <= 0 or length > 16384:
            raise ValueError("requête invalide")
        body = self.rfile.read(length).decode("utf-8")
        return parse_qs(body, keep_blank_values=True)

    def session(self) -> tuple[str, str] | None:
        raw_cookie = self.headers.get("Cookie", "")
        cookie = SimpleCookie()
        try:
            cookie.load(raw_cookie)
        except (KeyError, ValueError):
            return None
        token = cookie.get("kighmu_session")
        if token is None:
            return None
        with LOCK:
            current = SESSIONS.get(session_key(token.value))
            if current is None or current[0] < time.time():
                SESSIONS.pop(session_key(token.value), None)
                return None
            return token.value, current[1]

    def require_session(self) -> tuple[str, str] | None:
        active = self.session()
        if active is None:
            self.redirect("/login")
        return active

    def verify_csrf(self, form: dict[str, list[str]], csrf: str) -> bool:
        return hmac.compare_digest(form_value(form, "csrf"), csrf)

    @staticmethod
    def page(title: str, content: str) -> str:
        return f"""<!doctype html><html lang='fr'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>{html.escape(title)}</title><style>
body{{font-family:system-ui,-apple-system,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;background:#f5f8fc;color:#122033}}main{{background:#fff;padding:2rem;border-radius:16px;box-shadow:0 5px 24px #1232}}h1{{margin-top:0;color:#0878d1}}input,button{{font:inherit;padding:.65rem;border-radius:8px;border:1px solid #b6c3d2}}button{{background:#0878d1;color:#fff;border:0;font-weight:700;cursor:pointer}}button.danger{{background:#bd2441}}form.inline{{display:inline}}table{{width:100%;border-collapse:collapse;margin:1rem 0}}th,td{{padding:.7rem;border-bottom:1px solid #dbe5ef;text-align:left}}.card{{padding:1rem;border:1px solid #dbe5ef;border-radius:10px;margin:1rem 0}}.error{{color:#a51d35;font-weight:600}}.ok{{color:#137333;font-weight:600}}label{{display:block;margin:.7rem 0 .3rem}}small{{color:#526376}}</style></head><body><main>{content}</main></body></html>"""

    def login_page(self, error: str = "") -> None:
        message = f"<p class='error'>{html.escape(error)}</p>" if error else ""
        body = f"<h1>KIGHMU — Administration</h1><p>Entrez le code d’administration pour gérer les comptes Android.</p>{message}<form method='post' action='/login'><label>Code d’administration</label><input type='password' name='password' autocomplete='current-password' required autofocus><p><button type='submit'>Ouvrir le panneau</button></p></form><small>Cette interface utilise HTTPS avec un certificat de test auto-signé.</small>"
        self.send_html(HTTPStatus.OK, self.page("Connexion KIGHMU", body))

    def dashboard(self, notice: str = "", error: str = "") -> None:
        session = self.require_session()
        if session is None:
            return
        _, csrf = session
        try:
            users = load_users()
        except RuntimeError as failure:
            users = {}
            error = str(failure)
        host, port = profile_endpoint()
        rows = "".join(
            f"<tr><td>{html.escape(name)}</td><td>{html.escape(record.get('createdAt', 'inconnu'))}</td><td><form class='inline' method='post' action='/users/{html.escape(name, quote=True)}/revoke'><input type='hidden' name='csrf' value='{csrf}'><button class='danger' type='submit'>Révoquer</button></form></td></tr>"
            for name, record in sorted(users.items())
        ) or "<tr><td colspan='3'>Aucun compte Android. Créez le premier compte ci-dessous.</td></tr>"
        notice_html = f"<p class='ok'>{html.escape(notice)}</p>" if notice else ""
        error_html = f"<p class='error'>{html.escape(error)}</p>" if error else ""
        body = f"""<h1>KIGHMU — Panneau de contrôle</h1><p>Serveur Android : <strong>{html.escape(host)}:{html.escape(port)}</strong></p>{notice_html}{error_html}
<div class='card'><h2>Créer un compte Android</h2><form method='post' action='/users'><input type='hidden' name='csrf' value='{csrf}'><label>Nom d’utilisateur</label><input name='username' pattern='[A-Za-z0-9_.-]{{3,32}}' required><label>Mot de passe du compte</label><input type='password' name='password' minlength='8' maxlength='128' autocomplete='new-password' required><p><button type='submit'>Créer le compte</button></p></form><small>Dans l’APK, utilisez <strong>nom_utilisateur:mot_de_passe</strong> dans le champ Password.</small></div>
<div class='card'><h2>Comptes actifs</h2><table><thead><tr><th>Utilisateur</th><th>Créé le</th><th>Action</th></tr></thead><tbody>{rows}</tbody></table></div>
<form method='post' action='/logout'><input type='hidden' name='csrf' value='{csrf}'><button type='submit'>Se déconnecter</button></form>"""
        self.send_html(HTTPStatus.OK, self.page("KIGHMU — Panneau", body))

    def do_GET(self) -> None:
        target = urlparse(self.path).path
        if target in ("/", "/dashboard"):
            self.dashboard()
        elif target == "/login":
            self.login_page()
        else:
            self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        target = urlparse(self.path).path
        try:
            form = self.read_form()
        except ValueError as error:
            self.send_html(HTTPStatus.BAD_REQUEST, self.page("Erreur", f"<p class='error'>{html.escape(str(error))}</p>"))
            return
        if target == "/login":
            self.handle_login(form)
        elif target == "/logout":
            self.handle_logout(form)
        elif target == "/users":
            self.handle_create(form)
        elif target.startswith("/users/") and target.endswith("/revoke"):
            self.handle_revoke(target, form)
        else:
            self.send_error(HTTPStatus.NOT_FOUND)

    def handle_login(self, form: dict[str, list[str]]) -> None:
        source = self.client_address[0]
        now = time.time()
        failures, expiry = FAILED_LOGINS.get(source, (0, now))
        if expiry > now and failures >= MAX_FAILURES:
            self.login_page("Trop de tentatives : réessayez dans quelques minutes.")
            return
        password = form_value(form, "password")
        if not ADMIN_PASSWORD or not hmac.compare_digest(password, ADMIN_PASSWORD):
            FAILED_LOGINS[source] = (failures + 1, now + FAILURE_WINDOW)
            self.login_page("Code d’administration incorrect.")
            return
        FAILED_LOGINS.pop(source, None)
        token = secrets.token_urlsafe(32)
        csrf = secrets.token_urlsafe(24)
        with LOCK:
            SESSIONS[session_key(token)] = (now + SESSION_TTL, csrf)
        self.redirect("/", f"kighmu_session={token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age={SESSION_TTL}")

    def handle_logout(self, form: dict[str, list[str]]) -> None:
        session = self.require_session()
        if session is None:
            return
        token, csrf = session
        if not self.verify_csrf(form, csrf):
            self.dashboard(error="Jeton de sécurité invalide.")
            return
        with LOCK:
            SESSIONS.pop(session_key(token), None)
        self.redirect("/login", "kighmu_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0")

    def handle_create(self, form: dict[str, list[str]]) -> None:
        session = self.require_session()
        if session is None:
            return
        _, csrf = session
        if not self.verify_csrf(form, csrf):
            self.dashboard(error="Jeton de sécurité invalide.")
            return
        username = form_value(form, "username")
        password = form_value(form, "password")
        if not USERNAME_RE.fullmatch(username):
            self.dashboard(error="Le nom doit comporter 3 à 32 caractères : lettres, chiffres, point, tiret ou souligné.")
            return
        if len(password) < 8 or len(password) > 128:
            self.dashboard(error="Le mot de passe du compte doit comporter entre 8 et 128 caractères.")
            return
        try:
            users = load_users()
            if username in users:
                raise RuntimeError("ce compte existe déjà")
            updated = dict(users)
            updated[username] = {"password": password, "createdAt": utc_now()}
            apply_users(users, updated)
            self.dashboard(notice=f"Compte {username} créé. Utilisez {username}:votre_mot_de_passe dans l’APK.")
        except RuntimeError as error:
            self.dashboard(error=f"Création refusée : {error}")

    def handle_revoke(self, target: str, form: dict[str, list[str]]) -> None:
        session = self.require_session()
        if session is None:
            return
        _, csrf = session
        if not self.verify_csrf(form, csrf):
            self.dashboard(error="Jeton de sécurité invalide.")
            return
        username = unquote(target[len("/users/") : -len("/revoke")]).strip("/")
        try:
            users = load_users()
            if username not in users:
                raise RuntimeError("compte introuvable")
            updated = dict(users)
            del updated[username]
            apply_users(users, updated)
            self.dashboard(notice=f"Compte {username} révoqué.")
        except RuntimeError as error:
            self.dashboard(error=f"Ré-vocation refusée : {error}")


def main() -> None:
    if not ADMIN_PASSWORD or not SESSION_SECRET:
        raise SystemExit("PANEL_ADMIN_PASSWORD et PANEL_SESSION_SECRET sont requis")
    if not CERT_FILE.exists() or not KEY_FILE.exists():
        raise SystemExit("certificat TLS du panneau introuvable")
    import logging

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    httpd = ThreadingHTTPServer((HOST, PORT), PanelHandler)
    httpd.logger = logging.getLogger("kighmu-panel")
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(CERT_FILE, KEY_FILE)
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
