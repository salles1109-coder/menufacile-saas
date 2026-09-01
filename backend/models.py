from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Date, Text
from sqlalchemy.orm import declarative_base
from datetime import datetime
from backend.timezone_utils import agora_brasilia

Base = declarative_base()


# ==================================================
# EMPRESA
# ==================================================

class Empresa(Base):
    __tablename__ = "empresas"

    id = Column(Integer, primary_key=True, index=True)

    nome = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    tipo = Column(String, nullable=False)

    telefone_whatsapp = Column(String, nullable=True)
    telefone_fixo = Column(String, nullable=True)
    telefone_secundario = Column(String, nullable=True)

    email = Column(String, nullable=True)

    endereco = Column(String, nullable=True)
    cidade = Column(String, nullable=True)
    pais = Column(String, default="Brasil")

    descricao = Column(String, nullable=True)

    logo_url = Column(String, nullable=True)

    instagram = Column(String, nullable=True)
    facebook = Column(String, nullable=True)

    aceita_pedidos_online = Column(Boolean, default=True)
    aceita_agendamentos = Column(Boolean, default=False)
    onboarding_concluido = Column(Boolean, default=False)
    onboarding_estado = Column(String, nullable=True, default="pendente")

    # ==================================================
    # FISCAL ITALIANO
    # ==================================================

    ragione_sociale = Column(String, nullable=True)
    partita_iva = Column(String, nullable=True)
    codice_fiscale = Column(String, nullable=True)
    pec = Column(String, nullable=True)
    codice_destinatario = Column(String, nullable=True)

    usa_iva = Column(Boolean, default=False)
    regime_iva = Column(String, nullable=True)
    regime_fiscale = Column(String, nullable=True)
    aliquota_iva_padrao = Column(Float, default=0)

    # Fiscal brasileiro
    cnpj = Column(String, nullable=True)
    razao_social = Column(String, nullable=True)
    nome_fantasia = Column(String, nullable=True)
    inscricao_estadual = Column(String, nullable=True)
    inscricao_municipal = Column(String, nullable=True)
    regime_tributario = Column(String, nullable=True)
    cnae_principal = Column(String, nullable=True)
    situacao_cadastral = Column(String, nullable=True)
    cep_fiscal = Column(String, nullable=True)
    logradouro_fiscal = Column(String, nullable=True)
    numero_fiscal = Column(String, nullable=True)
    complemento_fiscal = Column(String, nullable=True)
    bairro_fiscal = Column(String, nullable=True)
    municipio_fiscal = Column(String, nullable=True)
    uf_fiscal = Column(String, nullable=True)
    email_fiscal = Column(String, nullable=True)

    # Tempos operacionais exibidos no menu público
    tempo_retirada_minutos = Column(Integer, default=30)
    tempo_entrega_minutos = Column(Integer, default=50)
    taxa_entrega_padrao = Column(Float, default=0)

    # Entrega e políticas — configuração flexível por empresa
    entrega_config_json = Column(Text, nullable=True)
    politicas_loja_json = Column(Text, nullable=True)

    # ==================================================
    # PAGAMENTOS ONLINE — configuração por empresa
    # ==================================================
    pagamentos_online_ativo = Column(Boolean, default=False)
    gateway_pagamento = Column(String, default="mercadopago")
    gateway_ambiente = Column(String, default="sandbox")  # sandbox, producao
    mercadopago_public_key = Column(String, nullable=True)
    mercadopago_access_token = Column(String, nullable=True)
    mercadopago_webhook_secret = Column(String, nullable=True)
    aceita_pix_online = Column(Boolean, default=True)
    aceita_cartao_online = Column(Boolean, default=True)
    # Pix manual para pedidos de Produtos e Comida. É separado do sinal de reservas/agendamentos.
    aceita_pix_chave = Column(Boolean, default=False)
    pix_manual_tipo = Column(String, default="cnpj")
    pix_manual_chave = Column(String, nullable=True)
    pix_manual_titular = Column(String, nullable=True)
    aceita_dinheiro = Column(Boolean, default=True)
    aceita_cartao_entrega = Column(Boolean, default=True)
    # Encomendas: formas presenciais podem ser diferentes na retirada e na entrega.
    # Valores: nenhum, dinheiro, cartao, ambos.
    pagamento_retirada_modo = Column(String, default="ambos")
    pagamento_entrega_modo = Column(String, default="ambos")
    pedido_so_apos_pagamento = Column(Boolean, default=True)

    # Sinal manual por Pix para reservas e agendamentos
    sinal_reserva_ativo = Column(Boolean, default=False)
    sinal_aplicar_agendamentos = Column(Boolean, default=True)
    sinal_aplicar_reservas = Column(Boolean, default=True)
    sinal_tipo = Column(String, default="percentual")  # percentual, fixo, por_pessoa, integral
    sinal_valor = Column(Float, default=50)
    sinal_pix_tipo = Column(String, default="cnpj")
    sinal_pix_chave = Column(String, nullable=True)
    sinal_pix_titular = Column(String, nullable=True)
    sinal_whatsapp = Column(String, nullable=True)
    sinal_prazo_minutos = Column(Integer, default=30)
    sinal_politica = Column(Text, nullable=True)

    # ==================================================
    # IMPRESSÃO UNIVERSAL — Navegador / QZ / IP / USB / Bluetooth / Serial
    # ==================================================
    impressao_modo = Column(String, default="navegador")  # navegador, qz, ip_qz, serial_qz, app_local
    impressao_conexao = Column(String, default="navegador")  # navegador, usb, bluetooth, wifi, ethernet, serial
    impressao_largura = Column(String, default="80")  # 58, 80, a4
    impressora_nome = Column(String, nullable=True)
    impressora_ip = Column(String, nullable=True)
    impressora_porta = Column(Integer, default=9100)
    impressora_porta_serial = Column(String, nullable=True)
    impressora_baud_rate = Column(Integer, default=9600)
    impressora_modelo = Column(String, nullable=True)
    qz_ativo = Column(Boolean, default=False)
    impressao_automatica = Column(Boolean, default=False)
    imprimir_comanda = Column(Boolean, default=True)
    imprimir_recibo = Column(Boolean, default=True)
    imprimir_entregador = Column(Boolean, default=False)

    # ==================================================
    # PLANO ÚNICO DO SAAS
    # ==================================================

    plano_nome = Column(String, default="Plano Completo")
    plano_status = Column(String, default="ativo")  # ativo, teste, vencido, cancelado
    plano_valor_mensal = Column(Float, default=0)
    assinatura_inicio = Column(DateTime, nullable=True)
    assinatura_vencimento = Column(DateTime, nullable=True)
    plano_motivo_bloqueio = Column(String, nullable=True)

    ativo = Column(Boolean, default=True)

    capacidade_maxima = Column(Integer, default=0)

    criado_em = Column(
        DateTime,
        default=agora_brasilia
    )


