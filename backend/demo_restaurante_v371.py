"""MenuFacile v371: prepara o restaurante público Bella Food com cardápio completo.

A rotina é deliberadamente restrita à empresa definida em
``LANDING_DEMO_RESTAURANTE_SLUG`` ou aos nomes de demonstração Bella Pizza /
Bella Food. Nenhum restaurante real é alterado por fallback.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import unicodedata
from pathlib import Path
from typing import Any, Iterable

from sqlalchemy import text

from backend.database import SessionLocal, engine
from backend.models import Base, Categoria, Empresa, Item

LOGGER = logging.getLogger("menufacile.demo.v371")
MIGRATION_KEY = "v371_demo_restaurante_generico"
ASSET_PREFIX = "/static/uploads/demo_restaurante_v371"
ASSET_DIRECTORY = Path(__file__).resolve().parent / "static" / "uploads" / "demo_restaurante_v371"
SUPPORTED_IMAGE_EXTENSIONS = ("webp", "jpg", "jpeg", "png")


def _norm(value: Any) -> str:
    text_value = unicodedata.normalize("NFKD", str(value or ""))
    text_value = "".join(ch for ch in text_value if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", text_value.lower()).strip()


def _slug(value: str) -> str:
    return _norm(value).replace(" ", "-") or "opcao"


def _asset_stem(value: str) -> str:
    """Retorna o nome-base sem depender da extensão antiga gravada no banco."""
    return Path(str(value or "")).stem.strip() or _slug(str(value or "imagem"))


def _asset_files_by_stem() -> dict[str, dict[str, Path]]:
    """Indexa imagens da demo sem diferenciar maiúsculas/minúsculas no Linux."""
    result: dict[str, dict[str, Path]] = {}
    if not ASSET_DIRECTORY.is_dir():
        return result
    # rglob também encontra imagens caso um ZIP tenha sido extraído com uma
    # pasta demo_restaurante_v371 duplicada por engano.
    for path in ASSET_DIRECTORY.rglob("*"):
        if not path.is_file():
            continue
        extension = path.suffix.lower().lstrip(".")
        if extension not in SUPPORTED_IMAGE_EXTENSIONS:
            continue
        stem = path.stem.lower()
        current = result.setdefault(stem, {}).get(extension)
        # Prefere o arquivo mais próximo da raiz esperada.
        if current is None or len(path.relative_to(ASSET_DIRECTORY).parts) < len(current.relative_to(ASSET_DIRECTORY).parts):
            result.setdefault(stem, {})[extension] = path
    return result


def _resolve_demo_asset_url(asset_name: str, index: dict[str, dict[str, Path]] | None = None) -> str | None:
    """Localiza WEBP/JPG/JPEG/PNG (e SVG legado) usando o mesmo nome-base."""
    files = index if index is not None else _asset_files_by_stem()
    candidates = files.get(_asset_stem(asset_name).lower(), {})
    for extension in SUPPORTED_IMAGE_EXTENSIONS:
        path = candidates.get(extension)
        if path is not None:
            relative = path.relative_to(ASSET_DIRECTORY).as_posix()
            try:
                version = path.stat().st_mtime_ns
            except OSError:
                version = 0
            # O parâmetro v evita que o navegador mantenha uma foto antiga ou
            # um erro 404 em cache quando o arquivo é substituído pelo mesmo nome.
            return f"{ASSET_PREFIX}/{relative}?v={version}"
    return None


def _static_url_exists(url: Any) -> bool:
    value = str(url or "").strip().split("?", 1)[0]
    if not value.startswith("/static/"):
        return False
    relative = value[len("/static/"):].lstrip("/")
    static_root = Path(__file__).resolve().parent / "static"
    try:
        target = (static_root / relative).resolve()
        target.relative_to(static_root.resolve())
    except (OSError, ValueError):
        return False
    return target.is_file()


def _photo_reference_is_usable(url: Any) -> bool:
    value = str(url or "").strip()
    if not value:
        return False
    if value.startswith("/static/"):
        return _static_url_exists(value)
    # URLs externas ou outros provedores já cadastrados são preservados.
    return True


def _photo_list(item: Item) -> list[str]:
    result: list[str] = []
    raw = getattr(item, "fotos_json", None)
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                result.extend(str(value or "").strip() for value in parsed)
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
    cover = str(getattr(item, "foto_url", None) or "").strip()
    if cover:
        result.insert(0, cover)
    unique: list[str] = []
    seen: set[str] = set()
    for value in result:
        if value and value not in seen:
            unique.append(value)
            seen.add(value)
    return unique[:5]


def _set_cover_preserving_gallery(item: Item, cover: str | None) -> None:
    photos = _photo_list(item)
    if cover:
        photos = [cover] + [
            value
            for value in photos
            if value != cover
            and not str(value).startswith(f"{ASSET_PREFIX}/")
            and _photo_reference_is_usable(value)
        ]
    else:
        photos = [value for value in photos if _photo_reference_is_usable(value)]
    photos = photos[:5]
    item.foto_url = photos[0] if photos else None
    item.fotos_json = json.dumps(photos, ensure_ascii=False)


def _group(
    group_id: str,
    name: str,
    options: Iterable[tuple[str, float]],
    *,
    required: bool = False,
    maximum: int = 1,
) -> dict[str, Any]:
    option_list = [
        {
            "id": f"{group_id}_{_slug(option_name)}",
            "nome": option_name,
            "preco": round(float(price), 2),
        }
        for option_name, price in options
    ]
    safe_max = max(1, min(int(maximum or 1), len(option_list)))
    return {
        "id": group_id,
        "nome": name,
        "obrigatorio": bool(required),
        "min": 1 if required else 0,
        "max": safe_max,
        "opcoes": option_list,
    }


def _options(*groups: dict[str, Any]) -> str:
    return json.dumps({"versao": 2, "grupos": list(groups)}, ensure_ascii=False)


PIZZA_OPTIONS = _options(
    _group(
        "pizza_tamanho",
        "Tamanho",
        [("Pequena", 0), ("Média", 10), ("Grande", 18)],
        required=True,
    ),
    _group(
        "pizza_borda",
        "Borda recheada",
        [("Catupiry", 6), ("Cheddar", 6), ("Chocolate", 8)],
    ),
    _group(
        "pizza_adicionais",
        "Adicionais",
        [("Bacon", 5), ("Queijo extra", 5), ("Azeitona", 2), ("Cebola", 2)],
        maximum=4,
    ),
)

BURGER_OPTIONS = _options(
    _group(
        "burger_ponto",
        "Ponto da carne",
        [("Mal passada", 0), ("Ao ponto", 0), ("Bem passada", 0)],
        required=True,
    ),
    _group(
        "burger_queijo",
        "Queijo",
        [("Cheddar", 3), ("Prato", 3), ("Muçarela", 3)],
    ),
    _group(
        "burger_extras",
        "Extras",
        [("Bacon", 5), ("Ovo", 3), ("Cebola caramelizada", 4), ("Hambúrguer extra", 9)],
        maximum=4,
    ),
)

VEGGIE_BURGER_OPTIONS = _options(
    _group(
        "veg_pao",
        "Pão",
        [("Tradicional", 0), ("Integral", 2), ("Sem glúten", 4)],
        required=True,
    ),
    _group(
        "veg_extras",
        "Extras",
        [("Queijo", 3), ("Cebola caramelizada", 4), ("Molho especial", 2)],
        maximum=3,
    ),
)

SNACK_OPTIONS = _options(
    _group(
        "lanche_pao",
        "Pão",
        [("Tradicional", 0), ("Integral", 2)],
        required=True,
    ),
    _group(
        "lanche_extras",
        "Adicionais",
        [("Queijo extra", 3), ("Bacon", 5), ("Ovo", 3)],
        maximum=3,
    ),
    _group(
        "lanche_combo",
        "Transformar em combo",
        [("Batata pequena + refrigerante", 10)],
    ),
)

PORTION_OPTIONS = _options(
    _group(
        "porcao_tamanho",
        "Tamanho",
        [("Individual", 0), ("Média", 8), ("Família", 16)],
        required=True,
    ),
    _group(
        "porcao_molhos",
        "Molhos",
        [("Maionese da casa", 2), ("Barbecue", 2), ("Cheddar", 3)],
        maximum=2,
    ),
)

MEAL_OPTIONS = _options(
    _group(
        "marmita_tamanho",
        "Tamanho / peso",
        [("400 g", 0), ("600 g", 6), ("800 g", 10)],
        required=True,
    ),
    _group(
        "marmita_proteina",
        "Proteína",
        [("Frango grelhado", 0), ("Carne bovina", 4), ("Linguiça acebolada", 2)],
        required=True,
    ),
    _group(
        "marmita_acompanhamentos",
        "Acompanhamentos",
        [("Arroz", 0), ("Feijão", 0), ("Salada", 0), ("Batata frita", 3), ("Legumes", 2)],
        maximum=3,
    ),
)

ACAI_OPTIONS = _options(
    _group(
        "acai_tamanho",
        "Tamanho",
        [("300 ml", 0), ("500 ml", 5), ("700 ml", 9)],
        required=True,
    ),
    _group(
        "acai_complementos",
        "Complementos",
        [("Banana", 0), ("Granola", 0), ("Paçoca", 2), ("Leite em pó", 2), ("Morango", 3)],
        maximum=5,
    ),
    _group(
        "acai_coberturas",
        "Coberturas",
        [("Leite condensado", 2), ("Nutella", 4), ("Mel", 2)],
        maximum=2,
    ),
)

DESSERT_OPTIONS = _options(
    _group(
        "doce_extras",
        "Acompanhamentos",
        [("Sorvete de creme", 5), ("Calda de chocolate", 2), ("Morango", 3)],
        maximum=2,
    )
)

SOFT_DRINK_OPTIONS = _options(
    _group(
        "bebida_tamanho",
        "Tamanho",
        [("Lata 350 ml", 0), ("600 ml", 4), ("1 litro", 7)],
        required=True,
    )
)

WATER_OPTIONS = _options(
    _group(
        "agua_tamanho",
        "Tamanho",
        [("500 ml", 0), ("1,5 litro", 4)],
        required=True,
    )
)

JUICE_OPTIONS = _options(
    _group(
        "suco_sabor",
        "Sabor",
        [("Laranja", 0), ("Limão", 0), ("Maracujá", 1), ("Morango", 2)],
        required=True,
    ),
    _group(
        "suco_tamanho",
        "Tamanho",
        [("300 ml", 0), ("500 ml", 4)],
        required=True,
    ),
)

COFFEE_OPTIONS = _options(
    _group(
        "cafe_tamanho",
        "Tamanho",
        [("Pequeno", 0), ("Médio", 3), ("Grande", 5)],
        required=True,
    ),
    _group(
        "cafe_leite",
        "Tipo de leite",
        [("Integral", 0), ("Sem lactose", 2), ("Vegetal", 3)],
    ),
)

COMBO_OPTIONS = _options(
    _group(
        "combo_bebida",
        "Bebida",
        [("Coca-Cola", 0), ("Fanta", 0), ("Suco", 2), ("Água", 0)],
        required=True,
    ),
    _group(
        "combo_molho",
        "Molho",
        [("Maionese da casa", 0), ("Barbecue", 0), ("Cheddar", 2)],
    ),
)


CATEGORIES: list[dict[str, Any]] = [
    {
        "name": "Pizzas",
        "aliases": ["Pizzas", "Pizze"],
        "description": "Sabores clássicos e especiais com tamanhos, bordas e adicionais.",
        "order": 10,
    },
    {
        "name": "Hambúrgueres",
        "aliases": ["Hambúrgueres", "Hamburgueres", "Burgers"],
        "description": "Hambúrgueres artesanais com ponto da carne, queijos e extras.",
        "order": 20,
    },
    {
        "name": "Lanches",
        "aliases": ["Lanches", "Sanduíches", "Sanduiches"],
        "description": "Sanduíches e opções rápidas para qualquer hora.",
        "order": 30,
    },
    {
        "name": "Porções",
        "aliases": ["Porções", "Porcoes", "Aperitivos"],
        "description": "Porções individuais ou para compartilhar.",
        "order": 40,
    },
    {
        "name": "Pratos e Marmitas",
        "aliases": ["Pratos e Marmitas", "Pratos", "Marmitas"],
        "description": "Refeições completas com tamanho, proteína e acompanhamentos.",
        "order": 50,
    },
    {
        "name": "Sobremesas e Açaí",
        "aliases": ["Sobremesas e Açaí", "Sobremesas", "Dolci", "Açaí", "Acai"],
        "description": "Doces, sobremesas e açaí personalizável.",
        "order": 60,
    },
    {
        "name": "Bebidas",
        "aliases": ["Bebidas", "Bevande"],
        "description": "Refrigerantes, águas, sucos e cafés.",
        "order": 70,
    },
    {
        "name": "Combos",
        "aliases": ["Combos", "Menu", "Menus"],
        "description": "Combinações prontas com melhor custo-benefício.",
        "order": 80,
    },
]


def _item(
    name: str,
    category: str,
    price: float,
    description: str,
    emoji: str,
    *,
    aliases: Iterable[str] = (),
    options: str = '{"versao":2,"grupos":[]}',
    duration: int = 20,
) -> dict[str, Any]:
    return {
        "name": name,
        "aliases": [name, *aliases],
        "category": category,
        "price": round(float(price), 2),
        "description": description,
        "emoji": emoji,
        "asset": _slug(name),
        "options": options,
        "duration": duration,
    }


ITEMS: list[dict[str, Any]] = [
    # Pizzas existentes e novas
    _item("Pizza Margherita", "Pizzas", 32, "Molho de tomate, muçarela, tomate fresco, manjericão e azeite.", "🍕", options=PIZZA_OPTIONS, duration=30),
    _item("Pizza Calabresa", "Pizzas", 34, "Calabresa fatiada, muçarela, cebola, molho de tomate e orégano.", "🍕", options=PIZZA_OPTIONS, duration=30),
    _item("Pizza Napoli", "Pizzas", 35, "Molho de tomate, muçarela, anchovas, azeitonas e orégano.", "🍕", options=PIZZA_OPTIONS, duration=30),
    _item("Pizza Diavola", "Pizzas", 37, "Muçarela, salame picante, molho de tomate e toque de pimenta.", "🍕", options=PIZZA_OPTIONS, duration=30),
    _item("Pizza Capricciosa", "Pizzas", 39, "Presunto, cogumelos, alcachofra, azeitonas, muçarela e molho de tomate.", "🍕", options=PIZZA_OPTIONS, duration=35),
    _item("Pizza Quattro Formaggi", "Pizzas", 40, "Muçarela, provolone, parmesão e gorgonzola em uma combinação cremosa.", "🍕", aliases=["Pizza Quatro Queijos"], options=PIZZA_OPTIONS, duration=30),
    _item("Pizza Prosciutto e Funghi", "Pizzas", 39, "Presunto, cogumelos, muçarela, molho de tomate e orégano.", "🍕", aliases=["Pizza Prosciutto e Funghi", "Pizza Prosciutto Funghi"], options=PIZZA_OPTIONS, duration=30),
    _item("Pizza Tonno e Cipolla", "Pizzas", 39, "Atum, cebola, muçarela, molho de tomate e azeitonas.", "🍕", aliases=["Pizza Tonno e Cipolla"], options=PIZZA_OPTIONS, duration=30),
    _item("Pizza Vegetariana", "Pizzas", 38, "Muçarela, abobrinha, berinjela, pimentões, cebola e tomate.", "🍕", options=PIZZA_OPTIONS, duration=30),
    _item("Pizza Bufalina", "Pizzas", 42, "Muçarela de búfala, tomate-cereja, manjericão e azeite extravirgem.", "🍕", options=PIZZA_OPTIONS, duration=30),
    _item("Pizza Bella Especial", "Pizzas", 45, "Carne desfiada, bacon, cebola caramelizada, muçarela e molho especial.", "🍕", aliases=["Pizza Bella Speciale"], options=PIZZA_OPTIONS, duration=35),

    # Hambúrgueres
    _item("Burger Clássico", "Hambúrgueres", 25, "Pão brioche, hambúrguer artesanal, queijo, alface, tomate e molho da casa.", "🍔", options=BURGER_OPTIONS, duration=18),
    _item("Burger Bacon", "Hambúrgueres", 29, "Hambúrguer artesanal, bacon crocante, cheddar, cebola caramelizada e molho barbecue.", "🍔", options=BURGER_OPTIONS, duration=20),
    _item("Burger Vegetariano", "Hambúrgueres", 27, "Hambúrguer vegetal, queijo, alface, tomate, cebola roxa e molho especial.", "🥬", options=VEGGIE_BURGER_OPTIONS, duration=18),

    # Lanches
    _item("X-Salada", "Lanches", 19, "Hambúrguer, queijo, presunto, alface, tomate, milho e maionese da casa.", "🥪", options=SNACK_OPTIONS, duration=15),
    _item("Hot Dog Especial", "Lanches", 17, "Salsicha, purê de batata, milho, ervilha, batata palha e molhos.", "🌭", options=SNACK_OPTIONS, duration=12),
    _item("Misto Quente", "Lanches", 12, "Pão tostado com presunto e queijo derretido.", "🥪", options=SNACK_OPTIONS, duration=10),

    # Porções
    _item("Batata Frita Crocante", "Porções", 18, "Batatas douradas e crocantes, servidas com molho da casa.", "🍟", options=PORTION_OPTIONS, duration=15),
    _item("Onion Rings", "Porções", 20, "Anéis de cebola empanados, sequinhos e crocantes.", "🧅", options=PORTION_OPTIONS, duration=15),
    _item("Frango Crocante", "Porções", 26, "Tiras de frango empanadas e temperadas, ideais para compartilhar.", "🍗", options=PORTION_OPTIONS, duration=20),

    # Pratos e marmitas
    _item("Marmita Executiva", "Pratos e Marmitas", 24, "Refeição completa com arroz, feijão, proteína e acompanhamentos à escolha.", "🍱", options=MEAL_OPTIONS, duration=25),
    _item("Prato Feito da Casa", "Pratos e Marmitas", 27, "Arroz, feijão, salada, fritas e proteína preparada na hora.", "🍛", options=MEAL_OPTIONS, duration=25),

    # Sobremesas e açaí
    _item("Açaí Cremoso", "Sobremesas e Açaí", 16, "Açaí cremoso com tamanhos, frutas, complementos e coberturas à escolha.", "🫐", options=ACAI_OPTIONS, duration=8),
    _item("Brownie com Sorvete", "Sobremesas e Açaí", 18, "Brownie de chocolate servido morno, com opção de sorvete e caldas.", "🍫", options=DESSERT_OPTIONS, duration=10),
    _item("Pudim de Leite", "Sobremesas e Açaí", 12, "Pudim cremoso de leite condensado com calda de caramelo.", "🍮", duration=5),
    _item("Tiramisù", "Sobremesas e Açaí", 16, "Sobremesa italiana com café, creme de mascarpone e cacau.", "🍰", aliases=["Tiramisu"], duration=5),
    _item("Panna Cotta", "Sobremesas e Açaí", 15, "Creme italiano delicado servido com calda de frutas vermelhas.", "🍮", duration=5),
    _item("Cannolo Siciliano", "Sobremesas e Açaí", 14, "Massa crocante recheada com creme doce de ricota e chocolate.", "🥐", duration=5),

    # Bebidas
    _item("Coca-Cola", "Bebidas", 7, "Refrigerante gelado disponível em diferentes tamanhos.", "🥤", aliases=["Coca-Cola 330ml", "Coca Cola 330ml"], options=SOFT_DRINK_OPTIONS, duration=2),
    _item("Fanta Laranja", "Bebidas", 7, "Refrigerante sabor laranja, servido bem gelado.", "🥤", aliases=["Fanta 330ml", "Fanta"], options=SOFT_DRINK_OPTIONS, duration=2),
    _item("Chinotto", "Bebidas", 8, "Refrigerante italiano de sabor cítrico e levemente amargo.", "🥤", aliases=["Chinotto 330ml"], options=SOFT_DRINK_OPTIONS, duration=2),
    _item("Água Natural", "Bebidas", 4, "Água mineral sem gás em diferentes tamanhos.", "💧", aliases=["Água natural", "Agua Natural", "Água Natural 500ml"], options=WATER_OPTIONS, duration=1),
    _item("Água com Gás", "Bebidas", 5, "Água mineral com gás, gelada e refrescante.", "💧", aliases=["Água com gás", "Agua com Gas", "Água com Gás 500ml"], options=WATER_OPTIONS, duration=1),
    _item("Suco Natural", "Bebidas", 9, "Suco preparado na hora com fruta e tamanho à escolha.", "🧃", options=JUICE_OPTIONS, duration=7),
    _item("Café Cremoso", "Bebidas", 7, "Café cremoso com tamanhos e tipos de leite à escolha.", "☕", options=COFFEE_OPTIONS, duration=6),

    # Combos
    _item("Combo Burger", "Combos", 35, "Burger Clássico, batata pequena e bebida à escolha.", "🍔", options=COMBO_OPTIONS, duration=22),
    _item("Combo Pizza + Bebida", "Combos", 44, "Pizza pequena e bebida à escolha em uma combinação prática.", "🍕", aliases=["Combo Pizza Bebida"], options=COMBO_OPTIONS, duration=30),
    _item("Menu Família", "Combos", 79, "Pizza grande, porção de batata e bebida de 1 litro para compartilhar.", "👨‍👩‍👧‍👦", aliases=["Menu Família Bella", "Menu Familia Bella"], options=COMBO_OPTIONS, duration=35),
]


def _find_company(db) -> Empresa | None:
    env_slug = str(os.getenv("LANDING_DEMO_RESTAURANTE_SLUG", "") or "").strip().strip("/")
    if env_slug.startswith("menu/"):
        env_slug = env_slug.split("/", 1)[1]
    if env_slug:
        company = db.query(Empresa).filter(Empresa.slug == env_slug).first()
        if company:
            return company

    allowed_names = {
        "bella pizza",
        "bella food",
        "restaurante demonstracao",
        "pizzaria demonstracao",
        "restaurante demo",
        "pizzaria demo",
    }
    for company in db.query(Empresa).order_by(Empresa.id.asc()).all():
        if _norm(company.nome) in allowed_names:
            return company
    return None


def _ensure_demo_columns() -> None:
    """Garante colunas usadas pela demonstração em bancos SQLite antigos."""
    required = {
        "categorias": {
            "nome_pt": "VARCHAR(255)",
            "nome_it": "VARCHAR(255)",
            "nome_en": "VARCHAR(255)",
            "descricao_pt": "TEXT",
            "descricao_it": "TEXT",
            "descricao_en": "TEXT",
        },
        "itens": {
            "nome_pt": "VARCHAR(255)",
            "nome_it": "VARCHAR(255)",
            "nome_en": "VARCHAR(255)",
            "descricao_pt": "TEXT",
            "descricao_it": "TEXT",
            "descricao_en": "TEXT",
            "fotos_json": "TEXT",
            "duracao_minutos": "INTEGER",
            "opcoes_json": "TEXT",
        },
    }
    with engine.connect() as connection:
        for table_name, columns in required.items():
            existing = {
                row[1]
                for row in connection.exec_driver_sql(
                    f"PRAGMA table_info({table_name})"
                ).fetchall()
            }
            for column_name, column_type in columns.items():
                if column_name not in existing:
                    connection.exec_driver_sql(
                        f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"
                    )
        connection.commit()


def _ensure_marker_table(db) -> None:
    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS mf_demo_migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                empresa_id INTEGER NOT NULL,
                chave VARCHAR(120) NOT NULL,
                aplicado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(empresa_id, chave)
            )
            """
        )
    )
    db.commit()


