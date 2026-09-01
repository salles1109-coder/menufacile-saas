"""Minimal production environment loader for MenuFacile.

Environment variables provided by systemd/Docker always win.  When present, the
local .env.production file supplies only missing values.  The parser is small on
purpose and does not require python-dotenv.
"""
from __future__ import annotations

import os
from pathlib import Path


def _unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1]
    return value.replace("\\n", "\n")


def load_runtime_env() -> Path | None:
    configured = os.getenv("MENUFACILE_ENV_FILE", "").strip()
    path = Path(configured or ".env.production").expanduser()
    if not path.exists() or not path.is_file():
        return None

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or not key.replace("_", "").isalnum() or key[0].isdigit():
            continue
        os.environ.setdefault(key, _unquote(value))
    return path.resolve()


__all__ = ["load_runtime_env"]
