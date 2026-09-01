(function(){
  'use strict';
  if(window.__MF_AGENDA_DESKTOP_ORDER_V44__) return;
  window.__MF_AGENDA_DESKTOP_ORDER_V44__ = true;

  function setupHistoryCollapse(){
    var card=document.getElementById('agendamentosCard');
    var grid=document.getElementById('reservasGrid');
    var tabs=document.getElementById('statusTabs');
    if(!card||!grid||!tabs) return;

    /* No novo painel por atalhos, o próprio botão superior já abre e fecha
       o histórico. Não criar um segundo recolhimento dentro dele. */
    if(document.getElementById('reservasToolbarShell')){
      var oldHead=card.querySelector('.mf-history-collapse-head');
      if(oldHead) oldHead.remove();
      card.classList.remove('mf-history-collapsed');
      return;
    }

    if(card.querySelector('.mf-history-collapse-head')) return;

    var head=document.createElement('div');
    head.className='mf-history-collapse-head';
    head.innerHTML='<div class="mf-history-collapse-title"><span class="mf-history-collapse-icon"><i class="fa-solid fa-clock-rotate-left"></i></span><strong>Histórico de agendamentos</strong></div><button type="button" class="mf-history-collapse-btn" aria-expanded="false" aria-label="Expandir histórico"><i class="fa-solid fa-chevron-down"></i></button>';
    card.classList.add('mf-history-collapsed');
    card.insertBefore(head,tabs);

    var btn=head.querySelector('.mf-history-collapse-btn');
    btn.addEventListener('click',function(){
      var collapsed=card.classList.toggle('mf-history-collapsed');
      btn.setAttribute('aria-expanded',collapsed?'false':'true');
      btn.setAttribute('aria-label',collapsed?'Expandir histórico':'Recolher histórico');
      var icon=btn.querySelector('i');
      if(icon) icon.className=collapsed?'fa-solid fa-chevron-down':'fa-solid fa-chevron-up';
    });
  }

  function syncDesktopOrder(){
    var setup=document.getElementById('setupCard');
    var agenda=document.getElementById('agendaDia');
    if(!setup||!agenda||setup.parentNode!==agenda.parentNode) return;
    var parent=setup.parentNode;
    if(window.matchMedia('(min-width: 769px)').matches){
      agenda.classList.remove('collapsed');
      if(parent.firstElementChild!==agenda || agenda.nextElementSibling!==setup){
        parent.insertBefore(agenda,setup);
      }
    }else{
      if(setup.nextElementSibling!==agenda){
        parent.insertBefore(setup,agenda);
      }
    }
  }

  function init(){
    setupHistoryCollapse();
    syncDesktopOrder();
  }
  document.addEventListener('DOMContentLoaded',init);
  window.addEventListener('resize',syncDesktopOrder,{passive:true});
  setTimeout(init,150);
})();
