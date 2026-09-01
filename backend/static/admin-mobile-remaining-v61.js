(function(){
  'use strict';
  function mobile(){ return window.matchMedia('(max-width:768px)').matches; }
  function qs(sel,root){ return (root||document).querySelector(sel); }
  function qsa(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function clean(value){ return String(value||'').replace(/\s+/g,' ').trim(); }

  function makeTablesMobile(){
    qsa('table').forEach(function(table){
      if(table.closest('.mp-help-modal')) return;
      var headers=qsa('thead th',table).map(function(th){return clean(th.textContent);});
      if(!headers.length) return;
      table.classList.add('mf-v58-mobile-table');
      qsa('tbody tr',table).forEach(function(row){
        qsa('td',row).forEach(function(td,index){
          if(!td.hasAttribute('data-mf-label')) td.setAttribute('data-mf-label',headers[index]||('Campo '+(index+1)));
        });
      });
    });
  }

  function initConfigAccordions(){
    if(!document.body.classList.contains('mf-ds-configuracoes')) return;

    var STORAGE_KEY='v137_config_cards_abertos';

    function readState(){
      try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');}
      catch(error){return {};}
    }

    function saveState(card,index){
      var title=qs(':scope > .card-title h2',card);
      var id=card.id||clean(title&&title.textContent)||('card-'+index);
      var state=readState();
      state[id]=card.classList.contains('v137-open');
      try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(error){}
    }

    function toggleCard(card,index,event){
      if(event){
        event.preventDefault();
        event.stopPropagation();
        if(event.stopImmediatePropagation) event.stopImmediatePropagation();
      }
      card.classList.toggle('v137-open');
      saveState(card,index);
    }

    /* A tela já possui o accordion nativo v137. Removemos controles antigos,
       mantemos uma única seta e damos a ela um clique próprio. Assim o toque
       no ícone não depende da propagação para o cabeçalho. */
    qsa('.mf-v58-collapse-btn').forEach(function(button){button.remove();});

    qsa('main.container > form > section.card, .premium-content main.container section.card').forEach(function(card,index){
      var head=qs(':scope > .card-title',card);
      if(!head) return;

      var icons=qsa(':scope > .v137-collapse-icon',head);
      icons.slice(0,-1).forEach(function(icon){icon.remove();});
      var icon=icons.length?icons[icons.length-1]:null;

      card.classList.remove('mf-v58-collapsed');
      if(!icon||icon.dataset.mfV61Ready==='1') return;

      icon.dataset.mfV61Ready='1';
      icon.setAttribute('role','button');
      icon.setAttribute('tabindex','0');
      icon.setAttribute('aria-label','Abrir ou fechar seção');

      icon.addEventListener('click',function(event){toggleCard(card,index,event);});
      icon.addEventListener('keydown',function(event){
        if(event.key==='Enter'||event.key===' '||event.key==='Spacebar') toggleCard(card,index,event);
      });
    });
  }

  function improveModals(){
    qsa('.mp-help-modal, .mf-modal').forEach(function(modal){
      modal.addEventListener('click',function(event){
        if(event.target!==modal) return;
        var close=qs('.mp-help-close,.mf-modal-close,[data-modal-close]',modal);
        if(close) close.click();
      });
    });
  }

  function improveMoreMenu(){
    qsa('.mf-global-more-grid a').forEach(function(link){
      var text=clean(link.textContent).toLowerCase();
      var href=link.getAttribute('href')||'';
      if(text.indexOf('menu público')>-1 || text.indexOf('menu publico')>-1 || href.indexOf('/menu/')>-1){
        link.classList.add('mf-v58-public-menu-link');
        /* No celular, mantém somente o ícone principal do Menu público.
           Remove o indicador externo duplicado criado por versões anteriores. */
        qsa('.fa-arrow-up-right-from-square',link).forEach(function(icon){ icon.remove(); });
      }
    });
  }

  function revealHashSection(){
    if(!location.hash) return;
    var target=qs(location.hash);
    if(!target) return;
    var card=target.closest('section.card');
    if(card){ card.classList.remove('mf-v58-collapsed'); card.classList.add('v137-open'); }
    setTimeout(function(){target.scrollIntoView({behavior:'smooth',block:'start'});},80);
  }

  function init(){
    if(!mobile() || !location.pathname.startsWith('/admin/')) return;
    var supported=document.body.matches('.mf-ds-fiscal,.mf-ds-pagamentos-online,.mf-ds-configuracoes,.mf-ds-funcionarios,.mf-ds-integracoes');
    if(!supported) return;
    document.body.classList.add('mf-v58-remaining-ready');
    makeTablesMobile();
    initConfigAccordions();
    improveModals();
    improveMoreMenu();
    revealHashSection();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
