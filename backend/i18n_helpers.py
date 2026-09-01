from backend.database import engine
from sqlalchemy import text


def normalizar_idioma(idioma="pt") -> str:
    """O MenuFacile opera exclusivamente em português do Brasil."""
    return "pt"


def idioma_empresa(empresa=None):
    """Retorna sempre o idioma único suportado pelo sistema."""
    return "pt"


def garantir_coluna_idioma_empresas():
    """Mantém compatibilidade com bancos antigos que possuem a coluna idioma."""
    try:
        with engine.begin() as conn:
            try:
                conn.execute(text("SELECT idioma FROM empresas LIMIT 1"))
            except Exception:
                conn.execute(text("ALTER TABLE empresas ADD COLUMN idioma VARCHAR(10) DEFAULT 'pt'"))
    except Exception:
        pass


def salvar_idioma_empresa_sql(db, empresa, idioma="pt"):
    """Grava português como idioma único, preservando compatibilidade do banco."""
    if not empresa:
        return "pt"
    garantir_coluna_idioma_empresas()
    try:
        db.execute(
            text("UPDATE empresas SET idioma = 'pt' WHERE id = :empresa_id"),
            {"empresa_id": empresa.id},
        )
    except Exception:
        pass
    try:
        setattr(empresa, "idioma", "pt")
    except Exception:
        pass
    return "pt"


__all__ = [
    "normalizar_idioma",
    "idioma_empresa",
    "garantir_coluna_idioma_empresas",
    "salvar_idioma_empresa_sql",
]