def _category_index(categories: Iterable[Categoria]) -> dict[str, Categoria]:
    index: dict[str, Categoria] = {}
    for category in categories:
        for value in (
            getattr(category, "nome", None),
            getattr(category, "nome_pt", None),
            getattr(category, "nome_it", None),
            getattr(category, "nome_en", None),
        ):
            normalized = _norm(value)
            if normalized:
                index.setdefault(normalized, category)
    return index


def _item_index(items: Iterable[Item]) -> dict[str, Item]:
    index: dict[str, Item] = {}
    for item in items:
        for value in (
            getattr(item, "nome", None),
            getattr(item, "nome_pt", None),
            getattr(item, "nome_it", None),
            getattr(item, "nome_en", None),
        ):
            normalized = _norm(value)
            if normalized:
                index.setdefault(normalized, item)
    return index


def aplicar_demo_restaurante_generico_v371(*, force: bool = False) -> dict[str, Any]:
    """Cria/atualiza o cardápio da empresa Bella Food uma única vez."""
    Base.metadata.create_all(bind=engine)
    _ensure_demo_columns()
    db = SessionLocal()
    try:
        company = _find_company(db)
        if company is None:
            return {"aplicado": False, "motivo": "empresa_demo_nao_encontrada"}

        _ensure_marker_table(db)
        marker = db.execute(
            text(
                "SELECT id FROM mf_demo_migrations "
                "WHERE empresa_id = :empresa_id AND chave = :chave LIMIT 1"
            ),
            {"empresa_id": company.id, "chave": MIGRATION_KEY},
        ).first()
        if marker and not force:
            return {"aplicado": False, "motivo": "ja_aplicado", "empresa_id": company.id}
        if marker and force:
            db.execute(
                text("DELETE FROM mf_demo_migrations WHERE empresa_id = :empresa_id AND chave = :chave"),
                {"empresa_id": company.id, "chave": MIGRATION_KEY},
            )

        # Mantém o slug para não quebrar links publicados, mas torna o nome genérico.
        if _norm(company.nome) in {"bella pizza", "bella food"}:
            company.nome = "Bella Food"
        company.descricao = (
            "Cardápio completo com pizzas, hambúrgueres, lanches, "
            "porções, pratos, açaí, doces, bebidas e combos."
        )
        company.aceita_pedidos_online = True
        company.tempo_retirada_minutos = 25
        company.tempo_entrega_minutos = 45

        existing_categories = db.query(Categoria).filter(Categoria.empresa_id == company.id).all()
        category_by_name = _category_index(existing_categories)
        category_map: dict[str, Categoria] = {}
        created_categories = 0

        for spec in CATEGORIES:
            category = None
            for alias in spec["aliases"]:
                category = category_by_name.get(_norm(alias))
                if category:
                    break
            if category is None:
                category = Categoria(empresa_id=company.id, nome=spec["name"])
                db.add(category)
                db.flush()
                created_categories += 1
            category.nome = spec["name"]
            category.nome_pt = spec["name"]
            category.descricao = spec["description"]
            category.descricao_pt = spec["description"]
            category.ordem = spec["order"]
            category.ativo = True
            category_map[spec["name"]] = category
            for alias in spec["aliases"]:
                category_by_name[_norm(alias)] = category

        existing_items = db.query(Item).filter(Item.empresa_id == company.id).all()
        item_by_name = _item_index(existing_items)
        created_items = 0
        updated_items = 0
        asset_index = _asset_files_by_stem()

        for spec in ITEMS:
            item = None
            for alias in spec["aliases"]:
                item = item_by_name.get(_norm(alias))
                if item:
                    break
            if item is None:
                item = Item(
                    empresa_id=company.id,
                    nome=spec["name"],
                    preco=spec["price"],
                )
                db.add(item)
                db.flush()
                created_items += 1
            else:
                updated_items += 1

            image_url = _resolve_demo_asset_url(spec["asset"], asset_index)
            item.nome = spec["name"]
            item.nome_pt = spec["name"]
            item.descricao = spec["description"]
            item.descricao_pt = spec["description"]
            item.preco = spec["price"]
            item.categoria_id = category_map[spec["category"]].id
            item.tipo = "comida"
            current_cover = str(getattr(item, "foto_url", None) or "").strip()
            current_is_demo = current_cover.startswith(f"{ASSET_PREFIX}/")
            current_is_valid = _photo_reference_is_usable(current_cover)
            # Nunca troca uma foto real já enviada pelo cliente. Para a demo, usa
            # automaticamente WEBP/JPG/JPEG/PNG com o mesmo nome-base.
            if image_url and (not current_cover or current_is_demo):
                _set_cover_preserving_gallery(item, image_url)
            elif not current_is_valid and current_is_demo:
                _set_cover_preserving_gallery(item, None)
            item.duracao_minutos = spec["duration"]
            item.opcoes_json = spec["options"]
            item.disponivel = True
            item.estoque = None

            for alias in spec["aliases"]:
                item_by_name[_norm(alias)] = item

        db.execute(
            text(
                "INSERT INTO mf_demo_migrations (empresa_id, chave) "
                "VALUES (:empresa_id, :chave)"
            ),
            {"empresa_id": company.id, "chave": MIGRATION_KEY},
        )
        db.commit()

        result = {
            "aplicado": True,
            "empresa_id": company.id,
            "empresa_nome": company.nome,
            "categorias_criadas": created_categories,
            "itens_criados": created_items,
            "itens_atualizados": updated_items,
            "total_itens_demo": len(ITEMS),
        }
        LOGGER.info("Cardápio Bella Food v371 aplicado: %s", result)
        return result
    except Exception:
        db.rollback()
        LOGGER.exception("Falha ao aplicar demo de restaurante v371")
        raise
    finally:
        db.close()


