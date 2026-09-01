"""Web Push confiável para o PWA MenuFacile Gestor.

v752: confirmação manual/automática dos testes e resultado visual persistente.

v750: teste Android completo e persistente em dois aparelhos.

v746: teste mínimo de fundo sem Topic e ACK por estágio.

v744:
- Cada aviso é persistido no SQLite antes do envio.
- Uma entrega é criada por aparelho, com chave anti-duplicidade.
- Falhas temporárias de DNS/rede permanecem pendentes e são reenviadas.
- Um worker systemd independente verifica a fila mesmo sem o app aberto.
- Agendamentos ativos recebem um lembrete 1 hora antes, com ação de WhatsApp.
- Endpoints expirados (HTTP 404/410) são removidos sem repetir indefinidamente.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy.exc import IntegrityError

from backend.database import SessionLocal
from backend.models import (
    Empresa,
    Encomenda,
    EncomendaItem,
    Pedido,
    PushDelivery,
    PushSubscription,
    Reserva,
    UsuarioAdmin,
)
from backend.timezone_utils import FUSO_MENUFACILE, agora_brasilia

try:
    from pywebpush import WebPushException, webpush
except ImportError:  # O app continua online até a dependência ser instalada.
    WebPushException = Exception  # type: ignore[misc,assignment]
    webpush = None  # type: ignore[assignment]


LOGGER = logging.getLogger("menufacile.push")
PROJECT_ROOT = Path(__file__).resolve().parents[2]
_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="mf-webpush")
_BACKGROUND_TEST_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="mf-push-test")
_KEY_LOCK = threading.Lock()
_PROCESS_LOCK = threading.Lock()
_WORKER_LOCK = threading.Lock()
_WORKER_STARTED = False
_WORKER_STOP = threading.Event()

# O primeiro reenvio ocorre em 1 minuto. Depois o intervalo cresce, sem martelar
# o serviço externo. Após a última faixa, continua tentando de hora em hora até
# a entrega expirar.
_RETRY_DELAYS_SECONDS = (60, 120, 300, 600, 1800, 3600)
_DELIVERY_LIFETIME_HOURS = 24
_WORKER_INTERVAL_SECONDS = 30

_PUSH_DIAGNOSTIC_DIR = Path(os.getenv("MENUFACILE_PUSH_DIAGNOSTIC_DIR", "/tmp/menufacile_push_diagnostics"))
_PUSH_BACKGROUND_TEST_DIR = Path(os.getenv("MENUFACILE_PUSH_BACKGROUND_TEST_DIR", "/tmp/menufacile_push_background_tests"))
_PUSH_BACKGROUND_TEST_LOCK = threading.Lock()

_REMINDER_EVENT = "reserva_lembrete_1h"
_REMINDER_SCAN_DAYS = 3
_ENCOMENDA_EVENT = "encomenda"
_ENCOMENDA_REMINDER_EVENT = "encomenda_lembrete_24h"
_ENCOMENDA_REMINDER_2H_EVENT = "encomenda_lembrete_2h"
_ENCOMENDA_ALERT_30M_EVENT = "encomenda_alerta_30m"
_ENCOMENDA_REMINDER_SCAN_DAYS = 2
_CANCELLED_ENCOMENDA_STATUSES = {
    "cancelada", "cancelado", "recusada", "recusado", "expirada", "expirado",
    "pagamento_cancelado", "pagamento_recusado", "entregue", "finalizada", "finalizado",
}
_CANCELLED_RESERVATION_STATUSES = {
    "cancelada", "cancelado", "recusada", "recusado", "expirada", "expirado",
    "concluida", "concluido", "finalizada", "finalizado", "paga", "pago",
}
_CONFIRMED_RESERVATION_STATUSES = {
    "confirmada", "confirmado", "confirmed", "confermata",
    "aguardando_conclusao", "aguardando conclusão",
}

try:
    _ROME_ZONE = ZoneInfo("Europe/Rome")
except ZoneInfoNotFoundError:  # pragma: no cover - depende da instalação do SO
    _ROME_ZONE = FUSO_MENUFACILE



def _external_worker_heartbeat_path() -> Path:
    configured = str(os.getenv("MENUFACILE_PUSH_HEARTBEAT_PATH", "")).strip()
    if configured:
        path = Path(configured).expanduser()
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        return path
    return PROJECT_ROOT / ".menufacile_push_worker_heartbeat.json"


def write_external_worker_heartbeat(
    *,
    state: str,
    scheduled: dict[str, int] | None = None,
    deliveries: dict[str, int] | None = None,
    error: str = "",
) -> None:
    """Grava um sinal de vida atômico do worker separado do FastAPI."""
    path = _external_worker_heartbeat_path()
    payload = {
        "state": str(state or "unknown"),
        "updated_at": datetime.now(FUSO_MENUFACILE).isoformat(timespec="seconds"),
        "pid": os.getpid(),
        "scheduled": scheduled or {},
        "deliveries": deliveries or {},
        "error": str(error or "")[:1200],
        "interval_seconds": int(os.getenv("MENUFACILE_PUSH_WORKER_INTERVAL", "15") or 15),
    }
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + ".tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        temporary.replace(path)
    except Exception:
        LOGGER.exception("Não foi possível gravar heartbeat do worker de notificações")


def external_worker_status(max_age_seconds: int = 75) -> dict[str, Any]:
    """Retorna se o processo systemd de Push está vivo e processando a fila."""
    path = _external_worker_heartbeat_path()
    base = {
        "online": False,
        "state": "not_started",
        "updated_at": "",
        "age_seconds": None,
        "pid": None,
        "error": "",
        "scheduled": {},
        "deliveries": {},
    }
    try:
        if not path.is_file():
            return base
        payload = json.loads(path.read_text(encoding="utf-8") or "{}")
        updated_text = str(payload.get("updated_at") or "")
        updated = datetime.fromisoformat(updated_text) if updated_text else None
        if updated is not None and updated.tzinfo is None:
            updated = updated.replace(tzinfo=FUSO_MENUFACILE)
        now = datetime.now(FUSO_MENUFACILE)
        age = max(0.0, (now - updated.astimezone(FUSO_MENUFACILE)).total_seconds()) if updated else None
        state = str(payload.get("state") or "unknown")
        online = bool(age is not None and age <= max(30, int(max_age_seconds)) and state in {"running", "ok"})
        return {
            "online": online,
            "state": state,
            "updated_at": updated_text,
            "age_seconds": round(age, 1) if age is not None else None,
            "pid": payload.get("pid"),
            "error": str(payload.get("error") or "")[:500],
            "scheduled": payload.get("scheduled") or {},
            "deliveries": payload.get("deliveries") or {},
        }
    except Exception as exc:
        base["state"] = "invalid_heartbeat"
        base["error"] = str(exc)[:500]
        return base


def run_push_worker_cycle(*, heartbeat: bool = False) -> dict[str, Any]:
    """Executa um ciclo completo: agenda lembretes e entrega tudo que venceu."""
    reservation_scheduled = schedule_upcoming_reservation_reminders()
    encomenda_scheduled = schedule_upcoming_encomenda_reminders()
    scheduled = {
        "queued": int(reservation_scheduled.get("queued", 0)) + int(encomenda_scheduled.get("queued", 0)),
        "duplicate": int(reservation_scheduled.get("duplicate", 0)) + int(encomenda_scheduled.get("duplicate", 0)),
        "skipped": int(reservation_scheduled.get("skipped", 0)) + int(encomenda_scheduled.get("skipped", 0)),
        "reservas_queued": int(reservation_scheduled.get("queued", 0)),
        "encomendas_queued": int(encomenda_scheduled.get("queued", 0)),
        "encomendas_24h_queued": int(encomenda_scheduled.get("queued_24h", 0)),
        "encomendas_2h_queued": int(encomenda_scheduled.get("queued_2h", 0)),
        "encomendas_30m_queued": int(encomenda_scheduled.get("queued_30m", 0)),
    }
    deliveries = process_due_push_deliveries(limit=200)
    result = {"scheduled": scheduled, "deliveries": deliveries}
    if heartbeat:
        write_external_worker_heartbeat(
            state="ok",
            scheduled=scheduled,
            deliveries=deliveries,
        )
    return result

def _private_key_path() -> Path:
    configured = str(os.getenv("VAPID_PRIVATE_KEY_PATH", "")).strip()
    if configured:
        path = Path(configured).expanduser()
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        return path
    return PROJECT_ROOT / ".menufacile_vapid_private.pem"


def _ensure_private_key() -> Path:
    path = _private_key_path()
    if path.is_file():
        return path

    with _KEY_LOCK:
        if path.is_file():
            return path
        path.parent.mkdir(parents=True, exist_ok=True)
        private_key = ec.generate_private_key(ec.SECP256R1())
        pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
        temporary = path.with_suffix(path.suffix + ".tmp")
        with open(temporary, "wb") as handle:
            handle.write(pem)
        if os.name != "nt":
            os.chmod(temporary, 0o600)
        os.replace(temporary, path)
        if os.name != "nt":
            os.chmod(path, 0o600)
        LOGGER.info("Chave VAPID criada em %s", path)
    return path


def public_vapid_key() -> str:
    private_key = serialization.load_pem_private_key(
        _ensure_private_key().read_bytes(), password=None
    )
    public_bytes = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    return base64.urlsafe_b64encode(public_bytes).rstrip(b"=").decode("ascii")


def push_runtime_status() -> dict[str, Any]:
    try:
        public_key = public_vapid_key()
        key_ready = bool(public_key)
        key_error = ""
    except Exception as exc:  # pragma: no cover - depende do SO/permissões
        LOGGER.exception("Não foi possível preparar a chave VAPID")
        public_key = ""
        key_ready = False
        key_error = str(exc)
    return {
        "ready": bool(webpush is not None and key_ready),
        "dependency_ready": bool(webpush is not None),
        "key_ready": key_ready,
        "public_key": public_key,
        "error": key_error,
        "external_worker": external_worker_status(),
    }


def endpoint_hash(endpoint: str) -> str:
    return hashlib.sha256(endpoint.strip().encode("utf-8")).hexdigest()


def save_subscription(
    *,
    empresa_id: int,
    usuario_admin_id: int,
    subscription: dict[str, Any],
    user_agent: str = "",
) -> PushSubscription:
    endpoint = str(subscription.get("endpoint") or "").strip()
    keys = subscription.get("keys") or {}
    p256dh = str(keys.get("p256dh") or "").strip()
    auth = str(keys.get("auth") or "").strip()

    if not endpoint.startswith("https://") or not p256dh or not auth:
        raise ValueError("Assinatura de notificações inválida.")
    if len(endpoint) > 4096 or len(p256dh) > 1024 or len(auth) > 512:
        raise ValueError("Assinatura de notificações excede o tamanho permitido.")

    digest = endpoint_hash(endpoint)
    db = SessionLocal()
    try:
        row = db.query(PushSubscription).filter(
            PushSubscription.endpoint_hash == digest
        ).first()
        now = agora_brasilia()
        if row is None:
            row = PushSubscription(
                empresa_id=int(empresa_id),
                usuario_admin_id=int(usuario_admin_id),
                endpoint_hash=digest,
                endpoint=endpoint,
                p256dh=p256dh,
                auth=auth,
                user_agent=(user_agent or "")[:500],
                ativo=True,
                falhas_consecutivas=0,
                criado_em=now,
                atualizado_em=now,
            )
            db.add(row)
        else:
            row.empresa_id = int(empresa_id)
            row.usuario_admin_id = int(usuario_admin_id)
            row.endpoint = endpoint
            row.p256dh = p256dh
            row.auth = auth
            row.user_agent = (user_agent or "")[:500]
            row.ativo = True
            row.falhas_consecutivas = 0
            row.ultimo_erro = None
            row.atualizado_em = now
        db.commit()
        db.refresh(row)
        return row
    except IntegrityError:
        db.rollback()
        row = db.query(PushSubscription).filter(
            PushSubscription.endpoint_hash == digest
        ).first()
        if row is None:
            raise
        row.empresa_id = int(empresa_id)
        row.usuario_admin_id = int(usuario_admin_id)
        row.endpoint = endpoint
        row.p256dh = p256dh
        row.auth = auth
        row.user_agent = (user_agent or "")[:500]
        row.ativo = True
        row.falhas_consecutivas = 0
        row.ultimo_erro = None
        row.atualizado_em = agora_brasilia()
        db.commit()
        db.refresh(row)
        return row
    finally:
        db.close()


def remove_subscription(*, empresa_id: int, usuario_admin_id: int, endpoint: str) -> bool:
    digest = endpoint_hash(endpoint)
    db = SessionLocal()
    try:
        row = db.query(PushSubscription).filter(
            PushSubscription.endpoint_hash == digest,
            PushSubscription.empresa_id == int(empresa_id),
            PushSubscription.usuario_admin_id == int(usuario_admin_id),
        ).first()
        if row is None:
            return False
        # Entregas pendentes deste aparelho não devem ficar tentando após o usuário
        # desativar as notificações.
        db.query(PushDelivery).filter(
            PushDelivery.subscription_id == int(row.id),
            PushDelivery.status == "pendente",
        ).update(
            {
                PushDelivery.status: "cancelado",
                PushDelivery.ultimo_erro: "Notificações desativadas neste aparelho.",
                PushDelivery.atualizado_em: agora_brasilia(),
            },
            synchronize_session=False,
        )
        db.delete(row)
        db.commit()
        return True
    finally:
        db.close()


def subscription_count(*, empresa_id: int, usuario_admin_id: int | None = None) -> int:
    db = SessionLocal()
    try:
        query = db.query(PushSubscription).filter(
            PushSubscription.empresa_id == int(empresa_id),
            PushSubscription.ativo == True,  # noqa: E712
        )
        if usuario_admin_id is not None:
            query = query.filter(PushSubscription.usuario_admin_id == int(usuario_admin_id))
        return int(query.count())
    finally:
        db.close()


def _permission_set(raw: str | None) -> set[str]:
    return {
        item.strip()
        for item in str(raw or "").replace(";", ",").split(",")
        if item.strip()
    }


def _user_can_receive(user: UsuarioAdmin | None, event_type: str) -> bool:
    if user is None or not bool(getattr(user, "ativo", False)):
        return False
    profile = str(getattr(user, "perfil", "administrador") or "administrador").strip().lower()
    if profile == "administrador":
        return True
    permissions = _permission_set(getattr(user, "permissoes", ""))
    if str(event_type or "").startswith("reserva"):
        return "reservas" in permissions
    if str(event_type or "").startswith("encomenda"):
        # O segmento Encomendas usa a mesma permissão operacional de Pedidos.
        return "pedidos" in permissions
    if event_type == "pedido":
        return bool({"pedidos", "produtos"} & permissions)
    return True


def _webpush_claims() -> dict[str, str]:
    subject = str(os.getenv("VAPID_SUBJECT", "mailto:suporte@menufacile.org")).strip()
    return {"sub": subject or "mailto:suporte@menufacile.org"}


def _push_transport_options(
    payload: dict[str, Any],
    *,
    ttl_seconds: int | None = None,
) -> tuple[int, dict[str, str]]:
    """Prioriza avisos operacionais e evita entrega muito atrasada.

    ``Urgency: high`` pede ao serviço Push que trate pedidos, agendamentos e
    lembretes como alertas sensíveis ao tempo. ``Topic`` substitui uma cópia
    ainda pendente do mesmo aviso no mesmo aparelho, sem criar duplicidade.
    """
    event_type = str(payload.get("event") or "").strip().lower()
    if ttl_seconds is None:
        default_ttl = {
            "teste": 300,
            "pedido": 3600,
            "reserva": 3600,
            _REMINDER_EVENT: 3600,
        }.get(event_type, 3600)
        ttl = default_ttl
    else:
        ttl = int(ttl_seconds)
    ttl = max(0, min(86400, ttl))

    tag = str(payload.get("tag") or "").strip()
    headers: dict[str, str] = {"Urgency": "high"}
    # No teste de fundo, não usamos Topic. O objetivo é impedir que uma mensagem
    # pendente seja substituída e medir a entrega real no Android/Chrome.
    diagnostic_simple = bool(payload.get("diagnostic_simple")) or event_type == "teste"
    if tag and not diagnostic_simple:
        # RFC 8030 limita Topic a 32 caracteres do alfabeto URL-safe.
        topic = base64.urlsafe_b64encode(hashlib.sha256(tag.encode("utf-8")).digest()[:18])
        headers["Topic"] = topic.rstrip(b"=").decode("ascii")
    return ttl, headers


def _send_one(
    subscription: PushSubscription,
    payload: dict[str, Any],
    *,
    ttl_seconds: int | None = None,
) -> None:
    if webpush is None:
        raise RuntimeError("Dependência pywebpush não instalada.")
    ttl, headers = _push_transport_options(payload, ttl_seconds=ttl_seconds)
    webpush(
        subscription_info={
            "endpoint": subscription.endpoint,
            "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
        },
        data=json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        vapid_private_key=str(_ensure_private_key()),
        vapid_claims=_webpush_claims(),
        ttl=ttl,
        headers=headers,
        timeout=10,
    )



def _decorate_company_push_payload(db, empresa_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Inclui logo e nome da empresa sem poluir o corpo da notificação.

    V933: o slogan continua cadastrado normalmente no MenuFacile, mas não é
    enviado no Web Push. A notificação fica focada apenas no evento.
    """
    decorated = dict(payload or {})
    try:
        company = db.query(Empresa).filter(Empresa.id == int(empresa_id)).first()
    except Exception:
        company = None
    if not company:
        return decorated
    name = str(getattr(company, "nome", "") or "").strip()
    logo = str(getattr(company, "logo_url", "") or "").strip()
    if name:
        decorated["company_name"] = name[:80]
        decorated.setdefault("company", name[:80])
    if logo:
        if not (logo.startswith("/") or logo.startswith("http://") or logo.startswith("https://")):
            logo = "/" + logo.lstrip("/")
        decorated["company_logo"] = logo[:700]
    return decorated