# ==================================================
# CATEGORIA
# ==================================================

class Categoria(Base):
    __tablename__ = "categorias"

    id = Column(Integer, primary_key=True, index=True)

    empresa_id = Column(Integer, nullable=False)

    nome = Column(String, nullable=False)

    # v27: traduções opcionais da categoria.
    # Se estiver vazio, o menu público usa o nome principal como fallback.
    nome_pt = Column(String, nullable=True)
    nome_it = Column(String, nullable=True)
    nome_en = Column(String, nullable=True)

    descricao = Column(String, nullable=True)
    descricao_pt = Column(String, nullable=True)
    descricao_it = Column(String, nullable=True)
    descricao_en = Column(String, nullable=True)

    imagem_url = Column(String, nullable=True)

    ordem = Column(Integer, default=0)

    ativo = Column(Boolean, default=True)

    criado_em = Column(
        DateTime,
        default=agora_brasilia
    )


# ==================================================
# ITEM
# ==================================================

class Item(Base):
    __tablename__ = "itens"

    id = Column(Integer, primary_key=True, index=True)

    empresa_id = Column(Integer, nullable=False)

    categoria_id = Column(Integer, nullable=True)

    nome = Column(String, nullable=False)

    # v27: traduções opcionais do item/serviço.
    # Se estiver vazio, o menu público usa o nome/descrição principal como fallback.
    nome_pt = Column(String, nullable=True)
    nome_it = Column(String, nullable=True)
    nome_en = Column(String, nullable=True)

    descricao = Column(String, nullable=True)
    descricao_pt = Column(String, nullable=True)
    descricao_it = Column(String, nullable=True)
    descricao_en = Column(String, nullable=True)

    preco = Column(Float, nullable=False)

    # O preço continua sendo o valor final exibido ao cliente.
    # Quando a empresa usa IVA, o sistema calcula internamente a base líquida.
    aplica_iva = Column(Boolean, default=True)
    aliquota_iva = Column(Float, nullable=True)

    tipo = Column(String, default="produto")

    foto_url = Column(String, nullable=True)
    # Galeria pública com até 5 imagens em JSON textual.
    fotos_json = Column(Text, nullable=True)

    duracao_minutos = Column(Integer, nullable=True)

    estoque = Column(Integer, nullable=True)

    # Metadados genéricos para lojas. Guardados como JSON textual para manter
    # compatibilidade com SQLite e com os demais tipos de negócio.
    atributos_json = Column(String, nullable=True)
    opcoes_json = Column(String, nullable=True)

    disponivel = Column(Boolean, default=True)

    criado_em = Column(
        DateTime,
        default=agora_brasilia
    )


