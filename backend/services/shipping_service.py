"""Cálculo de frete do Menu de Produtos.

Modelos suportados:
1. taxa fixa;
2. cidade/bairro identificado pelo CEP do cliente;
3. distância rodoviária aproximada entre CEPs;
4. cotação manual pelo WhatsApp.

O formato antigo por faixas de CEP continua aceito apenas por compatibilidade.
O cálculo por distância usa coordenadas aproximadas do CEP e um servidor OSRM.
A URL do OSRM pode ser trocada por MENUFACILE_OSRM_BASE_URL em produção.
"""

from __future__ import annotations

import json
import math
import os
import re
import unicodedata
import urllib.error
import urllib.request
import urllib.parse
import threading
import time
from decimal import Decimal, ROUND_HALF_UP
from functools import lru_cache
from typing import Any, Callable


CENTAVOS = Decimal("0.01")
BRASIL_API_CEP_V2 = os.getenv(
    "MENUFACILE_CEP_API_BASE_URL",
    "https://brasilapi.com.br/api/cep/v2",
).rstrip("/")
BRASIL_API_CEP_V1 = os.getenv(
    "MENUFACILE_CEP_API_V1_BASE_URL",
    "https://brasilapi.com.br/api/cep/v1",
).rstrip("/")
NOMINATIM_BASE_URL = os.getenv(
    "MENUFACILE_NOMINATIM_BASE_URL",
    "https://nominatim.openstreetmap.org",
).rstrip("/")
OSRM_BASE_URL = os.getenv(
    "MENUFACILE_OSRM_BASE_URL",
    "https://router.project-osrm.org",
).rstrip("/")
HTTP_TIMEOUT_SECONDS = max(
    2.0,
    min(20.0, float(os.getenv("MENUFACILE_FRETE_HTTP_TIMEOUT", "8"))),
)
USER_AGENT = os.getenv(
    "MENUFACILE_FRETE_USER_AGENT",
    "MenuFacile/1.0 (shipping; contact: admin@menufacile.org)",
)
_NOMINATIM_LOCK = threading.Lock()
_NOMINATIM_LAST_REQUEST = 0.0
SHIPPING_ENGINE_VERSION = "2026.07.26-cep-local-v4"


class ShippingQuoteError(ValueError):
    """Erro de validação ou de cotação que pode ser exibido ao cliente."""


class ShippingProviderError(RuntimeError):
    """Erro temporário no provedor externo de CEP/rota."""


def decimal_money(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value.quantize(CENTAVOS, rounding=ROUND_HALF_UP)
    raw = str(value if value is not None else "0").strip().replace(" ", "")
    if "," in raw and "." in raw:
        raw = raw.replace(".", "").replace(",", ".")
    else:
        raw = raw.replace(",", ".")
    try:
        result = Decimal(raw or "0")
    except Exception as exc:
        raise ShippingQuoteError("Valor monetário inválido.") from exc
    if not result.is_finite():
        raise ShippingQuoteError("Valor monetário inválido.")
    return result.quantize(CENTAVOS, rounding=ROUND_HALF_UP)


def decimal_number(value: Any, default: str = "0") -> Decimal:
    raw = str(value if value is not None else default).strip().replace(",", ".")
    try:
        result = Decimal(raw or default)
    except Exception as exc:
        raise ShippingQuoteError("Valor numérico inválido.") from exc
    if not result.is_finite():
        raise ShippingQuoteError("Valor numérico inválido.")
    return result


def normalize_cep(value: Any) -> str:
    cep = re.sub(r"\D", "", str(value or ""))
    if len(cep) != 8:
        raise ShippingQuoteError("Informe um CEP válido com 8 números.")
    return cep


def format_cep(value: Any) -> str:
    cep = normalize_cep(value)
    return f"{cep[:5]}-{cep[5:]}"


def normalize_location_text(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").strip())
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"[^a-zA-Z0-9]+", " ", text).strip().casefold()
    return re.sub(r"\s+", " ", text)


def normalize_uf(value: Any) -> str:
    uf = re.sub(r"[^A-Za-z]", "", str(value or "")).upper()[:2]
    if len(uf) != 2:
        raise ShippingQuoteError("Selecione um estado válido para a cidade atendida.")
    return uf


def _bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "sim", "yes", "on"}


