"""Expiração automática de pagamentos/sinais pendentes das Encomendas.

v792 (base v790)
- Reutiliza ``Empresa.sinal_prazo_minutos``; não cria configuração nova.
- Pix manual/sinal expira ao fim do prazo.
- Pix online Mercado Pago é consultado antes de expirar: se já estiver aprovado,
  libera a encomenda; se continuar pendente, a cobrança é cancelada e a
  encomenda vai para Canceladas.
- Cartão online ``pending/in_process`` NÃO usa o prazo curto do Pix e permanece
  aguardando atualização do Mercado Pago.
- Dinheiro/cartão presencial não passam por esta rotina.

A rotina pode ser chamada pelo worker independente e também ao abrir a Central,
para que o comportamento seja testável no ambiente local sem systemd.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from sqlalchemy import or_

from backend.database import SessionLocal
from backend.models import Empresa, Encomenda
from backend.timezone_utils import agora_brasilia
from backend.services.mercadopago_service import MercadoPagoService
from backend.services.payment_service import PaymentError, PaymentService

LOGGER = logging.getLogger("menufacile.encomendas.expiry")

PENDING_PAYMENT_STATUSES = {
    "pendente",
    "pending",
    "aguardando_pagamento",
    "aguardando_sinal",
    "in_process",
    "inprocess",
}
OPERABLE_ORDER_STATUSES = {"nova", "aguardando_pagamento", "aguardando_sinal"}
FINAL_MP_FAILURES = {"rejected", "cancelled", "canceled", "refunded", "charged_back"}
PENDING_MP_STATUSES = {"pending", "in_process", "authorized"}


def _normalizar(valor: Any) -> str:
    return str(valor or "").strip().lower()


def _prazo_minutos(empresa: Empresa) -> int:
    try:
        valor = int(getattr(empresa, "sinal_prazo_minutos", 30) or 30)
    except (TypeError, ValueError):
        valor = 30
    return min(1440, max(5, valor))


def _marcar_cancelada_expirada(encomenda: Encomenda, *, origem: str) -> None:
    encomenda.status = "cancelada"
    encomenda.pagamento_status = "cancelado"
    encomenda.gateway_status = "expired"
    encomenda.gateway_status_detail = f"mf_v790_expired:{origem}"


def _marcar_aprovada(encomenda: Encomenda, payment: dict[str, Any]) -> None:
    """Aplica aprovação sem regredir a etapa operacional da encomenda."""
    status_anterior = _normalizar(getattr(encomenda, "status", ""))
    PaymentService.update_origin(
        encomenda,
        payment,
        origin_type="encomenda",
        on_approved=None,
    )
    if status_anterior in {"confirmada", "producao", "pronta", "entregue", "finalizada"}:
        encomenda.status = status_anterior
    metodo_id = _normalizar(payment.get("payment_method_id"))
    tipo_id = _normalizar(payment.get("payment_type_id"))
    if metodo_id == "pix" or tipo_id == "bank_transfer":
        encomenda.gateway_pagamento = "pix_online"
    elif metodo_id:
        encomenda.gateway_pagamento = "cartao_online"
    sinal = round(float(getattr(encomenda, "sinal_valor", 0) or 0), 2)
    saldo = round(float(getattr(encomenda, "saldo_valor", 0) or 0), 2)
    if sinal > 0 and saldo > 0:
        encomenda.pagamento_status = "sinal_pago"
    else:
        encomenda.pagamento_status = "pago"
    # v792 — confirmação financeira não regride a etapa operacional.
    if _normalizar(getattr(encomenda, "status", "")) in {"aguardando_pagamento", "aguardando_sinal"}:
        encomenda.status = "nova"


def _metodo_online_persistido(encomenda: Encomenda) -> str:
    metodo = _normalizar(getattr(encomenda, "gateway_pagamento", ""))
    if metodo in {"pix_online", "cartao_online", "pix_sinal_manual"}:
        return metodo
    # Compatibilidade: algumas cobranças antigas tiveram o provedor salvo como
    # ``mercadopago`` pelo núcleo compartilhado. A consulta abaixo identifica o
    # método real e volta a persistir pix_online/cartao_online.
    return metodo


def processar_expiracao_encomendas_empresa(db, empresa: Empresa, *, agora=None) -> dict[str, int]:
    """Processa apenas encomendas vencidas de uma empresa.

    Retorna contadores; nunca lança erro de rede do Mercado Pago para o chamador.
    Em caso de dúvida/indisponibilidade do gateway, mantém a encomenda pendente
    para evitar cancelar algo que pode ter sido pago.
    """
    resultado = {
        "analisadas": 0,
        "expiradas": 0,
        "aprovadas_encontradas": 0,
        "cartao_em_analise": 0,
        "gateway_indisponivel": 0,
    }
    if not empresa:
        return resultado

    agora = agora or agora_brasilia()
    limite = agora - timedelta(minutes=_prazo_minutos(empresa))

    registros = db.query(Encomenda).filter(
        Encomenda.empresa_id == empresa.id,
        Encomenda.criado_em.isnot(None),
        Encomenda.criado_em <= limite,
        Encomenda.status.in_(tuple(OPERABLE_ORDER_STATUSES)),
        Encomenda.pagamento_status.in_(tuple(PENDING_PAYMENT_STATUSES)),
    ).order_by(Encomenda.id.asc()).all()

    if not registros:
        return resultado

    token: str | None = None
    mp: MercadoPagoService | None = None

    def get_mp() -> MercadoPagoService | None:
        nonlocal token, mp
        if mp is not None:
            return mp
        try:
            token = PaymentService.ensure_company_enabled(empresa)
            mp = MercadoPagoService(token)
            return mp
        except (PaymentError, ValueError) as exc:
            LOGGER.warning(
                "v790: Mercado Pago indisponível para expiração empresa=%s: %s",
                getattr(empresa, "id", None),
                exc,
            )
            return None

    for encomenda in registros:
        resultado["analisadas"] += 1
        metodo = _metodo_online_persistido(encomenda)
        payment_id = str(getattr(encomenda, "gateway_payment_id", "") or "").strip()
        gateway_status = _normalizar(getattr(encomenda, "gateway_status", ""))
        gateway_detail = _normalizar(getattr(encomenda, "gateway_status_detail", ""))

        # Cartão identificado explicitamente: não usa o prazo curto do Pix.
        if metodo == "cartao_online":
            resultado["cartao_em_analise"] += 1
            continue

        # Pix manual por chave/comprovante não possui cobrança no gateway.
        if metodo == "pix_sinal_manual" or (
            _normalizar(getattr(encomenda, "pagamento_status", "")) == "aguardando_sinal"
            and not payment_id
        ):
            _marcar_cancelada_expirada(encomenda, origem="pix_manual")
            resultado["expiradas"] += 1
            continue

        # Pix online selecionado mas o cliente nunca chegou a gerar a cobrança.
        if metodo == "pix_online" and not payment_id:
            _marcar_cancelada_expirada(encomenda, origem="pix_online_sem_cobranca")
            resultado["expiradas"] += 1
            continue

        if not payment_id:
            # Não sabemos com segurança se é Pix ou cartão. Não cancela.
            continue

        # Atalho para registros já reconhecidos como cartão pelo status_detail.
        if metodo == "mercadopago" and gateway_detail in {
            "pending_contingency",
            "pending_review_manual",
            "pending_card_payment",
        }:
            encomenda.gateway_pagamento = "cartao_online"
            resultado["cartao_em_analise"] += 1
            continue

        cliente = get_mp()
        if cliente is None:
            resultado["gateway_indisponivel"] += 1
            continue

        consulta = cliente.get_payment(payment_id)
        if not consulta.ok:
            resultado["gateway_indisponivel"] += 1
            LOGGER.warning(
                "v790: falha ao consultar pagamento %s da encomenda %s (HTTP %s)",
                payment_id,
                encomenda.id,
                consulta.status_code,
            )
            continue

        payment = consulta.data or {}
        mp_status = _normalizar(payment.get("status"))
        payment_method_id = _normalizar(payment.get("payment_method_id"))
        payment_type_id = _normalizar(payment.get("payment_type_id"))
        is_pix = payment_method_id == "pix" or payment_type_id == "bank_transfer"

        # Guarda novamente o método real para futuras iterações e para a Central.
        if is_pix:
            encomenda.gateway_pagamento = "pix_online"
        elif payment_method_id:
            encomenda.gateway_pagamento = "cartao_online"

        encomenda.gateway_status = str(payment.get("status") or encomenda.gateway_status or "")
        encomenda.gateway_status_detail = str(payment.get("status_detail") or encomenda.gateway_status_detail or "")

        if mp_status == "approved":
            _marcar_aprovada(encomenda, payment)
            resultado["aprovadas_encontradas"] += 1
            continue

        if not is_pix:
            # Cartão online pendente/em análise não é cancelado pelo prazo do Pix.
            resultado["cartao_em_analise"] += 1
            continue

        if mp_status in FINAL_MP_FAILURES:
            _marcar_cancelada_expirada(encomenda, origem=f"pix_online_{mp_status}")
            resultado["expiradas"] += 1
            continue

        if mp_status in PENDING_MP_STATUSES or not mp_status:
            # Para evitar uma cobrança ainda pagável depois do cancelamento local,
            # só marcamos como expirada se o Mercado Pago aceitar o cancelamento.
            cancelamento = cliente.cancel_payment(payment_id)
            if cancelamento.ok:
                _marcar_cancelada_expirada(encomenda, origem="pix_online_prazo")
                resultado["expiradas"] += 1
                continue

            # Pode ter ocorrido corrida: o cliente pagou exatamente nesse momento.
            segunda_consulta = cliente.get_payment(payment_id)
            if segunda_consulta.ok and _normalizar(segunda_consulta.data.get("status")) == "approved":
                _marcar_aprovada(encomenda, segunda_consulta.data)
                resultado["aprovadas_encontradas"] += 1
                continue

            # Segurança: sem confirmação do cancelamento, não cancela localmente.
            resultado["gateway_indisponivel"] += 1
            LOGGER.warning(
                "v790: não foi seguro expirar Pix %s da encomenda %s; será tentado novamente.",
                payment_id,
                encomenda.id,
            )
            continue

        # Qualquer status inesperado permanece aguardando para não gerar falso cancelamento.
        LOGGER.info(
            "v790: status Mercado Pago não expirado automaticamente encomenda=%s status=%s",
            encomenda.id,
            mp_status,
        )

    db.commit()
    return resultado


def run_encomenda_expiry_cycle() -> dict[str, int]:
    """Ciclo global usado pelo worker de produção."""
    total = {
        "empresas": 0,
        "analisadas": 0,
        "expiradas": 0,
        "aprovadas_encontradas": 0,
        "cartao_em_analise": 0,
        "gateway_indisponivel": 0,
    }
    db = SessionLocal()
    try:
        empresa_ids = [
            row[0]
            for row in db.query(Encomenda.empresa_id)
            .filter(
                Encomenda.status.in_(tuple(OPERABLE_ORDER_STATUSES)),
                Encomenda.pagamento_status.in_(tuple(PENDING_PAYMENT_STATUSES)),
            )
            .distinct()
            .all()
        ]
        for empresa_id in empresa_ids:
            empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
            if not empresa:
                continue
            total["empresas"] += 1
            parcial = processar_expiracao_encomendas_empresa(db, empresa)
            for chave in total:
                if chave == "empresas":
                    continue
                total[chave] += int(parcial.get(chave, 0) or 0)
        return total
    except Exception:
        db.rollback()
        LOGGER.exception("v790: falha no ciclo global de expiração de Encomendas")
        return total
    finally:
        db.close()