# ==================================================
# ENCOMENDAS — CATÁLOGO PRÓPRIO (v766)
# ==================================================

class CategoriaEncomenda(Base):
    __tablename__ = "categorias_encomenda"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, nullable=False, index=True)
    nome = Column(String, nullable=False)
    descricao = Column(String, nullable=True)
    ordem = Column(Integer, default=0)
    ativo = Column(Boolean, default=True)
    criado_em = Column(DateTime, default=agora_brasilia)


class ItemEncomenda(Base):
    __tablename__ = "itens_encomenda"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, nullable=False, index=True)
    categoria_id = Column(Integer, nullable=True, index=True)
    nome = Column(String, nullable=False)
    descricao = Column(String, nullable=True)
    foto_url = Column(Text, nullable=True)
    forma_venda = Column(String, default="personalizado")
    antecedencia_horas = Column(Integer, default=48)
    permite_retirada = Column(Boolean, default=True)
    permite_entrega = Column(Boolean, default=True)
    sabores_json = Column(Text, nullable=True)
    recheios_json = Column(Text, nullable=True)
    aceita_personalizacao = Column(Boolean, default=True)
    destaque = Column(Boolean, default=False)
    ativo = Column(Boolean, default=True)
    criado_em = Column(DateTime, default=agora_brasilia)


class OpcaoEncomenda(Base):
    __tablename__ = "opcoes_encomenda"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, nullable=False, index=True)
    item_encomenda_id = Column(Integer, nullable=False, index=True)
    nome = Column(String, nullable=False)
    preco = Column(Float, nullable=False, default=0)
    ordem = Column(Integer, default=0)
    ativo = Column(Boolean, default=True)
    criado_em = Column(DateTime, default=agora_brasilia)


class Encomenda(Base):
    __tablename__ = "encomendas"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, nullable=False, index=True)
    numero = Column(String, nullable=True, index=True)
    cliente_nome = Column(String, nullable=False)
    telefone = Column(String, nullable=True)
    tipo_recebimento = Column(String, default="retirada")  # retirada | entrega
    data_retirada = Column(Date, nullable=False, index=True)
    horario = Column(String, nullable=False)
    endereco = Column(Text, nullable=True)
    observacao = Column(Text, nullable=True)
    status = Column(String, default="nova", nullable=False, index=True)
    total = Column(Float, default=0)
    sinal_valor = Column(Float, default=0)
    saldo_valor = Column(Float, default=0)
    pagamento_status = Column(String, default="pendente")
    forma_pagamento = Column(String, nullable=True)
    gateway_pagamento = Column(String, nullable=True)
    gateway_payment_id = Column(String, nullable=True, index=True)
    gateway_status = Column(String, nullable=True)
    gateway_status_detail = Column(String, nullable=True)
    public_token = Column(String, nullable=True, index=True)
    pago_em = Column(DateTime, nullable=True)
    saldo_forma_pagamento = Column(String, nullable=True)
    saldo_pago_valor = Column(Float, default=0)
    saldo_pago_em = Column(DateTime, nullable=True)
    saldo_pagamento_observacao = Column(Text, nullable=True)

    # V913 — auditoria do cancelamento público de encomendas.
    # O cancelamento operacional não significa estorno do sinal já recebido.
    cancelamento_origem = Column(String, nullable=True, index=True)
    cancelamento_em = Column(DateTime, nullable=True)
    reembolso_status = Column(String, nullable=True)

    criado_em = Column(DateTime, default=agora_brasilia, index=True)