def send_push_to_company(
    *,
    empresa_id: int,
    event_type: str,
    payload: dict[str, Any],
    usuario_admin_id: int | None = None,
    subscription_id: int | None = None,
) -> dict[str, int]:
    """Envio direto usado pelo botão de teste.

    Eventos reais de pedido/reserva usam a fila persistente abaixo.
    """
    runtime = push_runtime_status()
    if not runtime["ready"]:
        return {"sent": 0, "failed": 0, "removed": 0, "skipped": 0, "targets": 0, "eligible": 0}

    db = SessionLocal()
    sent = failed = removed = skipped = 0
    targets = eligible = 0
    try:
        payload = _decorate_company_push_payload(db, empresa_id, payload)
        query = db.query(PushSubscription).filter(
            PushSubscription.empresa_id == int(empresa_id),
            PushSubscription.ativo == True,  # noqa: E712
        )
        if usuario_admin_id is not None:
            query = query.filter(PushSubscription.usuario_admin_id == int(usuario_admin_id))
        if subscription_id is not None:
            query = query.filter(PushSubscription.id == int(subscription_id))
        subscriptions = query.all()
        targets = len(subscriptions)
        user_ids = {int(item.usuario_admin_id) for item in subscriptions if item.usuario_admin_id}
        users = {
            int(user.id): user
            for user in db.query(UsuarioAdmin).filter(UsuarioAdmin.id.in_(user_ids)).all()
        } if user_ids else {}

        for subscription in subscriptions:
            user = users.get(int(subscription.usuario_admin_id or 0))
            if not _user_can_receive(user, event_type):
                skipped += 1
                continue
            eligible += 1
            try:
                _send_one(subscription, payload)
                subscription.falhas_consecutivas = 0
                subscription.ultimo_erro = None
                subscription.ultimo_sucesso_em = agora_brasilia()
                subscription.atualizado_em = agora_brasilia()
                sent += 1
            except WebPushException as exc:
                status_code = getattr(getattr(exc, "response", None), "status_code", None)
                if status_code in {404, 410}:
                    db.delete(subscription)
                    removed += 1
                else:
                    subscription.falhas_consecutivas = int(subscription.falhas_consecutivas or 0) + 1
                    subscription.ultimo_erro = str(exc)[:1000]
                    subscription.atualizado_em = agora_brasilia()
                    failed += 1
            except Exception as exc:
                subscription.falhas_consecutivas = int(subscription.falhas_consecutivas or 0) + 1
                subscription.ultimo_erro = str(exc)[:1000]
                subscription.atualizado_em = agora_brasilia()
                failed += 1
        db.commit()
    finally:
        db.close()
    return {
        "sent": sent,
        "failed": failed,
        "removed": removed,
        "skipped": skipped,
        "targets": targets,
        "eligible": eligible,
    }


def _delivery_key(event_type: str, entity_id: int | None, subscription_id: int) -> str:
    entity = str(int(entity_id)) if entity_id is not None else "sem-entidade"
    return f"{event_type}:{entity}:subscription:{int(subscription_id)}"


def queue_push_to_company(
    *,
    empresa_id: int,
    event_type: str,
    payload: dict[str, Any],
    entity_id: int | None,
    usuario_admin_id: int | None = None,
    available_at: datetime | None = None,
    expires_at: datetime | None = None,
) -> dict[str, int]:
    """Registra uma entrega persistente por aparelho.

    O retorno informa quantas entregas novas entraram na fila. Chamadas repetidas
    para o mesmo pedido/agendamento não criam notificações duplicadas.
    """
    db = SessionLocal()
    queued = duplicate = skipped = 0
    try:
        query = db.query(PushSubscription).filter(
            PushSubscription.empresa_id == int(empresa_id),
            PushSubscription.ativo == True,  # noqa: E712
        )
        if usuario_admin_id is not None:
            query = query.filter(PushSubscription.usuario_admin_id == int(usuario_admin_id))
        subscriptions = query.all()
        user_ids = {int(item.usuario_admin_id) for item in subscriptions if item.usuario_admin_id}
        users = {
            int(user.id): user
            for user in db.query(UsuarioAdmin).filter(UsuarioAdmin.id.in_(user_ids)).all()
        } if user_ids else {}

        payload = _decorate_company_push_payload(db, empresa_id, payload)
        now = agora_brasilia()
        ready_at = available_at if isinstance(available_at, datetime) else now
        if ready_at < now:
            ready_at = now
        expires = expires_at if isinstance(expires_at, datetime) else now + timedelta(hours=_DELIVERY_LIFETIME_HOURS)
        if expires <= ready_at:
            expires = ready_at + timedelta(minutes=5)
        payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))

        for subscription in subscriptions:
            user = users.get(int(subscription.usuario_admin_id or 0))
            if not _user_can_receive(user, event_type):
                skipped += 1
                continue
            key = _delivery_key(event_type, entity_id, int(subscription.id))
            exists = db.query(PushDelivery.id).filter(PushDelivery.dedupe_key == key).first()
            if exists:
                duplicate += 1
                continue
            delivery = PushDelivery(
                empresa_id=int(empresa_id),
                usuario_admin_id=int(subscription.usuario_admin_id),
                subscription_id=int(subscription.id),
                dedupe_key=key,
                event_type=event_type,
                entity_id=int(entity_id) if entity_id is not None else None,
                payload_json=payload_json,
                status="pendente",
                tentativas=0,
                proxima_tentativa_em=ready_at,
                criado_em=now,
                atualizado_em=now,
                expira_em=expires,
            )
            try:
                with db.begin_nested():
                    db.add(delivery)
                    db.flush()
                queued += 1
            except IntegrityError:
                duplicate += 1
        db.commit()
    finally:
        db.close()

    if queued:
        _EXECUTOR.submit(_delayed_process_due)
    return {"queued": queued, "duplicate": duplicate, "skipped": skipped}


def _retry_delay(attempts: int) -> int:
    index = max(0, min(int(attempts) - 1, len(_RETRY_DELAYS_SECONDS) - 1))
    return int(_RETRY_DELAYS_SECONDS[index])


def _mark_subscription_failure(subscription: PushSubscription, error: str) -> None:
    subscription.falhas_consecutivas = int(subscription.falhas_consecutivas or 0) + 1
    subscription.ultimo_erro = error[:1000]
    subscription.atualizado_em = agora_brasilia()
    # Falhas temporárias de DNS/rede não desativam o aparelho. Apenas 404/410
    # removem uma assinatura de forma definitiva.