def _bounded_int(value: Any, default: int = 0, minimum: int = 0, maximum: int = 365) -> int:
    try:
        parsed = int(str(value if value is not None else default).strip() or default)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def normalize_shipping_locations(raw_locations: Any) -> list[dict[str, Any]]:
    """Normaliza cidades/bairros e impede regras duplicadas ativas."""
    if not isinstance(raw_locations, list):
        return []

    normalized: list[dict[str, Any]] = []
    active_keys: dict[tuple[str, str, str], str] = {}
    for index, raw in enumerate(raw_locations, start=1):
        if not isinstance(raw, dict):
            continue
        active = _bool(raw.get("ativa"), True)
        uf = normalize_uf(raw.get("uf"))
        city = str(raw.get("cidade") or "").strip()[:100]
        district = str(raw.get("bairro") or "").strip()[:100]
        if not city:
            raise ShippingQuoteError(f"Informe a cidade no local de entrega {index}.")
        city_key = normalize_location_text(city)
        district_key = normalize_location_text(district)
        if not city_key:
            raise ShippingQuoteError(f"Informe uma cidade válida no local de entrega {index}.")

        default_name = f"{district}, {city} - {uf}" if district else f"{city} - {uf}"
        name = str(raw.get("nome") or default_name).strip()[:120]
        fee = decimal_money(raw.get("valor", 0))
        minimum = decimal_money(raw.get("pedido_minimo", 0))
        if fee < 0 or minimum < 0:
            raise ShippingQuoteError(f"Valores negativos não são permitidos em “{name}”.")
        deadline = str(raw.get("prazo") or "").strip()[:120]

        key = (uf, city_key, district_key)
        if active and key in active_keys:
            raise ShippingQuoteError(
                f"Existem duas regras ativas para o mesmo local: “{active_keys[key]}” e “{name}”."
            )
        if active:
            active_keys[key] = name

        normalized.append(
            {
                "nome": name,
                "uf": uf,
                "cidade": city,
                "bairro": district,
                "valor": float(fee),
                "prazo": deadline,
                "pedido_minimo": float(minimum),
                "ativa": active,
            }
        )
    return normalized


def find_shipping_location(
    locations: list[dict[str, Any]], address: dict[str, Any]
) -> dict[str, Any] | None:
    target_uf = str(address.get("uf") or address.get("state") or "").upper()
    target_city = normalize_location_text(address.get("cidade") or address.get("city"))
    target_district = normalize_location_text(
        address.get("bairro") or address.get("neighborhood")
    )
    if len(target_uf) != 2 or not target_city:
        return None

    matches: list[dict[str, Any]] = []
    for item in locations:
        if not item.get("ativa", True):
            continue
        if str(item.get("uf") or "").upper() != target_uf:
            continue
        if normalize_location_text(item.get("cidade")) != target_city:
            continue
        configured_district = normalize_location_text(item.get("bairro"))
        if configured_district and configured_district != target_district:
            continue
        matches.append(item)

    if not matches:
        return None
    # Bairro específico sempre vence a regra geral da cidade.
    return max(matches, key=lambda item: bool(normalize_location_text(item.get("bairro"))))


