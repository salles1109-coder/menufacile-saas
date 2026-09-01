"""Worker Web Push independente do servidor HTTP — MenuFacile v744.

Executado pelo systemd para que pedidos, agendamentos e lembretes de 1 hora
sejam processados mesmo quando nenhum usuário está com o aplicativo aberto.
"""
from __future__ import annotations

import logging
import os
import signal
import threading

from backend.services.encomenda_expiry import run_encomenda_expiry_cycle
from backend.services.push_service import (
    push_runtime_status,
    run_push_worker_cycle,
    write_external_worker_heartbeat,
)

LOGGER = logging.getLogger("menufacile.push.worker")
STOP = threading.Event()


def _stop(signum, _frame) -> None:
    LOGGER.info("Sinal %s recebido; encerrando worker de notificações.", signum)
    STOP.set()


def main() -> int:
    logging.basicConfig(
        level=os.getenv("MENUFACILE_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    try:
        interval = max(5, min(300, int(os.getenv("MENUFACILE_PUSH_WORKER_INTERVAL", "15"))))
    except ValueError:
        interval = 15

    runtime = push_runtime_status()
    if not runtime.get("ready"):
        error = str(runtime.get("error") or "Dependência/chave Web Push indisponível.")
        write_external_worker_heartbeat(state="error", error=error)
        LOGGER.error("Worker iniciado sem Web Push pronto: %s", error)
    else:
        write_external_worker_heartbeat(state="running")
        LOGGER.info("Worker Web Push v790 iniciado; intervalo=%ss.", interval)

    while not STOP.is_set():
        try:
            expiry = run_encomenda_expiry_cycle()
            if int(expiry.get("expiradas", 0) or 0) or int(expiry.get("aprovadas_encontradas", 0) or 0):
                LOGGER.info("Ciclo Encomendas v790: %s", expiry)
        except Exception:
            LOGGER.exception("Falha no ciclo de expiração das Encomendas")

        try:
            current_runtime = push_runtime_status()
            if not current_runtime.get("ready"):
                error = str(current_runtime.get("error") or "Dependência/chave Web Push indisponível.")
                write_external_worker_heartbeat(state="error", error=error)
                LOGGER.error("Web Push ainda não está pronto: %s", error)
            else:
                result = run_push_worker_cycle(heartbeat=True)
                deliveries = result.get("deliveries") or {}
                scheduled = result.get("scheduled") or {}
                if any(int(v or 0) for v in deliveries.values()) or any(int(v or 0) for v in scheduled.values()):
                    LOGGER.info("Ciclo Push: lembretes=%s entregas=%s", scheduled, deliveries)
        except Exception as exc:
            write_external_worker_heartbeat(state="error", error=str(exc))
            LOGGER.exception("Falha no ciclo do worker Web Push")
        STOP.wait(interval)

    write_external_worker_heartbeat(state="stopped")
    LOGGER.info("Worker Web Push encerrado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
