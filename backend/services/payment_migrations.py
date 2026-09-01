"""Migração idempotente das colunas compartilhadas de pagamento."""
from sqlalchemy import text


def ensure_payment_columns(engine, session_factory) -> None:
    company_columns = {
        "pagamentos_online_ativo": "BOOLEAN DEFAULT 0",
        "gateway_pagamento": "VARCHAR DEFAULT 'mercadopago'",
        "gateway_ambiente": "VARCHAR DEFAULT 'sandbox'",
        "mercadopago_public_key": "VARCHAR",
        "mercadopago_access_token": "VARCHAR",
        "mercadopago_webhook_secret": "VARCHAR",
        "aceita_pix_online": "BOOLEAN DEFAULT 1",
        "aceita_cartao_online": "BOOLEAN DEFAULT 1",
        "aceita_dinheiro": "BOOLEAN DEFAULT 1",
        "aceita_cartao_entrega": "BOOLEAN DEFAULT 1",
        "pedido_so_apos_pagamento": "BOOLEAN DEFAULT 1",
    }
    transaction_columns = {
        "status_pagamento": "VARCHAR DEFAULT 'nao_iniciado'",
        "gateway_pagamento": "VARCHAR",
        "gateway_payment_id": "VARCHAR",
        "gateway_status": "VARCHAR",
        "gateway_status_detail": "VARCHAR",
        "pago_em": "DATETIME",
    }
    db = session_factory()
    try:
        if not str(getattr(engine.url, "drivername", "")).startswith("sqlite"):
            return
        for table, columns in (
            ("empresas", company_columns),
            ("pedidos", transaction_columns),
            ("reservas", transaction_columns),
        ):
            existing = {row[1] for row in db.execute(text(f"PRAGMA table_info({table})")).fetchall()}
            for name, sql_type in columns.items():
                if name not in existing:
                    db.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}"))
        db.commit()
    except Exception as error:
        db.rollback()
        print("Aviso: migração central de pagamentos não concluída:", error)
    finally:
        db.close()