# Compatibilidade com instalações que já salvaram faixas de CEP.
def normalize_shipping_ranges(raw_ranges: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_ranges, list):
        return []

    normalized: list[dict[str, Any]] = []
    for index, raw in enumerate(raw_ranges, start=1):
        if not isinstance(raw, dict):
            continue
        active = _bool(raw.get("ativa"), True)
        name = str(raw.get("nome") or f"Faixa {index}").strip()[:100]
        initial = normalize_cep(raw.get("cep_inicial"))
        final = normalize_cep(raw.get("cep_final"))
        if int(initial) > int(final):
            raise ShippingQuoteError(
                f"Na faixa “{name}”, o CEP inicial deve ser menor ou igual ao CEP final."
            )
        fee = decimal_money(raw.get("valor", 0))
        minimum = decimal_money(raw.get("pedido_minimo", 0))
        deadline = str(raw.get("prazo") or "").strip()[:120]
        normalized.append(
            {
                "nome": name,
                "cep_inicial": initial,
                "cep_final": final,
                "valor": float(fee),
                "prazo": deadline,
                "pedido_minimo": float(minimum),
                "ativa": active,
            }
        )

    active_ranges = sorted(
        (item for item in normalized if item["ativa"]),
        key=lambda item: int(item["cep_inicial"]),
    )
    for previous, current in zip(active_ranges, active_ranges[1:]):
        if int(current["cep_inicial"]) <= int(previous["cep_final"]):
            raise ShippingQuoteError(
                "As faixas ativas não podem se sobrepor: "
                f"“{previous['nome']}” e “{current['nome']}”."
            )
    return normalized


def find_shipping_range(ranges: list[dict[str, Any]], cep: str) -> dict[str, Any] | None:
    target = int(normalize_cep(cep))
    matches = [
        item
        for item in ranges
        if item.get("ativa", True)
        and int(item["cep_inicial"]) <= target <= int(item["cep_final"])
    ]
    if not matches:
        return None
    return min(matches, key=lambda item: int(item["cep_final"]) - int(item["cep_inicial"]))


def _read_json_any(url: str, timeout: float = HTTP_TIMEOUT_SECONDS) -> Any:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": USER_AGENT},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, ValueError) as exc:
        raise ShippingProviderError("Serviço externo de frete indisponível.") from exc


def _read_json(url: str, timeout: float = HTTP_TIMEOUT_SECONDS) -> dict[str, Any]:
    payload = _read_json_any(url, timeout=timeout)
    if not isinstance(payload, dict):
        raise ShippingProviderError("Resposta inválida do serviço externo de frete.")
    return payload


def _read_json_list(url: str, timeout: float = HTTP_TIMEOUT_SECONDS) -> list[Any]:
    payload = _read_json_any(url, timeout=timeout)
    if not isinstance(payload, list):
        raise ShippingProviderError("Resposta inválida do serviço de geolocalização.")
    return payload


@lru_cache(maxsize=4096)
def lookup_cep_address(cep: str) -> dict[str, str]:
    normalized = normalize_cep(cep)
    data = _read_json(f"{BRASIL_API_CEP_V2}/{normalized}")
    city = str(data.get("city") or "").strip()
    state = str(data.get("state") or "").strip().upper()
    if not city or len(state) != 2:
        raise ShippingProviderError("Não foi possível identificar a cidade deste CEP.")
    return {
        "cep": normalized,
        "uf": state,
        "cidade": city,
        "bairro": str(data.get("neighborhood") or "").strip(),
        "logradouro": str(data.get("street") or "").strip(),
    }


def _coordinates_from_brasil_api(data: dict[str, Any]) -> tuple[float, float]:
    location = data.get("location") or {}
    coordinates = location.get("coordinates") if isinstance(location, dict) else None
    longitude: Any = None
    latitude: Any = None
    if isinstance(coordinates, dict):
        longitude = coordinates.get("longitude")
        latitude = coordinates.get("latitude")
    elif isinstance(coordinates, (list, tuple)) and len(coordinates) >= 2:
        longitude, latitude = coordinates[0], coordinates[1]

    try:
        lon = float(longitude)
        lat = float(latitude)
    except (TypeError, ValueError) as exc:
        raise ShippingProviderError(
            "Não foi possível localizar este CEP para calcular a distância."
        ) from exc
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ShippingProviderError("As coordenadas retornadas para o CEP são inválidas.")
    return lon, lat


def _nominatim_wait_turn() -> None:
    """Respeita o limite conservador do servidor público do Nominatim."""
    global _NOMINATIM_LAST_REQUEST
    with _NOMINATIM_LOCK:
        elapsed = time.monotonic() - _NOMINATIM_LAST_REQUEST
        if elapsed < 1.05:
            time.sleep(1.05 - elapsed)
        _NOMINATIM_LAST_REQUEST = time.monotonic()