def process_due_push_deliveries(limit: int = 80) -> dict[str, int]:
    """Tenta as entregas vencidas sem duplicar entre processos do servidor.

    Cada linha é marcada de forma atômica como ``processando`` antes do envio.
    Se um processo cair no meio, a linha volta para ``pendente`` após cinco
    minutos e outro worker continua o trabalho.
    """
    if webpush is None:
        return {"sent": 0, "failed": 0, "removed": 0, "expired": 0}
    if not _PROCESS_LOCK.acquire(blocking=False):
        return {"sent": 0, "failed": 0, "removed": 0, "expired": 0}

    sent = failed = removed = expired = 0
    db = SessionLocal()
    try:
        now = agora_brasilia()
        stale_before = now - timedelta(minutes=5)
        db.query(PushDelivery).filter(
            PushDelivery.status == "processando",
            PushDelivery.atualizado_em <= stale_before,
        ).update(
            {
                PushDelivery.status: "pendente",
                PushDelivery.proxima_tentativa_em: now,
                PushDelivery.ultimo_erro: "Envio retomado após reinício do worker.",
                PushDelivery.atualizado_em: now,
            },
            synchronize_session=False,
        )
        db.commit()

        candidate_ids = [
            int(row[0])
            for row in (
                db.query(PushDelivery.id)
                .filter(
                    PushDelivery.status == "pendente",
                    PushDelivery.proxima_tentativa_em <= now,
                )
                .order_by(PushDelivery.proxima_tentativa_em.asc(), PushDelivery.id.asc())
                .limit(max(1, int(limit)))
                .all()
            )
        ]

        for delivery_id in candidate_ids:
            claim_time = agora_brasilia()
            claimed = db.query(PushDelivery).filter(
                PushDelivery.id == delivery_id,
                PushDelivery.status == "pendente",
            ).update(
                {
                    PushDelivery.status: "processando",
                    PushDelivery.atualizado_em: claim_time,
                },
                synchronize_session=False,
            )
            db.commit()
            if not claimed:
                continue

            delivery = db.query(PushDelivery).filter(PushDelivery.id == delivery_id).first()
            if delivery is None:
                continue
            now = agora_brasilia()
            if delivery.expira_em and delivery.expira_em <= now:
                delivery.status = "expirado"
                delivery.ultimo_erro = "Prazo de entrega da notificação expirado."
                delivery.atualizado_em = now
                db.commit()
                expired += 1
                continue

            if not _refresh_reminder_delivery(db, delivery):
                db.commit()
                continue
            if not _refresh_encomenda_reminder_delivery(db, delivery):
                db.commit()
                continue

            subscription = db.query(PushSubscription).filter(
                PushSubscription.id == int(delivery.subscription_id),
                PushSubscription.ativo == True,  # noqa: E712
            ).first()
            if subscription is None:
                delivery.status = "cancelado"
                delivery.ultimo_erro = "Aparelho não está mais inscrito."
                delivery.atualizado_em = now
                db.commit()
                continue

            try:
                payload = json.loads(delivery.payload_json or "{}")
                payload["delivery_id"] = int(delivery.id)
                remaining_ttl = 0
                if delivery.expira_em is not None:
                    remaining_ttl = max(0, int((delivery.expira_em - now).total_seconds()))
                _send_one(subscription, payload, ttl_seconds=remaining_ttl)
                delivery.status = "enviado"
                delivery.enviado_em = now
                delivery.ultimo_erro = None
                delivery.atualizado_em = now
                subscription.falhas_consecutivas = 0
                subscription.ultimo_erro = None
                subscription.ultimo_sucesso_em = now
                subscription.atualizado_em = now
                sent += 1
            except WebPushException as exc:
                status_code = getattr(getattr(exc, "response", None), "status_code", None)
                message = str(exc)[:1500]
                delivery.tentativas = int(delivery.tentativas or 0) + 1
                delivery.ultimo_erro = message
                delivery.atualizado_em = now
                if status_code in {404, 410}:
                    delivery.status = "cancelado"
                    db.delete(subscription)
                    removed += 1
                else:
                    delivery.status = "pendente"
                    delivery.proxima_tentativa_em = now + timedelta(
                        seconds=_retry_delay(delivery.tentativas)
                    )
                    _mark_subscription_failure(subscription, message)
                    failed += 1
                    LOGGER.warning(
                        "Web Push pendente para reenvio entrega=%s empresa=%s status=%s tentativa=%s erro=%s",
                        delivery.id,
                        delivery.empresa_id,
                        status_code,
                        delivery.tentativas,
                        message,
                    )
            except Exception as exc:  # DNS, timeout, conexão, fornecedor
                message = str(exc)[:1500]
                delivery.tentativas = int(delivery.tentativas or 0) + 1
                delivery.ultimo_erro = message
                delivery.atualizado_em = now
                delivery.status = "pendente"
                delivery.proxima_tentativa_em = now + timedelta(
                    seconds=_retry_delay(delivery.tentativas)
                )
                _mark_subscription_failure(subscription, message)
                failed += 1
                LOGGER.warning(
                    "Web Push pendente por falha temporária entrega=%s empresa=%s tentativa=%s próximo=%s erro=%s",
                    delivery.id,
                    delivery.empresa_id,
                    delivery.tentativas,
                    delivery.proxima_tentativa_em,
                    message,
                )
            db.commit()
    except Exception:
        db.rollback()
        LOGGER.exception("Falha ao processar a fila persistente de Web Push")
    finally:
        db.close()
        _PROCESS_LOCK.release()
    return {"sent": sent, "failed": failed, "removed": removed, "expired": expired}


def acknowledge_push_displayed(
    *,
    empresa_id: int,
    endpoint: str,
    usuario_admin_id: int | None = None,
    delivery_id: int | None = None,
    event_type: str = "",
    tag: str = "",
    stage: str = "shown",
    test_id: str = "",
    worker_version: str = "",
    client_at: str = "",
    visible_count: int | None = None,
) -> dict[str, Any]:
    """Registra que o service worker concluiu ``showNotification``.

    A confirmação pode ocorrer com o aplicativo fechado e sem uma sessão HTTP
    ativa. Por isso o aparelho é validado pela combinação empresa + endpoint
    Push, que é específica da assinatura, e o usuário é obtido do próprio
    registro salvo no servidor.
    """
    endpoint = str(endpoint or "").strip()
    if not endpoint:
        return {"ok": False, "detail": "Endpoint ausente."}

    db = SessionLocal()
    try:
        query = db.query(PushSubscription).filter(
            PushSubscription.empresa_id == int(empresa_id),
            PushSubscription.endpoint_hash == endpoint_hash(endpoint),
            PushSubscription.ativo == True,  # noqa: E712
        )
        if usuario_admin_id is not None:
            query = query.filter(PushSubscription.usuario_admin_id == int(usuario_admin_id))
        subscription = query.first()
        if subscription is None:
            return {"ok": False, "detail": "Aparelho não encontrado."}

        resolved_user_id = int(subscription.usuario_admin_id)
        normalized_stage = str(stage or "shown").strip().lower()[:30]
        delivery = None
        if delivery_id is not None:
            delivery = db.query(PushDelivery).filter(
                PushDelivery.id == int(delivery_id),
                PushDelivery.empresa_id == int(empresa_id),
                PushDelivery.usuario_admin_id == resolved_user_id,
                PushDelivery.subscription_id == int(subscription.id),
            ).first()
            if (
                delivery is not None
                and normalized_stage in {"shown", "displayed"}
                and delivery.status in {"enviado", "exibido"}
            ):
                delivery.status = "exibido"
                delivery.atualizado_em = agora_brasilia()
                delivery.ultimo_erro = None

        db.commit()
        LOGGER.warning(
            "Push ACK empresa=%s usuario=%s assinatura=%s entrega=%s estágio=%s teste=%s evento=%s tag=%s worker=%s cliente=%s visíveis=%s ua=%s",
            empresa_id,
            resolved_user_id,
            subscription.id,
            getattr(delivery, "id", None),
            normalized_stage,
            str(test_id or "")[:80],
            str(event_type or "")[:60],
            str(tag or "")[:160],
            str(worker_version or "")[:80],
            str(client_at or "")[:80],
            visible_count,
            str(getattr(subscription, "user_agent", "") or "")[:180],
        )
        record_background_test_ack(
            empresa_id=int(empresa_id),
            usuario_admin_id=resolved_user_id,
            subscription_id=int(subscription.id),
            test_id=str(test_id or ""),
            stage=normalized_stage,
            client_at=str(client_at or ""),
            worker_version=str(worker_version or ""),
            visible_count=visible_count,
        )
        return {
            "ok": True,
            "subscription_id": int(subscription.id),
            "usuario_admin_id": resolved_user_id,
            "delivery_id": int(delivery.id) if delivery is not None else None,
            "stage": normalized_stage,
            "displayed": normalized_stage in {"shown", "displayed"},
        }
    except Exception:
        db.rollback()
        LOGGER.exception("Falha ao registrar confirmação de exibição Push")
        return {"ok": False, "detail": "Falha ao registrar exibição."}
    finally:
        db.close()

def push_queue_status(*, empresa_id: int | None = None) -> dict[str, int]:
    db = SessionLocal()
    try:
        query = db.query(PushDelivery)
        if empresa_id is not None:
            query = query.filter(PushDelivery.empresa_id == int(empresa_id))
        return {
            "pending": int(query.filter(PushDelivery.status == "pendente").count()),
            "processing": int(query.filter(PushDelivery.status == "processando").count()),
            "sent": int(query.filter(PushDelivery.status.in_(["enviado", "exibido"])).count()),
            "displayed": int(query.filter(PushDelivery.status == "exibido").count()),
            "expired": int(query.filter(PushDelivery.status == "expirado").count()),
            "cancelled": int(query.filter(PushDelivery.status == "cancelado").count()),
        }
    finally:
        db.close()


def _dt_iso(value: datetime | None) -> str:
    if value is None:
        return ""
    # Datas de Push são persistidas no relógio operacional de Brasília.
    # O offset explícito permite que o navegador converta para o horário local.
    aware = value if value.tzinfo is not None else value.replace(tzinfo=FUSO_MENUFACILE)
    try:
        return aware.isoformat(timespec="seconds")
    except TypeError:
        return aware.isoformat()


def _push_device_label(user_agent: str, subscription_id: int) -> str:
    ua = str(user_agent or "")
    lower = ua.lower()
    if "samsungbrowser" in lower:
        name = "Samsung Internet"
    elif "android" in lower and "chrome" in lower:
        name = "Android • Google Chrome"
    elif "iphone" in lower or "ipad" in lower:
        name = "iPhone/iPad"
    elif "windows" in lower and "chrome" in lower:
        name = "Computador Windows • Chrome"
    elif "windows" in lower and "edg" in lower:
        name = "Computador Windows • Edge"
    elif "macintosh" in lower:
        name = "Mac"
    elif "linux" in lower:
        name = "Computador Linux"
    else:
        name = "Aparelho"
    return f"{name} • ID {int(subscription_id)}"


def list_push_devices(*, empresa_id: int, usuario_admin_id: int) -> list[dict[str, Any]]:
    """Lista apenas as inscrições do usuário logado para teste individual."""
    db = SessionLocal()
    try:
        rows = (
            db.query(PushSubscription)
            .filter(
                PushSubscription.empresa_id == int(empresa_id),
                PushSubscription.usuario_admin_id == int(usuario_admin_id),
                PushSubscription.ativo == True,  # noqa: E712
            )
            .order_by(PushSubscription.atualizado_em.desc(), PushSubscription.id.desc())
            .all()
        )
        return [
            {
                "id": int(row.id),
                "label": _push_device_label(str(row.user_agent or ""), int(row.id)),
                "last_success_at": _dt_iso(row.ultimo_sucesso_em),
                "updated_at": _dt_iso(row.atualizado_em),
                "failures": int(row.falhas_consecutivas or 0),
                "user_agent": str(row.user_agent or "")[:240],
            }
            for row in rows
        ]
    finally:
        db.close()


def push_device_status(
    *,
    empresa_id: int,
    usuario_admin_id: int,
    endpoint: str,
) -> dict[str, Any]:
    """Diagnóstico da assinatura atual e das entregas ligadas a este aparelho."""
    endpoint = str(endpoint or "").strip()
    if not endpoint:
        return {
            "registered": False,
            "active": False,
            "pending": 0,
            "processing": 0,
            "last_success_at": "",
            "last_error": "",
            "updated_at": "",
            "failures": 0,
        }

    digest = endpoint_hash(endpoint)
    db = SessionLocal()
    try:
        subscription = db.query(PushSubscription).filter(
            PushSubscription.empresa_id == int(empresa_id),
            PushSubscription.usuario_admin_id == int(usuario_admin_id),
            PushSubscription.endpoint_hash == digest,
        ).first()
        if subscription is None:
            return {
                "registered": False,
                "active": False,
                "pending": 0,
                "processing": 0,
                "last_success_at": "",
                "last_error": "",
                "updated_at": "",
                "failures": 0,
            }

        pending = db.query(PushDelivery).filter(
            PushDelivery.subscription_id == int(subscription.id),
            PushDelivery.status == "pendente",
        ).count()
        processing = db.query(PushDelivery).filter(
            PushDelivery.subscription_id == int(subscription.id),
            PushDelivery.status == "processando",
        ).count()
        last_delivery = db.query(PushDelivery).filter(
            PushDelivery.subscription_id == int(subscription.id)
        ).order_by(PushDelivery.atualizado_em.desc(), PushDelivery.id.desc()).first()

        last_error = str(subscription.ultimo_erro or "").strip()
        if not last_error and last_delivery is not None:
            last_error = str(last_delivery.ultimo_erro or "").strip()
        last_success = subscription.ultimo_sucesso_em
        if last_success is None and last_delivery is not None:
            last_success = last_delivery.enviado_em

        return {
            "registered": True,
            "active": bool(subscription.ativo),
            "pending": int(pending),
            "processing": int(processing),
            "last_success_at": _dt_iso(last_success),
            "last_error": last_error[:500],
            "updated_at": _dt_iso(subscription.atualizado_em),
            "failures": int(subscription.falhas_consecutivas or 0),
            "last_event": str(getattr(last_delivery, "event_type", "") or ""),
            "last_delivery_status": str(getattr(last_delivery, "status", "") or ""),
        }
    finally:
        db.close()



