"""Ajuste visual seguro apenas da empresa demo local de Encomendas v768.

Não cria produtos e não altera empresas reais. Mantém a identidade quente da demo
quando ela ainda estiver usando as cores-padrão genéricas do MenuFacile.
"""
from sqlalchemy import text
from backend.database import engine

DEMO_SLUG = "maison-dolce-encomendas"


def main():
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(empresas)"))}
        if "menu_cor_principal" not in cols or "menu_cor_fundo" not in cols:
            return
        row = conn.execute(
            text("SELECT id, menu_cor_principal, menu_cor_fundo FROM empresas WHERE slug=:slug"),
            {"slug": DEMO_SLUG},
        ).mappings().first()
        if not row:
            return
        principal = str(row.get("menu_cor_principal") or "").strip().upper()
        fundo = str(row.get("menu_cor_fundo") or "").strip().upper()
        updates = {}
        if not principal or principal == "#1236B5":
            updates["principal"] = "#2E2925"
        if not fundo or fundo == "#F5F7FB":
            updates["fundo"] = "#FBFAF7"
        if updates:
            conn.execute(
                text("""
                    UPDATE empresas SET
                      menu_cor_principal = COALESCE(:principal, menu_cor_principal),
                      menu_cor_fundo = COALESCE(:fundo, menu_cor_fundo)
                    WHERE id=:id
                """),
                {"id": row["id"], "principal": updates.get("principal"), "fundo": updates.get("fundo")},
            )
            print("Demo Encomendas: identidade visual alinhada à vitrine v768.")
        else:
            print("Demo Encomendas: cores personalizadas preservadas.")


if __name__ == "__main__":
    main()
