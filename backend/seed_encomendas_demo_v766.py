from __future__ import annotations

import base64
import hashlib
import secrets
from datetime import timedelta

from backend.database import SessionLocal, engine
from backend.models import (
    Base,
    Empresa,
    UsuarioAdmin,
    CategoriaEncomenda,
    ItemEncomenda,
    OpcaoEncomenda,
    Encomenda,
    EncomendaItem,
)
from backend.timezone_utils import agora_brasilia, hoje_brasilia

DEMO_SLUG = "maison-dolce-encomendas"
DEMO_EMAIL = "encomendas.demo@menufacile.local"
DEMO_PASSWORD = "MenuFacile#766"


def gerar_hash_senha(senha: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", senha.encode("utf-8"), salt, 200_000)
    return base64.urlsafe_b64encode(salt).decode() + "$" + base64.urlsafe_b64encode(digest).decode()


def add_item(db, empresa_id, categoria_id, nome, descricao, foto, forma, antecedencia, destaque, opcoes, recheios="", sabores=""):
    item = ItemEncomenda(
        empresa_id=empresa_id,
        categoria_id=categoria_id,
        nome=nome,
        descricao=descricao,
        foto_url=foto,
        forma_venda=forma,
        antecedencia_horas=antecedencia,
        permite_retirada=True,
        permite_entrega=True,
        aceita_personalizacao=True,
        destaque=destaque,
        recheios_json="|".join([x.strip() for x in recheios.split(",") if x.strip()]),
        sabores_json="|".join([x.strip() for x in sabores.split(",") if x.strip()]),
        ativo=True,
    )
    db.add(item)
    db.flush()
    for ordem, (rotulo, preco) in enumerate(opcoes, start=1):
        db.add(OpcaoEncomenda(
            empresa_id=empresa_id,
            item_encomenda_id=item.id,
            nome=rotulo,
            preco=preco,
            ordem=ordem,
            ativo=True,
        ))
    return item


def add_order(db, empresa_id, numero, cliente, telefone, dias, horario, status, tipo, total, sinal, itens, obs=""):
    encomenda = Encomenda(
        empresa_id=empresa_id,
        numero=numero,
        cliente_nome=cliente,
        telefone=telefone,
        tipo_recebimento=tipo,
        data_retirada=hoje_brasilia() + timedelta(days=dias),
        horario=horario,
        observacao=obs,
        status=status,
        total=total,
        sinal_valor=sinal,
        saldo_valor=max(0, total - sinal),
        pagamento_status="sinal" if sinal and sinal < total else ("pago" if sinal >= total else "pendente"),
        criado_em=agora_brasilia() - timedelta(minutes=max(2, int(numero[-2:]) % 25)),
    )
    db.add(encomenda)
    db.flush()
    for nome, opcao, subtotal in itens:
        db.add(EncomendaItem(
            empresa_id=empresa_id,
            encomenda_id=encomenda.id,
            nome_item=nome,
            opcao_nome=opcao,
            quantidade=1,
            preco_unitario=subtotal,
            subtotal=subtotal,
        ))


def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        empresa = db.query(Empresa).filter(Empresa.slug == DEMO_SLUG).first()
        if not empresa:
            empresa = Empresa(
                nome="Maison Dolce Encomendas",
                slug=DEMO_SLUG,
                tipo="encomendas",
                telefone_whatsapp="+39 333 555 0766",
                email="contato@maisondolce.demo",
                cidade="Torino",
                pais="Italia",
                descricao="Bolos, salgados, doces e coleções artesanais sob encomenda.",
                aceita_pedidos_online=True,
                aceita_agendamentos=False,
                onboarding_concluido=True,
                onboarding_estado="concluido",
                plano_nome="Plano Completo",
                plano_status="ativo",
                plano_valor_mensal=25.99,
                assinatura_inicio=agora_brasilia(),
                assinatura_vencimento=agora_brasilia() + timedelta(days=30),
                ativo=True,
            )
            db.add(empresa)
            db.flush()

        admin = db.query(UsuarioAdmin).filter(UsuarioAdmin.empresa_id == empresa.id).first()
        if not admin:
            email_em_uso = db.query(UsuarioAdmin).filter(UsuarioAdmin.email == DEMO_EMAIL).first()
            if not email_em_uso:
                db.add(UsuarioAdmin(
                    empresa_id=empresa.id,
                    nome="Demo Encomendas",
                    email=DEMO_EMAIL,
                    senha_hash=gerar_hash_senha(DEMO_PASSWORD),
                    perfil="administrador",
                    permissoes="",
                    ativo=True,
                ))

        if db.query(CategoriaEncomenda).filter(CategoriaEncomenda.empresa_id == empresa.id).count() == 0:
            categorias = []
            for ordem, (nome, descricao) in enumerate([
                ("Bolos e tortas", "Bolos, tortas e sobremesas para celebrações."),
                ("Salgados e festas", "Bandejas, cento de salgados e kits para eventos."),
                ("Doces e presentes", "Trufas, brigadeiros, caixas e lembranças."),
                ("Sazonais", "Panetones e coleções especiais de época."),
            ], start=1):
                categoria = CategoriaEncomenda(empresa_id=empresa.id, nome=nome, descricao=descricao, ordem=ordem, ativo=True)
                db.add(categoria); db.flush(); categorias.append(categoria)

            bolos, salgados, doces, sazonais = categorias
            add_item(db, empresa.id, bolos.id, "Torta al Pistacchio", "Creme de pistache, massa delicada e acabamento artesanal.", "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=88", "peso", 48, True, [("1 kg",38),("1,5 kg",48),("2 kg",58)], "Pistache, Chocolate branco, Frutas vermelhas")
            add_item(db, empresa.id, bolos.id, "Bolo Chocolate Premium", "Chocolate intenso, recheio cremoso e finalização elegante.", "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=1200&q=88", "peso", 48, True, [("1 kg",36),("2 kg",64),("3 kg",89)], "Brigadeiro, Ganache, Ninho")
            add_item(db, empresa.id, bolos.id, "Red Velvet Celebração", "Massa red velvet, creme suave e decoração para ocasiões especiais.", "https://images.unsplash.com/photo-1586788680434-30d324b2d46f?auto=format&fit=crop&w=1200&q=88", "tamanho", 72, False, [("Pequeno · 10 pessoas",42),("Médio · 18 pessoas",68),("Grande · 30 pessoas",96)], "Cream cheese, Baunilha")

            add_item(db, empresa.id, salgados.id, "Coxinhas Artesanais", "Coxinhas douradas com recheio cremoso de frango.", "https://images.unsplash.com/photo-1625938145744-e380515399bf?auto=format&fit=crop&w=1200&q=88", "quantidade", 24, True, [("25 unidades",18),("50 unidades",32),("100 unidades",58)], sabores="Frango clássico, Frango com catupiry")
            add_item(db, empresa.id, salgados.id, "Kit Festa Salgado", "Seleção variada pronta para aniversários, reuniões e eventos.", "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=88", "kit", 48, False, [("Kit 50 peças",34),("Kit 100 peças",62),("Kit 150 peças",88)], sabores="Coxinha, Bolinha de queijo, Kibe, Risole")
            add_item(db, empresa.id, salgados.id, "Mini Quiches", "Mini quiches delicadas em sabores variados para eventos.", "https://images.unsplash.com/photo-1572449043416-55f4685c9bb7?auto=format&fit=crop&w=1200&q=88", "quantidade", 24, False, [("20 unidades",24),("40 unidades",44),("80 unidades",82)], sabores="Queijo, Alho-poró, Espinafre")

            add_item(db, empresa.id, doces.id, "Trufas Gourmet", "Trufas artesanais com acabamento fino para presentear ou servir.", "https://images.unsplash.com/photo-1548907040-4d42eba3866d?auto=format&fit=crop&w=1200&q=88", "kit", 24, True, [("Caixa 6",16),("Caixa 12",29),("Caixa 24",54)], sabores="Pistache, Avelã, Chocolate 70%, Caramelo")
            add_item(db, empresa.id, doces.id, "Caixa de Brigadeiros", "Brigadeiros gourmet em caixa para presente ou celebração.", "https://images.unsplash.com/photo-1571115177098-24ec42ed204d?auto=format&fit=crop&w=1200&q=88", "quantidade", 24, False, [("12 unidades",18),("24 unidades",34),("50 unidades",66)], sabores="Tradicional, Pistache, Ninho, Doce de leite")
            add_item(db, empresa.id, doces.id, "Box Café da Manhã", "Pães, doces, frutas e bebidas em uma apresentação especial.", "https://images.unsplash.com/photo-1533777324565-a040eb52facd?auto=format&fit=crop&w=1200&q=88", "kit", 48, False, [("Box P",29),("Box M",44),("Box G",62)])

            add_item(db, empresa.id, sazonais.id, "Panettone Pistacchio", "Panettone artesanal recheado com creme de pistache.", "https://images.unsplash.com/photo-1519915028121-7d3463d20b13?auto=format&fit=crop&w=1200&q=88", "peso", 72, True, [("500 g",24),("1 kg",42)], sabores="Pistache")
            add_item(db, empresa.id, sazonais.id, "Panettone Chocolate", "Massa macia com chocolate e cobertura artesanal.", "https://images.unsplash.com/photo-1608835291093-394b0c943a75?auto=format&fit=crop&w=1200&q=88", "peso", 72, False, [("500 g",22),("1 kg",39)], sabores="Chocolate ao leite, Chocolate 70%")
            add_item(db, empresa.id, sazonais.id, "Coleção Mini Doces", "Seleção de mini doces para mesas, presentes e eventos.", "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=1200&q=88", "quantidade", 48, False, [("25 unidades",32),("50 unidades",58),("100 unidades",108)], sabores="Variado")

        if db.query(Encomenda).filter(Encomenda.empresa_id == empresa.id).count() == 0:
            add_order(db, empresa.id, "0248", "Mariana Rossi", "+39 333 214 8890", 1, "10:30", "nova", "retirada", 58, 20, [("Torta al Pistacchio","2 kg",58)], "Escrita: Buon Compleanno Giulia · retirar bem gelada.")
            add_order(db, empresa.id, "0249", "Luca Bianchi", "+39 347 552 1083", 1, "12:00", "nova", "entrega", 90, 30, [("Coxinhas Artesanais","100 unidades",58),("Caixa de Brigadeiros","24 unidades",32)], "Entregar na recepção. Evento começa às 13:00.")
            add_order(db, empresa.id, "0250", "Giulia Ferrero", "+39 328 112 9044", 2, "16:00", "nova", "retirada", 68, 68, [("Red Velvet Celebração","Médio · 18 pessoas",68)], "Nome: Sofia · 8 anos.")
            add_order(db, empresa.id, "0251", "Paolo Conti", "+39 340 906 1731", 2, "18:30", "nova", "retirada", 54, 0, [("Trufas Gourmet","Caixa 24",54)], "Embalagem para presente.")
            add_order(db, empresa.id, "0242", "Elena Romano", "+39 333 700 1182", 0, "15:30", "producao", "retirada", 64, 64, [("Bolo Chocolate Premium","2 kg",64)], "Finalizar decoração antes da retirada.")
            add_order(db, empresa.id, "0243", "Marco Gallo", "+39 349 631 7710", 0, "17:00", "confirmada", "entrega", 108, 54, [("Coleção Mini Doces","100 unidades",108)], "Separar para o motorista às 16:20.")
            add_order(db, empresa.id, "0244", "Anna Moretti", "+39 320 418 6509", 0, "18:15", "pronta", "retirada", 44, 44, [("Box Café da Manhã","Box M",44)], "Pronta para retirada.")

        db.commit()
        print(f"DEMO_EMPRESA_ID={empresa.id}")
        print(f"DEMO_SLUG={DEMO_SLUG}")
        print(f"DEMO_EMAIL={DEMO_EMAIL}")
        print(f"DEMO_PASSWORD={DEMO_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