def _sanitize_push_diagnostic(value: Any, depth: int = 0) -> Any:
    """Limita o relatório voluntário para evitar dados enormes ou formatos perigosos."""
    if depth > 6:
        return "[limite]"
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return value[:600]
    if isinstance(value, list):
        return [_sanitize_push_diagnostic(item, depth + 1) for item in value[:40]]
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for index, (key, item) in enumerate(value.items()):
            if index >= 100:
                break
            cleaned[str(key)[:100]] = _sanitize_push_diagnostic(item, depth + 1)
        return cleaned
    return str(value)[:600]


def _push_diagnostic_path(empresa_id: int, usuario_admin_id: int, subscription_id: int) -> Path:
    return _PUSH_DIAGNOSTIC_DIR / f"empresa-{int(empresa_id)}" / f"usuario-{int(usuario_admin_id)}" / f"assinatura-{int(subscription_id)}.json"


def save_push_device_diagnostic(
    *,
    empresa_id: int,
    usuario_admin_id: int,
    subscription_id: int,
    report: dict[str, Any],
) -> dict[str, Any]:
    """Guarda em /tmp o último diagnóstico gerado conscientemente pelo usuário."""
    db = SessionLocal()
    try:
        subscription = db.query(PushSubscription).filter(
            PushSubscription.id == int(subscription_id),
            PushSubscription.empresa_id == int(empresa_id),
            PushSubscription.usuario_admin_id == int(usuario_admin_id),
            PushSubscription.ativo == True,  # noqa: E712
        ).first()
        if subscription is None:
            raise ValueError("Aparelho não pertence a este usuário ou não está mais ativo.")
        clean_report = _sanitize_push_diagnostic(report)
        record = {
            "subscription_id": int(subscription.id),
            "label": _push_device_label(str(subscription.user_agent or ""), int(subscription.id)),
            "collected_at": datetime.now(FUSO_MENUFACILE).isoformat(timespec="seconds"),
            "report": clean_report,
        }
        path = _push_diagnostic_path(empresa_id, usuario_admin_id, int(subscription.id))
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(path)
        device = clean_report.get("device") if isinstance(clean_report, dict) else {}
        browser = clean_report.get("browser") if isinstance(clean_report, dict) else {}
        pwa = clean_report.get("pwa") if isinstance(clean_report, dict) else {}
        LOGGER.info(
            "Push Device Diagnostic empresa=%s usuario=%s assinatura=%s modelo=%s plataforma=%s chrome=%s standalone=%s permissao=%s",
            int(empresa_id),
            int(usuario_admin_id),
            int(subscription.id),
            str((device or {}).get("model") or "")[:80],
            str((device or {}).get("platform_version") or "")[:40],
            str((browser or {}).get("full_version") or "")[:40],
            bool((pwa or {}).get("standalone")),
            str((clean_report.get("push") or {}).get("notification_permission") or "") if isinstance(clean_report, dict) else "",
        )
        return record
    finally:
        db.close()


def list_push_device_diagnostics(*, empresa_id: int, usuario_admin_id: int) -> list[dict[str, Any]]:
    """Retorna relatórios temporários apenas das inscrições ainda ativas do usuário."""
    devices = list_push_devices(empresa_id=empresa_id, usuario_admin_id=usuario_admin_id)
    results: list[dict[str, Any]] = []
    for device in devices:
        subscription_id = int(device.get("id") or 0)
        path = _push_diagnostic_path(empresa_id, usuario_admin_id, subscription_id)
        record: dict[str, Any] = {
            "subscription_id": subscription_id,
            "label": str(device.get("label") or f"Aparelho ID {subscription_id}"),
            "collected_at": "",
            "report": None,
        }
        if path.is_file():
            try:
                loaded = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    record["collected_at"] = str(loaded.get("collected_at") or "")
                    report = loaded.get("report")
                    record["report"] = report if isinstance(report, dict) else None
            except Exception:
                LOGGER.exception("Não foi possível ler diagnóstico temporário da assinatura %s", subscription_id)
        results.append(record)
    return results


def _money_br(value: Any) -> str:
    try:
        number = float(value or 0)
    except (TypeError, ValueError):
        number = 0.0
    return f"R$ {number:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _normalise_status(value: Any) -> str:
    return " ".join(str(value or "pendente").strip().lower().replace("-", "_").split())


def _company_zone(company: Empresa | None):
    country = str(getattr(company, "pais", "") or "").strip().lower()
    if country in {"italia", "itália", "italy", "italy / italia"} or "itali" in country:
        return _ROME_ZONE
    return FUSO_MENUFACILE


def _company_now(company: Empresa | None) -> datetime:
    return datetime.now(_company_zone(company)).replace(tzinfo=None)


def _local_to_operational(value: datetime, company: Empresa | None) -> datetime:
    aware = value.replace(tzinfo=_company_zone(company))
    return aware.astimezone(FUSO_MENUFACILE).replace(tzinfo=None)


def _reservation_datetime(reservation: Reserva) -> datetime | None:
    date_text = str(getattr(reservation, "data", "") or "").strip()
    time_text = str(getattr(reservation, "horario", "") or "").strip().split(" - ", 1)[0]
    match = re.search(r"(\d{1,2}):(\d{2})", time_text)
    if not date_text or not match:
        return None
    day = None
    for pattern, candidate in (
        ("%Y-%m-%d", date_text[:10]),
        ("%d/%m/%Y", date_text[:10]),
        ("%d-%m-%Y", date_text[:10]),
    ):
        try:
            day = datetime.strptime(candidate, pattern)
            break
        except (TypeError, ValueError):
            continue
    if day is None:
        return None
    try:
        hour = int(match.group(1))
        minute = int(match.group(2))
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            return None
        return day.replace(hour=hour, minute=minute, second=0, microsecond=0)
    except (TypeError, ValueError):
        return None


def _reservation_service_name(reservation: Reserva) -> str:
    raw = str(getattr(reservation, "observacao", "") or "").replace("\\n", "\n").strip()
    if not raw:
        return "Atendimento"
    text = raw
    for prefix in (
        "Serviços selecionados:", "Servicos selecionados:",
        "Servizi selezionati:", "Selected services:",
    ):
        if prefix.lower() in text.lower():
            index = text.lower().find(prefix.lower())
            text = text[index + len(prefix):]
            break
    stop_prefixes = (
        "total:", "totale:", "professional:", "profissional:", "professionista:",
        "clientes adicionais:", "additional clients:", "clienti aggiuntivi:",
        "observação do cliente:", "observacao do cliente:", "customer note:",
        "osservazione del cliente:", "financeiro_servico",
    )
    names: list[str] = []
    for line in text.splitlines():
        clean = line.strip(" •\t")
        if not clean:
            continue
        lower = clean.lower()
        if any(lower.startswith(prefix) for prefix in stop_prefixes):
            break
        clean = re.sub(r"^\d+\s*[xX]\s*", "", clean).strip()
        clean = re.split(r"\s+[—–-]\s+(?:R\$|€|EUR|BRL)\s*", clean, maxsplit=1, flags=re.IGNORECASE)[0]
        clean = re.sub(r"\s+(?:R\$|€|EUR|BRL)\s*[\d.,]+.*$", "", clean, flags=re.IGNORECASE).strip()
        if clean and clean not in names:
            names.append(clean)
        if len(names) >= 2:
            break
    if not names:
        first = text.splitlines()[0].strip() if text.splitlines() else text.strip()
        first = re.sub(r"^\d+\s*[xX]\s*", "", first).strip()
        first = re.split(r"\s+[—–-]\s+(?:R\$|€|EUR|BRL)\s*", first, maxsplit=1, flags=re.IGNORECASE)[0]
        return first[:90] or "Atendimento"
    return " + ".join(names)[:120]


def _whatsapp_number(raw_phone: Any, company: Empresa | None) -> str:
    original = str(raw_phone or "").strip()
    digits = re.sub(r"\D", "", original)
    if not digits:
        return ""
    if digits.startswith("00"):
        digits = digits[2:]
    if original.lstrip().startswith("+") or original.lstrip().startswith("(+"):
        return digits
    country = str(getattr(company, "pais", "") or "").strip().lower()
    if "itali" in country and not digits.startswith("39"):
        return "39" + digits.lstrip("0")
    if (country in {"brasil", "brazil"} or not country) and len(digits) in {10, 11} and not digits.startswith("55"):
        return "55" + digits
    return digits


def _reminder_payload(reservation: Reserva, company: Empresa | None) -> dict[str, Any]:
    status = _normalise_status(getattr(reservation, "status", "pendente"))
    confirmed = status in _CONFIRMED_RESERVATION_STATUSES
    client = str(getattr(reservation, "nome_cliente", "Cliente") or "Cliente").strip()
    service = _reservation_service_name(reservation)
    appointment = _reservation_datetime(reservation)
    hour = appointment.strftime("%H:%M") if appointment else str(getattr(reservation, "horario", "") or "").split(" - ", 1)[0]
    if confirmed:
        body = f"{client} — {service} às {hour}. Prepare-se para o atendimento."
    else:
        body = f"{client} — {service} às {hour}. O agendamento ainda está pendente."

    company_now = _company_now(company)
    when = "hoje"
    if appointment and appointment.date() > company_now.date():
        when = "amanhã" if appointment.date() == company_now.date() + timedelta(days=1) else f"em {appointment.strftime('%d/%m/%Y')}"
    if confirmed:
        wa_text = f"Olá, {client}! Passando para lembrar do seu atendimento de {service} {when} às {hour}. Esperamos você!"
    else:
        wa_text = f"Olá, {client}! Seu agendamento de {service} para {when} às {hour} ainda está pendente de confirmação. Pode me confirmar, por favor?"
    phone = _whatsapp_number(getattr(reservation, "telefone_cliente", ""), company)
    whatsapp_url = f"https://wa.me/{phone}?text={quote(wa_text)}" if phone else ""
    return {
        "title": "Atendimento em 1 hora",
        "body": body,
        "url": f"/admin/{reservation.empresa_id}/reservas?data={reservation.data}&reserva={reservation.id}&lembrete=1",
        "whatsapp_url": whatsapp_url,
        "whatsapp_label": "Lembrar pelo WhatsApp",
        "tag": f"mf-reserva-lembrete-{reservation.id}",
        "event": _REMINDER_EVENT,
        "entity_id": reservation.id,
        "company": getattr(company, "nome", "MenuFacile"),
    }


