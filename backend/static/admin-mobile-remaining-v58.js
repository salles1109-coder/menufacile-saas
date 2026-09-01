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
    var cards=qsa('main.container > form > section.card, .premium-content main.container section.card');
    cards.forEach(function(card,index){
      var head=qs(':scope > .card-title',card);
      if(!head || qs('.mf-v58-collapse-btn',head)) return;
      var button=document.createElement('button');
      button.type='button';
      button.className='mf-v58-collapse-btn';
      button.setAttribute('aria-label','Recolher ou expandir seção');
      button.innerHTML='<i class="fa-solid fa-chevron-down"></i>';
      head.appendChild(button);
      if(index>0) card.classList.add('mf-v58-collapsed');
      function toggle(event){
        if(event && event.target.closest('a,input,select,textarea,label')) return;
        card.classList.toggle('mf-v58-collapsed');
      }
      head.addEventListener('click',toggle);
      button.addEventListener('click',function(event){event.stopPropagation();toggle();});
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
        if(!qs('.fa-arrow-up-right-from-square',link)){
          var icon=document.createElement('i');
          icon.className='fa-solid fa-arrow-up-right-from-square';
          link.appendChild(icon);
        }
      }
    });
  }

  function revealHashSection(){
    if(!location.hash) return;
    var target=qs(location.hash);
    if(!target) return;
    var card=target.closest('section.card');
    if(card) card.classList.remove('mf-v58-collapsed');
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
