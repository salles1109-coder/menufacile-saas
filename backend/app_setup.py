import os
import re
from datetime import date, datetime
from pathlib import Path

from backend.runtime_env import load_runtime_env

# Must run before importing security_service because APPLICATION_SECRET is
# resolved when that module is imported.
load_runtime_env()

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from backend.services.security_service import (
    APPLICATION_SECRET,
    CSRFMiddleware,
    SecurityHeadersMiddleware,
    csrf_token,
)


# Each permission represents one real admin screen.  Owner sessions bypass this
# table; staff sessions are allowed only into the screens selected by the owner.
ADMIN_ROUTE_PERMISSIONS = {
    "": "dashboard",
    "cardapio": "cardapio",
    "produtos-pedidos": "produtos",
    "pedidos": "pedidos",
    "chamadas-atendimento": "pedidos",
    "mesas": "pedidos",
    "reservas": "reservas",
    "financeiro": "financeiro",
    "caixa": "financeiro",
    "fiscal": "fiscal",
    "pagamentos-online": "pagamentos_online",
    "entrega-politicas": "entrega_politicas",
    "configuracoes": "configuracoes",
    "funcionarios": "funcionarios",
    "integracoes": "integracoes",
    "menu-publico": "menu_publico",
}

ADMIN_OWNER_ONLY_PATHS = {"pagamento", "plano-status-json"}

ADMIN_PERMISSION_ORDER = [
    "dashboard", "produtos", "pedidos", "reservas", "cardapio",
    "financeiro", "fiscal", "pagamentos_online", "entrega_politicas",
    "configuracoes", "integracoes", "funcionarios", "menu_publico",
]

ADMIN_PERMISSION_URLS = {
    "dashboard": "",
    "cardapio": "/cardapio",
    "produtos": "/produtos-pedidos",
    "pedidos": "/pedidos",
    "reservas": "/reservas",
    "financeiro": "/financeiro",
    "fiscal": "/fiscal",
    "pagamentos_online": "/pagamentos-online",
    "entrega_politicas": "/entrega-politicas",
    "configuracoes": "/configuracoes",
    "funcionarios": "/funcionarios",
    "integracoes": "/integracoes",
    "menu_publico": "/menu-publico",
}


def _session_permissions(request: Request) -> set[str]:
    raw = request.session.get("admin_permissoes", "")
    if isinstance(raw, str):
        return {item.strip() for item in raw.replace(";", ",").split(",") if item.strip()}
    if isinstance(raw, (list, tuple, set)):
        return {str(item).strip() for item in raw if str(item).strip()}
    return set()


def _first_allowed_admin_url(empresa_id: str, permissions: set[str]) -> str | None:
    for permission in ADMIN_PERMISSION_ORDER:
        if permission in permissions:
            suffix = ADMIN_PERMISSION_URLS.get(permission)
            if suffix is not None:
                return f"/admin/{empresa_id}{suffix}"
    return None


class AdminPermissionMiddleware(BaseHTTPMiddleware):
    """Protect every /admin/{empresa_id}/... route with the same screen permissions.

    This is intentionally below SessionMiddleware so request.session is available.
    It covers GET pages and write endpoints under the same admin path, preventing
    access by typing a URL manually.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path or ""
        parts = [part for part in path.split("/") if part]
        if len(parts) < 2 or parts[0] != "admin":
            return await call_next(request)

        empresa_id = parts[1]
        if not empresa_id.isdigit():
            return await call_next(request)

        # Let the normal login/empresa checks handle unauthenticated or foreign-company requests.
        session_empresa = request.session.get("empresa_id")
        try:
            same_company = int(session_empresa) == int(empresa_id)
        except (TypeError, ValueError):
            same_company = False
        if not same_company:
            return await call_next(request)

        profile = str(request.session.get("admin_perfil", "administrador") or "administrador").strip().lower()
        if profile == "administrador":
            return await call_next(request)

        head = parts[2] if len(parts) >= 3 else ""
        if head == "funcionario":
            # Temporary legacy aliases remain reachable only so they can redirect
            # to the unified admin routes during the migration.
            return await call_next(request)

        permissions = _session_permissions(request)
        owner_only = head in ADMIN_OWNER_ONLY_PATHS
        required = ADMIN_ROUTE_PERMISSIONS.get(head)

        # Unknown admin paths are owner-only by default. This is safer than
        # accidentally exposing a new administrative endpoint to every employee.
        denied = owner_only or required is None or required not in permissions
        if not denied:
            return await call_next(request)

        if request.method.upper() in {"GET", "HEAD"}:
            destination = _first_allowed_admin_url(empresa_id, permissions)
            if destination:
                separator = "&" if "?" in destination else "?"
                return RedirectResponse(f"{destination}{separator}status=sem_permissao", status_code=303)
            return RedirectResponse("/logout", status_code=303)

        return JSONResponse(
            {"detail": "Você não possui permissão para esta área do painel."},
            status_code=403,
        )


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name, "true" if default else "false").strip().lower()
    return value in {"1", "true", "yes", "sim", "on"}




def formatar_data_br(value):
    """Formata datas para exibição sem alterar o valor técnico salvo no banco."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%d-%m-%Y %H:%M")
    if isinstance(value, date):
        return value.strftime("%d-%m-%Y")
    texto = str(value).strip()
    if not texto:
        return ""
    match = re.match(r"^(\d{4})-(\d{2})-(\d{2})(.*)$", texto)
    if match:
        sufixo = match.group(4) or ""
        if sufixo.startswith("T"):
            sufixo = " " + sufixo[1:6]
        return f"{match.group(3)}-{match.group(2)}-{match.group(1)}{sufixo}"
    return texto

def create_app() -> FastAPI:
    app = FastAPI(title="Restaurant SaaS")
    production = os.getenv("APP_ENV", "development").strip().lower() in {"prod", "production", "producao", "produção", "live"}
    session_https_only = _bool_env("SESSION_HTTPS_ONLY", production)
    if production and not session_https_only:
        raise RuntimeError("Em produção, SESSION_HTTPS_ONLY precisa permanecer true.")

    # Starlette wraps the last middleware added around the previous ones.  Session
    # must therefore be added last so request.session exists inside CSRF checks.
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(CSRFMiddleware)
    app.add_middleware(AdminPermissionMiddleware)
    app.add_middleware(
        SessionMiddleware,
        secret_key=APPLICATION_SECRET,
        session_cookie=os.getenv("SESSION_COOKIE_NAME", "menufacile_session").strip() or "menufacile_session",
        max_age=max(900, int(os.getenv("SESSION_MAX_AGE", "43200"))),
        same_site="lax",
        https_only=session_https_only,
    )

    uploads = Path("backend/static/uploads")
    uploads.mkdir(parents=True, exist_ok=True)
    if os.name != "nt":
        try:
            uploads.chmod(0o750)
        except OSError:
            pass

    app.mount(
        "/static",
        StaticFiles(directory="backend/static"),
        name="static",
    )

    templates = Jinja2Templates(directory="backend/templates")
    templates.env.globals["csrf_token"] = csrf_token
    templates.env.filters["data_br"] = formatar_data_br
    app.state.templates = templates
    return app


app = create_app()
templates = app.state.templates

__all__ = ["app", "templates", "create_app", "csrf_token", "formatar_data_br"]
