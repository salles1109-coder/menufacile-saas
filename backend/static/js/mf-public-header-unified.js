(function(){
  'use strict';
  if(window.__MF_PUBLIC_HEADER_SEARCH__) return;
  window.__MF_PUBLIC_HEADER_SEARCH__=true;

  function isPublicMenu(){
    return document.body && (
      document.body.classList.contains('menu-produtos') ||
      document.body.classList.contains('menu-pedidos') ||
      document.body.classList.contains('menu-servicos')
    );
  }

  function init(){
    if(!isPublicMenu()) return;
    var header=document.querySelector('.header-clean');
    if(!header || header.dataset.mfUnifiedSearchReady==='1') return;
    var box=header.querySelector('.clean-search');
    var input=box && box.querySelector('#buscaProdutos,input');
    var toggle=header.querySelector('.mf-mobile-search-toggle');
    if(!box || !input || !toggle) return;

    header.dataset.mfUnifiedSearchReady='1';
    var close=box.querySelector('.mf-mobile-search-close');
    if(!close){
      close=document.createElement('button');
      close.type='button';
      close.className='mf-mobile-search-close';
      close.setAttribute('aria-label','Fechar busca');
      close.textContent='×';
      box.appendChild(close);
    }

    function opened(){return header.classList.contains('mf-mobile-search-open')}
    function sync(){toggle.setAttribute('aria-expanded',opened()?'true':'false')}
    function openSearch(){
      header.classList.add('mf-mobile-search-open');
      sync();
      window.setTimeout(function(){input.focus();input.select&&input.select()},45);
    }
    function closeSearch(){
      header.classList.remove('mf-mobile-search-open');
      sync();
      input.blur();
    }
    function toggleSearch(){opened()?closeSearch():openSearch()}

    toggle.addEventListener('click',function(event){
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleSearch();
    },true);

    close.addEventListener('click',function(event){
      event.preventDefault();
      event.stopImmediatePropagation();
      closeSearch();
    },true);

    input.addEventListener('keydown',function(event){
      if(event.key==='Escape'){
        event.preventDefault();
        closeSearch();
      }
    });

    document.addEventListener('pointerdown',function(event){
      if(!opened() || window.innerWidth<=720) return;
      if(header.contains(event.target)) return;
      closeSearch();
    },true);

    window.addEventListener('resize',function(){
      if(opened() && document.activeElement!==input) closeSearch();
    },{passive:true});

    sync();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