def _coordinates_from_nominatim_result(result: dict[str, Any]) -> tuple[float, float]:
    try:
        lon = float(result.get("lon"))
        lat = float(result.get("lat"))
    except (TypeError, ValueError) as exc:
        raise ShippingProviderError("O geocodificador não retornou coordenadas válidas.") from exc
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ShippingProviderError("O geocodificador retornou coordenadas inválidas.")
    return lon, lat


def _nominatim_queries(cep: str, address: dict[str, Any]) -> list[tuple[str, bool]]:
    """Monta consultas de geocodificação sem degradar rua conhecida para centro da cidade.

    O segundo item da tupla indica que a resposta precisa corresponder ao
    logradouro. Isso evita aceitar o centro de Tatuí (ou outro ponto genérico)
    quando o Nominatim não encontra a rua exata.
    """
    formatted = format_cep(cep)
    street = str(address.get("street") or address.get("logradouro") or "").strip()
    district = str(address.get("neighborhood") or address.get("bairro") or "").strip()
    city = str(address.get("city") or address.get("cidade") or "").strip()
    state = str(address.get("state") or address.get("uf") or "").strip().upper()

    candidates: list[tuple[str, bool]] = []
    if street and city and state:
        # Não adicionamos uma consulta apenas por cidade neste caso. Se a rua
        # não for localizada, o chamador usa as coordenadas do provedor de CEP.
        candidates.append((", ".join(part for part in [street, district, city, state, "Brasil"] if part), True))
        candidates.append((", ".join([street, city, state, "Brasil"]), True))
        candidates.append((", ".join(part for part in [formatted, street, city, state, "Brasil"] if part), True))
    elif district and city and state:
        candidates.append((", ".join([district, city, state, "Brasil"]), False))
        candidates.append((", ".join([formatted, city, state, "Brasil"]), False))
    elif city and state:
        candidates.append((", ".join([formatted, city, state, "Brasil"]), False))
        candidates.append((", ".join([city, state, "Brasil"]), False))
    else:
        candidates.append((f"{formatted}, Brasil", False))

    unique: list[tuple[str, bool]] = []
    seen: set[str] = set()
    for query, require_street in candidates:
        key = normalize_location_text(query)
        if key and key not in seen:
            seen.add(key)
            unique.append((query, require_street))
    return unique


def _nominatim_result_matches(
    result: dict[str, Any],
    expected_address: dict[str, Any],
    *,
    require_street: bool,
) -> bool:
    """Confere se o Nominatim devolveu a mesma cidade/UF e, quando exigido, a rua."""
    details = result.get("address") if isinstance(result.get("address"), dict) else {}
    display = normalize_location_text(result.get("display_name"))

    expected_city = normalize_location_text(
        expected_address.get("city") or expected_address.get("cidade")
    )
    expected_state = str(
        expected_address.get("state") or expected_address.get("uf") or ""
    ).strip().upper()
    expected_street = normalize_location_text(
        expected_address.get("street") or expected_address.get("logradouro")
    )

    result_city = normalize_location_text(
        details.get("city")
        or details.get("town")
        or details.get("municipality")
        or details.get("village")
        or details.get("county")
    )
    iso_state = str(details.get("ISO3166-2-lvl4") or details.get("ISO3166-2-lvl6") or "").upper()
    result_state = str(details.get("state_code") or "").upper()

    if expected_city and result_city and result_city != expected_city:
        return False
    if expected_city and not result_city and expected_city not in display:
        return False
    if expected_state:
        state_ok = (
            result_state == expected_state
            or iso_state.endswith(f"-{expected_state}")
            or normalize_location_text(expected_state) in display
        )
        # Muitos resultados brasileiros não trazem state_code; nesse caso a
        # cidade + país ainda são suficientes, mas um UF conflitante é rejeitado.
        if (result_state or iso_state) and not state_ok:
            return False

    if require_street and expected_street:
        result_street = normalize_location_text(
            details.get("road")
            or details.get("pedestrian")
            or details.get("residential")
            or details.get("path")
        )
        if result_street:
            if result_street != expected_street and expected_street not in result_street and result_street not in expected_street:
                return False
        elif expected_street not in display:
            return False
    return True


