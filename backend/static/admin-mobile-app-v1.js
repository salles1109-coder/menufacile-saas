(function(){
  'use strict';
  if(window.__MF_ADMIN_MOBILE_APP_V1__) return;
  window.__MF_ADMIN_MOBILE_APP_V1__=true;

  function mobile(){return window.matchMedia('(max-width: 768px)').matches}
  function qs(s,r){return (r||document).querySelector(s)}
  function qsa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}

  function formatTitle(value){
    if(!value) return 'Agenda de hoje';
    var d=new Date(value+'T12:00:00');
    return new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(d).replace(/^./,function(c){return c.toUpperCase()});
  }



  function ensureProfessionalTabs(){
    var tabs=qs('#profTabsAgenda');
    var select=qs('#profissionalAgenda');
    if(!tabs||!select)return;
    var current=profAtual() || localStorage.getItem('mf_admin_prof_agenda') || '';
    var options=qsa('option',select).filter(function(o){return String(o.value||'').trim()!=='';});
    var existingNames=qsa('.prof-tab',tabs).map(function(b){return b.dataset.prof||'';});
    var optionNames=options.map(function(o){return (o.textContent||'').trim();});
    var needsSync=optionNames.length!==existingNames.length || optionNames.some(function(n,i){return n!==existingNames[i]});
    if(needsSync){
      tabs.innerHTML='';
      options.forEach(function(o){
        var name=(o.textContent||'').trim();
        if(!name)return;
        var b=document.createElement('button');
        b.type='button';
        b.className='prof-tab';
        b.dataset.prof=name;
        b.innerHTML='<span class="mf-prof-name"></span><span class="count">0</span>';
        qs('.mf-prof-name',b).textContent=name;
        b.addEventListener('click',function(){
          if(typeof window.setProf==='function') window.setProf(name);
          else if(typeof setProf==='function') setProf(name);
          else{
            qsa('.prof-tab',tabs).forEach(function(x){x.classList.toggle('active',x===b)});
            localStorage.setItem('mf_admin_prof_agenda',name);
            if(typeof window.filtrarAgenda==='function') window.filtrarAgenda();
          }
          keepActiveProfessionalVisible();
        });
        tabs.appendChild(b);
      });
    }
    var buttons=qsa('.prof-tab',tabs);
    if(!buttons.length)return;
    var target=buttons.find(function(b){return b.dataset.prof===current}) || buttons[0];
    buttons.forEach(function(b){b.classList.toggle('active',b===target)});
    localStorage.setItem('mf_admin_prof_agenda',target.dataset.prof||'');
    tabs.style.display='flex';
    tabs.style.visibility='visible';
    tabs.style.opacity='1';
  }

  function keepActiveProfessionalVisible(){
    var tabs=qs('#profTabsAgenda');
    var active=qs('#profTabsAgenda .prof-tab.active');
    if(!tabs||!active)return;
    requestAnimationFrame(function(){
      try{active.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});}catch(e){}
    });
  }

  function setAgendaDate(value, updateUrl){
    var input=qs('#dataAgendaDia');
    if(!input||!value)return;
    input.value=value;
    var setupDate=qs('#dataAgendaSetup');
    if(setupDate) setupDate.value=value;
    if(updateUrl!==false){
      try{
        var url=new URL(window.location.href);
        url.searchParams.set('data',value);
        url.searchParams.delete('_auto');
        history.replaceState({mfAgendaDate:value},'',url.toString());
      }catch(e){}
    }
    buildDateStrip();
    ensureProfessionalTabs();
    if(typeof window.filtrarAgenda==='function') window.filtrarAgenda();
    else if(typeof filtrarAgenda==='function') filtrarAgenda();
    keepActiveProfessionalVisible();
    refreshAgendaStatuses();
    refreshProfessionalAppointmentCounts();
    refreshProfessionalAppointmentCounts();
  }

  function buildDateStrip(){
    var strip=qs('[data-mf-mobile-date-strip]');
    var input=qs('#dataAgendaDia');
    var title=qs('[data-mf-mobile-date-title]');
    if(!strip||!input) return;
    var base=new Date((input.value||new Date().toISOString().slice(0,10))+'T12:00:00');
    var start=new Date(base);start.setDate(base.getDate()-3);
    strip.innerHTML='';
    var week=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    var monthNames=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    var monthRow=document.createElement('div');
    monthRow.className='mf-mobile-date-months';
    monthRow.innerHTML='<span>'+monthNames[base.getMonth()]+'</span>';
    var endMonth=new Date(start);endMonth.setDate(start.getDate()+6);
    if(endMonth.getMonth()!==base.getMonth()) monthRow.innerHTML+='<span>'+monthNames[endMonth.getMonth()]+'</span>';
    strip.appendChild(monthRow);
    var days=document.createElement('div');days.className='mf-mobile-date-days';strip.appendChild(days);
    for(var i=0;i<7;i++){
      var d=new Date(start);d.setDate(start.getDate()+i);
      var value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      var b=document.createElement('button');b.type='button';b.className='mf-mobile-date-day'+(value===input.value?' is-active':'');
      b.setAttribute('aria-label',week[d.getDay()]+' '+d.getDate());
      b.innerHTML='<span>'+week[d.getDay()]+'</span><strong>'+String(d.getDate()).padStart(2,'0')+'</strong>';
      b.addEventListener('click',function(v){return function(){setAgendaDate(v,true)}}(value));
      days.appendChild(b);
    }
    if(title) title.textContent=formatTitle(input.value);
  }

  function setMobileTitle(text){
    var title=qs('.top-title strong');if(title)title.textContent=text;
    var subtitle=qs('.top-title span');if(subtitle)subtitle.style.display='none';
  }

  function setHistoryActionLabel(isHistory){
    var label=qs('[data-mf-mobile-history-label]');
    var icon=qs('[data-mf-mobile-action="history"] i');
    if(label)label.textContent=isHistory?'Agenda do dia':'Histórico de agendamentos';
    if(icon)icon.className=isHistory?'fa-regular fa-calendar-check':'fa-regular fa-rectangle-list';
  }

  function openAgenda(){
    document.body.classList.remove('mf-mobile-setup-open','mf-mobile-history-open');
    setHistoryActionLabel(false);
    setMobileTitle('Agendamentos');
    var agenda=qs('#agendaDia');if(!agenda)return;
    agenda.classList.remove('collapsed');
    agenda.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function openHistory(){
    document.body.classList.remove('mf-mobile-setup-open');
    document.body.classList.add('mf-mobile-history-open');
    setHistoryActionLabel(true);
    setMobileTitle('Histórico de agendamentos');
    var card=qs('#agendamentosCard');
    if(card){card.classList.remove('collapsed');card.scrollIntoView({behavior:'smooth',block:'start'});}
  }

  function openCard(id){
    var card=qs('#'+id);if(!card)return;
    if(id==='setupCard'){
      document.body.classList.remove('mf-mobile-history-open');
      document.body.classList.add('mf-mobile-setup-open');
      setHistoryActionLabel(false);
      setMobileTitle('Cadastrar horários');
    }
    card.classList.remove('collapsed');
    card.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function initFab(){
    var wrap=qs('[data-mf-mobile-fab-wrap]');if(!wrap)return;
    var toggle=qs('[data-mf-mobile-fab]',wrap);
    toggle&&toggle.addEventListener('click',function(){wrap.classList.toggle('is-open')});
    qsa('[data-mf-mobile-action]',wrap).forEach(function(btn){
      btn.addEventListener('click',function(){
        wrap.classList.remove('is-open');
        var action=btn.getAttribute('data-mf-mobile-action');
        if(action==='setup') openCard('setupCard');
        if(action==='history'){
          if(document.body.classList.contains('mf-mobile-history-open')) openAgenda();
          else openHistory();
        }
      });
    });
  }

  function initMore(){
    var open=qs('[data-mf-mobile-more-open]');var sheet=qs('[data-mf-mobile-more-sheet]');if(!open||!sheet)return;
    function close(){sheet.classList.remove('is-open');document.body.style.overflow=''}
    open.addEventListener('click',function(){sheet.classList.add('is-open');document.body.style.overflow='hidden'});
    qsa('[data-mf-mobile-more-close]',sheet).forEach(function(x){x.addEventListener('click',close)});
    sheet.addEventListener('click',function(e){if(e.target===sheet)close()});
  }

  function initMoreActions(){
    qsa('.reserva-card .actions').forEach(function(actions){
      if(actions.dataset.mfMobileMoreReady==='1')return;actions.dataset.mfMobileMoreReady='1';
      actions.addEventListener('click',function(e){
        if(!mobile())return;
        var rect=actions.getBoundingClientRect();
        if(e.clientX<rect.right-54)return;
        e.preventDefault();e.stopPropagation();
        var buttons=qsa('.btn',actions).filter(function(b,i){return i>0});
        if(!buttons.length)return;
        var panel=document.createElement('div');panel.className='mf-mobile-more-sheet is-open';
        var box=document.createElement('div');box.className='mf-mobile-more-panel';
        box.innerHTML='<div class="mf-mobile-more-head"><strong>Mais ações</strong><button class="mf-mobile-more-close" type="button">×</button></div><div class="mf-mobile-more-grid"></div>';
        var grid=qs('.mf-mobile-more-grid',box);
        buttons.forEach(function(original){
          var clone=document.createElement('button');clone.type='button';clone.className='mf-mobile-fab-action';clone.style.justifyContent='stretch';clone.innerHTML='<span style="width:100%;text-align:left">'+original.textContent.trim()+'</span>';
          clone.addEventListener('click',function(){original.click();panel.remove()});grid.appendChild(clone);
        });
        panel.appendChild(box);document.body.appendChild(panel);
        qs('.mf-mobile-more-close',box).addEventListener('click',function(){panel.remove()});
        panel.addEventListener('click',function(ev){if(ev.target===panel)panel.remove()});
      });
    });
  }


  function normalizeStatus(value){
    value=String(value||'').toLowerCase().trim();
    if(value==='concluído'||value==='concluido')return 'concluida';
    if(value==='pago')return 'paga';
    if(value==='confirmado')return 'confirmada';
    if(value==='cancelado')return 'cancelada';
    if(value==='recusado')return 'recusada';
    return value||'pendente';
  }

  function dateKey(value){
    value=String(value||'').trim();
    var iso=value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(iso)return iso[1]+'-'+iso[2]+'-'+iso[3];
    var br=value.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
    if(br)return br[3]+'-'+br[2]+'-'+br[1];
    return value;
  }

  function slotReservations(slot){
    var date=dateKey(slot.dataset.date||'');
    var prof=String(slot.dataset.prof||'').trim().toLowerCase();
    var hour=String(slot.dataset.hour||'').slice(0,5);
    return qsa('#reservasGrid .reserva-card').filter(function(card){
      return dateKey(card.dataset.date||'')===date &&
        String(card.dataset.prof||'').trim().toLowerCase()===prof &&
        String(card.dataset.hour||'').slice(0,5)===hour;
    });
  }

  function isPastSlot(slot){
    var raw=(slot.dataset.date||'')+'T'+String(slot.dataset.hour||'00:00').slice(0,5)+':00';
    var when=new Date(raw);
    return !isNaN(when.getTime()) && when.getTime()<Date.now();
  }

  function chooseReservation(cards){
    var priority={pendente:60,confirmada:50,paga:40,concluida:40,cancelada:20,recusada:10};
    return cards.slice().sort(function(a,b){return (priority[normalizeStatus(b.dataset.status)]||0)-(priority[normalizeStatus(a.dataset.status)]||0)})[0]||null;
  }

  function statusPresentation(status,past){
    status=normalizeStatus(status);
    if(past && status==='pendente')return {key:'expirado',label:'Expirado'};
    if(past && status==='confirmada')return {key:'aguardando',label:'Aguardando conclusão'};
    if(past && (status==='paga'||status==='concluida'))return {key:'concluida',label:'Concluído'};
    var labels={pendente:'Pendente',confirmada:'Confirmado',paga:'Pago',concluida:'Concluído',cancelada:'Cancelado',recusada:'Recusado'};
    return {key:status,label:labels[status]||'Pendente'};
  }

  function cardIsPast(card){
    if(!card)return false;
    var date=dateKey(card.dataset.date||'');
    var hour=String(card.dataset.hour||'00:00').slice(0,5);
    var when=new Date(date+'T'+hour+':00');
    return !isNaN(when.getTime()) && when.getTime()<Date.now();
  }

  window.mfAgendaVisualStatusForCard=function(card){
    if(!card)return {key:'pendente',label:'Pendente'};
    return statusPresentation(card.dataset.status||'pendente',cardIsPast(card));
  };

  function cleanService(value){
    value=String(value||'').replace(/FINANCEIRO_SERVICO[^\n]*/gi,'').replace(/valor=\S+/gi,'').replace(/pagamento=\S+/gi,'').trim();
    return value||'Serviço não informado';
  }



  function refreshProfessionalAppointmentCounts(){
    var dateInput=qs('#dataAgendaDia');
    var selectedDate=dateKey(dateInput&&dateInput.value||'');
    var cards=qsa('#reservasGrid .reserva-card');
    qsa('#profTabsAgenda .prof-tab').forEach(function(btn){
      var prof=String(btn.dataset.prof||'').trim().toLowerCase();
      var total=cards.filter(function(card){
        var status=normalizeStatus(card.dataset.status||'');
        var active=status!=='cancelada' && status!=='recusada';
        return active && dateKey(card.dataset.date||'')===selectedDate && String(card.dataset.prof||'').trim().toLowerCase()===prof;
      }).length;
      var count=qs('.count',btn);
      if(count)count.textContent=String(total);
    });
  }

  function refreshAgendaStatuses(){
    qsa('#agendaGrid .slot').forEach(function(slot){
      var cards=slotReservations(slot);
      var chip=qs('.chip',slot);
      var info=qs('p',slot);
      if(!cards.length){
        slot.dataset.mfStatus='livre';
        if(chip)chip.textContent='Livre';
        return;
      }
      var selected=chooseReservation(cards);
      var presentation=statusPresentation(selected.dataset.status,isPastSlot(slot));
      slot.dataset.mfStatus=presentation.key;
      if(chip)chip.textContent=presentation.label;
      if(info){
        var service=cleanService(selected.dataset.servico||selected.dataset.observacao||'');
        var prof=selected.dataset.prof||slot.dataset.prof||'';
        info.innerHTML='<span class="mf-slot-detail"></span><span class="mf-slot-prof"></span>';
        qs('.mf-slot-detail',info).textContent=service;
        qs('.mf-slot-prof',info).textContent=prof;
      }
    });
  }

  var mfAgendaRefreshTimer=null;
  function scheduleAgendaStatusRefresh(){
    clearTimeout(mfAgendaRefreshTimer);
    mfAgendaRefreshTimer=setTimeout(refreshAgendaStatuses,40);
  }
  function observeAgendaChanges(){
    ['agendaGrid','reservasGrid'].forEach(function(id){
      var node=document.getElementById(id);
      if(!node||node.dataset.mfStatusObserver==='1')return;
      node.dataset.mfStatusObserver='1';
      new MutationObserver(function(){scheduleAgendaStatusRefresh();setTimeout(refreshProfessionalAppointmentCounts,50)}).observe(node,{childList:true});
    });
    new MutationObserver(function(mutations){
      var needsBind=mutations.some(function(m){
        return Array.prototype.some.call(m.addedNodes||[],function(n){
          return n.nodeType===1 && (n.id==='agendaGrid'||n.id==='reservasGrid'||(n.querySelector&&n.querySelector('#agendaGrid,#reservasGrid')));
        });
      });
      if(needsBind){observeAgendaChanges();scheduleAgendaStatusRefresh();}
    }).observe(document.body,{childList:true,subtree:true});
  }

  function init(){
    if(!mobile())return;
    document.body.classList.remove('mf-mobile-history-open');
    setHistoryActionLabel(false);
    var dateInput=qs('#dataAgendaDia');
    var dateForm=qs('#formDataAgenda');
    if(dateForm) dateForm.addEventListener('submit',function(e){e.preventDefault();if(dateInput)setAgendaDate(dateInput.value,true)});
    if(dateInput) dateInput.addEventListener('change',function(){setAgendaDate(dateInput.value,true)});
    buildDateStrip();ensureProfessionalTabs();openAgenda();initFab();initMore();initMoreActions();observeAgendaChanges();refreshAgendaStatuses();refreshProfessionalAppointmentCounts();setInterval(function(){refreshAgendaStatuses();refreshProfessionalAppointmentCounts()},15000);
    var profTabs=qs('#profTabsAgenda');
    if(profTabs){
      profTabs.addEventListener('click',function(e){
        if(e.target.closest('.prof-tab')) setTimeout(keepActiveProfessionalVisible,0);
      });
      keepActiveProfessionalVisible();
    }
    var setupClose=qs('#setupCard .collapse-btn');
    if(setupClose)setupClose.addEventListener('click',function(){setTimeout(openAgenda,0)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.addEventListener('resize',function(){if(mobile())buildDateStrip()},{passive:true});
})();


/* v15 — cards operacionais completos e modal limpo */
(function(){
  'use strict';
  function q(s,r){return (r||document).querySelector(s)}
  function qa(s,r){return Array.from((r||document).querySelectorAll(s))}
  function mobile(){return matchMedia('(max-width:768px)').matches}
  function normDate(v){v=String(v||'');var m=v.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);return m?m[3]+'-'+m[2]+'-'+m[1]:v}
  function minutes(h){var p=String(h||'00:00').slice(0,5).split(':').map(Number);return (p[0]||0)*60+(p[1]||0)}
  function hm(n){n=(n+1440)%1440;return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
  function cleanService(v){
    return String(v||'')
      .replace(/FINANCEIRO_SERVICO[^\n]*/gi,'')
      .replace(/\bvalor=\S+/gi,'')
      .replace(/\bpagamento=\S+/gi,'')
      .replace(/Serviços selecionados:\s*/gi,'')
      .replace(/\s+/g,' ').trim();
  }
  function serviceName(v){return cleanService(v).replace(/\s*(?:—|-|\|)?\s*R\$\s*[\d.,]+.*$/i,'').trim()||'Serviço não informado'}
  function money(v){var a=Array.from(String(v||'').matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)/gi));return a.length?'R$ '+a[a.length-1][1]:''}
  function nextEnd(slot){
    var start=minutes(slot.dataset.hour);var date=normDate(slot.dataset.date);var prof=String(slot.dataset.prof||'').toLowerCase();
    var next=qa('#agendaGrid .slot').filter(function(s){return normDate(s.dataset.date)===date&&String(s.dataset.prof||'').toLowerCase()===prof&&minutes(s.dataset.hour)>start}).sort(function(a,b){return minutes(a.dataset.hour)-minutes(b.dataset.hour)})[0];
    return next?String(next.dataset.hour||'').slice(0,5):hm(start+30);
  }
  function cardsFor(slot){
    var d=normDate(slot.dataset.date),p=String(slot.dataset.prof||'').toLowerCase(),h=String(slot.dataset.hour||'').slice(0,5);
    return qa('#reservasGrid .reserva-card').filter(function(c){return normDate(c.dataset.date)===d&&String(c.dataset.prof||'').toLowerCase()===p&&String(c.dataset.hour||'').slice(0,5)===h});
  }
  function chosen(cards){
    var pr={pendente:6,confirmada:5,paga:4,concluida:4,cancelada:2,recusada:1};
    return cards.slice().sort(function(a,b){return (pr[String(b.dataset.status||'').toLowerCase()]||0)-(pr[String(a.dataset.status||'').toLowerCase()]||0)})[0]||null;
  }
  function refreshSlotDetails(){
    if(!mobile())return;
    qa('#agendaGrid .slot').forEach(function(slot){
      var cards=cardsFor(slot), info=q('p',slot), time=q('.time',slot); if(!info||!time)return;
      if(!cards.length){time.textContent=String(slot.dataset.hour||time.textContent).slice(0,5);return}
      var c=chosen(cards); if(!c)return;
      var start=String(slot.dataset.hour||'').slice(0,5), end=nextEnd(slot);
      time.textContent=start+' – '+end;
      var raw=c.dataset.servico||c.dataset.observacao||'';
      var nome=String(c.dataset.cliente||'Cliente').trim().toUpperCase();
      var serv=serviceName(raw), val=money(raw);
      info.innerHTML='<span class="mf-slot-client"></span><span class="mf-slot-service"></span><span class="mf-slot-prof"></span>';
      q('.mf-slot-client',info).textContent=nome;
      q('.mf-slot-service',info).textContent=serv+(val?' — '+val:'');
      q('.mf-slot-prof',info).textContent=c.dataset.prof||slot.dataset.prof||'';
    });
  }
  function paymentFrom(card){
    var raw=String(card.dataset.servico||card.dataset.observacao||'');
    var m=raw.match(/pagamento=([^\s|]+)/i);return m?m[1]:'Não informado';
  }
  function enhanceModal(card){
    if(!mobile()||!card)return;
    var info=q('#modalAgendaReserva .modal-agenda-info'); if(!info)return;
    var raw=card.dataset.servico||card.dataset.observacao||'';
    var serv=serviceName(raw), val=money(raw)||'R$ 0,00';
    info.innerHTML=''
      +'<div><strong>Cliente:</strong> <span>'+String(card.dataset.cliente||'-')+'</span></div>'
      +'<div><strong>Telefone:</strong> <span>'+String(card.dataset.telefone||'-')+'</span></div>'
      +'<div><strong>Serviço:</strong> <span>'+serv+'</span></div>'
      +'<div><strong>Profissional:</strong> <span>'+String(card.dataset.prof||'-')+'</span></div>'
      +'<div><strong>Valor:</strong> <span>'+val+'</span></div>'
      +'<div><strong>Pagamento:</strong> <span>'+paymentFrom(card)+'</span></div>';
  }
  function wrapModal(){
    if(typeof window.abrirModalReservaCard!=='function'||window.abrirModalReservaCard.__mfV15)return;
    var original=window.abrirModalReservaCard;
    var wrapped=function(card,lista){var r=original.apply(this,arguments);setTimeout(function(){enhanceModal(card)},0);return r};
    wrapped.__mfV15=true;window.abrirModalReservaCard=wrapped;
  }
  function boot(){wrapModal();refreshSlotDetails();setInterval(refreshSlotDetails,3000);new MutationObserver(function(){setTimeout(refreshSlotDetails,50)}).observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