class EncomendaItem(Base):
    __tablename__ = "encomendas_itens"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, nullable=False, index=True)
    encomenda_id = Column(Integer, nullable=False, index=True)
    item_encomenda_id = Column(Integer, nullable=True, index=True)
    nome_item = Column(String, nullable=False)
    opcao_nome = Column(String, nullable=True)
    quantidade = Column(Integer, default=1)
    preco_unitario = Column(Float, default=0)
    subtotal = Column(Float, default=0)
    detalhes_json = Column(Text, nullable=True)
    criado_em = Column(DateTime, default=agora_brasilia)


# ==================================================
# PEDIDO
# ==================================================

class Pedido(Base):
    __tablename__ = "pedidos"

    id = Column(Integer, primary_key=True, index=True)

    empresa_id = Column(Integer, nullable=False)

    # Número operacional reiniciado por dia e por empresa. Ex: Pedido #001, #002...
    numero_dia = Column(Integer, nullable=True, index=True)
    data_operacional = Column(Date, nullable=True, index=True)

    cliente_id = Column(Integer, nullable=True)

    nome_cliente = Column(String, nullable=False)

    telefone_cliente = Column(String, nullable=True)

    tipo_pedido = Column(String, nullable=False)

    # Origem operacional do pedido: comida, produto ou servico.
    # Mantém os fluxos administrativos isolados mesmo usando a mesma tabela.
    origem_menu = Column(String, nullable=True, index=True)

    horario = Column(String, nullable=True)

    pagamento = Column(String, nullable=True)

    # Pagamento online / Mercado Pago
    status_pagamento = Column(String, default="nao_iniciado", index=True)
    gateway_pagamento = Column(String, nullable=True)
    gateway_payment_id = Column(String, nullable=True, index=True)
    gateway_status = Column(String, nullable=True)
    gateway_status_detail = Column(String, nullable=True)
    pago_em = Column(DateTime, nullable=True)

    # Segurança do checkout: repetição de requisição e controle de estoque.
    chave_idempotencia = Column(String, nullable=True, index=True)
    estoque_reservado = Column(Boolean, default=False)
    estoque_devolvido = Column(Boolean, default=False)
    public_token = Column(String, nullable=True, index=True)

    precisa_troco = Column(Boolean, default=False)

    troco_para = Column(Float, nullable=True)

    endereco_entrega = Column(String, nullable=True)

    cap_entrega = Column(String, nullable=True)

    cidade_entrega = Column(String, nullable=True)

    provincia_entrega = Column(String, nullable=True)

    referencia_entrega = Column(String, nullable=True)

    # Fotografia do tempo estimado configurado no momento do pedido
    tempo_estimado_minutos = Column(Integer, nullable=True)

    # Taxa de entrega aplicada no momento do pedido.
    taxa_entrega = Column(Float, default=0)

    # Memória da cotação aplicada ao pedido de produto.
    frete_metodo = Column(String, nullable=True)
    frete_distancia_km = Column(Float, nullable=True)
    frete_faixa_nome = Column(String, nullable=True)
    frete_prazo = Column(String, nullable=True)

    # Total final exibido e cobrado do cliente.
    total = Column(Float, default=0)

    # Totais fiscais internos para dashboard, relatórios e documentos.
    subtotal_sem_iva = Column(Float, default=0)
    total_iva = Column(Float, default=0)

    status = Column(String, default="novo")

    # V923 — auditoria de cancelamento/reembolso de pedidos pagos.
    # Cancelar operacionalmente não significa estornar um pagamento já recebido.
    cancelamento_origem = Column(String, nullable=True, index=True)
    cancelamento_em = Column(DateTime, nullable=True)
    reembolso_status = Column(String, nullable=True, index=True)
    reembolso_valor = Column(Float, default=0)
    reembolso_em = Column(DateTime, nullable=True)

    observacao = Column(String, nullable=True)

    criado_em = Column(
        DateTime,
        default=agora_brasilia
    )


# ==================================================
# PEDIDO ITEM
# ==================================================