def schedule_reservation_reminder(reservation_id: int) -> dict[str, int]:
    db = SessionLocal()
    try:
        reservation = db.query(Reserva).filter(Reserva.id == int(reservation_id)).first()
        if reservation is None:
            return {"queued": 0, "duplicate": 0, "skipped": 0}
        status = _normalise_status(getattr(reservation, "status", "pendente"))
        if status in _CANCELLED_RESERVATION_STATUSES:
            return {"queued": 0, "duplicate": 0, "skipped": 1}
        company = db.query(Empresa).filter(Empresa.id == int(reservation.empresa_id)).first()
        appointment_local = _reservation_datetime(reservation)
        if appointment_local is None or appointment_local <= _company_now(company):
            return {"queued": 0, "duplicate": 0, "skipped": 1}
        target_local = appointment_local - timedelta(hours=1)
        target_operational = _local_to_operational(target_local, company)
        appointment_operational = _local_to_operational(appointment_local, company)
        payload = _reminder_payload(reservation, company)
        empresa_id = int(reservation.empresa_id)
        entity_id = int(reservation.id)
        event_type = f"{_REMINDER_EVENT}_{appointment_local.strftime('%Y%m%d%H%M')}"
        # Se o horário foi alterado, cancela o lembrete antigo e cria um novo
        # para o horário atual, sem enviar cedo ou duplicado.
        db.query(PushDelivery).filter(
            PushDelivery.entity_id == entity_id,
            PushDelivery.event_type.like(f"{_REMINDER_EVENT}%"),
            PushDelivery.event_type != event_type,
            PushDelivery.status.in_(["pendente", "processando"]),
        ).update(
            {
                PushDelivery.status: "cancelado",
                PushDelivery.ultimo_erro: "Lembrete substituído após alteração do horário.",
                PushDelivery.atualizado_em: agora_brasilia(),
            },
            synchronize_session=False,
        )
        db.commit()
    finally:
        db.close()
    return queue_push_to_company(
        empresa_id=empresa_id,
        event_type=event_type,
        payload=payload,
        entity_id=entity_id,
        available_at=target_operational,
        expires_at=appointment_operational,
    )


def schedule_upcoming_reservation_reminders(
    days_ahead: int = _REMINDER_SCAN_DAYS,
    empresa_id: int | None = None,
) -> dict[str, int]:
    """Agenda lembretes futuros e recupera reservas criadas antes do PWA."""
    db = SessionLocal()
    reservation_ids: list[int] = []
    try:
        if empresa_id is not None:
            company_ids = [int(empresa_id)]
        else:
            company_ids = [
                int(row[0]) for row in db.query(PushSubscription.empresa_id).filter(
                    PushSubscription.ativo == True  # noqa: E712
                ).distinct().all()
            ]
        for company_id in company_ids:
            company = db.query(Empresa).filter(Empresa.id == company_id).first()
            if company is None:
                continue
            today = _company_now(company).date()
            end = today + timedelta(days=max(1, int(days_ahead)))
            start_text, end_text = today.isoformat(), end.isoformat()
            rows = db.query(Reserva.id, Reserva.status).filter(
                Reserva.empresa_id == company_id,
                Reserva.data >= start_text,
                Reserva.data <= end_text,
            ).limit(1000).all()
            for reservation_id, status in rows:
                if _normalise_status(status) not in _CANCELLED_RESERVATION_STATUSES:
                    reservation_ids.append(int(reservation_id))
    finally:
        db.close()

    totals = {"queued": 0, "duplicate": 0, "skipped": 0}
    for reservation_id in reservation_ids:
        result = schedule_reservation_reminder(reservation_id)
        for key in totals:
            totals[key] += int(result.get(key, 0))
    return totals


def _refresh_reminder_delivery(db, delivery: PushDelivery) -> bool:
    """Atualiza status/texto no instante do envio e cancela lembretes inválidos."""
    if not str(delivery.event_type or "").startswith(_REMINDER_EVENT) or delivery.entity_id is None:
        return True
    reservation = db.query(Reserva).filter(Reserva.id == int(delivery.entity_id)).first()
    now = agora_brasilia()
    if reservation is None:
        delivery.status = "cancelado"
        delivery.ultimo_erro = "Agendamento não encontrado."
        delivery.atualizado_em = now
        return False
    status = _normalise_status(getattr(reservation, "status", "pendente"))
    company = db.query(Empresa).filter(Empresa.id == int(reservation.empresa_id)).first()
    appointment_local = _reservation_datetime(reservation)
    if status in _CANCELLED_RESERVATION_STATUSES or appointment_local is None or appointment_local <= _company_now(company):
        delivery.status = "cancelado"
        delivery.ultimo_erro = "Agendamento encerrado ou horário já iniciado."
        delivery.atualizado_em = now
        return False
    expected_event = f"{_REMINDER_EVENT}_{appointment_local.strftime('%Y%m%d%H%M')}"
    if delivery.event_type != expected_event:
        delivery.status = "cancelado"
        delivery.ultimo_erro = "Lembrete substituído após alteração do horário."
        delivery.atualizado_em = now
        return False
    delivery.payload_json = json.dumps(
        _reminder_payload(reservation, company),
        ensure_ascii=False,
        separators=(",", ":"),
    )
    delivery.atualizado_em = now
    return True


def _encomenda_datetime(encomenda: Encomenda) -> datetime | None:
    day_value = getattr(encomenda, "data_retirada", None)
    if isinstance(day_value, datetime):
        day = day_value.date()
    elif hasattr(day_value, "year") and hasattr(day_value, "month") and hasattr(day_value, "day"):
        day = day_value
    else:
        text_value = str(day_value or "").strip()[:10]
        day = None
        for pattern in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
            try:
                day = datetime.strptime(text_value, pattern).date()
                break
            except (TypeError, ValueError):
                continue
        if day is None:
            return None
    match = re.search(r"(\d{1,2}):(\d{2})", str(getattr(encomenda, "horario", "") or ""))
    if not match:
        return None
    try:
        hour = int(match.group(1))
        minute = int(match.group(2))
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            return None
        return datetime.combine(day, datetime.min.time()).replace(hour=hour, minute=minute)
    except (TypeError, ValueError):
        return None


def _encomenda_items_summary(db, encomenda: Encomenda) -> str:
    rows = db.query(EncomendaItem).filter(
        EncomendaItem.empresa_id == int(encomenda.empresa_id),
        EncomendaItem.encomenda_id == int(encomenda.id),
    ).order_by(EncomendaItem.id.asc()).limit(4).all()
    if not rows:
        return "Encomenda"
    labels: list[str] = []
    for row in rows[:2]:
        name = str(getattr(row, "nome_item", "Item") or "Item").strip()
        option = str(getattr(row, "opcao_nome", "") or "").strip()
        # V933: rótulos técnicos/genéricos não ajudam na notificação.
        # Ex.: "Bolo Vulcão · Preço único" vira apenas "Bolo Vulcão".
        option_key = re.sub(r"\s+", " ", option.lower()).strip(" .:-_")
        generic_options = {
            "preço único", "preco unico", "prezzo unico", "single price",
            "fixed price", "preço fixo", "preco fixo", "prezzo fisso",
            "fixed", "padrão", "padrao", "standard",
            "valor", "value", "valore",
        }
        label = name
        if option and option_key not in generic_options:
            label += f" · {option}"
        labels.append(label)
    extra = max(0, len(rows) - len(labels))
    summary = " + ".join(labels)
    if extra:
        summary += f" + {extra} item" + ("s" if extra != 1 else "")
    return summary[:150]


def _encomenda_payment_summary(encomenda: Encomenda) -> tuple[str, bool]:
    payment_status = _normalise_status(getattr(encomenda, "pagamento_status", ""))
    gateway_status = _normalise_status(getattr(encomenda, "gateway_status", ""))
    method = _normalise_status(getattr(encomenda, "gateway_pagamento", ""))
    signal = float(getattr(encomenda, "sinal_valor", 0) or 0)
    balance = float(getattr(encomenda, "saldo_valor", 0) or 0)

    if payment_status in {"pago", "sinal_pago"} or gateway_status == "approved":
        if signal > 0 and balance > 0:
            return f"Sinal confirmado ({_money_br(signal)})", False
        return "Pagamento confirmado", False
    if gateway_status in {"rejected", "cancelled", "canceled", "refunded", "charged_back"}:
        return "Pagamento não aprovado", True
    if method == "cartao_online":
        return "Cartão online em análise", True
    if method == "pix_online":
        return "Pix online aguardando confirmação", True
    if method == "pix_sinal_manual" or payment_status in {"aguardando_sinal", "pendente"} and signal > 0:
        return f"Sinal pendente ({_money_br(signal)})", True
    if payment_status in {"pagar_no_recebimento", "pago_no_recebimento"}:
        return "Pagamento no recebimento", False
    return "Pagamento pendente", True


def _encomenda_status_filter(status: Any) -> str:
    normalized = _normalise_status(status)
    return {
        "nova": "nova",
        "confirmada": "confirmada",
        "producao": "producao",
        "pronta": "pronta",
        "entregue": "finalizada",
        "finalizada": "finalizada",
        "cancelada": "cancelada",
        "recusada": "cancelada",
    }.get(normalized, "nova")


def _encomenda_new_payload(db, encomenda: Encomenda, company: Empresa | None) -> dict[str, Any]:
    appointment = _encomenda_datetime(encomenda)
    when = appointment.strftime("%d/%m às %H:%M") if appointment else f"{getattr(encomenda, 'data_retirada', '')} às {getattr(encomenda, 'horario', '')}"
    receiving = "Entrega" if _normalise_status(getattr(encomenda, "tipo_recebimento", "retirada")) == "entrega" else "Retirada"
    payment, _pending = _encomenda_payment_summary(encomenda)
    client = str(getattr(encomenda, "cliente_nome", "Cliente") or "Cliente").strip()
    items = _encomenda_items_summary(db, encomenda)
    number = str(getattr(encomenda, "numero", "") or encomenda.id).strip()
    return {
        "title": f"Nova encomenda #{number}",
        "body": f"{client} • {items} • {receiving} {when} • {payment}"[:240],
        "url": f"/admin/{encomenda.empresa_id}/encomendas?status=nova",
        "open_label": "Abrir encomendas",
        "tag": f"mf-encomenda-{encomenda.id}",
        "event": _ENCOMENDA_EVENT,
        "entity_id": encomenda.id,
        "company": getattr(company, "nome", "MenuFacile"),
    }


def _encomenda_status_label(status: Any) -> str:
    normalized = _normalise_status(status)
    return {
        "nova": "Nova",
        "confirmada": "Confirmada",
        "producao": "Em produção",
        "pronta": "Pronta",
        "entregue": "Finalizada",
        "finalizada": "Finalizada",
        "cancelada": "Cancelada",
        "recusada": "Recusada",
    }.get(normalized, str(status or "Nova").replace("_", " ").strip().title())


def _encomenda_reminder_payload(
    db,
    encomenda: Encomenda,
    company: Empresa | None,
    *,
    reminder_kind: str = "24h",
) -> dict[str, Any]:
    appointment = _encomenda_datetime(encomenda)
    hour = appointment.strftime("%H:%M") if appointment else str(getattr(encomenda, "horario", "") or "")
    client = str(getattr(encomenda, "cliente_nome", "Cliente") or "Cliente").strip()
    items = _encomenda_items_summary(db, encomenda)
    payment, pending = _encomenda_payment_summary(encomenda)
    receiving = "entrega" if _normalise_status(getattr(encomenda, "tipo_recebimento", "retirada")) == "entrega" else "retirada"
    number = str(getattr(encomenda, "numero", "") or encomenda.id).strip()
    status_label = _encomenda_status_label(getattr(encomenda, "status", "nova"))
    company_now = _company_now(company)
    when = "hoje"
    if appointment and appointment.date() > company_now.date():
        when = "amanhã" if appointment.date() == company_now.date() + timedelta(days=1) else appointment.strftime("%d/%m")

    phone = _whatsapp_number(getattr(encomenda, "telefone", ""), company)
    whatsapp_url = ""
    whatsapp_label = ""

    if reminder_kind == "2h":
        title = f"Encomenda em 2 horas · {hour}"
        body = f"{client} • {items} • {receiving.capitalize()} às {hour} • Status: {status_label}."
        if pending:
            body += f" Atenção: {payment.lower()}."
        if _normalise_status(getattr(encomenda, "status", "")) == "pronta" and phone:
            wa_text = f"Olá, {client.split()[0] if client else 'Cliente'}! Sua encomenda #{number} já está pronta para {receiving} {when} às {hour}."
            whatsapp_url = f"https://wa.me/{phone}?text={quote(wa_text)}"
            whatsapp_label = "Avisar cliente"
        tag = f"mf-encomenda-2h-{encomenda.id}"
        event = _ENCOMENDA_REMINDER_2H_EVENT
    elif reminder_kind == "30m":
        title = "Atenção: encomenda em 30 minutos"
        body = f"#{number} · {client} • {items} • {receiving.capitalize()} às {hour} • Ainda está {status_label}."
        tag = f"mf-encomenda-30m-{encomenda.id}"
        event = _ENCOMENDA_ALERT_30M_EVENT
    else:
        title = f"Encomenda amanhã às {hour}"
        body = f"{client} • {items} • {receiving.capitalize()} amanhã às {hour}."
        if pending:
            body += f" Atenção: {payment.lower()}."
        if phone:
            wa_text = f"Olá, {client.split()[0] if client else 'Cliente'}! Lembrando que sua encomenda #{number} está programada para amanhã às {hour}."
            whatsapp_url = f"https://wa.me/{phone}?text={quote(wa_text)}"
            whatsapp_label = "Avisar cliente"
        tag = f"mf-encomenda-24h-{encomenda.id}"
        event = _ENCOMENDA_REMINDER_EVENT

    payload = {
        "title": title,
        "body": body[:240],
        "url": f"/admin/{encomenda.empresa_id}/encomendas?status={_encomenda_status_filter(getattr(encomenda, 'status', 'nova'))}",
        "open_label": "Abrir encomendas",
        "tag": tag,
        "event": event,
        "entity_id": encomenda.id,
        "company": getattr(company, "nome", "MenuFacile"),
    }
    if whatsapp_url:
        payload["whatsapp_url"] = whatsapp_url
        payload["whatsapp_label"] = whatsapp_label or "Avisar cliente"
    return payload


