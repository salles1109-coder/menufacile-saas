"""Relógio operacional do MenuFacile.

O banco SQLite continua usando datetimes sem timezone para manter compatibilidade
com os registros existentes. Todas as novas datas de negócio são geradas no fuso
America/Sao_Paulo e então convertidas para datetime ingênuo antes de salvar.

No Windows, algumas instalações do Python não trazem a base IANA de fusos. Nesse
caso, usamos UTC-03:00 como fallback para o horário de Brasília, evitando que o
SaaS deixe de iniciar. Quando a base ``tzdata`` está disponível, o fuso regional
America/Sao_Paulo continua sendo usado normalmente.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


try:
    FUSO_MENUFACILE = ZoneInfo("America/Sao_Paulo")
    FUSO_MENUFACILE_ORIGEM = "America/Sao_Paulo"
except ZoneInfoNotFoundError:
    # Fallback compatível com instalações do Python/Windows sem o pacote tzdata.
    # Brasília opera atualmente em UTC-03:00.
    FUSO_MENUFACILE = timezone(timedelta(hours=-3), name="America/Sao_Paulo")
    FUSO_MENUFACILE_ORIGEM = "UTC-03:00 (fallback sem tzdata)"


def agora_brasilia() -> datetime:
    """Retorna o horário atual de Brasília como datetime ingênuo."""
    return datetime.now(FUSO_MENUFACILE).replace(tzinfo=None)


def hoje_brasilia() -> date:
    """Retorna a data operacional atual de Brasília."""
    return agora_brasilia().date()


def agora_brasilia_iso() -> str:
    return agora_brasilia().isoformat()