class PedidoItem(Base):
    __tablename__ = "pedido_itens"

    id = Column(Integer, primary_key=True, index=True)

    pedido_id = Column(Integer, nullable=False)

    item_id = Column(Integer, nullable=True)

    nome_item = Column(String, nullable=False)

    quantidade = Column(Integer, nullable=False)

    preco_unitario = Column(Float, nullable=False)

    # Subtotal final do item, incluindo IVA quando aplicável.
    subtotal = Column(Float, nullable=False)

    # Memória fiscal do item no momento do pedido.
    aplica_iva = Column(Boolean, default=False)
    aliquota_iva = Column(Float, default=0)
    preco_unitario_sem_iva = Column(Float, default=0)
    subtotal_sem_iva = Column(Float, default=0)
    valor_iva = Column(Float, default=0)

    criado_em = Column(
        DateTime,
        default=agora_brasilia
    )



# ==================================================
# PROFISSIONAL
# ==================================================

class Profissional(Base):
    __tablename__ = "profissionais"

    id = Column(Integer, primary_key=True, index=True)

    empresa_id = Column(Integer, nullable=False)

    nome = Column(String, nullable=False)

    telefone = Column(String, nullable=True)

    foto_url = Column(String, nullable=True)

    ativo = Column(Boolean, default=True)

    criado_em = Column(
        DateTime,
        default=agora_brasilia
    )

# ==================================================
# RESERVA
# ==================================================

class Reserva(Base):
    __tablename__ = "reservas"

    id = Column(Integer, primary_key=True, index=True)

    codigo = Column(String, unique=True, nullable=True)

    empresa_id = Column(Integer, nullable=False)

    # Número operacional reiniciado por dia e por empresa. Ex: Reserva #001, #002...
    numero_dia = Column(Integer, nullable=True, index=True)
    data_operacional = Column(Date, nullable=True, index=True)

    data = Column(String, nullable=False)

    horario = Column(String, nullable=False)

    profissional_id = Column(Integer, nullable=True)

    horario_id = Column(Integer, nullable=True)

    pessoas = Column(Integer, nullable=False)

    nome_cliente = Column(String, nullable=False)

    telefone_cliente = Column(String, nullable=True)

    # Documento usado na consulta segura de “Meus agendamentos”.
    # O valor é salvo somente com números.
    cpf_cliente = Column(String, nullable=True, index=True)

    observacao = Column(String, nullable=True)

    status = Column(
        String,
        default="pendente"
    )

    # Pagamento online da reserva/agendamento
    status_pagamento = Column(String, default="nao_iniciado", index=True)
    valor_total = Column(Float, default=0)
    valor_sinal = Column(Float, default=0)
    sinal_percentual = Column(Float, default=0)
    sinal_tipo = Column(String, nullable=True)
    gateway_pagamento = Column(String, nullable=True)
    gateway_payment_id = Column(String, nullable=True, index=True)
    gateway_status = Column(String, nullable=True)
    gateway_status_detail = Column(String, nullable=True)
    pago_em = Column(DateTime, nullable=True)
    forma_pagamento = Column(String, nullable=True)

    # V276 — controle financeiro manual separado do status do atendimento.
    # valor_sinal continua representando o sinal configurado no checkout;
    # valor_recebido guarda o total efetivamente registrado pela empresa.
    valor_recebido = Column(Float, default=0)
    valor_sinal_recebido = Column(Float, default=0)
    pagamento_tipo = Column(String, nullable=True)
    pagamento_observacao = Column(Text, nullable=True)
    pagamento_registrado_em = Column(DateTime, nullable=True)

    public_token = Column(String, nullable=True, index=True)

    # Marca que o responsável confirmou manualmente a liberação do horário.
    # O histórico e o status original da reserva continuam preservados.
    horario_liberado = Column(Boolean, default=False, nullable=False)

    # V912 — auditoria do cancelamento público sem misturar cancelamento com estorno.
    cancelamento_origem = Column(String, nullable=True, index=True)
    cancelamento_em = Column(DateTime, nullable=True)
    reembolso_status = Column(String, nullable=True)

    criado_em = Column(
        DateTime,
        default=agora_brasilia
    )

# ==================================================
# HORÁRIOS DE RESERVA
# ==================================================

class HorarioReserva(Base):
    __tablename__ = "horarios_reserva"

    id = Column(Integer, primary_key=True, index=True)

    empresa_id = Column(Integer, nullable=False)

    data = Column(String, nullable=False)

    horario = Column(String, nullable=False)

    profissional_id = Column(Integer, nullable=True)

    ativo = Column(Boolean, default=True)

    capacidade_maxima = Column(Integer, default=0)

    criado_em = Column(
        DateTime,
        default=agora_brasilia
    )
    # ==================================================
# DIAS FECHADOS
# ==================================================