def _encomenda_reminder_spec(reminder_kind: str) -> tuple[str, timedelta]:
    if reminder_kind == "2h":
        return _ENCOMENDA_REMINDER_2H_EVENT, timedelta(hours=2)
    if reminder_kind == "30m":
        return _ENCOMENDA_ALERT_30M_EVENT, timedelta(minutes=30)
    return _ENCOMENDA_REMINDER_EVENT, timedelta(hours=24)


def schedule_encomenda_reminder(encomenda_id: int, *, reminder_kind: str = "24h") -> dict[str, int]:
    """Agenda um lembrete operacional de Encomendas sem duplicar por aparelho."""
    event_prefix, offset = _encomenda_reminder_spec(reminder_kind)
    db = SessionLocal()
    try:
        encomenda = db.query(Encomenda).filter(Encomenda.id == int(encomenda_id)).first()
        if encomenda is None:
            return {"queued": 0, "duplicate": 0, "skipped": 0}
        status = _normalise_status(getattr(encomenda, "status", "nova"))
        if status in _CANCELLED_ENCOMENDA_STATUSES:
            return {"queued": 0, "duplicate": 0, "skipped": 1}
        # O alerta de 30 minutos só existe quando ainda há algo a fazer.
        if reminder_kind == "30m" and status == "pronta":
            return {"queued": 0, "duplicate": 0, "skipped": 1}
        company = db.query(Empresa).filter(Empresa.id == int(encomenda.empresa_id)).first()
        appointment_local = _encomenda_datetime(encomenda)
        company_now = _company_now(company)
        if appointment_local is None or appointment_local <= company_now:
            return {"queued": 0, "duplicate": 0, "skipped": 1}
        target_local = appointment_local - offset
        # Não enviamos lembretes atrasados. Se a encomenda nasceu depois do
        # ponto de disparo, o push imediato/alerta seguinte cobre a operação.
        if target_local <= company_now:
            return {"queued": 0, "duplicate": 0, "skipped": 1}
        target_operational = _local_to_operational(target_local, company)
        appointment_operational = _local_to_operational(appointment_local, company)
        payload = _encomenda_reminder_payload(db, encomenda, company, reminder_kind=reminder_kind)
        empresa_id = int(encomenda.empresa_id)
        entity_id = int(encomenda.id)
        event_type = f"{event_prefix}_{appointment_local.strftime('%Y%m%d%H%M')}"
        db.query(PushDelivery).filter(
            PushDelivery.entity_id == entity_id,
            PushDelivery.event_type.like(f"{event_prefix}%"),
            PushDelivery.event_type != event_type,
            PushDelivery.status.in_(["pendente", "processando"]),
        ).update(
            {
                PushDelivery.status: "cancelado",
                PushDelivery.ultimo_erro: "Alerta substituído após alteração da data/horário da encomenda.",
                PushDelivery.atualizado_em: agora_brasilia(),
            },
            synchronize_session=False,
        )
        db.commit()
    finally:
        db.close()
    return queue_push_to_company(
        empresa_id=empresa_id,
        event_type=event_type,
        payload=payload,
        entity_id=entity_id,
        available_at=target_operational,
        expires_at=appointment_operational,
    )


def schedule_encomenda_operational_reminders(encomenda_id: int) -> dict[str, int]:
    totals = {
        "queued": 0, "duplicate": 0, "skipped": 0,
        "queued_24h": 0, "queued_2h": 0, "queued_30m": 0,
    }
    for kind, metric in (("24h", "queued_24h"), ("2h", "queued_2h"), ("30m", "queued_30m")):
        result = schedule_encomenda_reminder(encomenda_id, reminder_kind=kind)
        for key in ("queued", "duplicate", "skipped"):
            totals[key] += int(result.get(key, 0))
        totals[metric] += int(result.get("queued", 0))
    return totals


def schedule_upcoming_encomenda_reminders(
    days_ahead: int = _ENCOMENDA_REMINDER_SCAN_DAYS,
    empresa_id: int | None = None,
) -> dict[str, int]:
    """Reconcilia alertas de 24h, 2h e 30min para encomendas ativas."""
    db = SessionLocal()
    encomenda_ids: list[int] = []
    try:
        if empresa_id is not None:
            company_ids = [int(empresa_id)]
        else:
            company_ids = [
                int(row[0]) for row in db.query(PushSubscription.empresa_id).filter(
                    PushSubscription.ativo == True  # noqa: E712
                ).distinct().all()
            ]
        for company_id in company_ids:
            company = db.query(Empresa).filter(Empresa.id == company_id).first()
            if company is None:
                continue
            today = _company_now(company).date()
            end = today + timedelta(days=max(2, int(days_ahead)))
            rows = db.query(Encomenda.id, Encomenda.status).filter(
                Encomenda.empresa_id == company_id,
                Encomenda.data_retirada >= today,
                Encomenda.data_retirada <= end,
            ).limit(1500).all()
            for encomenda_id, status in rows:
                if _normalise_status(status) not in _CANCELLED_ENCOMENDA_STATUSES:
                    encomenda_ids.append(int(encomenda_id))
    finally:
        db.close()

    totals = {
        "queued": 0, "duplicate": 0, "skipped": 0,
        "queued_24h": 0, "queued_2h": 0, "queued_30m": 0,
    }
    for encomenda_id in encomenda_ids:
        result = schedule_encomenda_operational_reminders(encomenda_id)
        for key in totals:
            totals[key] += int(result.get(key, 0))
    return totals


def _encomenda_delivery_kind(event_type: str) -> str | None:
    event_type = str(event_type or "")
    if event_type.startswith(_ENCOMENDA_ALERT_30M_EVENT):
        return "30m"
    if event_type.startswith(_ENCOMENDA_REMINDER_2H_EVENT):
        return "2h"
    if event_type.startswith(_ENCOMENDA_REMINDER_EVENT):
        return "24h"
    return None


def _refresh_encomenda_reminder_delivery(db, delivery: PushDelivery) -> bool:
    reminder_kind = _encomenda_delivery_kind(str(delivery.event_type or ""))
    if reminder_kind is None or delivery.entity_id is None:
        return True
    encomenda = db.query(Encomenda).filter(Encomenda.id == int(delivery.entity_id)).first()
    now = agora_brasilia()
    if encomenda is None:
        delivery.status = "cancelado"
        delivery.ultimo_erro = "Encomenda não encontrada."
        delivery.atualizado_em = now
        return False
    status = _normalise_status(getattr(encomenda, "status", "nova"))
    company = db.query(Empresa).filter(Empresa.id == int(encomenda.empresa_id)).first()
    appointment_local = _encomenda_datetime(encomenda)
    if status in _CANCELLED_ENCOMENDA_STATUSES or appointment_local is None or appointment_local <= _company_now(company):
        delivery.status = "cancelado"
        delivery.ultimo_erro = "Encomenda encerrada/cancelada ou horário já iniciado."
        delivery.atualizado_em = now
        return False
    if reminder_kind == "30m" and status == "pronta":
        delivery.status = "cancelado"
        delivery.ultimo_erro = "Alerta de 30 minutos dispensado: encomenda já está pronta."
        delivery.atualizado_em = now
        return False
    event_prefix, _offset = _encomenda_reminder_spec(reminder_kind)
    expected_event = f"{event_prefix}_{appointment_local.strftime('%Y%m%d%H%M')}"
    if delivery.event_type != expected_event:
        delivery.status = "cancelado"
        delivery.ultimo_erro = "Alerta substituído após alteração da data/horário."
        delivery.atualizado_em = now
        return False
    delivery.payload_json = json.dumps(
        _encomenda_reminder_payload(db, encomenda, company, reminder_kind=reminder_kind),
        ensure_ascii=False,
        separators=(",", ":"),
    )
    delivery.atualizado_em = now
    return True


def notify_new_encomenda(encomenda_id: int) -> dict[str, int]:
    db = SessionLocal()
    try:
        encomenda = db.query(Encomenda).filter(Encomenda.id == int(encomenda_id)).first()
        if encomenda is None:
            return {"queued": 0, "duplicate": 0, "skipped": 0}
        status = _normalise_status(getattr(encomenda, "status", "nova"))
        if status in _CANCELLED_ENCOMENDA_STATUSES:
            return {"queued": 0, "duplicate": 0, "skipped": 1}
        company = db.query(Empresa).filter(Empresa.id == int(encomenda.empresa_id)).first()
        payload = _encomenda_new_payload(db, encomenda, company)
        empresa_id = int(encomenda.empresa_id)
        entity_id = int(encomenda.id)
    finally:
        db.close()
    return queue_push_to_company(
        empresa_id=empresa_id,
        event_type=_ENCOMENDA_EVENT,
        payload=payload,
        entity_id=entity_id,
    )



def notify_encomenda_cancelled_by_customer(encomenda_id: int) -> dict[str, int]:
    """Avisa o estabelecimento quando o cliente cancela a própria encomenda."""
    db = SessionLocal()
    try:
        encomenda = db.query(Encomenda).filter(Encomenda.id == int(encomenda_id)).first()
        if encomenda is None:
            return {"queued": 0, "duplicate": 0, "skipped": 0}
        company = db.query(Empresa).filter(Empresa.id == int(encomenda.empresa_id)).first()
        number = str(getattr(encomenda, "numero", "") or encomenda.id).strip()
        client = str(getattr(encomenda, "cliente_nome", "") or "Cliente").strip()
        sinal = max(0.0, float(getattr(encomenda, "sinal_valor", 0) or 0))
        pagamento = _normalise_status(getattr(encomenda, "pagamento_status", ""))
        reembolso = _normalise_status(getattr(encomenda, "reembolso_status", ""))
        sinal_retido = sinal if (
            sinal > 0.005
            and pagamento in {"sinal_pago", "pago", "approved", "aprovado"}
            and reembolso == "nao_realizado"
        ) else 0.0
        financeiro = f"Sinal {_money_br(sinal_retido)} mantido • sem reembolso" if sinal_retido > 0.005 else "Sem sinal recebido"
        payload = {
            "title": "Encomenda cancelada pelo cliente",
            "body": f"#{number} • {client} • {financeiro} • Movida para Canceladas"[:240],
            "url": f"/admin/{encomenda.empresa_id}/encomendas?status=cancelada",
            "open_label": "Abrir canceladas",
            "tag": f"mf-encomenda-cancelada-cliente-{encomenda.id}",
            "event": "encomenda_cancelada_cliente",
            "entity_id": encomenda.id,
            "company": getattr(company, "nome", "MenuFacile"),
        }
        empresa_id = int(encomenda.empresa_id)
        entity_id = int(encomenda.id)
    finally:
        db.close()
    return queue_push_to_company(
        empresa_id=empresa_id,
        event_type="encomenda_cancelada_cliente",
        payload=payload,
        entity_id=entity_id,
    )


def notify_new_order(order_id: int) -> dict[str, int]:
    db = SessionLocal()
    try:
        order = db.query(Pedido).filter(Pedido.id == int(order_id)).first()
        if not order:
            return {"queued": 0, "duplicate": 0, "skipped": 0}
        company = db.query(Empresa).filter(Empresa.id == order.empresa_id).first()
        number = int(order.numero_dia or order.id)
        payload = {
            "title": f"Novo pedido #{number:03d}",
            "body": f"{_money_br(order.total)} • {str(order.tipo_pedido or 'Novo pedido')}",
            "url": f"/admin/{order.empresa_id}/pedidos?pedido={order.id}",
            "tag": f"mf-pedido-{order.id}",
            "event": "pedido",
            "entity_id": order.id,
            "company": getattr(company, "nome", "MenuFacile"),
        }
        empresa_id = int(order.empresa_id)
        entity_id = int(order.id)
    finally:
        db.close()
    return queue_push_to_company(
        empresa_id=empresa_id,
        event_type="pedido",
        payload=payload,
        entity_id=entity_id,
    )


