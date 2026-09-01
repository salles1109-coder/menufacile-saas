"""Sincronização manual/fallback de pagamentos com o gateway."""
from __future__ import annotations

from typing import Any, Callable

from .mercadopago_service import MercadoPagoService
from .payment_service import PaymentError, PaymentService
from .payment_webhook import amounts_match, parse_external_reference


def _expected_amount(origin: Any, origin_type: str) -> float:
    if origin_type == "reserva":
        return PaymentService.reservation_amount(origin)
    if origin_type == "encomenda":
        try:
            signal = round(float(getattr(origin, "sinal_valor", 0) or 0), 2)
        except (TypeError, ValueError):
            signal = 0.0
        if signal > 0:
            return signal
    try:
        return round(float(getattr(origin, "total", 0) or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def sync_origin(
    company: Any,
    origin: Any,
    origin_type: str,
    *,
    on_approved: Callable[[], None] | None = None,
) -> dict:
    """Consulta o Mercado Pago e sincroniza somente a cobrança ligada à origem.

    Além do ID persistido, confere ``external_reference`` e valor antes de
    alterar o estado local. Isso deixa o fallback seguro para Pedido, Reserva
    e Encomenda e garante que callbacks operacionais rodem apenas na primeira
    aprovação.
    """
    payment_id = getattr(origin, "gateway_payment_id", None)
    if not payment_id:
        raise PaymentError("Pagamento ainda não possui ID no gateway.", status_code=404)

    token = PaymentService.ensure_company_enabled(company)
    response = MercadoPagoService(token).get_payment(payment_id)
    if not response.ok:
        raise PaymentError(
            "Não foi possível sincronizar o pagamento.",
            status_code=503 if int(response.status_code or 0) >= 500 else 409,
            details=response.data,
        )

    payment = response.data
    reference = parse_external_reference(payment.get("external_reference"))
    company_id = int(getattr(company, "id", 0) or 0)
    origin_id = int(getattr(origin, "id", 0) or 0)
    reference_valid = bool(
        reference
        and reference.origin_type == origin_type
        and reference.company_id == company_id
        and reference.origin_id == origin_id
    )
    if not reference_valid:
        raise PaymentError(
            "A cobrança retornada pelo gateway não pertence a este registro.",
            status_code=409,
        )

    expected_amount = _expected_amount(origin, origin_type)
    if expected_amount <= 0 or not amounts_match(
        expected_amount, payment.get("transaction_amount")
    ):
        raise PaymentError(
            "O valor retornado pelo gateway não confere com o registro.",
            status_code=409,
        )

    PaymentService.update_origin(
        origin,
        payment,
        origin_type=origin_type,
        on_approved=on_approved,
    )
    return payment