class DiaFechado(Base):
    __tablename__ = "dias_fechados"

    id = Column(Integer, primary_key=True, index=True)

    empresa_id = Column(Integer, nullable=False)

    data = Column(String, nullable=False)

    motivo = Column(String, nullable=True)

    criado_em = Column(
        DateTime,
        default=agora_brasilia
    )

# ==================================================
# FECHAMENTO DE CAIXA DIÁRIO
# ==================================================

class FechamentoCaixa(Base):
    __tablename__ = "fechamentos_caixa"

    id = Column(Integer, primary_key=True, index=True)

    empresa_id = Column(Integer, nullable=False)

    # Mantemos como string YYYY-MM-DD para acompanhar a forma simples
    # já usada no sistema de reservas e dias fechados.
    data = Column(String, nullable=False)

    total_bruto = Column(Float, default=0)
    base_sem_iva = Column(Float, default=0)
    total_iva = Column(Float, default=0)

    total_cartao = Column(Float, default=0)
    total_dinheiro = Column(Float, default=0)

    pedidos_finalizados = Column(Integer, default=0)
    pedidos_cancelados = Column(Integer, default=0)

    ticket_medio = Column(Float, default=0)

    observacao = Column(String, nullable=True)

    fechado_em = Column(
        DateTime,
        default=agora_brasilia
    )

# ==================================================
# USUÁRIO ADMINISTRATIVO
# ==================================================

class UsuarioAdmin(Base):
    __tablename__ = "usuarios_admin"

    id = Column(Integer, primary_key=True, index=True)

    empresa_id = Column(Integer, nullable=False)

    nome = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    senha_hash = Column(String, nullable=False)

    # Perfil do acesso no painel.
    # Por enquanto todos entram pelo mesmo /login; o perfil prepara
    # a próxima etapa de permissões sem criar outra tela de entrada.
    perfil = Column(String, default="administrador")

    # Permissões liberadas no painel, separadas por vírgula.
    # Administrador ignora este campo e continua com acesso completo.
    permissoes = Column(String, default="")

    ativo = Column(Boolean, default=True)

    criado_em = Column(
        DateTime,
        default=agora_brasilia
    )


# ==================================================
# ASSINATURAS WEB PUSH — PWA MENUFACILE GESTOR
# ==================================================

class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, nullable=False, index=True)
    usuario_admin_id = Column(Integer, nullable=False, index=True)

    # O endpoint completo é longo. O hash curto e único é usado para localizar
    # e reassociar com segurança a mesma assinatura em outro login/aparelho.
    endpoint_hash = Column(String(64), unique=True, nullable=False, index=True)
    endpoint = Column(Text, nullable=False)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    user_agent = Column(String(500), nullable=True)

    ativo = Column(Boolean, default=True, nullable=False)
    falhas_consecutivas = Column(Integer, default=0, nullable=False)
    ultimo_erro = Column(Text, nullable=True)
    ultimo_sucesso_em = Column(DateTime, nullable=True)

    criado_em = Column(DateTime, default=agora_brasilia)
    atualizado_em = Column(DateTime, default=agora_brasilia)

# ==================================================
# FILA PERSISTENTE WEB PUSH — PWA MENUFACILE GESTOR v717
# ==================================================

class PushDelivery(Base):
    __tablename__ = "push_deliveries"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, nullable=False, index=True)
    usuario_admin_id = Column(Integer, nullable=False, index=True)
    subscription_id = Column(Integer, nullable=False, index=True)

    # Uma mesma ocorrência gera no máximo uma entrega por aparelho.
    dedupe_key = Column(String(220), unique=True, nullable=False, index=True)
    event_type = Column(String(40), nullable=False, index=True)
    entity_id = Column(Integer, nullable=True, index=True)
    payload_json = Column(Text, nullable=False)

    status = Column(String(30), default="pendente", nullable=False, index=True)
    tentativas = Column(Integer, default=0, nullable=False)
    proxima_tentativa_em = Column(DateTime, default=agora_brasilia, nullable=False, index=True)
    ultimo_erro = Column(Text, nullable=True)

    criado_em = Column(DateTime, default=agora_brasilia, nullable=False)
    atualizado_em = Column(DateTime, default=agora_brasilia, nullable=False)
    enviado_em = Column(DateTime, nullable=True)
    expira_em = Column(DateTime, nullable=False, index=True)