def notify_order_cancelled_by_customer(order_id: int) -> dict[str, int]:
    """Avisa o estabelecimento quando um pedido é cancelado pelo cliente."""
    db = SessionLocal()
    try:
        order = db.query(Pedido).filter(Pedido.id == int(order_id)).first()
        if not order:
            return {"queued": 0, "duplicate": 0, "skipped": 0}
        company = db.query(Empresa).filter(Empresa.id == int(order.empresa_id)).first()
        number = int(order.numero_dia or order.id)
        client = str(getattr(order, "nome_cliente", "") or "Cliente").strip()
        origin = _normalise_status(getattr(order, "origem_menu", ""))
        company_type = str(getattr(company, "tipo", "") or "").strip().lower()
        product_company_tokens = ("loja", "catalog", "produto", "ecommerce", "varejo", "mercado", "mercearia", "adega", "farm", "pet", "floric")
        product_order = origin == "produto" or (origin in {"", "pendente"} and any(token in company_type for token in product_company_tokens))
        payload = {
            "title": f"Pedido #{number:03d} cancelado pelo cliente",
            "body": (
                f"{client} • Pagamento ainda não confirmado • Estoque liberado"
                if product_order
                else f"{client} • Pedido retirado da fila • Pagamento não confirmado"
            )[:240],
            "url": (
                f"/admin/{order.empresa_id}/produtos-pedidos?filtro=cancelados"
                if product_order
                else f"/admin/{order.empresa_id}/pedidos?filtro=cancelados"
            ),
            "open_label": "Abrir cancelados",
            "tag": f"mf-pedido-cancelado-cliente-{order.id}",
            "event": "pedido_cancelado_cliente",
            "entity_id": order.id,
            "company": getattr(company, "nome", "MenuFacile"),
        }
        empresa_id = int(order.empresa_id)
        entity_id = int(order.id)
    finally:
        db.close()
    return queue_push_to_company(
        empresa_id=empresa_id,
        event_type="pedido_cancelado_cliente",
        payload=payload,
        entity_id=entity_id,
    )


def notify_new_reservation(reservation_id: int) -> dict[str, int]:
    db = SessionLocal()
    try:
        reservation = db.query(Reserva).filter(Reserva.id == int(reservation_id)).first()
        if not reservation:
            return {"queued": 0, "duplicate": 0, "skipped": 0}
        company = db.query(Empresa).filter(Empresa.id == reservation.empresa_id).first()
        number = int(reservation.numero_dia or reservation.id)
        people = int(reservation.pessoas or 1)
        people_text = "1 pessoa" if people == 1 else f"{people} pessoas"
        payload = {
            "title": f"Novo agendamento #{number:03d}",
            "body": f"{reservation.data} às {reservation.horario} • {people_text}",
            "url": f"/admin/{reservation.empresa_id}/reservas?data={reservation.data}&reserva={reservation.id}",
            "tag": f"mf-reserva-{reservation.id}",
            "event": "reserva",
            "entity_id": reservation.id,
            "company": getattr(company, "nome", "MenuFacile"),
        }
        empresa_id = int(reservation.empresa_id)
        entity_id = int(reservation.id)
    finally:
        db.close()
    return queue_push_to_company(
        empresa_id=empresa_id,
        event_type="reserva",
        payload=payload,
        entity_id=entity_id,
    )



def notify_reservation_awaiting_signal(reservation_id: int) -> dict[str, int]:
    """Notifica um novo agendamento que ainda depende da conferência manual do sinal.

    Diferente de ``notify_new_reservation``, este evento não agenda lembretes de
    atendimento porque a reserva ainda não foi confirmada.
    """
    db = SessionLocal()
    try:
        reservation = db.query(Reserva).filter(Reserva.id == int(reservation_id)).first()
        if not reservation:
            return {"queued": 0, "duplicate": 0, "skipped": 0}
        company = db.query(Empresa).filter(Empresa.id == reservation.empresa_id).first()
        number = int(reservation.numero_dia or reservation.id)
        signal = float(getattr(reservation, "valor_sinal", 0) or 0)
        signal_text = f"R$ {signal:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        payload = {
            "title": f"Agendamento aguardando sinal #{number:03d}",
            "body": f"{reservation.data} às {reservation.horario} • Sinal pendente ({signal_text})",
            "url": f"/admin/{reservation.empresa_id}/reservas?data={reservation.data}&reserva={reservation.id}",
            "tag": f"mf-reserva-sinal-{reservation.id}",
            "event": "reserva_sinal",
            "entity_id": reservation.id,
            "company": getattr(company, "nome", "MenuFacile"),
        }
        empresa_id = int(reservation.empresa_id)
        entity_id = int(reservation.id)
    finally:
        db.close()
    return queue_push_to_company(
        empresa_id=empresa_id,
        event_type="reserva_sinal",
        payload=payload,
        entity_id=entity_id,
    )


def notify_reservation_online_payment(reservation_id: int) -> dict[str, int]:
    """Avisa o estabelecimento quando o sinal/pagamento online da Agenda foi aprovado."""
    db = SessionLocal()
    try:
        reservation = db.query(Reserva).filter(Reserva.id == int(reservation_id)).first()
        if not reservation:
            return {"queued": 0, "duplicate": 0, "skipped": 0}
        company = db.query(Empresa).filter(Empresa.id == reservation.empresa_id).first()
        number = int(reservation.numero_dia or reservation.id)
        total = max(0.0, float(getattr(reservation, "valor_total", 0) or 0))
        received = max(0.0, float(getattr(reservation, "valor_recebido", 0) or 0))
        signal = max(0.0, float(getattr(reservation, "valor_sinal_recebido", 0) or 0))
        amount = signal if signal > 0 else received
        amount_text = _money_br(amount)
        forma = str(getattr(reservation, "forma_pagamento", "") or "").strip().lower()
        forma_label = {
            "cartao_credito_online": "Cartão crédito online",
            "cartao_debito_online": "Cartão débito online",
            "cartao_online": "Cartão online",
            "pix_online": "Pix online",
        }.get(forma, "Pagamento online")
        is_signal = total > 0.005 and amount < (total - 0.005)
        title = f"Sinal pago online #{number:03d}" if is_signal else f"Pagamento online aprovado #{number:03d}"
        body = f"{amount_text} • {forma_label} • {reservation.data} às {str(reservation.horario or '').split(' - ', 1)[0]}"
        payload = {
            "title": title,
            "body": body,
            "url": f"/admin/{reservation.empresa_id}/reservas?data={reservation.data}&reserva={reservation.id}",
            "tag": f"mf-reserva-pagamento-online-{reservation.id}",
            "event": "reserva_pagamento_online",
            "entity_id": reservation.id,
            "company": getattr(company, "nome", "MenuFacile"),
        }
        empresa_id = int(reservation.empresa_id)
        entity_id = int(reservation.id)
    finally:
        db.close()
    return queue_push_to_company(
        empresa_id=empresa_id,
        event_type="reserva_pagamento_online",
        payload=payload,
        entity_id=entity_id,
    )


def notify_reservation_cancelled_by_customer(reservation_id: int) -> dict[str, int]:
    """Notificação operacional quando o próprio cliente cancela pelo menu."""
    db = SessionLocal()
    try:
        reservation = db.query(Reserva).filter(Reserva.id == int(reservation_id)).first()
        if not reservation:
            return {"queued": 0, "duplicate": 0, "skipped": 0}
        company = db.query(Empresa).filter(Empresa.id == reservation.empresa_id).first()
        number = int(reservation.numero_dia or reservation.id)
        nome = str(getattr(reservation, "nome_cliente", None) or "Cliente").strip()
        horario = str(getattr(reservation, "horario", None) or "").split(" - ", 1)[0].strip()
        valor_sinal = max(0.0, float(getattr(reservation, "valor_sinal_recebido", 0) or 0))
        financeiro = f"Sinal {_money_br(valor_sinal)} mantido • sem reembolso" if valor_sinal > 0.005 else "Sem sinal recebido"
        payload = {
            "title": "Agendamento cancelado pelo cliente",
            "body": f"#{number:03d} • {nome} • {reservation.data} às {horario} • {financeiro} • Horário liberado",
            "url": f"/admin/{reservation.empresa_id}/reservas?data={reservation.data}&reserva={reservation.id}",
            "tag": f"mf-reserva-cancelada-cliente-{reservation.id}",
            "event": "reserva_cancelada_cliente",
            "entity_id": reservation.id,
            "company": getattr(company, "nome", "MenuFacile"),
        }
        empresa_id = int(reservation.empresa_id)
        entity_id = int(reservation.id)
    finally:
        db.close()
    return queue_push_to_company(
        empresa_id=empresa_id,
        event_type="reserva_cancelada_cliente",
        payload=payload,
        entity_id=entity_id,
    )


def send_test_notification(
    *,
    empresa_id: int,
    usuario_admin_id: int,
    subscription_id: int | None = None,
) -> dict[str, Any]:
    now_utc = datetime.now(ZoneInfo("UTC"))
    now_rome = datetime.now(_ROME_ZONE)
    test_id = f"751-{int(time.time() * 1000)}"
    result = send_push_to_company(
        empresa_id=int(empresa_id),
        usuario_admin_id=int(usuario_admin_id),
        event_type="teste",
        subscription_id=subscription_id,
        payload={
            "title": f"🔔 Teste Android v752 {now_rome:%H:%M:%S}",
            "body": f"Push completo com app fechado • código {test_id[-6:]}",
            "url": f"/admin/{int(empresa_id)}",
            "tag": f"mf-background-{test_id}",
            "event": "teste",
            "test_id": test_id,
            "sent_at": now_utc.isoformat(timespec="milliseconds"),
            "diagnostic_full": True,
        },
    )
    return {
        **result,
        "test_id": test_id,
        "sent_at": now_utc.isoformat(timespec="milliseconds"),
        "target_subscription_id": int(subscription_id) if subscription_id is not None else None,
    }


def _background_test_now() -> datetime:
    return datetime.now(ZoneInfo("UTC"))


def _background_test_iso(value: datetime | None = None) -> str:
    return (value or _background_test_now()).isoformat(timespec="milliseconds")


def _background_test_parse(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=ZoneInfo("UTC"))
        return parsed.astimezone(ZoneInfo("UTC"))
    except (TypeError, ValueError):
        return None


def _background_test_path(empresa_id: int, usuario_admin_id: int, test_id: str) -> Path:
    token = hashlib.sha256(
        f"{int(empresa_id)}:{int(usuario_admin_id)}:{str(test_id or '')}".encode("utf-8")
    ).hexdigest()
    return _PUSH_BACKGROUND_TEST_DIR / f"{token}.json"


def _background_test_read(empresa_id: int, usuario_admin_id: int, test_id: str) -> dict[str, Any] | None:
    path = _background_test_path(empresa_id, usuario_admin_id, test_id)
    with _PUSH_BACKGROUND_TEST_LOCK:
        try:
            if not path.is_file():
                return None
            payload = json.loads(path.read_text(encoding="utf-8") or "{}")
            return payload if isinstance(payload, dict) else None
        except Exception:
            LOGGER.exception("Falha ao ler teste Push em segundo plano")
            return None


def _background_test_write(record: dict[str, Any]) -> None:
    empresa_id = int(record.get("empresa_id") or 0)
    usuario_admin_id = int(record.get("usuario_admin_id") or 0)
    test_id = str(record.get("test_id") or "")
    if empresa_id <= 0 or usuario_admin_id <= 0 or not test_id:
        raise ValueError("Registro de teste em segundo plano inválido.")
    path = _background_test_path(empresa_id, usuario_admin_id, test_id)
    with _PUSH_BACKGROUND_TEST_LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f"{path.name}.{os.getpid()}.tmp")
        temporary.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
        temporary.replace(path)


def _background_test_update(
    empresa_id: int,
    usuario_admin_id: int,
    test_id: str,
    callback,
) -> dict[str, Any] | None:
    path = _background_test_path(empresa_id, usuario_admin_id, test_id)
    with _PUSH_BACKGROUND_TEST_LOCK:
        try:
            if not path.is_file():
                return None
            record = json.loads(path.read_text(encoding="utf-8") or "{}")
            if not isinstance(record, dict):
                return None
            callback(record)
            record["updated_at"] = _background_test_iso()
            temporary = path.with_name(f"{path.name}.{os.getpid()}.tmp")
            temporary.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
            temporary.replace(path)
            return record
        except Exception:
            LOGGER.exception("Falha ao atualizar teste Push em segundo plano")
            return None


