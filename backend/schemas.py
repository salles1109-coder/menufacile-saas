from pydantic import BaseModel
from typing import Optional, List


# ==================================================
# EMPRESA
# ==================================================

class EmpresaCreate(BaseModel):
    nome: str
    slug: str
    tipo: str

    telefone_whatsapp: Optional[str] = None

    email: Optional[str] = None

    endereco: Optional[str] = None
    cidade: Optional[str] = None
    pais: Optional[str] = "Brasil"

    descricao: Optional[str] = None

    logo_url: Optional[str] = None

    instagram: Optional[str] = None
    facebook: Optional[str] = None

    aceita_pedidos_online: bool = True
    aceita_agendamentos: bool = False


class EmpresaFiscalUpdate(BaseModel):
    ragione_sociale: Optional[str] = None
    partita_iva: Optional[str] = None
    codice_fiscale: Optional[str] = None
    pec: Optional[str] = None
    codice_destinatario: Optional[str] = None

    usa_iva: bool = False
    regime_iva: Optional[str] = None
    regime_fiscale: Optional[str] = None
    aliquota_iva_padrao: Optional[float] = 0

    tempo_retirada_minutos: Optional[int] = 30
    tempo_entrega_minutos: Optional[int] = 50


# ==================================================
# CATEGORIA
# ==================================================

class CategoriaCreate(BaseModel):
    empresa_id: int

    nome: str

    nome_pt: Optional[str] = None
    nome_it: Optional[str] = None
    nome_en: Optional[str] = None

    descricao: Optional[str] = None
    descricao_pt: Optional[str] = None
    descricao_it: Optional[str] = None
    descricao_en: Optional[str] = None

    imagem_url: Optional[str] = None

    ordem: int = 0


# ==================================================
# ITEM
# ==================================================

class ItemCreate(BaseModel):
    empresa_id: int

    categoria_id: Optional[int] = None

    nome: str

    nome_pt: Optional[str] = None
    nome_it: Optional[str] = None
    nome_en: Optional[str] = None

    descricao: Optional[str] = None
    descricao_pt: Optional[str] = None
    descricao_it: Optional[str] = None
    descricao_en: Optional[str] = None

    preco: float

    # O preço permanece final para o cliente.
    # IVA é calculada internamente quando ativada na empresa.
    aplica_iva: bool = True
    aliquota_iva: Optional[float] = None

    tipo: str = "produto"

    foto_url: Optional[str] = None
    fotos_json: Optional[str] = None

    duracao_minutos: Optional[int] = None

    estoque: Optional[int] = None



# ==================================================
# PROFISSIONAL
# ==================================================

class ProfissionalCreate(BaseModel):
    empresa_id: int

    nome: str

    telefone: Optional[str] = None

    foto_url: Optional[str] = None

    ativo: bool = True


class ProfissionalUpdate(BaseModel):
    nome: Optional[str] = None

    telefone: Optional[str] = None

    foto_url: Optional[str] = None

    ativo: Optional[bool] = None


# ==================================================
# PEDIDO ITEM
# ==================================================

class PedidoOpcaoSelecionada(BaseModel):
    grupo_id: str
    opcao_id: str


class PedidoItemCreate(BaseModel):
    item_id: Optional[int] = None

    nome_item: str

    quantidade: int

    preco_unitario: float

    # V370: escolhas feitas no modal do item. O backend valida os IDs e
    # recalcula os adicionais usando somente a configuração oficial do banco.
    opcoes_selecionadas: Optional[List[PedidoOpcaoSelecionada]] = None
    observacao_item: Optional[str] = None


# ==================================================
# PEDIDO
# ==================================================

class PedidoCreate(BaseModel):
    empresa_id: int

    nome_cliente: str

    telefone_cliente: Optional[str] = None

    tipo_pedido: str

    horario: Optional[str] = None

    pagamento: Optional[str] = None

    precisa_troco: bool = False

    troco_para: Optional[float] = None

    endereco_entrega: Optional[str] = None

    cap_entrega: Optional[str] = None

    cidade_entrega: Optional[str] = None

    provincia_entrega: Optional[str] = None

    referencia_entrega: Optional[str] = None

    observacao: Optional[str] = None

    # Chave opcional enviada pelo checkout para impedir pedidos duplicados.
    chave_idempotencia: Optional[str] = None

    itens: List[PedidoItemCreate]


class PedidoStatusUpdate(BaseModel):
    status: str



# ==================================================
# TEMPOS DE PEDIDO
# ==================================================

class TempoPedidosUpdate(BaseModel):
    tempo_retirada_minutos: Optional[int] = None
    tempo_entrega_minutos: Optional[int] = None


# ==================================================
# RESERVAS
# ==================================================

class ReservaCreate(BaseModel):
    empresa_id: int

    data: str

    horario: str

    profissional_id: Optional[int] = None

    pessoas: int

    nome_cliente: str

    telefone_cliente: Optional[str] = None

    observacao: Optional[str] = None


class ReservaStatusUpdate(BaseModel):
    status: str


class ReservaEditarUpdate(BaseModel):
    data: str
    horario: str
    profissional_id: Optional[int] = None
    servico_id: Optional[int] = None


# ==================================================
# HORÁRIOS DE RESERVA
# ==================================================

class HorarioReservaCreate(BaseModel):
    empresa_id: int

    data: str

    horario: str

    profissional_id: Optional[int] = None

    capacidade_maxima: Optional[int] = None




class HorariosAgendaLote(BaseModel):
    empresa_id: int
    data: str
    profissional_id: Optional[int] = None
    nome_profissional: Optional[str] = None
    telefone_profissional: Optional[str] = None
    foto_profissional: Optional[str] = None
    horarios: List[str]
    capacidade_maxima: Optional[int] = 1


class HorarioReservaCapacidadeUpdate(BaseModel):
    capacidade_maxima: Optional[int] = None


class HorarioReservaStatusUpdate(BaseModel):
    ativo: bool

# ==================================================
# DIAS FECHADOS
# ==================================================

class DiaFechadoCreate(BaseModel):
    empresa_id: int

    data: str

    motivo: Optional[str] = None

# ==================================================
# FECHAMENTO DE CAIXA DIÁRIO
# ==================================================

class FechamentoCaixaCreate(BaseModel):
    data: str
    observacao: Optional[str] = None

# ==================================================
# IMPRESSÃO UNIVERSAL
# ==================================================

class ImpressaoConfigUpdate(BaseModel):
    impressao_modo: Optional[str] = "navegador"
    impressao_conexao: Optional[str] = "navegador"
    impressao_largura: Optional[str] = "80"
    impressora_nome: Optional[str] = None
    impressora_ip: Optional[str] = None
    impressora_porta: Optional[int] = 9100
    impressora_porta_serial: Optional[str] = None
    impressora_baud_rate: Optional[int] = 9600
    impressora_modelo: Optional[str] = None
    qz_ativo: bool = False
    impressao_automatica: bool = False
    imprimir_comanda: bool = True
    imprimir_recibo: bool = True
    imprimir_entregador: bool = False