@lru_cache(maxsize=4096)
def _lookup_nominatim_coordinates(cep: str, address_json: str) -> tuple[float, float]:
    address = json.loads(address_json) if address_json else {}
    last_error: Exception | None = None
    for query, require_street in _nominatim_queries(cep, address):
        params = urllib.parse.urlencode(
            {
                "format": "jsonv2",
                "limit": "3",
                "countrycodes": "br",
                "addressdetails": "1",
                "q": query,
            }
        )
        try:
            _nominatim_wait_turn()
            results = _read_json_list(f"{NOMINATIM_BASE_URL}/search?{params}")
            for result in results:
                if not isinstance(result, dict):
                    continue
                if not _nominatim_result_matches(
                    result,
                    address,
                    require_street=require_street,
                ):
                    continue
                return _coordinates_from_nominatim_result(result)
        except ShippingProviderError as exc:
            last_error = exc
            continue
    raise ShippingProviderError(
        f"O CEP {format_cep(cep)} foi encontrado, mas não possui coordenadas confiáveis para calcular a distância."
    ) from last_error


@lru_cache(maxsize=4096)
def lookup_cep_coordinates(cep: str) -> tuple[float, float]:
    """Localiza um CEP sem aceitar silenciosamente o centro da cidade.

    A coordenada do CEP V2 é a referência principal. Uma coordenada de rua do
    Nominatim só é usada quando corresponde ao logradouro/cidade e permanece
    próxima da referência do CEP. Isso corrige rotas locais absurdas, como dois
    CEPs vizinhos sendo calculados com dezenas de quilômetros.
    """
    normalized = normalize_cep(cep)
    address: dict[str, Any] = {}
    brasil_coordinates: tuple[float, float] | None = None

    try:
        data = _read_json(f"{BRASIL_API_CEP_V2}/{normalized}")
        address = data
        try:
            brasil_coordinates = _coordinates_from_brasil_api(data)
        except ShippingProviderError:
            brasil_coordinates = None
    except ShippingProviderError:
        try:
            address = _read_json(f"{BRASIL_API_CEP_V1}/{normalized}")
        except ShippingProviderError as exc:
            raise ShippingProviderError(
                f"Não foi possível consultar o CEP {format_cep(normalized)} agora."
            ) from exc

    safe_address = {
        key: address.get(key)
        for key in (
            "street", "logradouro", "neighborhood", "bairro",
            "city", "cidade", "state", "uf",
        )
        if address.get(key)
    }

    has_street = bool(safe_address.get("street") or safe_address.get("logradouro"))
    has_city = bool(safe_address.get("city") or safe_address.get("cidade"))
    has_state = bool(safe_address.get("state") or safe_address.get("uf"))

    if has_street and has_city and has_state:
        try:
            street_coordinates = _lookup_nominatim_coordinates(
                normalized,
                json.dumps(safe_address, ensure_ascii=False, sort_keys=True),
            )
            if brasil_coordinates is None:
                return street_coordinates

            # Se os provedores discordarem muito, a resposta do Nominatim
            # provavelmente caiu em outra rua/localidade. Mantemos o ponto do CEP.
            divergence_km = haversine_distance_km(
                brasil_coordinates,
                street_coordinates,
            )
            if divergence_km <= 3.0:
                return street_coordinates
        except ShippingProviderError:
            pass

    if brasil_coordinates is not None:
        return brasil_coordinates

    return _lookup_nominatim_coordinates(
        normalized,
        json.dumps(safe_address, ensure_ascii=False, sort_keys=True),
    )


