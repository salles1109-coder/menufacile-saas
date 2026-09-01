(function(){
  'use strict';

  function mobile(){return window.matchMedia('(max-width:768px)').matches}
  function q(selector,root){return (root||document).querySelector(selector)}
  function qa(selector,root){return Array.prototype.slice.call((root||document).querySelectorAll(selector))}
  function normalize(value){
    return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }
  function linkPath(link){
    try{return new URL(link.href,location.href).pathname.replace(/\/$/,'').toLowerCase()}
    catch(error){return ''}
  }

  function init(){
    if(!location.pathname.startsWith('/admin/')||!mobile())return;

    var path=location.pathname.toLowerCase();
    if(path.indexOf('/reservas')>-1||q('.mf-stage1-bottom-nav')){
      document.body.classList.add('mf-has-agenda-nav');
      document.body.classList.remove('mf-global-mobile-admin');
      return;
    }

    document.body.classList.add('mf-global-mobile-admin');

    var page='inicio';
    if(path.indexOf('/cardapio')>-1)page='cardapio';
    else if(path.indexOf('/reservas')>-1)page='reservas';
    else if(path.indexOf('/produtos-pedidos')>-1)page='produtos';
    else if(path.indexOf('/pedidos')>-1)page='pedidos';
    else if(path.indexOf('/financeiro')>-1||path.indexOf('/caixa')>-1)page='financeiro';
    else if(path.indexOf('/fiscal')>-1)page='fiscal';
    else if(path.indexOf('/pagamento')>-1)page='pagamentos';
    else if(path.indexOf('/configuracoes')>-1)page='configuracoes';
    else if(path.indexOf('/funcionarios')>-1)page='funcionarios';
    else if(path.indexOf('/integracoes')>-1)page='integracoes';
    else if(path.indexOf('/entrega')>-1)page='entrega';

    document.body.classList.add('mf-page-'+page);
    document.body.setAttribute('data-mf-mobile-page',page);
    if(q('.mf-global-bottom-nav'))return;

    var links=qa('.mf-admin-sidebar .mf-admin-nav-link');
    if(!links.length)return;

    var companyId=location.pathname.split('/')[2];
    var basePath=('/admin/'+companyId).toLowerCase();
    function exact(suffix){
      var wanted=(basePath+suffix).replace(/\/$/,'');
      return links.find(function(link){return linkPath(link)===wanted});
    }
    function contains(fragment){
      return links.find(function(link){return linkPath(link).indexOf(fragment)>-1});
    }

    var dashboard=exact('');
    var catalog=exact('/cardapio')||contains('/cardapio');
    var reservations=exact('/reservas')||contains('/reservas');
    var productOrders=exact('/produtos-pedidos')||contains('/produtos-pedidos');
    var orders=exact('/pedidos')||links.find(function(link){
      var p=linkPath(link);
      return p.endsWith('/pedidos')&&!p.endsWith('/produtos-pedidos');
    });
    var encomendaCatalog=exact('/encomendas/cadastrar')||contains('/encomendas/cadastrar');
    var encomendaOrders=exact('/encomendas')||links.find(function(link){
      return linkPath(link).endsWith('/encomendas');
    });
    var finance=exact('/financeiro')||contains('/financeiro');

    var businessMeta=q('meta[name="mf-business-type"]');
    var businessType=normalize((businessMeta&&businessMeta.content)||'');
    var serviceTypes=['servicos_gerais','outros_servicos','servicos','salao','barbearia','estetica','clinica','clinica_simples','consultorio','academia','oficina'];
    var productTypes=['loja','loja_catalogo','catalogo','mercado','mercearia','adega','bebidas','farmacia','pet_shop','petshop','floricultura','outras_lojas'];
    var restaurantTypes=['restaurante','comida','pizzaria','lanchonete','hamburgueria','padaria','cafeteria','doceria','sorveteria','acaiteria','outros_alimentacao'];

    var encomendaTypes=['encomendas','encomenda','sob_encomenda','confeitaria_encomendas'];
    var isService=serviceTypes.indexOf(businessType)>-1;
    var isProduct=productTypes.indexOf(businessType)>-1;
    var isEncomenda=encomendaTypes.indexOf(businessType)>-1;
    var isRestaurant=restaurantTypes.indexOf(businessType)>-1||(!isService&&!isProduct&&!isEncomenda);

    var primary;
    if(isEncomenda){
      primary=[dashboard,encomendaCatalog,encomendaOrders,finance].filter(Boolean);
    }else if(isRestaurant){
      primary=[dashboard,reservations,orders,finance].filter(Boolean);
    }else if(isService){
      primary=[dashboard,catalog,reservations,finance].filter(Boolean);
    }else{
      primary=[dashboard,catalog,(productOrders||orders),finance].filter(Boolean);
    }
    if(!primary.length&&links.length)primary=[links[0]];

    var nav=document.createElement('nav');
    nav.className='mf-global-bottom-nav';
    nav.setAttribute('aria-label','Navegação principal');
    nav.setAttribute('data-mf-business',isEncomenda?'encomendas':(isRestaurant?'restaurante':(isService?'servicos':'produtos')));

    primary.forEach(function(link){
      var item=document.createElement('a');
      item.href=link.href;
      var original=(q('span',link)&&q('span',link).textContent||link.textContent||'').trim();
      var href=linkPath(link);
      var label=original.split(/\s+/)[0]||'Abrir';

      if(href===basePath)label='Início';
      else if(isEncomenda&&href.endsWith('/encomendas/cadastrar'))label='Produtos';
      else if(isEncomenda&&href.endsWith('/encomendas'))label='Pedidos';
      else if(isRestaurant&&href.endsWith('/reservas'))label='Reservas';
      else if(isRestaurant&&href.endsWith('/pedidos'))label='Pedidos';
      else if(isService&&href.endsWith('/cardapio'))label='Serviços';
      else if(isService&&href.endsWith('/reservas'))label='Agenda';
      else if(isProduct&&href.endsWith('/cardapio'))label='Produtos';
      else if(isProduct&&href.endsWith('/produtos-pedidos'))label='Pedidos';
      else if(href.endsWith('/financeiro'))label='Financeiro';
      else if(/dashboard/i.test(original))label='Início';

      item.innerHTML=(q('i',link)?q('i',link).outerHTML:'<i class="fa-solid fa-circle"></i>')+'<span>'+label+'</span>';
      if(location.pathname.replace(/\/$/,'').toLowerCase()===href||link.classList.contains('active'))item.classList.add('is-active');
      nav.appendChild(item);
    });

    var more=document.createElement('button');
    more.type='button';
    more.innerHTML='<i class="fa-solid fa-ellipsis"></i><span>Mais</span>';
    nav.appendChild(more);
    document.body.appendChild(nav);

    var sheet=document.createElement('div');
    sheet.className='mf-global-more-sheet';
    sheet.innerHTML='<div class="mf-global-more-panel"><div class="mf-global-more-head"><div><strong>Mais opções</strong><small>Acessos e configurações</small></div><button class="mf-global-more-close" type="button" aria-label="Fechar">×</button></div><div class="mf-global-more-grid"></div></div>';
    var grid=q('.mf-global-more-grid',sheet);
    var used=new Set(primary);

    /* v726 — “Aplicativo e alertas” fica visível no dashboard e no menu
       lateral do desktop. No celular não deve ser repetido dentro de Mais. */
    links.forEach(function(link){
      if(used.has(link)||link.hasAttribute('data-mf-push-open'))return;
      var clone=link.cloneNode(true);
      clone.className='';
      grid.appendChild(clone);
    });
    document.body.appendChild(sheet);

    function close(){sheet.classList.remove('is-open');document.body.style.overflow=''}
    more.addEventListener('click',function(){sheet.classList.add('is-open');document.body.style.overflow='hidden'});
    q('.mf-global-more-close',sheet).addEventListener('click',close);
    sheet.addEventListener('click',function(event){if(event.target===sheet)close()});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
