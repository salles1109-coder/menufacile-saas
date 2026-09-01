"""Security helpers shared by sessions, CSRF, public checkout tokens and secrets.

The module deliberately avoids hard-coded production secrets.  When SECRET_KEY is
not supplied, a persistent random key is generated in a file with restrictive
permissions.  The same key also derives the local encryption key used for
credentials stored in SQLite.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import secrets
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from cryptography.fernet import Fernet, InvalidToken
from starlette.responses import JSONResponse

LOGGER = logging.getLogger("menufacile.security")
_ENCRYPTED_PREFIX = "enc:v1:"
_MIN_SECRET_LENGTH = 32


class SecretProtectionError(RuntimeError):
    """Raised when a protected credential cannot be decrypted safely."""


def _secret_file_path() -> Path:
    configured = os.getenv("MENUFACILE_SECRET_FILE", "").strip()
    return Path(configured or ".menufacile_secret_key").expanduser().resolve()


def _validate_application_secret(value: str) -> str:
    value = (value or "").strip()
    if len(value) < _MIN_SECRET_LENGTH:
        raise RuntimeError(
            "SECRET_KEY precisa ter pelo menos 32 caracteres. "
            "Defina SECRET_KEY no serviço ou preserve o arquivo .menufacile_secret_key."
        )
    return value


def load_application_secret() -> str:
    """Loads a strong secret from the environment or a persistent local file."""
    env_value = os.getenv("SECRET_KEY", "").strip()
    if env_value:
        return _validate_application_secret(env_value)

    path = _secret_file_path()
    if path.exists():
        try:
            if os.name != "nt":
                path.chmod(0o600)
        except OSError:
            LOGGER.warning("Não foi possível ajustar as permissões de %s", path)
        return _validate_application_secret(path.read_text(encoding="utf-8"))

    path.parent.mkdir(parents=True, exist_ok=True)
    generated = secrets.token_urlsafe(64)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    try:
        descriptor = os.open(path, flags, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(generated)
            handle.write("\n")
    except FileExistsError:
        return _validate_application_secret(path.read_text(encoding="utf-8"))
    except OSError as error:
        raise RuntimeError(
            "SECRET_KEY não configurada e não foi possível criar o arquivo seguro "
            f"{path}: {error}"
        ) from error

    LOGGER.warning(
        "SECRET_KEY não estava configurada. Uma chave persistente foi criada em %s. "
        "Inclua esse arquivo no backup seguro e não o publique.",
        path,
    )
    return _validate_application_secret(generated)


APPLICATION_SECRET = load_application_secret()


def _credential_root_secret() -> str:
    configured = os.getenv("CREDENTIALS_ENCRYPTION_KEY", "").strip()
    return _validate_application_secret(configured) if configured else APPLICATION_SECRET


def _fernet() -> Fernet:
    digest = hashlib.sha256(_credential_root_secret().encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def is_encrypted_secret(value: object) -> bool:
    return str(value or "").startswith(_ENCRYPTED_PREFIX)


def encrypt_secret(value: object) -> str:
    plain = str(value or "").strip()
    if not plain:
        return ""
    if is_encrypted_secret(plain):
        # Validate rather than encrypting an encrypted token a second time.
        decrypt_secret(plain)
        return plain
    token = _fernet().encrypt(plain.encode("utf-8")).decode("ascii")
    return _ENCRYPTED_PREFIX + token


def decrypt_secret(value: object) -> str:
    stored = str(value or "").strip()
    if not stored:
        return ""
    if not is_encrypted_secret(stored):
        # Legacy plaintext remains readable and is migrated at startup/save.
        return stored
    token = stored[len(_ENCRYPTED_PREFIX):]
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeError, ValueError) as error:
        raise SecretProtectionError(
            "Uma credencial protegida não pôde ser aberta. Verifique SECRET_KEY/"
            "CREDENTIALS_ENCRYPTION_KEY e restaure a chave usada no backup."
        ) from error


def configured_secret(value: object) -> bool:
    try:
        return bool(decrypt_secret(value))
    except SecretProtectionError:
        return False


def mask_secret(value: object, visible: int = 4) -> str:
    plain = decrypt_secret(value)
    if not plain:
        return ""
    if len(plain) <= visible:
        return "•" * len(plain)
    return "•" * max(8, len(plain) - visible) + plain[-visible:]


def csrf_token(request) -> str:
    """Returns a session-bound CSRF token, creating it when needed."""
    token = str(request.session.get("csrf_token") or "")
    if len(token) < 32:
        token = secrets.token_urlsafe(32)
        request.session["csrf_token"] = token
    return token


def verify_csrf_token(expected: str, supplied: str) -> bool:
    return bool(expected and supplied and hmac.compare_digest(str(expected), str(supplied)))


def _header_map(scope) -> dict[str, str]:
    return {
        key.decode("latin-1").lower(): value.decode("latin-1")
        for key, value in scope.get("headers", [])
    }


def _origin_matches(scope, headers: dict[str, str]) -> bool:
    origin = (headers.get("origin") or "").strip()
    referer = (headers.get("referer") or "").strip()
    candidate = origin or referer
    if not candidate:
        return False
    try:
        parsed = urlparse(candidate)
    except ValueError:
        return False
    incoming_host = (headers.get("x-forwarded-host") or headers.get("host") or "").split(",")[0].strip().lower()
    candidate_host = (parsed.netloc or "").lower()
    return bool(incoming_host and candidate_host and hmac.compare_digest(incoming_host, candidate_host))


def _multipart_csrf(body: bytes) -> str:
    marker = b'name="csrf_token"'
    position = body.find(marker)
    if position < 0:
        return ""
    value_start = body.find(b"\r\n\r\n", position)
    if value_start < 0:
        return ""
    value_start += 4
    value_end = body.find(b"\r\n", value_start)
    if value_end < 0:
        return ""
    return body[value_start:value_end].decode("utf-8", errors="ignore").strip()


def _body_csrf(content_type: str, body: bytes) -> str:
    if content_type.startswith("application/x-www-form-urlencoded"):
        try:
            values = parse_qs(body.decode("utf-8", errors="strict"), keep_blank_values=True)
            return str((values.get("csrf_token") or [""])[0])
        except (UnicodeError, ValueError):
            return ""
    if content_type.startswith("multipart/form-data"):
        return _multipart_csrf(body)
    return ""


class CSRFMiddleware:
    """Session-aware CSRF validation for authenticated state-changing requests.

    Public checkout and webhook calls without an admin session are unaffected.
    JSON/fetch requests use X-CSRF-Token. Normal HTML forms use a hidden
    csrf_token field inserted globally by base.html.
    """

    UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
    EXEMPT_PATH_PREFIXES = (
        "/api/pagamentos/mercadopago/",  # Public checkout/webhook uses public tokens/signatures.
        "/api/integracoes/",             # External integrations use their own bearer token.
    )

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or scope.get("method", "GET").upper() not in self.UNSAFE_METHODS:
            await self.app(scope, receive, send)
            return

        session = scope.get("session") or {}
        authenticated = bool(session.get("empresa_id") is not None or session.get("saas_owner") is True)
        path = str(scope.get("path") or "")
        if not authenticated or any(path.startswith(prefix) for prefix in self.EXEMPT_PATH_PREFIXES):
            await self.app(scope, receive, send)
            return

        headers = _header_map(scope)
        if not _origin_matches(scope, headers):
            response = JSONResponse(
                {"error": "Origem da solicitação não autorizada."},
                status_code=403,
            )
            await response(scope, receive, send)
            return

        expected = str(session.get("csrf_token") or "")
        supplied = (headers.get("x-csrf-token") or "").strip()
        body = b""
        replay_receive = receive

        if not supplied:
            content_type = (headers.get("content-type") or "").lower()
            if content_type.startswith(("application/x-www-form-urlencoded", "multipart/form-data")):
                chunks: list[bytes] = []
                more_body = True
                while more_body:
                    message = await receive()
                    if message.get("type") == "http.disconnect":
                        return
                    chunks.append(message.get("body", b""))
                    more_body = bool(message.get("more_body", False))
                body = b"".join(chunks)
                supplied = _body_csrf(content_type, body)
                sent = False

                async def replay_receive():
                    nonlocal sent
                    if sent:
                        return {"type": "http.request", "body": b"", "more_body": False}
                    sent = True
                    return {"type": "http.request", "body": body, "more_body": False}

        if not verify_csrf_token(expected, supplied):
            response = JSONResponse(
                {"error": "Sessão de segurança inválida. Atualize a página e tente novamente."},
                status_code=403,
            )
            await response(scope, replay_receive, send)
            return

        await self.app(scope, replay_receive, send)


class SecurityHeadersMiddleware:
    """Adds conservative browser security headers without changing the UI."""

    IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".jfif", ".png", ".webp")

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        path = str(scope.get("path") or "").lower()

        async def send_with_headers(message):
            if message.get("type") == "http.response.start":
                headers = list(message.get("headers") or [])
                existing = {key.lower() for key, _ in headers}

                def add(name: bytes, value: bytes):
                    if name.lower() not in existing:
                        headers.append((name, value))
                        existing.add(name.lower())

                add(b"x-content-type-options", b"nosniff")
                add(b"referrer-policy", b"strict-origin-when-cross-origin")
                add(b"x-frame-options", b"SAMEORIGIN")
                add(b"permissions-policy", b"camera=(), microphone=(), geolocation=()")

                # v731 — páginas administrativas e menus públicos nunca devem
                # reutilizar HTML antigo. Os arquivos estáticos continuam com
                # sua política própria e recebem versionamento no template.
                content_type = next(
                    (value.lower() for key, value in headers if key.lower() == b"content-type"),
                    b"",
                )
                no_flash_page = (
                    path == "/login"
                    or path.startswith("/admin/")
                    or path.startswith("/funcionario/")
                    or path.startswith("/menu/")
                )
                if no_flash_page and b"text/html" in content_type:
                    blocked = {b"cache-control", b"pragma", b"expires"}
                    headers = [(key, value) for key, value in headers if key.lower() not in blocked]
                    headers.extend([
                        (b"cache-control", b"no-store, no-cache, must-revalidate, max-age=0"),
                        (b"pragma", b"no-cache"),
                        (b"expires", b"0"),
                    ])
                    existing.update(blocked)

                headers_map = _header_map(scope)
                forwarded_proto = (headers_map.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
                is_https = scope.get("scheme") == "https" or forwarded_proto == "https"
                if is_https and os.getenv("ENABLE_HSTS", "true").strip().lower() in {"1", "true", "yes", "sim", "on"}:
                    add(b"strict-transport-security", b"max-age=31536000; includeSubDomains")

                if path.startswith("/static/uploads/"):
                    add(b"content-security-policy", b"default-src 'none'; sandbox")
                    if not path.endswith(self.IMAGE_EXTENSIONS):
                        # Legacy non-image files must never execute in the site origin.
                        headers = [
                            (key, value)
                            for key, value in headers
                            if key.lower() != b"content-type"
                        ]
                        headers.append((b"content-type", b"application/octet-stream"))
                        headers.append((b"content-disposition", b"attachment"))

                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)


def public_recovery_token(kind: str, origin_id: int, company_id: int) -> str:
    raw = f"{kind}:{int(origin_id)}:{int(company_id)}".encode("utf-8")
    return hmac.new(APPLICATION_SECRET.encode("utf-8"), raw, hashlib.sha256).hexdigest()[:40]


def verify_meta_webhook_signature(*, body: bytes, signature: str, app_secret: str) -> bool:
    """Validates Meta's X-Hub-Signature-256 HMAC for webhook payloads."""
    supplied = str(signature or "").strip()
    secret = str(app_secret or "").strip()
    if not supplied.startswith("sha256=") or not secret:
        return False
    received = supplied.split("=", 1)[1].strip()
    if not received:
        return False
    calculated = hmac.new(secret.encode("utf-8"), body or b"", hashlib.sha256).hexdigest()
    return hmac.compare_digest(calculated, received)


def verify_mercadopago_signature(
    *, x_signature: str, x_request_id: str, data_id: str, secret: str
) -> bool:
    """Validates Mercado Pago's documented HMAC-SHA256 webhook manifest."""
    parts: dict[str, str] = {}
    for item in str(x_signature or "").split(","):
        key, separator, value = item.strip().partition("=")
        if separator and key and value:
            parts[key] = value
    timestamp = parts.get("ts", "")
    received = parts.get("v1", "")
    if not timestamp or not received or not secret:
        return False

    manifest_parts: list[str] = []
    if data_id:
        manifest_parts.append(f"id:{str(data_id).lower()};")
    if x_request_id:
        manifest_parts.append(f"request-id:{x_request_id};")
    manifest_parts.append(f"ts:{timestamp};")
    manifest = "".join(manifest_parts)
    calculated = hmac.new(
        secret.encode("utf-8"), manifest.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(calculated, received)