def _run_background_test_send(
    *,
    empresa_id: int,
    usuario_admin_id: int,
    subscription_id: int,
    test_id: str,
    delay_seconds: int,
) -> None:
    try:
        time.sleep(max(1, int(delay_seconds)))
        now_utc = _background_test_now()
        now_rome = datetime.now(_ROME_ZONE)

        def mark_sending(record: dict[str, Any]) -> None:
            record["state"] = "sending"
            record["sending_at"] = _background_test_iso(now_utc)

        _background_test_update(empresa_id, usuario_admin_id, test_id, mark_sending)
        result = send_push_to_company(
            empresa_id=int(empresa_id),
            usuario_admin_id=int(usuario_admin_id),
            event_type="teste",
            subscription_id=int(subscription_id),
            payload={
                "title": f"🔔 Teste em segundo plano {now_rome:%H:%M:%S}",
                "body": "Se este aviso apareceu sem abrir o MenuFacile, o aparelho está pronto.",
                "url": f"/admin/{int(empresa_id)}",
                "tag": f"mf-background-verified-{test_id}",
                "event": "teste",
                "test_id": test_id,
                "sent_at": now_utc.isoformat(timespec="milliseconds"),
                "diagnostic_full": True,
                "background_verification": True,
            },
        )

        def mark_sent(record: dict[str, Any]) -> None:
            record["send_result"] = result
            record["sent_at"] = _background_test_iso(now_utc)
            record["state"] = "sent" if int(result.get("sent", 0)) > 0 else "send_failed"
            if record["state"] == "send_failed":
                record["error"] = "O provedor Push não aceitou o envio para este aparelho."

        _background_test_update(empresa_id, usuario_admin_id, test_id, mark_sent)
    except Exception as exc:
        LOGGER.exception("Falha no envio guiado do teste Push em segundo plano")

        def mark_failed(record: dict[str, Any]) -> None:
            record["state"] = "send_failed"
            record["error"] = str(exc)[:800]

        _background_test_update(empresa_id, usuario_admin_id, test_id, mark_failed)


def schedule_background_test_notification(
    *,
    empresa_id: int,
    usuario_admin_id: int,
    subscription_id: int,
    delay_seconds: int = 12,
) -> dict[str, Any]:
    delay = max(8, min(30, int(delay_seconds or 12)))
    db = SessionLocal()
    try:
        subscription = db.query(PushSubscription).filter(
            PushSubscription.id == int(subscription_id),
            PushSubscription.empresa_id == int(empresa_id),
            PushSubscription.usuario_admin_id == int(usuario_admin_id),
            PushSubscription.ativo == True,  # noqa: E712
        ).first()
        if subscription is None:
            raise ValueError("Este aparelho não está mais inscrito para notificações.")
    finally:
        db.close()

    now = _background_test_now()
    test_id = f"752-bg-{int(time.time() * 1000)}-{int(subscription_id)}"
    record = {
        "version": 752,
        "test_id": test_id,
        "empresa_id": int(empresa_id),
        "usuario_admin_id": int(usuario_admin_id),
        "subscription_id": int(subscription_id),
        "state": "scheduled",
        "scheduled_at": _background_test_iso(now),
        "send_at": _background_test_iso(now + timedelta(seconds=delay)),
        "expires_at": _background_test_iso(now + timedelta(minutes=10)),
        "background_at": "",
        "resumed_at": "",
        "confirmed_at": "",
        "stages": {},
        "error": "",
        "updated_at": _background_test_iso(now),
    }
    _background_test_write(record)
    _BACKGROUND_TEST_EXECUTOR.submit(
        _run_background_test_send,
        empresa_id=int(empresa_id),
        usuario_admin_id=int(usuario_admin_id),
        subscription_id=int(subscription_id),
        test_id=test_id,
        delay_seconds=delay,
    )
    return {
        "ok": True,
        "test_id": test_id,
        "subscription_id": int(subscription_id),
        "delay_seconds": delay,
        "send_at": record["send_at"],
        "expires_at": record["expires_at"],
    }


def mark_background_test_client_stage(
    *,
    empresa_id: int,
    usuario_admin_id: int,
    test_id: str,
    stage: str,
    client_at: str = "",
) -> dict[str, Any]:
    normalized = str(stage or "").strip().lower()
    if normalized not in {"background", "resumed", "confirmed"}:
        raise ValueError("Etapa do teste inválida.")

    field = {"background": "background_at", "resumed": "resumed_at", "confirmed": "confirmed_at"}[normalized]
    now_text = _background_test_iso()

    def apply(record: dict[str, Any]) -> None:
        if not str(record.get(field) or ""):
            record[field] = now_text
        record[f"{normalized}_client_at"] = str(client_at or "")[:100]

    record = _background_test_update(empresa_id, usuario_admin_id, test_id, apply)
    if record is None:
        raise ValueError("Teste em segundo plano não encontrado ou expirado.")
    return background_test_status(
        empresa_id=empresa_id,
        usuario_admin_id=usuario_admin_id,
        test_id=test_id,
    )


def record_background_test_ack(
    *,
    empresa_id: int,
    usuario_admin_id: int,
    subscription_id: int,
    test_id: str,
    stage: str,
    client_at: str = "",
    worker_version: str = "",
    visible_count: int | None = None,
) -> None:
    if not str(test_id or "").startswith(("751-bg-", "752-bg-")):
        return
    normalized = str(stage or "").strip().lower()[:30]
    now_text = _background_test_iso()

    def apply(record: dict[str, Any]) -> None:
        if int(record.get("subscription_id") or 0) != int(subscription_id):
            return
        stages = record.setdefault("stages", {})
        if not isinstance(stages, dict):
            stages = {}
            record["stages"] = stages
        stages[normalized] = {
            "server_at": now_text,
            "client_at": str(client_at or "")[:100],
            "worker_version": str(worker_version or "")[:80],
            "visible_count": visible_count,
        }

    _background_test_update(empresa_id, usuario_admin_id, test_id, apply)


def background_test_status(
    *,
    empresa_id: int,
    usuario_admin_id: int,
    test_id: str,
) -> dict[str, Any]:
    record = _background_test_read(empresa_id, usuario_admin_id, test_id)
    if record is None:
        raise ValueError("Teste em segundo plano não encontrado ou expirado.")
    if (
        int(record.get("empresa_id") or 0) != int(empresa_id)
        or int(record.get("usuario_admin_id") or 0) != int(usuario_admin_id)
    ):
        raise ValueError("Teste em segundo plano inválido.")

    stages = record.get("stages") if isinstance(record.get("stages"), dict) else {}
    shown_data = stages.get("shown") if isinstance(stages.get("shown"), dict) else None
    if shown_data is None and isinstance(stages.get("displayed"), dict):
        shown_data = stages.get("displayed")
    shown_at = _background_test_parse((shown_data or {}).get("server_at"))
    background_at = _background_test_parse(record.get("background_at"))
    resumed_at = _background_test_parse(record.get("resumed_at"))
    confirmed_at = _background_test_parse(record.get("confirmed_at"))
    send_at = _background_test_parse(record.get("send_at"))
    expires_at = _background_test_parse(record.get("expires_at"))
    now = _background_test_now()

    shown_after_background = bool(
        shown_at is not None
        and background_at is not None
        and shown_at >= background_at - timedelta(seconds=1)
    )
    shown_before_resume = bool(
        shown_at is not None
        and resumed_at is not None
        and shown_at <= resumed_at - timedelta(seconds=1)
    )
    # Alguns navegadores Samsung suspendem a página tão rápido ao pressionar
    # Home que o beacon de ``background`` não alcança o servidor. Nesses casos,
    # o botão “Confirmar que chegou” continua sendo confiável quando o servidor
    # já registrou ``shown`` antes de ``resumed``. Assim, ``background_at`` é uma
    # prova preferencial, mas não bloqueia a aprovação manual do teste.
    verified = bool(
        shown_before_resume
        and (shown_after_background or confirmed_at is not None)
    )
    late_after_resume = bool(
        shown_at is not None
        and resumed_at is not None
        and not shown_before_resume
    )

    deadline = (send_at + timedelta(seconds=50)) if send_at is not None else None
    raw_state = str(record.get("state") or "waiting")
    if verified:
        outcome = "verified"
    elif raw_state == "send_failed":
        outcome = "send_failed"
    elif late_after_resume:
        outcome = "not_verified"
    elif resumed_at is not None and deadline is not None and now >= deadline and shown_at is None:
        outcome = "not_verified"
    elif expires_at is not None and now >= expires_at:
        outcome = "expired"
    else:
        outcome = "waiting"

    return {
        "ok": True,
        "test_id": str(record.get("test_id") or ""),
        "subscription_id": int(record.get("subscription_id") or 0),
        "state": raw_state,
        "outcome": outcome,
        "verified": verified,
        "background_recorded": background_at is not None,
        "resumed_recorded": resumed_at is not None,
        "confirmed_recorded": confirmed_at is not None,
        "shown_recorded": shown_at is not None,
        "shown_at": _background_test_iso(shown_at) if shown_at else "",
        "background_at": _background_test_iso(background_at) if background_at else "",
        "resumed_at": _background_test_iso(resumed_at) if resumed_at else "",
        "confirmed_at": _background_test_iso(confirmed_at) if confirmed_at else "",
        "send_at": str(record.get("send_at") or ""),
        "expires_at": str(record.get("expires_at") or ""),
        "stages": sorted(str(key) for key in stages.keys()),
        "error": str(record.get("error") or "")[:800],
    }


def _delayed_call(callback, entity_id: int) -> None:
    # Permite que a transação que criou/aprovou o registro termine no SQLite.
    time.sleep(0.6)
    callback(int(entity_id))


def _delayed_new_reservation(reservation_id: int) -> None:
    time.sleep(0.6)
    notify_new_reservation(int(reservation_id))
    schedule_reservation_reminder(int(reservation_id))


def _delayed_process_due() -> None:
    time.sleep(0.8)
    process_due_push_deliveries()


def _delayed_new_encomenda(encomenda_id: int) -> None:
    time.sleep(0.6)
    notify_new_encomenda(int(encomenda_id))
    schedule_encomenda_operational_reminders(int(encomenda_id))


def enqueue_new_order(order_id: int) -> None:
    _EXECUTOR.submit(_delayed_call, notify_new_order, int(order_id))


def enqueue_order_cancelled_by_customer(order_id: int) -> None:
    _EXECUTOR.submit(_delayed_call, notify_order_cancelled_by_customer, int(order_id))


def enqueue_new_reservation(reservation_id: int) -> None:
    _EXECUTOR.submit(_delayed_new_reservation, int(reservation_id))


def enqueue_reservation_awaiting_signal(reservation_id: int) -> None:
    # Notificação informativa apenas. O lembrete operacional só é agendado
    # depois que o sinal manual for confirmado pelo estabelecimento.
    _EXECUTOR.submit(_delayed_call, notify_reservation_awaiting_signal, int(reservation_id))


def enqueue_reservation_online_payment(reservation_id: int) -> None:
    _EXECUTOR.submit(_delayed_call, notify_reservation_online_payment, int(reservation_id))


def enqueue_reservation_cancelled_by_customer(reservation_id: int) -> None:
    _EXECUTOR.submit(_delayed_call, notify_reservation_cancelled_by_customer, int(reservation_id))


def enqueue_new_encomenda(encomenda_id: int) -> None:
    _EXECUTOR.submit(_delayed_new_encomenda, int(encomenda_id))


def enqueue_encomenda_cancelled_by_customer(encomenda_id: int) -> None:
    _EXECUTOR.submit(_delayed_call, notify_encomenda_cancelled_by_customer, int(encomenda_id))


def _worker_loop() -> None:
    # Fallback local/desenvolvimento. Em produção, o serviço systemd v744 roda
    # de forma independente do FastAPI e não depende de alguém abrir o app.
    while not _WORKER_STOP.is_set():
        try:
            run_push_worker_cycle(heartbeat=False)
        except Exception:
            LOGGER.exception("Worker interno de notificações encontrou um erro")
        _WORKER_STOP.wait(_WORKER_INTERVAL_SECONDS)


def start_push_delivery_worker() -> bool:
    global _WORKER_STARTED
    with _WORKER_LOCK:
        if _WORKER_STARTED:
            return False
        _WORKER_STARTED = True
        thread = threading.Thread(
            target=_worker_loop,
            name="mf-push-persistent-worker",
            daemon=True,
        )
        thread.start()
        LOGGER.info("Worker persistente de notificações iniciado (intervalo: %ss)", _WORKER_INTERVAL_SECONDS)
        return True
