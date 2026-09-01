from __future__ import annotations

from backend.database import SessionLocal
from backend.models import Empresa, CategoriaEncomenda, ItemEncomenda, OpcaoEncomenda

DEMO_SLUG = "maison-dolce-encomendas"


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


def main():
    db = SessionLocal()
    try:
        empresa = db.query(Empresa).filter(Empresa.slug == DEMO_SLUG).first()
        if not empresa:
            raise RuntimeError("Empresa demo de Encomendas não encontrada. Aplique a v766 primeiro.")

        empresa.descricao = "Padaria, confeitaria, salgados, bolos e doces preparados sob encomenda."

        # v767 atualiza SOMENTE o catálogo da empresa demo. As encomendas recebidas
        # e seus status permanecem intactos para não mexer na tela já aprovada.
        item_ids = [row[0] for row in db.query(ItemEncomenda.id).filter(ItemEncomenda.empresa_id == empresa.id).all()]
        if item_ids:
            db.query(OpcaoEncomenda).filter(OpcaoEncomenda.item_encomenda_id.in_(item_ids)).delete(synchronize_session=False)
        db.query(ItemEncomenda).filter(ItemEncomenda.empresa_id == empresa.id).delete(synchronize_session=False)
        db.query(CategoriaEncomenda).filter(CategoriaEncomenda.empresa_id == empresa.id).delete(synchronize_session=False)
        db.flush()

        categorias = []
        for ordem, (nome, descricao) in enumerate([
            ("Salgados e festas", "Salgados por quantidade, tortas salgadas e itens para festas."),
            ("Doces e confeitaria", "Brigadeiros, doces finos, frutas especiais e sobremesas individuais."),
            ("Bolos e sobremesas", "Bolos, pudins, travessas e tortas para compartilhar."),
            ("Sazonais", "Panetones, chocotones e sabores especiais de época."),
        ], start=1):
            categoria = CategoriaEncomenda(
                empresa_id=empresa.id,
                nome=nome,
                descricao=descricao,
                ordem=ordem,
                ativo=True,
            )
            db.add(categoria)
            db.flush()
            categorias.append(categoria)

        salgados, doces, bolos, sazonais = categorias

        # URLs conhecidas que já eram usadas na demo. A vitrine v767 valida a foto
        # antes de colocá-la no destaque grande, evitando qualquer quadro vazio.
        IMG_COXINHA = "https://images.unsplash.com/photo-1625938145744-e380515399bf?auto=format&fit=crop&w=1200&q=88"
        IMG_SALGADOS = "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=88"
        IMG_QUICHE = "https://images.unsplash.com/photo-1572449043416-55f4685c9bb7?auto=format&fit=crop&w=1200&q=88"
        IMG_DOCE = "https://images.unsplash.com/photo-1548907040-4d42eba3866d?auto=format&fit=crop&w=1200&q=88"
        IMG_BRIGADEIRO = "https://images.unsplash.com/photo-1571115177098-24ec42ed204d?auto=format&fit=crop&w=1200&q=88"
        IMG_CAFE = "https://images.unsplash.com/photo-1533777324565-a040eb52facd?auto=format&fit=crop&w=1200&q=88"
        IMG_BOLO = "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=1200&q=88"
        IMG_RED = "https://images.unsplash.com/photo-1586788680434-30d324b2d46f?auto=format&fit=crop&w=1200&q=88"
        IMG_PANETONE = "https://images.unsplash.com/photo-1519915028121-7d3463d20b13?auto=format&fit=crop&w=1200&q=88"
        IMG_PANETONE2 = "https://images.unsplash.com/photo-1608835291093-394b0c943a75?auto=format&fit=crop&w=1200&q=88"
        IMG_MINIDOCE = "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=1200&q=88"

        # SALGADOS E FESTAS
        add_item(db, empresa.id, salgados.id, "Coxinha Tradicional", "Coxinha dourada com massa leve e recheio cremoso de frango.", IMG_COXINHA, "quantidade", 24, True,
                 [("5 unidades", 6), ("50 unidades", 45), ("100 unidades", 82)], sabores="Frango, Frango com requeijão")
        add_item(db, empresa.id, salgados.id, "Risoles", "Risoles crocantes preparados para festas, reuniões e eventos.", IMG_SALGADOS, "quantidade", 24, True,
                 [("5 unidades", 6), ("50 unidades", 44), ("100 unidades", 80)], sabores="Presunto e queijo, Carne, Milho e queijo")
        add_item(db, empresa.id, salgados.id, "Kibe", "Kibes bem temperados, sequinhos por fora e macios por dentro.", IMG_SALGADOS, "quantidade", 24, False,
                 [("5 unidades", 7), ("50 unidades", 47), ("100 unidades", 86)], sabores="Tradicional, Recheado com queijo")
        add_item(db, empresa.id, salgados.id, "Empada Artesanal", "Empadas amanteigadas com recheio generoso e acabamento artesanal.", IMG_QUICHE, "quantidade", 24, False,
                 [("5 unidades", 9), ("50 unidades", 68), ("100 unidades", 128)], sabores="Frango, Palmito, Camarão")
        add_item(db, empresa.id, salgados.id, "Bolinha de Queijo", "Salgadinho clássico com queijo cremoso, ideal para compor kits de festa.", IMG_SALGADOS, "quantidade", 24, False,
                 [("5 unidades", 6), ("50 unidades", 43), ("100 unidades", 78)])
        add_item(db, empresa.id, salgados.id, "Torta Salgada", "Torta macia e bem recheada para reuniões, festas e refeições em família.", IMG_QUICHE, "tamanho", 36, True,
                 [("Pequena · 6 pessoas", 24), ("Média · 12 pessoas", 39), ("Grande · 20 pessoas", 58)], sabores="Frango com requeijão, Palmito, Legumes, Atum")

        # DOCES E CONFEITARIA
        add_item(db, empresa.id, doces.id, "Brigadeiro Gourmet", "Brigadeiros cremosos com acabamento delicado para festas e presentes.", IMG_BRIGADEIRO, "quantidade", 24, True,
                 [("5 unidades", 7), ("50 unidades", 52), ("100 unidades", 96)], sabores="Tradicional, Ninho, Pistache, Doce de leite")
        add_item(db, empresa.id, doces.id, "Doces Finos", "Seleção elegante para mesas de casamento, aniversários e eventos especiais.", IMG_MINIDOCE, "quantidade", 48, True,
                 [("12 unidades", 24), ("50 unidades", 84), ("100 unidades", 158)], sabores="Camafeu, Pistache, Nozes, Chocolate, Frutas vermelhas")
        add_item(db, empresa.id, doces.id, "Bem-casado", "Bem-casados macios, recheados e embalados individualmente.", IMG_MINIDOCE, "quantidade", 48, False,
                 [("10 unidades", 22), ("50 unidades", 94), ("100 unidades", 176)], sabores="Doce de leite, Brigadeiro branco")
        add_item(db, empresa.id, doces.id, "Morango do Amor", "Morango fresco com camada cremosa e cobertura crocante.", IMG_DOCE, "quantidade", 12, True,
                 [("2 unidades", 9), ("6 unidades", 24), ("12 unidades", 44)], sabores="Tradicional, Brigadeiro branco, Pistache")
        add_item(db, empresa.id, doces.id, "Cone Recheado", "Cone crocante com recheio cremoso e cobertura decorada.", IMG_DOCE, "quantidade", 24, False,
                 [("4 unidades", 13), ("10 unidades", 29), ("20 unidades", 54)], sabores="Brigadeiro, Ninho, Doce de leite, Pistache")
        add_item(db, empresa.id, doces.id, "Espeto de Morango", "Morangos selecionados no espeto com cobertura especial.", IMG_DOCE, "quantidade", 12, False,
                 [("4 unidades", 14), ("10 unidades", 31), ("20 unidades", 58)], sabores="Chocolate ao leite, Chocolate branco, Pistache")
        add_item(db, empresa.id, doces.id, "Bolo de Pote", "Camadas de bolo e recheio cremoso em porção individual.", IMG_CAFE, "quantidade", 24, True,
                 [("5 unidades", 18), ("10 unidades", 34), ("20 unidades", 64)], sabores="Chocolate, Ninho com morango, Doce de leite, Red velvet")
        add_item(db, empresa.id, doces.id, "Copo da Felicidade", "Sobremesa generosa em camadas com cremes, frutas e chocolates.", IMG_CAFE, "quantidade", 24, True,
                 [("2 unidades", 13), ("6 unidades", 35), ("12 unidades", 66)], sabores="Ninho com morango, Brownie, Ferrero, Pistache")

        # BOLOS E SOBREMESAS
        add_item(db, empresa.id, bolos.id, "Bolo Vulcão", "Bolo macio com cobertura abundante que escorre ao centro, feito para compartilhar.", IMG_BOLO, "tamanho", 36, True,
                 [("Pequeno · 6 pessoas", 24), ("Médio · 12 pessoas", 39), ("Grande · 20 pessoas", 58)], sabores="Cenoura com chocolate, Brigadeiro, Ninho, Chocolate")
        add_item(db, empresa.id, bolos.id, "Pudim Artesanal", "Pudim cremoso com calda de caramelo e textura delicada.", IMG_RED, "tamanho", 24, True,
                 [("Pequeno · 6 fatias", 18), ("Médio · 10 fatias", 28), ("Grande · 16 fatias", 42)])
        add_item(db, empresa.id, bolos.id, "Bombom na Travessa", "Sobremesa em camadas de creme, chocolate e frutas para dividir.", IMG_BRIGADEIRO, "tamanho", 36, True,
                 [("Pequena · 6 pessoas", 24), ("Média · 12 pessoas", 39), ("Grande · 20 pessoas", 59)], sabores="Morango, Uva, Ninho com Nutella, Chocolate")
        add_item(db, empresa.id, bolos.id, "Tortas Doces", "Tortas refrigeradas com apresentação elegante para festas e encontros.", IMG_RED, "tamanho", 48, True,
                 [("Pequena · 8 pessoas", 29), ("Média · 14 pessoas", 45), ("Grande · 22 pessoas", 66)], sabores="Limão, Banoffee, Chocolate, Morango, Maracujá")
        add_item(db, empresa.id, bolos.id, "Bolo de Festa", "Bolo decorado sob encomenda com escolha de massa, recheio e acabamento.", IMG_BOLO, "peso", 72, True,
                 [("1 kg", 38), ("2 kg", 68), ("3 kg", 96)], recheios="Brigadeiro, Ninho com morango, Doce de leite, Pistache")

        # SAZONAIS
        add_item(db, empresa.id, sazonais.id, "Panetone Tradicional", "Massa de longa fermentação com frutas cristalizadas e aroma delicado.", IMG_PANETONE, "peso", 72, True,
                 [("500 g", 18), ("750 g", 25), ("1 kg", 32)], sabores="Frutas cristalizadas")
        add_item(db, empresa.id, sazonais.id, "Chocotone Recheado", "Chocotone artesanal com recheio cremoso e cobertura especial.", IMG_PANETONE2, "peso", 72, True,
                 [("500 g", 24), ("750 g", 33), ("1 kg", 43)], sabores="Brigadeiro, Ninho, Doce de leite")
        add_item(db, empresa.id, sazonais.id, "Panetone Pistache", "Panetone especial recheado com creme de pistache e acabamento premium.", IMG_PANETONE, "peso", 72, True,
                 [("500 g", 29), ("750 g", 39), ("1 kg", 52)], sabores="Pistache")

        db.commit()
        print(f"OK: catálogo v767 recriado para a empresa demo ID={empresa.id}")
        print("A tela de Encomendas recebidas não foi alterada.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