def corrigir_fotos_demo_multiformato_v372() -> dict[str, Any]:
    """Sincroniza, a cada inicialização, a extensão real das fotos da demonstração."""
    Base.metadata.create_all(bind=engine)
    _ensure_demo_columns()
    db = SessionLocal()
    try:
        company = _find_company(db)
        if company is None:
            return {"aplicado": False, "motivo": "empresa_demo_nao_encontrada"}

        existing_items = db.query(Item).filter(Item.empresa_id == company.id).all()
        item_by_name = _item_index(existing_items)
        asset_index = _asset_files_by_stem()
        corrected = 0
        preserved = 0
        missing = 0

        for spec in ITEMS:
            item = next(
                (item_by_name.get(_norm(alias)) for alias in spec["aliases"] if item_by_name.get(_norm(alias))),
                None,
            )
            if item is None:
                continue

            current_cover = str(getattr(item, "foto_url", None) or "").strip()
            current_is_demo = current_cover.startswith(f"{ASSET_PREFIX}/")
            current_is_valid = _photo_reference_is_usable(current_cover)
            resolved = _resolve_demo_asset_url(spec["asset"], asset_index)

            if resolved and (not current_cover or current_is_demo):
                if current_cover != resolved:
                    _set_cover_preserving_gallery(item, resolved)
                    corrected += 1
                else:
                    preserved += 1
            elif current_is_valid:
                # Foto enviada normalmente pelo painel: nunca é sobrescrita.
                preserved += 1
            elif current_is_demo:
                # Evita mostrar o ícone de imagem quebrada quando o arquivo não existe.
                _set_cover_preserving_gallery(item, None)
                missing += 1
            else:
                missing += 1

        db.commit()
        result = {
            "aplicado": True,
            "empresa_id": company.id,
            "fotos_corrigidas": corrected,
            "fotos_preservadas": preserved,
            "fotos_ausentes": missing,
            "formatos": list(SUPPORTED_IMAGE_EXTENSIONS[:-1]),
        }
        LOGGER.info("Sincronização de fotos da demo v372: %s", result)
        return result
    except Exception:
        db.rollback()
        LOGGER.exception("Falha ao sincronizar fotos da demonstração v372")
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepara o restaurante demonstrativo do MenuFacile")
    parser.add_argument("--force", action="store_true", help="reaplica mesmo que a versão já tenha sido executada")
    args = parser.parse_args()
    result = aplicar_demo_restaurante_generico_v371(force=args.force)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
