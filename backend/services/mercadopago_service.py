"""Cliente isolado para a API do Mercado Pago.

v785: usa conexão HTTPS direta para garantir o envio do header Authorization.
Nenhuma rota ou módulo de negócio deve acessar diretamente api.mercadopago.com.
"""
from __future__ import annotations

import http.client
import json
import socket
import ssl
from dataclasses import dataclass
from typing import Any, Mapping
from urllib.parse import urlencode, urlsplit


@dataclass(slots=True)
class MercadoPagoResponse:
    status_code: int
    data: dict[str, Any]
    request_id: str | None = None

    @property
    def ok(self) -> bool:
        return 200 <= self.status_code < 300


class MercadoPagoService:
    API_BASE = "https://api.mercadopago.com"

    def __init__(self, access_token: str, timeout: int = 30):
        token = (access_token or "").strip()
        if not token:
            raise ValueError("Access Token do Mercado Pago não configurado.")
        self.access_token = token
        self.timeout = timeout

    def request(
        self,
        method: str,
        path: str,
        payload: Mapping[str, Any] | None = None,
        idempotency_key: str | None = None,
        device_id: str | None = None,
    ) -> MercadoPagoResponse:
        parsed = urlsplit(self.API_BASE)
        host = parsed.hostname or "api.mercadopago.com"
        port = parsed.port or 443
        request_path = path if str(path).startswith("/") else f"/{path}"
        body = None if payload is None else json.dumps(dict(payload), ensure_ascii=False).encode("utf-8")

        # O Authorization é montado aqui, no último ponto antes da conexão HTTPS,
        # evitando que handlers/proxies do urllib removam o cabeçalho em redirects.
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json",
            "User-Agent": "MenuFacile-MercadoPago/786",
        }
        if body is not None:
            headers["Content-Type"] = "application/json"
        if idempotency_key:
            headers["X-Idempotency-Key"] = str(idempotency_key)
        if device_id:
            headers["X-meli-session-id"] = str(device_id)

        connection: http.client.HTTPSConnection | None = None
        try:
            context = ssl.create_default_context()
            connection = http.client.HTTPSConnection(
                host,
                port=port,
                timeout=self.timeout,
                context=context,
            )
            connection.request(method.upper(), request_path, body=body, headers=headers)
            response = connection.getresponse()
            request_id = response.getheader("x-request-id")
            raw = response.read().decode("utf-8", errors="replace")
            try:
                data = json.loads(raw or "{}")
                if not isinstance(data, dict):
                    data = {"data": data}
            except Exception:
                data = {"message": raw or f"HTTP {response.status}"}
            return MercadoPagoResponse(
                int(response.status),
                data,
                request_id=request_id,
            )
        except (OSError, socket.timeout, ssl.SSLError, http.client.HTTPException) as error:
            return MercadoPagoResponse(
                503,
                {"message": f"Falha de comunicação com Mercado Pago: {error}"},
            )
        finally:
            if connection is not None:
                try:
                    connection.close()
                except Exception:
                    pass

    def create_payment(
        self,
        payload: Mapping[str, Any],
        idempotency_key: str,
        device_id: str | None = None,
    ) -> MercadoPagoResponse:
        return self.request(
            "POST",
            "/v1/payments",
            payload,
            idempotency_key,
            device_id=device_id,
        )

    def get_payment(self, payment_id: str | int) -> MercadoPagoResponse:
        return self.request("GET", f"/v1/payments/{payment_id}")

    def search_payments(self, external_reference: str, *, limit: int = 10) -> MercadoPagoResponse:
        """Busca cobranças pelo external_reference para reconciliar timeouts de criação.

        O Mercado Pago recomenda X-Idempotency-Key nas criações e oferece a busca
        de pagamentos por external_reference. A combinação permite descobrir uma
        cobrança que pode ter sido criada mesmo quando a resposta HTTP se perdeu.
        """
        query = urlencode({
            "external_reference": str(external_reference or ""),
            "sort": "date_created",
            "criteria": "desc",
            "limit": max(1, min(50, int(limit or 10))),
            "offset": 0,
        })
        return self.request("GET", f"/v1/payments/search?{query}")

    def cancel_payment(self, payment_id: str | int) -> MercadoPagoResponse:
        """Cancela uma tentativa ainda pendente/autorizada no Mercado Pago."""
        return self.request(
            "PUT",
            f"/v1/payments/{payment_id}",
            {"status": "cancelled"},
        )
