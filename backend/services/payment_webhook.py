"""Validação e interpretação compartilhada de webhooks de pagamento."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


@dataclass(slots=True)
class PaymentReference:
    origin_type: str
    company_id: int
    origin_id: int


def extract_payment_id(body: Mapping[str, Any] | None, query_params: Mapping[str, Any]) -> str | None:
    body = body or {}
    value = (body.get("data") or {}).get("id") or query_params.get("data.id") or query_params.get("id")
    return str(value) if value not in (None, "") else None


def parse_external_reference(value: str) -> PaymentReference | None:
    reference = str(value or "")
    try:
        if reference.startswith("reserva:"):
            _, company_id, origin_id = reference.split(":", 2)
            return PaymentReference("reserva", int(company_id), int(origin_id))
        if reference.startswith("encomenda:"):
            _, company_id, origin_id = reference.split(":", 2)
            return PaymentReference("encomenda", int(company_id), int(origin_id))
        company_id, origin_id = reference.split(":", 1)
        return PaymentReference("pedido", int(company_id), int(origin_id))
    except (TypeError, ValueError):
        return None


def amounts_match(expected: float, received: float) -> bool:
    return round(float(expected or 0), 2) == round(float(received or 0), 2)
