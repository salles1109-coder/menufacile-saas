"""Validação segura de pedidos, preços, estoque e idempotência.

Este módulo concentra as regras críticas do checkout para evitar que o navegador
seja tratado como fonte confiável de preço, disponibilidade ou estoque.
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Iterable

from sqlalchemy import or_, text

from backend.models import Item, Pedido, PedidoItem

MONEY = Decimal("0.01")
MAX_ITEM_QUANTITY = 999
MAX_ORDER_LINES = 100


class OrderValidationError(ValueError):
    def __init__(self, message: str, *, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def money(value: Any) -> Decimal:
    try:
        amount = Decimal(str(value if value is not None else 0))
    except (InvalidOperation, TypeError, ValueError):
        raise OrderValidationError("Valor monetário inválido.")
    if not amount.is_finite():
        raise OrderValidationError("Valor monetário inválido.")
    return amount.quantize(MONEY, rounding=ROUND_HALF_UP)


def normalize(value: Any) -> str:
    raw = unicodedata.normalize("NFKD", str(value or ""))
    raw = "".join(ch for ch in raw if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", raw).strip().casefold()


def digits(value: Any) -> str:
    return re.sub(r"\D+", "", str(value or ""))


def is_delivery(order_type: Any) -> bool:
    value = normalize(order_type)
    return value in {"entrega", "delivery", "consegna", "spedizione"} or value.startswith("entrega ")


def is_internal_order(order_type: Any) -> bool:
    value = normalize(order_type)
    return value.startswith("mesa") or value.startswith("tablet") or value in {
        "balcao", "balcão", "counter", "tavolo"
    }


def is_cash(payment: Any) -> bool:
    return normalize(payment) in {"dinheiro", "contanti", "cash", "especie", "espécie"}


def is_online_payment(payment: Any) -> bool:
    return normalize(payment) in {
        "pagamento online", "cartao online", "cartão online", "pix online", "online payment"
    }


def validate_order_header(order: Any) -> None:
    name = re.sub(r"\s+", " ", str(getattr(order, "nome_cliente", "") or "")).strip()
    order_type = str(getattr(order, "tipo_pedido", "") or "").strip()
    payment = str(getattr(order, "pagamento", "") or "").strip()

    if not name or len(name) < 2:
        raise OrderValidationError("Informe o nome do cliente.")
    if len(name) > 120:
        raise OrderValidationError("O nome do cliente é muito longo.")
    if not order_type or len(order_type) > 80:
        raise OrderValidationError("Tipo de pedido inválido.")

    normalized_type = normalize(order_type)
    allowed_type = (
        is_delivery(order_type)
        or is_internal_order(order_type)
        or normalized_type in {
            "retirada", "retirada no local", "retirada na loja", "retirada no balcao",
            "ritiro", "ritiro in sede", "ritiro in negozio", "pickup", "store pickup",
            "para viagem", "take away", "takeaway",
        }
    )
    if not allowed_type:
        raise OrderValidationError("Tipo de pedido não reconhecido.")

    if not is_internal_order(order_type):
        phone = digits(getattr(order, "telefone_cliente", ""))
        if len(phone) < 8 or len(phone) > 16:
            raise OrderValidationError("Informe um telefone válido.")

    known_payments = {
        "dinheiro", "contanti", "cash", "especie",
        "cartao", "cartão", "carta", "card", "cartao na entrega", "cartão na entrega",
        "credito", "crédito", "debito", "débito",
        "pix", "pix online", "pagamento online", "cartao online", "cartão online",
        "pix pela chave", "pix manual", "pix_manual", "pix chave", "pix_chave",
        "online payment", "pagamento no local", "pagamento na retirada", "atendimento",
    }
    if payment and normalize(payment) not in known_payments:
        raise OrderValidationError("Forma de pagamento não reconhecida.")

    if is_delivery(order_type):
        address = str(getattr(order, "endereco_entrega", "") or "").strip()
        postal = str(getattr(order, "cap_entrega", "") or "").strip()
        city = str(getattr(order, "cidade_entrega", "") or "").strip()
        if len(address) < 4 or len(postal) < 3 or len(city) < 2:
            raise OrderValidationError("Preencha endereço, CEP/CAP e cidade para entrega.")


def _item_aliases(item: Item) -> set[str]:
    return {
        normalized
        for normalized in (
            normalize(getattr(item, "nome", None)),
            normalize(getattr(item, "nome_pt", None)),
            normalize(getattr(item, "nome_it", None)),
            normalize(getattr(item, "nome_en", None)),
        )
        if normalized
    }


def _submitted_base_name(value: Any) -> str:
    # O menu acrescenta opções usando o separador “ · ”. A identidade e o preço
    # continuam vindo do item oficial do banco.
    return str(value or "").split(" · ", 1)[0].strip()


def _resolve_item_by_name(db: Any, company_id: int, submitted_name: str) -> Item | None:
    target = normalize(_submitted_base_name(submitted_name))
    if not target:
        return None
    candidates = db.query(Item).filter(Item.empresa_id == company_id).all()
    matches = [item for item in candidates if target in _item_aliases(item)]
    return matches[0] if len(matches) == 1 else None


def _rich_option_groups(item: Item) -> list[dict[str, Any]]:
    """Lê a configuração V370 de grupos de opções do item.

    Formatos antigos de ``opcoes_json`` continuam válidos nos demais menus,
    mas não participam do cálculo de adicionais.
    """
    raw = getattr(item, "opcoes_json", None)
    if not raw:
        return []
    try:
        data = raw if isinstance(raw, dict) else json.loads(str(raw))
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    if not isinstance(data, dict) or not isinstance(data.get("grupos"), list):
        return []

    groups: list[dict[str, Any]] = []
    for group_index, group in enumerate(data.get("grupos")[:30]):
        if not isinstance(group, dict):
            continue
        group_id = str(group.get("id") or f"g{group_index + 1}").strip()[:80]
        group_name = re.sub(r"\s+", " ", str(group.get("nome") or "Opção")).strip()[:80]
        options = []
        for option_index, option in enumerate((group.get("opcoes") or [])[:80]):
            if not isinstance(option, dict):
                continue
            option_id = str(option.get("id") or f"o{option_index + 1}").strip()[:80]
            option_name = re.sub(r"\s+", " ", str(option.get("nome") or "")).strip()[:100]
            if not option_id or not option_name:
                continue
            option_price = money(option.get("preco", option.get("preco_adicional", 0)))
            if option_price < 0:
                raise OrderValidationError(f'Preço adicional inválido em "{group_name}".')
            options.append({
                "id": option_id,
                "name": option_name,
                "price": option_price,
            })
        if not options:
            continue
        try:
            minimum = max(0, int(group.get("min", 1 if group.get("obrigatorio") else 0) or 0))
            maximum = max(1, int(group.get("max", 1) or 1))
        except (TypeError, ValueError):
            minimum, maximum = (1 if group.get("obrigatorio") else 0), 1
        maximum = min(maximum, len(options))
        minimum = min(minimum, maximum)
        groups.append({
            "id": group_id,
            "name": group_name,
            "min": minimum,
            "max": maximum,
            "options": options,
        })
    return groups


def _validate_selected_options(item: Item, line: Any) -> tuple[Decimal, list[str]]:
    groups = _rich_option_groups(item)
    submitted = list(getattr(line, "opcoes_selecionadas", None) or [])
    if not groups:
        if submitted:
            raise OrderValidationError(f'As opções de "{item.nome}" foram alteradas. Abra o item novamente.')
        return Decimal("0.00"), []

    group_map = {group["id"]: group for group in groups}
    selected_by_group: dict[str, list[str]] = defaultdict(list)
    for selected in submitted[:200]:
        group_id = str(getattr(selected, "grupo_id", "") or "").strip()
        option_id = str(getattr(selected, "opcao_id", "") or "").strip()
        if not group_id or not option_id or group_id not in group_map:
            raise OrderValidationError(f'Uma opção de "{item.nome}" não é mais válida. Abra o item novamente.')
        if option_id not in selected_by_group[group_id]:
            selected_by_group[group_id].append(option_id)

    additional = Decimal("0.00")
    labels: list[str] = []
    for group in groups:
        option_map = {option["id"]: option for option in group["options"]}
        selected_ids = selected_by_group.get(group["id"], [])
        if len(selected_ids) < group["min"]:
            raise OrderValidationError(f'Escolha {group["name"]} para "{item.nome}".')
        if len(selected_ids) > group["max"]:
            raise OrderValidationError(
                f'Escolha no máximo {group["max"]} opção(ões) em {group["name"]}.'
            )
        names: list[str] = []
        for option_id in selected_ids:
            option = option_map.get(option_id)
            if option is None:
                raise OrderValidationError(f'Uma opção de "{item.nome}" não é mais válida. Abra o item novamente.')
            additional += option["price"]
            names.append(option["name"])
        if names:
            labels.append(f'{group["name"]}: {", ".join(names)}')
    return money(additional), labels


def resolve_order_items(db: Any, company_id: int, incoming_items: Iterable[Any]) -> list[dict[str, Any]]:
    incoming_items = list(incoming_items or [])
    if not incoming_items:
        raise OrderValidationError("O carrinho está vazio.")
    if len(incoming_items) > MAX_ORDER_LINES:
        raise OrderValidationError("O pedido possui itens demais.")

    resolved: list[dict[str, Any]] = []
    for line in incoming_items:
        try:
            quantity = int(getattr(line, "quantidade", 0))
        except (TypeError, ValueError):
            raise OrderValidationError("Quantidade inválida.")
        if quantity < 1:
            raise OrderValidationError("A quantidade de cada item deve ser maior que zero.")
        if quantity > MAX_ITEM_QUANTITY:
            raise OrderValidationError(f"A quantidade máxima por item é {MAX_ITEM_QUANTITY}.")

        item_id = getattr(line, "item_id", None)
        item = None
        if item_id is not None:
            try:
                item_id = int(item_id)
            except (TypeError, ValueError):
                raise OrderValidationError("Produto inválido.")
            item = db.query(Item).filter(
                Item.id == item_id,
                Item.empresa_id == company_id,
            ).first()
        else:
            item = _resolve_item_by_name(db, company_id, getattr(line, "nome_item", ""))

        if item is None:
            raise OrderValidationError("Um dos produtos não existe nesta empresa.", status_code=404)
        if getattr(item, "disponivel", True) is False:
            raise OrderValidationError(f'O produto "{item.nome}" não está disponível.')

        official_price = money(getattr(item, "preco", 0))
        if official_price < 0:
            raise OrderValidationError(f'Preço inválido no produto "{item.nome}".')

        submitted_name = re.sub(r"\s+", " ", str(getattr(line, "nome_item", "") or "")).strip()
        aliases = _item_aliases(item)
        submitted_base = normalize(_submitted_base_name(submitted_name))
        display_base = _submitted_base_name(submitted_name) if submitted_name and submitted_base in aliases else str(item.nome)

        option_price, option_labels = _validate_selected_options(item, line)
        official_price = money(official_price + option_price)

        note = re.sub(r"\s+", " ", str(getattr(line, "observacao_item", "") or "")).strip()[:180]
        display_parts = [display_base]
        if option_labels:
            display_parts.extend(option_labels)
        if note:
            display_parts.append(f"Obs.: {note}")
        display_name = " · ".join(part for part in display_parts if part)[:255]

        resolved.append({
            "item": item,
            "item_id": int(item.id),
            "name": display_name,
            "quantity": quantity,
            "unit_price": official_price,
        })
    return resolved


def reserve_stock(db: Any, resolved_items: Iterable[dict[str, Any]]) -> bool:
    totals: dict[int, int] = defaultdict(int)
    items_by_id: dict[int, Item] = {}
    for line in resolved_items:
        item = line["item"]
        if getattr(item, "estoque", None) is None:
            continue
        totals[int(item.id)] += int(line["quantity"])
        items_by_id[int(item.id)] = item

    for item_id, quantity in totals.items():
        result = db.execute(
            text(
                """
                UPDATE itens
                   SET estoque = estoque - :quantity
                 WHERE id = :item_id
                   AND disponivel = 1
                   AND estoque IS NOT NULL
                   AND estoque >= :quantity
                """
            ),
            {"item_id": item_id, "quantity": quantity},
        )
        if result.rowcount != 1:
            current = db.query(Item).filter(Item.id == item_id).first()
            available = getattr(current, "estoque", 0) if current else 0
            name = getattr(items_by_id.get(item_id), "nome", "Produto")
            raise OrderValidationError(
                f'Estoque insuficiente para "{name}". Disponível: {max(int(available or 0), 0)}.',
                status_code=409,
            )
    return bool(totals)


def restore_stock(db: Any, order: Pedido) -> bool:
    if not bool(getattr(order, "estoque_reservado", False)):
        return False
    if bool(getattr(order, "estoque_devolvido", False)):
        return False

    totals: dict[int, int] = defaultdict(int)
    for line in db.query(PedidoItem).filter(PedidoItem.pedido_id == order.id).all():
        if line.item_id is not None and int(line.quantidade or 0) > 0:
            totals[int(line.item_id)] += int(line.quantidade)

    for item_id, quantity in totals.items():
        db.execute(
            text(
                """
                UPDATE itens
                   SET estoque = estoque + :quantity
                 WHERE id = :item_id
                   AND estoque IS NOT NULL
                """
            ),
            {"item_id": item_id, "quantity": quantity},
        )

    order.estoque_devolvido = True
    return True


def reserve_existing_order_stock(db: Any, order: Pedido) -> bool:
    if not bool(getattr(order, "estoque_devolvido", False)):
        return False
    lines = db.query(PedidoItem).filter(PedidoItem.pedido_id == order.id).all()
    resolved: list[dict[str, Any]] = []
    for line in lines:
        if line.item_id is None:
            continue
        item = db.query(Item).filter(
            Item.id == line.item_id,
            Item.empresa_id == order.empresa_id,
        ).first()
        if not item:
            raise OrderValidationError("Não foi possível reabrir: um produto do pedido não existe.", status_code=409)
        resolved.append({"item": item, "quantity": int(line.quantidade or 0)})
    reserved = reserve_stock(db, resolved)
    order.estoque_reservado = bool(reserved)
    order.estoque_devolvido = False
    return reserved


def canonical_order_fingerprint(order: Any, resolved_items: Iterable[dict[str, Any]]) -> str:
    payload = {
        "empresa_id": int(getattr(order, "empresa_id", 0) or 0),
        "nome": normalize(getattr(order, "nome_cliente", "")),
        "telefone": digits(getattr(order, "telefone_cliente", "")),
        "tipo": normalize(getattr(order, "tipo_pedido", "")),
        "pagamento": normalize(getattr(order, "pagamento", "")),
        "endereco": normalize(getattr(order, "endereco_entrega", "")),
        "itens": sorted(
            (
                int(line["item_id"]),
                int(line["quantity"]),
                normalize(line["name"]),
            )
            for line in resolved_items
        ),
    }
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def idempotency_keys(order: Any, resolved_items: Iterable[dict[str, Any]], explicit_key: str | None) -> tuple[str, list[str]]:
    explicit = re.sub(r"[^A-Za-z0-9._:-]", "", str(explicit_key or ""))[:120]
    if explicit:
        return explicit, [explicit]

    fingerprint = canonical_order_fingerprint(order, resolved_items)
    bucket = int(datetime.utcnow().timestamp() // 60)
    current = f"auto:{bucket}:{fingerprint}"
    previous = f"auto:{bucket - 1}:{fingerprint}"
    return current, [current, previous]


def find_recent_idempotent_order(db: Any, company_id: int, keys: Iterable[str]) -> Pedido | None:
    keys = [key for key in keys if key]
    if not keys:
        return None
    cutoff = datetime.utcnow() - timedelta(minutes=2)
    return db.query(Pedido).filter(
        Pedido.empresa_id == company_id,
        Pedido.chave_idempotencia.in_(keys),
        Pedido.criado_em >= cutoff,
    ).order_by(Pedido.id.desc()).first()


def ensure_order_security_columns(engine: Any) -> None:
    columns = {
        "chave_idempotencia": "VARCHAR(160)",
        "estoque_reservado": "BOOLEAN DEFAULT 0",
        "estoque_devolvido": "BOOLEAN DEFAULT 0",
        "public_token": "VARCHAR(96)",
    }
    try:
        with engine.begin() as connection:
            existing = {
                row[1]
                for row in connection.execute(text("PRAGMA table_info(pedidos)")).fetchall()
            }
            for name, ddl in columns.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE pedidos ADD COLUMN {name} {ddl}"))
            connection.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ux_pedidos_empresa_idempotencia "
                "ON pedidos(empresa_id, chave_idempotencia) "
                "WHERE chave_idempotencia IS NOT NULL"
            ))
            connection.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_pedidos_public_token ON pedidos(public_token)"
            ))

            reservation_existing = {
                row[1]
                for row in connection.execute(text("PRAGMA table_info(reservas)")).fetchall()
            }
            if "public_token" not in reservation_existing:
                connection.execute(text("ALTER TABLE reservas ADD COLUMN public_token VARCHAR(96)"))
            connection.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_reservas_public_token ON reservas(public_token)"
            ))
    except Exception as error:
        print("Aviso: não foi possível garantir colunas seguras de pedidos:", error)