@lru_cache(maxsize=8192)
def route_distance_km(origin_cep: str, destination_cep: str) -> float:
    origin = lookup_cep_coordinates(normalize_cep(origin_cep))
    destination = lookup_cep_coordinates(normalize_cep(destination_cep))
    coordinates = f"{origin[0]:.7f},{origin[1]:.7f};{destination[0]:.7f},{destination[1]:.7f}"
    data = _read_json(
        f"{OSRM_BASE_URL}/route/v1/driving/{coordinates}?overview=false&steps=false"
    )
    routes = data.get("routes")
    if data.get("code") != "Ok" or not isinstance(routes, list) or not routes:
        raise ShippingProviderError("Não foi possível encontrar uma rota para este CEP.")
    try:
        meters = float(routes[0]["distance"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ShippingProviderError("A rota não retornou uma distância válida.") from exc
    if meters < 0:
        raise ShippingProviderError("A rota retornou uma distância inválida.")
    return round(meters / 1000.0, 2)


def haversine_distance_km(origin: tuple[float, float], destination: tuple[float, float]) -> float:
    """Disponível para testes/diagnóstico; não é usado como cobrança automática."""
    lon1, lat1 = map(math.radians, origin)
    lon2, lat2 = map(math.radians, destination)
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(a))


def normalize_shipping_config(config: dict[str, Any] | None) -> dict[str, Any]:
    source = dict(config or {})
    model = str(source.get("modelo_frete") or "taxa_fixa").strip().lower()
    allowed_models = {"taxa_fixa", "cidade_regiao", "distancia", "whatsapp", "faixas_cep"}
    if model not in allowed_models:
        model = "taxa_fixa"

    fallback = str(
        source.get("fallback_sem_local")
        or source.get("fallback_sem_faixa")
        or "distancia"
    ).strip().lower()
    if fallback not in {"distancia", "taxa_fixa", "whatsapp", "bloquear"}:
        fallback = "distancia"

    origin_cep = re.sub(r"\D", "", str(source.get("cep_origem") or ""))[:8]
    if origin_cep and len(origin_cep) != 8:
        origin_cep = ""

    normalized = {
        **source,
        "modelo_frete": model,
        "locais_entrega": normalize_shipping_locations(source.get("locais_entrega") or []),
        "faixas_cep": normalize_shipping_ranges(source.get("faixas_cep") or []),
        "fallback_sem_local": fallback,
        # Alias temporário para versões anteriores do template/backend.
        "fallback_sem_faixa": fallback,
        "cep_origem": origin_cep,
        "taxa_base_km": float(max(Decimal("0"), decimal_money(source.get("taxa_base_km", 0)))),
        "valor_por_km": float(max(Decimal("0"), decimal_money(source.get("valor_por_km", 0)))),
        "frete_minimo": float(max(Decimal("0"), decimal_money(source.get("frete_minimo", 0)))),
        "frete_maximo": float(max(Decimal("0"), decimal_money(source.get("frete_maximo", 0)))),
        "distancia_maxima_km": float(max(Decimal("0"), decimal_number(source.get("distancia_maxima_km", 0)))),
        "frete_gratis_limite_km": float(max(Decimal("0"), decimal_number(source.get("frete_gratis_limite_km", 0)))),
        "prazo_distancia_dias": _bounded_int(source.get("prazo_distancia_dias"), 0),
    }
    return normalized


def _free_shipping_applies(
    subtotal: Decimal,
    free_above: Decimal,
    distance_km: float | None,
    free_distance_limit: Decimal,
) -> bool:
    if free_above <= 0 or subtotal < free_above:
        return False
    if distance_km is None or free_distance_limit <= 0:
        return True
    return Decimal(str(distance_km)) <= free_distance_limit


def quote_shipping(
    *,
    config: dict[str, Any],
    subtotal: Any,
    destination_cep: Any,
    fixed_fee: Any = 0,
    origin_cep_fallback: Any = "",
    distance_resolver: Callable[[str, str], float] | None = None,
    address_resolver: Callable[[str], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Retorna uma cotação confiável para exibição e criação do pedido."""
    normalized_config = normalize_shipping_config(config)
    cep = normalize_cep(destination_cep)
    subtotal_money = decimal_money(subtotal)
    global_minimum = decimal_money(normalized_config.get("pedido_minimo_entrega", 0))
    free_above = decimal_money(normalized_config.get("frete_gratis_acima", 0))
    fixed = max(Decimal("0"), decimal_money(fixed_fee))

    def base_result() -> dict[str, Any]:
        return {
            "cep": format_cep(cep),
            "distancia_km": None,
            "faixa_nome": "",  # alias usado por pedidos e versões antigas do menu
            "local_nome": "",
            "cidade": "",
            "uf": "",
            "bairro": "",
            "frete_gratis": False,
            "motor_frete": SHIPPING_ENGINE_VERSION,
        }

    def unavailable(code: str, message: str, whatsapp: bool = False) -> dict[str, Any]:
        return {
            **base_result(),
            "disponivel": False,
            "codigo": code,
            "mensagem": message,
            "necessita_whatsapp": whatsapp,
            "valor": 0.0,
            "prazo": "",
            "metodo": "indisponivel",
        }

    def fixed_quote(method: str, message: str) -> dict[str, Any]:
        fee = fixed
        free = _free_shipping_applies(subtotal_money, free_above, None, Decimal("0"))
        if free:
            fee = Decimal("0")
        return {
            **base_result(),
            "disponivel": True,
            "codigo": "ok",
            "mensagem": message,
            "necessita_whatsapp": False,
            "valor": float(fee),
            "prazo": "",
            "metodo": method,
            "frete_gratis": free,
        }

    def distance_quote(message: str) -> dict[str, Any]:
        origin_raw = normalized_config.get("cep_origem") or origin_cep_fallback
        try:
            origin = normalize_cep(origin_raw)
        except ShippingQuoteError:
            return unavailable(
                "origem_nao_configurada",
                "A loja ainda não configurou o CEP de origem para calcular por distância.",
                whatsapp=True,
            )

        resolver = distance_resolver or route_distance_km
        try:
            distance_km = round(float(resolver(origin, cep)), 2)
        except ShippingProviderError as exc:
            return unavailable("consulta_indisponivel", str(exc), whatsapp=True)
        except Exception:
            return unavailable(
                "consulta_indisponivel",
                "Não foi possível calcular a distância agora. Consulte a loja pelo WhatsApp.",
                whatsapp=True,
            )

        maximum_distance = decimal_number(normalized_config.get("distancia_maxima_km", 0))
        if maximum_distance > 0 and Decimal(str(distance_km)) > maximum_distance:
            return unavailable(
                "distancia_excedida",
                f"O endereço está a {distance_km:.1f} km e supera o limite de entrega da loja.",
                whatsapp=True,
            )

        base_fee = decimal_money(normalized_config.get("taxa_base_km", 0))
        price_per_km = decimal_money(normalized_config.get("valor_por_km", 0))
        fee = (base_fee + Decimal(str(distance_km)) * price_per_km).quantize(
            CENTAVOS, rounding=ROUND_HALF_UP
        )
        minimum_fee = decimal_money(normalized_config.get("frete_minimo", 0))
        maximum_fee = decimal_money(normalized_config.get("frete_maximo", 0))
        if minimum_fee > 0:
            fee = max(fee, minimum_fee)
        if maximum_fee > 0:
            fee = min(fee, maximum_fee)

        free_distance_limit = decimal_number(
            normalized_config.get("frete_gratis_limite_km", 0)
        )
        free = _free_shipping_applies(
            subtotal_money, free_above, distance_km, free_distance_limit
        )
        if free:
            fee = Decimal("0")

        days = _bounded_int(normalized_config.get("prazo_distancia_dias"), 0)
        deadline = "até 1 dia útil" if days == 1 else (f"até {days} dias úteis" if days > 1 else "")
        return {
            **base_result(),
            "disponivel": True,
            "codigo": "ok",
            "mensagem": message,
            "necessita_whatsapp": False,
            "valor": float(fee),
            "prazo": deadline,
            "metodo": "distancia",
            "distancia_km": distance_km,
            "frete_gratis": free,
        }

    if not _bool(normalized_config.get("entrega_ativa"), True):
        return unavailable("entrega_desativada", "A entrega está indisponível no momento.")
    if global_minimum > 0 and subtotal_money < global_minimum:
        missing = (global_minimum - subtotal_money).quantize(CENTAVOS)
        return unavailable(
            "pedido_minimo",
            f"Faltam R$ {missing:.2f} para atingir o pedido mínimo de entrega.",
        )

    model = normalized_config["modelo_frete"]
    if model == "taxa_fixa":
        return fixed_quote("taxa_fixa", "Frete calculado com a taxa fixa da loja.")
    if model == "whatsapp":
        return unavailable(
            "consultar_whatsapp",
            "O valor do frete é combinado diretamente com a loja pelo WhatsApp.",
            whatsapp=True,
        )
    if model == "distancia":
        return distance_quote("Frete calculado pela distância aproximada da rota.")

    # Novo modo simples para o lojista: o CEP identifica cidade/UF/bairro.
    if model == "cidade_regiao":
        resolver = address_resolver or lookup_cep_address
        try:
            address = resolver(cep)
        except ShippingProviderError as exc:
            return unavailable("consulta_cep_indisponivel", str(exc), whatsapp=True)
        except Exception:
            return unavailable(
                "consulta_cep_indisponivel",
                "Não foi possível identificar a cidade deste CEP agora.",
                whatsapp=True,
            )

        matched = find_shipping_location(normalized_config["locais_entrega"], address)
        if matched:
            local_minimum = decimal_money(matched.get("pedido_minimo", 0))
            if local_minimum > 0 and subtotal_money < local_minimum:
                missing = (local_minimum - subtotal_money).quantize(CENTAVOS)
                return unavailable(
                    "pedido_minimo_local",
                    f"Faltam R$ {missing:.2f} para entrega em {matched['nome']}.",
                )
            fee = decimal_money(matched.get("valor", 0))
            free = _free_shipping_applies(subtotal_money, free_above, None, Decimal("0"))
            if free:
                fee = Decimal("0")
            name = str(matched.get("nome") or "")
            return {
                **base_result(),
                "disponivel": True,
                "codigo": "ok",
                "mensagem": f"CEP identificado em {name}.",
                "necessita_whatsapp": False,
                "valor": float(fee),
                "prazo": str(matched.get("prazo") or ""),
                "metodo": "cidade_regiao",
                "faixa_nome": name,
                "local_nome": name,
                "cidade": str(address.get("cidade") or address.get("city") or ""),
                "uf": str(address.get("uf") or address.get("state") or ""),
                "bairro": str(address.get("bairro") or address.get("neighborhood") or ""),
                "frete_gratis": free,
            }
        fallback = normalized_config["fallback_sem_local"]
    else:
        # Compatibilidade: faixas de CEP salvas na versão anterior.
        matched = find_shipping_range(normalized_config["faixas_cep"], cep)
        if matched:
            range_minimum = decimal_money(matched.get("pedido_minimo", 0))
            if range_minimum > 0 and subtotal_money < range_minimum:
                missing = (range_minimum - subtotal_money).quantize(CENTAVOS)
                return unavailable(
                    "pedido_minimo_faixa",
                    f"Faltam R$ {missing:.2f} para entrega na região {matched['nome']}.",
                )
            fee = decimal_money(matched.get("valor", 0))
            free = _free_shipping_applies(subtotal_money, free_above, None, Decimal("0"))
            if free:
                fee = Decimal("0")
            name = str(matched.get("nome") or "")
            return {
                **base_result(),
                "disponivel": True,
                "codigo": "ok",
                "mensagem": f"CEP atendido pela faixa {name}.",
                "necessita_whatsapp": False,
                "valor": float(fee),
                "prazo": str(matched.get("prazo") or ""),
                "metodo": "faixa_cep",
                "faixa_nome": name,
                "local_nome": name,
                "frete_gratis": free,
            }
        fallback = normalized_config["fallback_sem_local"]

    if fallback == "taxa_fixa":
        return fixed_quote(
            "taxa_fixa_fallback",
            "Local não cadastrado; aplicada a taxa fixa alternativa.",
        )
    if fallback == "whatsapp":
        return unavailable(
            "consultar_whatsapp",
            "Ainda não há uma taxa automática para este local. Consulte a loja pelo WhatsApp.",
            whatsapp=True,
        )
    if fallback == "bloquear":
        return unavailable("local_nao_atendido", "A loja ainda não atende este local.")
    return distance_quote(
        "Local não cadastrado; frete calculado pela distância aproximada da rota."
    )
