"""Núcleo central de pagamentos para pedidos, produtos e serviços."""
from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, Mapping

from .mercadopago_service import MercadoPagoResponse, MercadoPagoService
from .security_service import SecretProtectionError, decrypt_secret


class PaymentError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 400, details: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details


@dataclass(slots=True)
class PaymentResult:
    origin_type: str
    origin_id: int
    payment_id: str | None
    status: str | None
    status_detail: str | None
    qr_code: str | None = None
    qr_code_base64: str | None = None
    ticket_url: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": True,
            f"{self.origin_type}_id": self.origin_id,
            "payment_id": self.payment_id,
            "status": self.status,
            "status_detail": self.status_detail,
            "qr_code": self.qr_code,
            "qr_code_base64": self.qr_code_base64,
            "ticket_url": self.ticket_url,
        }


class PaymentService:
    FINAL_FAILURE_STATUSES = {"rejected", "cancelled", "refunded", "charged_back"}

    # V898: falhas transitórias de rede/API não devem obrigar o cliente a clicar
    # várias vezes. A mesma tentativa é repetida com a MESMA chave de
    # idempotência, evitando criar cobranças duplicadas. Recusas reais do cartão
    # (status=rejected) não entram neste retry.
    TRANSIENT_CREATE_HTTP_STATUSES = {408, 425, 429, 500, 502, 503, 504}
    MAX_CREATE_ATTEMPTS = 3

    @staticmethod
    def reservation_amount(reservation: Any) -> float:
        # Reservas e agendamentos podem cobrar somente o sinal ou o valor integral.
        # Os campos persistidos são a fonte de verdade; o texto da observação fica
        # apenas como compatibilidade com registros antigos.
        try:
            signal_amount = round(float(getattr(reservation, "valor_sinal", 0) or 0), 2)
        except (TypeError, ValueError):
            signal_amount = 0.0
        if signal_amount > 0:
            return signal_amount
        try:
            total_amount = round(float(getattr(reservation, "valor_total", 0) or 0), 2)
        except (TypeError, ValueError):
            total_amount = 0.0
        if total_amount > 0:
            return total_amount

        text = str(getattr(reservation, "observacao", "") or "")
        patterns = (
            r"Total:\s*[€$R$\s]*([0-9]+(?:[\.,][0-9]{1,2})?)",
            r"total\s*=\s*([0-9]+(?:[\.,][0-9]{1,2})?)",
            r"€\s*([0-9]+(?:[\.,][0-9]{1,2})?)",
        )
        for pattern in patterns:
            match = re.search(pattern, text, flags=re.I)
            if match:
                try:
                    return round(float(match.group(1).replace(",", ".")), 2)
                except (TypeError, ValueError):
                    continue
        return 0.0

    @staticmethod
    def ensure_company_enabled(company: Any) -> str:
        if not company:
            raise PaymentError("Empresa não encontrada.", status_code=404)
        if not getattr(company, "pagamentos_online_ativo", False):
            raise PaymentError("Pagamentos online estão desativados.")
        try:
            token = decrypt_secret(getattr(company, "mercadopago_access_token", ""))
        except SecretProtectionError as error:
            raise PaymentError(
                "As credenciais de pagamento não puderam ser abertas. Contate o administrador.",
                status_code=503,
            ) from error
        if not token:
            raise PaymentError("Access Token do Mercado Pago não configurado.")
        return token

    @classmethod
    def update_origin(
        cls,
        origin: Any,
        payment: Mapping[str, Any],
        *,
        origin_type: str,
        on_approved: Callable[[], None] | None = None,
    ) -> None:
        status = str(payment.get("status") or "")
        detail = str(payment.get("status_detail") or "")
        payment_id = payment.get("id")

        # Encomendas precisam preservar o método escolhido
        # (cartao_online / pix_online / pix_sinal_manual).
        # A informação de que o provedor é Mercado Pago já existe
        # em gateway_payment_id / gateway_status / gateway_status_detail.
        if origin_type != "encomenda":
            origin.gateway_pagamento = "mercadopago"

        # V932: em pedidos e Agenda a forma final deve refletir o meio
        # realmente aprovado pelo Mercado Pago. O cliente escolhe apenas
        # "Cartão online" e o gateway informa se foi crédito ou débito.
        if origin_type in {"reserva", "pedido"}:
            payment_method_id = str(payment.get("payment_method_id") or "").strip().lower()
            payment_type_id = str(payment.get("payment_type_id") or "").strip().lower()
            if payment_method_id == "pix":
                origin.forma_pagamento = "pix_online"
            elif payment_type_id == "debit_card":
                origin.forma_pagamento = "cartao_debito_online"
            elif payment_type_id == "credit_card":
                origin.forma_pagamento = "cartao_credito_online"

        if payment_id is not None:
            origin.gateway_payment_id = str(payment_id)
        origin.gateway_status = status
        origin.gateway_status_detail = detail

        payment_status_attr = "pagamento_status" if origin_type == "encomenda" else "status_pagamento"
        current_payment_status = str(getattr(origin, payment_status_attr, None) or "").strip().lower()
        was_paid = current_payment_status in {"pago", "sinal_pago", "parcial"}
        if status == "approved":
            # V925 — idempotência da confirmação de encomendas.
            # A cobrança online da encomenda pode representar somente o sinal.
            # Quando a resposta inicial já converteu o pagamento para sinal_pago,
            # o webhook/reconsulta do MESMO approved não pode promover o registro
            # para pago integral nem regredir o status operacional para Nova.
            if origin_type == "encomenda" and was_paid:
                if not getattr(origin, "pago_em", None):
                    origin.pago_em = datetime.utcnow()
            elif origin_type == "reserva" and was_paid:
                # V929: resposta inicial + webhook do mesmo approved não podem
                # promover um sinal parcial a pagamento integral nem disparar
                # novamente o callback/Financeiro/push.
                if current_payment_status == "pago" and not getattr(origin, "pago_em", None):
                    origin.pago_em = datetime.utcnow()
            else:
                setattr(origin, payment_status_attr, "pago")
                origin.pago_em = datetime.utcnow()
                if origin_type == "pedido":
                    origin.status = "novo"
                elif origin_type == "encomenda":
                    origin.status = "nova"
                else:
                    origin.status = "pendente"
                    if hasattr(origin, "horario_liberado"):
                        origin.horario_liberado = False
                if not was_paid and on_approved:
                    on_approved()
        elif status in {"cancelled", "canceled"}:
            # Cancelamento confirmado pelo gateway não é recusa. Isso preserva
            # a semântica correta quando o próprio cliente cancela um Pix.
            setattr(origin, payment_status_attr, "cancelado")
            origin.status = "pagamento_cancelado"
            if hasattr(origin, "horario_liberado"):
                origin.horario_liberado = True
        elif status in cls.FINAL_FAILURE_STATUSES:
            setattr(origin, payment_status_attr, "recusado")
            origin.status = "pagamento_recusado"
            if hasattr(origin, "horario_liberado"):
                origin.horario_liberado = True
        else:
            setattr(origin, payment_status_attr, "pendente")
            origin.status = "aguardando_pagamento"
            if hasattr(origin, "horario_liberado"):
                origin.horario_liberado = False


    @staticmethod
    def status_payload(origin: Any, origin_type: str) -> dict[str, Any]:
        payment_status_attr = "pagamento_status" if origin_type == "encomenda" else "status_pagamento"
        return {
            "ok": True,
            "tipo": origin_type,
            "id": int(origin.id),
            "status_pagamento": getattr(origin, payment_status_attr, None),
            "gateway_status": getattr(origin, "gateway_status", None),
            "gateway_status_detail": getattr(origin, "gateway_status_detail", None),
            "payment_id": getattr(origin, "gateway_payment_id", None),
            "status": getattr(origin, "status", None),
        }

    @staticmethod
    def cancel_pending(origin: Any) -> None:
        if getattr(origin, "status_pagamento", None) == "pago":
            raise PaymentError(
                "O pagamento já foi aprovado e não pode ser descartado pelo checkout.",
                status_code=409,
            )
        origin.status_pagamento = "cancelado"
        origin.status = "pagamento_cancelado"
        origin.gateway_status = "cancelled_by_customer"
        origin.gateway_status_detail = "customer_cancelled_pix_checkout"
        if hasattr(origin, "horario_liberado"):
            origin.horario_liberado = True

    @staticmethod
    def external_reference(origin_type: str, company_id: int, origin_id: int) -> str:
        if origin_type == "reserva":
            return f"reserva:{int(company_id)}:{int(origin_id)}"
        if origin_type == "encomenda":
            return f"encomenda:{int(company_id)}:{int(origin_id)}"
        return f"{int(company_id)}:{int(origin_id)}"

    @classmethod
    def locate_payment(
        cls,
        *,
        company: Any,
        origin: Any,
        origin_type: str,
        amount: float,
        timeout: int = 8,
    ) -> Mapping[str, Any] | None:
        """Localiza uma cobrança ativa/aprovada da mesma origem após resposta ambígua.

        Não escolhe pagamentos rejeitados/cancelados. Isso evita que um timeout
        faça o cliente criar uma segunda cobrança quando a primeira chegou ao
        Mercado Pago mas a resposta não voltou ao MenuFacile.
        """
        token = cls.ensure_company_enabled(company)
        company_id = int(company.id)
        origin_id = int(origin.id)
        external_reference = cls.external_reference(origin_type, company_id, origin_id)
        expected_amount = round(float(amount or 0), 2)
        response = MercadoPagoService(token, timeout=timeout).search_payments(external_reference)
        if not response.ok:
            return None
        results = response.data.get("results")
        if not isinstance(results, list):
            return None
        accepted = {"approved", "pending", "in_process", "authorized"}
        for payment in results:
            if not isinstance(payment, Mapping):
                continue
            if str(payment.get("external_reference") or "") != external_reference:
                continue
            try:
                payment_amount = round(float(payment.get("transaction_amount") or 0), 2)
            except (TypeError, ValueError):
                continue
            if abs(payment_amount - expected_amount) > 0.01:
                continue
            if str(payment.get("status") or "").strip().lower() not in accepted:
                continue
            return payment
        return None

    @classmethod
    def create_payment(
        cls,
        *,
        company: Any,
        origin: Any,
        origin_type: str,
        amount: float,
        form_data: Mapping[str, Any],
        device_id: str | None = None,
        payer_email: str,
        notification_url: str | None,
        on_approved: Callable[[], None] | None = None,
    ) -> PaymentResult:
        token = cls.ensure_company_enabled(company)
        amount = round(float(amount or 0), 2)
        if amount <= 0:
            raise PaymentError("O valor do pagamento é inválido.")

        company_id = int(company.id)
        origin_id = int(origin.id)
        number = getattr(origin, "numero_dia", None) or origin_id
        is_reservation = origin_type == "reserva"
        is_order = origin_type == "pedido"
        external_reference = cls.external_reference(origin_type, company_id, origin_id)
        if is_reservation:
            description_label = "Agendamento"
        elif origin_type == "encomenda":
            description_label = "Encomenda"
        else:
            description_label = "Pedido"

        payload = dict(form_data or {})
        payload.update({
            "transaction_amount": amount,
            "description": f"{description_label} #{number} - {company.nome}",
            "external_reference": external_reference,
            "metadata": {
                "tipo": origin_type,
                "empresa_id": company_id,
                f"{origin_type}_id": origin_id,
                "numero_dia": getattr(origin, "numero_dia", None),
            },
        })
        if notification_url:
            payload["notification_url"] = notification_url
        payer = dict(payload.get("payer") or {})
        email_recebido = str(payer_email or "").strip()
        email_brick = str(payer.get("email") or "").strip()

        if email_recebido:
            payer["email"] = email_recebido
        elif email_brick:
            payer["email"] = email_brick
        else:
            payer["email"] = "cliente@menufacile.org"

        payload["payer"] = payer

        # A mesma tentativa (por exemplo, duplo clique/repetição de rede) usa a
        # mesma chave. Um novo token de cartão gera uma nova tentativa legítima.
        attempt_material = {
            "origin_type": origin_type,
            "origin_id": origin_id,
            "public_token": str(getattr(origin, "public_token", "") or ""),
            "payment_method_id": str(payload.get("payment_method_id") or ""),
            "token": str(payload.get("token") or ""),
            "issuer_id": str(payload.get("issuer_id") or ""),
            "installments": str(payload.get("installments") or ""),
        }
        digest = hashlib.sha256(
            json.dumps(attempt_material, sort_keys=True, ensure_ascii=True).encode("utf-8")
        ).hexdigest()

        idempotency_key = f"mf-{digest[:48]}"

        # V898: uma oscilação curta do Mercado Pago/rede deve ser absorvida pelo
        # servidor. Repetimos somente respostas HTTP transitórias e sempre com a
        # mesma X-Idempotency-Key. Assim um clique do cliente pode sobreviver a
        # uma falha momentânea sem disparar uma nova cobrança independente.
        mp_client = MercadoPagoService(token, timeout=12)
        response = None

        # V926 — se uma tentativa anterior terminou em timeout, primeiro procura
        # a cobrança pelo external_reference. Só cria outra se nada foi localizado.
        # Isso protege inclusive quando o Brick gera um novo token de cartão no retry.
        prior_gateway_status = str(getattr(origin, "gateway_status", "") or "").strip().lower()
        prior_gateway_detail = str(getattr(origin, "gateway_status_detail", "") or "").strip().lower()
        if prior_gateway_status == "unknown" or "v926_create_timeout" in prior_gateway_detail:
            recovered = cls.locate_payment(
                company=company,
                origin=origin,
                origin_type=origin_type,
                amount=amount,
                timeout=8,
            )
            if recovered is not None:
                response = MercadoPagoResponse(200, dict(recovered))

        if response is None:
            for attempt in range(cls.MAX_CREATE_ATTEMPTS):
                response = mp_client.create_payment(
                    payload,
                    idempotency_key,
                    device_id=device_id,
                )
                if response.ok:
                    break
                if int(response.status_code or 0) not in cls.TRANSIENT_CREATE_HTTP_STATUSES:
                    break
                if attempt + 1 < cls.MAX_CREATE_ATTEMPTS:
                    time.sleep(0.6 * (2 ** attempt))

        # V926 — uma resposta 5xx/timeout é ambígua: a cobrança pode ter sido
        # criada no Mercado Pago mesmo sem a resposta chegar ao MenuFacile. Antes
        # de informar falha, reconciliamos pelo external_reference + valor.
        if response is not None and not response.ok and int(response.status_code or 0) in cls.TRANSIENT_CREATE_HTTP_STATUSES:
            recovered = cls.locate_payment(
                company=company,
                origin=origin,
                origin_type=origin_type,
                amount=amount,
                timeout=8,
            )
            if recovered is not None:
                response = MercadoPagoResponse(200, dict(recovered))

        if response is None:
            raise PaymentError(
                "Não foi possível iniciar o pagamento agora. Tente novamente em alguns segundos.",
                status_code=503,
                details={"transient_create": True},
            )

        if not response.ok:
            payment_status_attr = "pagamento_status" if origin_type == "encomenda" else "status_pagamento"
            is_transient = int(response.status_code or 0) in cls.TRANSIENT_CREATE_HTTP_STATUSES
            if is_transient:
                # Estado propositalmente ambíguo: não declaramos pagamento recusado
                # nem erro definitivo, porque a criação pode ter ocorrido no gateway.
                origin.gateway_status = "unknown"
                origin.gateway_status_detail = "v926_create_timeout_reconcile_pending"
                details = {
                    "transient_create": True,
                    "message": str(response.data.get("message") or "Mercado Pago temporariamente indisponível"),
                }
            else:
                setattr(origin, payment_status_attr, "erro")
                origin.gateway_status_detail = str(response.data.get("message") or response.data)
                details = response.data
            raise PaymentError(
                (
                    "O Mercado Pago está demorando para responder. Aguarde alguns segundos e tente novamente."
                    if is_transient
                    else "O Mercado Pago não conseguiu processar o pagamento."
                ),
                status_code=503 if is_transient else 400,
                details=details,
            )

        cls.update_origin(origin, response.data, origin_type=origin_type, on_approved=on_approved)
        transaction = ((response.data.get("point_of_interaction") or {}).get("transaction_data") or {})
        return PaymentResult(
            origin_type=origin_type,
            origin_id=origin_id,
            payment_id=str(response.data.get("id")) if response.data.get("id") is not None else None,
            status=response.data.get("status"),
            status_detail=response.data.get("status_detail"),
            qr_code=transaction.get("qr_code"),
            qr_code_base64=transaction.get("qr_code_base64"),
            ticket_url=transaction.get("ticket_url"),
        )
