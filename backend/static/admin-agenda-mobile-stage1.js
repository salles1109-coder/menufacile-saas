(function(){
  'use strict';
  if(window.__MF_STAGE1_AGENDA__) return;
  window.__MF_STAGE1_AGENDA__=true;
  /* v84 — mostra um card por agendamento órfão, mesmo quando dois têm o mesmo horário/profissional antigo.
     v83 — mostra agendamentos órfãos em 'Sem profissional', preservando no card o nome anterior.
     v82 — correção do loop mobile no contador.
     Atualiza somente quando o valor muda e evita retroalimentação do MutationObserver. */
  var MF_ORPHAN_PROF='__mf_sem_profissional__';
  /* v80 — contador dos profissionais sempre usa agendamentos ativos do dia.
     Esta rotina fica antes do bloqueio mobile para funcionar também no notebook. */
  function mfNormAgendaDate(v){
    v=String(v||'').trim();
    var m=v.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m)return m[1]+'-'+m[2]+'-'+m[3];
    m=v.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);return m?m[3]+'-'+m[2]+'-'+m[1]:v;
  }
  function mfActiveAgendaStatus(v){
    v=String(v||'pendente').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return !['concluida','concluido','finalizada','finalizado','cancelada','cancelado','recusada','recusado','expirada','expirado'].includes(v);
  }
  function mfApplyProfessionalAppointmentCounts(){
    var counts={};
    var orphanCount=0;
    var input=document.querySelector('#dataAgendaDia');
    var selected=mfNormAgendaDate(input?input.value:'');
    var activeNames=new Set(Array.from(document.querySelectorAll('#profissionalAgenda option')).map(function(o){return String(o.textContent||'').trim();}).filter(Boolean));
    Array.from(document.querySelectorAll('#reservasGrid .reserva-card')).forEach(function(card){
      if(!mfActiveAgendaStatus(card.dataset.status))return;
      if(selected&&mfNormAgendaDate(card.dataset.date)!==selected)return;
      var name=String(card.dataset.prof||'').trim();
      if(!name||!activeNames.has(name)){orphanCount++;return;}
      counts[name]=(counts[name]||0)+1;
    });
    Array.from(document.querySelectorAll('#profTabsAgenda .prof-tab')).forEach(function(btn){
      var name=String(btn.dataset.prof||'').trim();
      var value=(name===MF_ORPHAN_PROF||btn.dataset.mfOrphan==='1')?orphanCount:(counts[name]||0);
      var badge=btn.querySelector('.count');
      if(badge&&badge.textContent!==String(value))badge.textContent=String(value);
      var title=value+' agendamento'+(value===1?'':'s')+' ativo'+(value===1?'':'s')+' neste dia';
      if(btn.title!==title)btn.title=title;
    });
    Array.from(document.querySelectorAll('[data-mf-stage1-fixed-professionals] .mf-stage1-fixed-prof')).forEach(function(btn){
      var name=String(btn.dataset.prof||'').trim();
      var value=(name===MF_ORPHAN_PROF||btn.dataset.mfOrphan==='1')?orphanCount:(counts[name]||0);
      var badge=btn.querySelector('b');
      if(badge&&badge.textContent!==String(value))badge.textContent=String(value);
      var title=value+' agendamento'+(value===1?'':'s')+' ativo'+(value===1?'':'s')+' neste dia';
      if(btn.title!==title)btn.title=title;
    });
  }
  window.mfRefreshAgendaProfessionalCounts=mfApplyProfessionalAppointmentCounts;
  document.addEventListener('mf:agenda-updated',mfApplyProfessionalAppointmentCounts);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mfApplyProfessionalAppointmentCounts);
  else setTimeout(mfApplyProfessionalAppointmentCounts,0);

  var isMobileStage1 = window.matchMedia ? window.matchMedia('(max-width: 768px)').matches : window.innerWidth <= 768;
  if(!isMobileStage1) return;
  function qs(s,r){return (r||document).querySelector(s)}
  function qsa(s,r){return Array.from((r||document).querySelectorAll(s))}
  function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function parseIso(v){var p=String(v||'').split('-').map(Number);return p.length===3?new Date(p[0],p[1]-1,p[2]):new Date()}
  function formatTitle(d){return new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(d).replace(/^./,function(c){return c.toUpperCase()})}
  function normCardDate(v){
    v=String(v||'').trim();
    var m=v.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m)return m[1]+'-'+m[2]+'-'+m[3];
    m=v.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);return m?m[3]+'-'+m[2]+'-'+m[1]:v;
  }
  function activeAgendaStatus(v){
    v=String(v||'pendente').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return !['concluida','concluido','finalizada','finalizado','cancelada','cancelado','recusada','recusado','expirada','expirado'].includes(v);
  }

  function currentProfessionalNames(){
    return new Set(qsa('#profissionalAgenda option').map(function(o){return String(o.textContent||'').trim();}).filter(Boolean));
  }
  function isOrphanProfessional(name){
    name=String(name||'').trim();
    return !name||!currentProfessionalNames().has(name);
  }
  function orphanCardsForSelectedDate(){
    var input=qs('#dataAgendaDia');
    var selected=normCardDate(input?input.value:'');
    return qsa('#reservasGrid .reserva-card').filter(function(card){
      return activeAgendaStatus(card.dataset.status)
        && (!selected||normCardDate(card.dataset.date)===selected)
        && isOrphanProfessional(card.dataset.prof);
    });
  }
  function removeOrphanSyntheticSlots(){
    qsa('#agendaGrid .slot[data-mf-orphan-synthetic="1"]').forEach(function(slot){slot.remove();});
  }
  function ensureOrphanSyntheticSlots(){
    var grid=qs('#agendaGrid');
    if(!grid)return;
    var cards=orphanCardsForSelectedDate();
    var wanted={};
    var changed=false;
    cards.forEach(function(card){
      var reservationId=String(card.dataset.id||'').trim();
      if(!reservationId)return;
      wanted[reservationId]=card;
    });
    qsa('#agendaGrid .slot[data-mf-orphan-synthetic="1"]').forEach(function(slot){
      var reservationId=String(slot.dataset.reservationId||'').trim();
      if(!wanted[reservationId]){slot.remove();changed=true;}
    });
    Object.keys(wanted).forEach(function(reservationId){
      var card=wanted[reservationId];
      var slot=qs('#agendaGrid .slot[data-mf-orphan-synthetic="1"][data-reservation-id="'+CSS.escape(reservationId)+'"]');
      var date=normCardDate(card.dataset.date),prof=String(card.dataset.prof||'').trim(),hour=String(card.dataset.hour||'').trim();
      if(!slot){
        slot=document.createElement('div');
        slot.className='slot mf-stage1-orphan-slot';
        slot.dataset.mfOrphanSynthetic='1';
        slot.dataset.reservationId=reservationId;
        slot.dataset.count='1';
        var time=document.createElement('div');time.className='time';
        var chip=document.createElement('span');chip.className='chip';chip.textContent='Agendado';
        var info=document.createElement('p');
        var strong=document.createElement('strong');strong.textContent='Agendamento';
        info.appendChild(strong);info.appendChild(document.createElement('br'));
        info.appendChild(document.createTextNode(prof||'Profissional não informado'));
        slot.appendChild(time);slot.appendChild(chip);slot.appendChild(info);grid.appendChild(slot);changed=true;
      }
      slot.dataset.date=date;
      slot.dataset.prof=prof;
      slot.dataset.hour=hour;
      var timeNode=qs('.time',slot);if(timeNode&&timeNode.textContent!==(hour||'--:--'))timeNode.textContent=hour||'--:--';
    });
    if(changed)document.dispatchEvent(new CustomEvent('mf:agenda-orphan-slots-changed'));
  }
  function applyOrphanProfessionalFilter(){
    ensureOrphanSyntheticSlots();
    var data=normCardDate(qs('#dataAgendaDia')?.value||'');
    var visible=0;
    qsa('#profTabsAgenda .prof-tab').forEach(function(btn){btn.classList.toggle('active',btn.dataset.prof===MF_ORPHAN_PROF);});
    qsa('[data-mf-stage1-fixed-professionals] .mf-stage1-fixed-prof').forEach(function(btn){btn.classList.toggle('is-active',btn.dataset.prof===MF_ORPHAN_PROF);});
    qsa('#agendaGrid .slot').forEach(function(slot){
      var show=slot.dataset.mfOrphanSynthetic==='1'&&normCardDate(slot.dataset.date)===data;
      slot.style.display=show?'':'none';if(show)visible++;
    });
    var empty=qs('#agendaEmpty');
    if(empty){
      if(!empty.dataset.mfOriginalText)empty.dataset.mfOriginalText=empty.textContent||'';
      empty.textContent='Nenhum agendamento sem profissional para esta data.';
      empty.style.display=visible?'none':'block';
    }
    localStorage.setItem('mf_admin_prof_agenda',MF_ORPHAN_PROF);
    return visible;
  }
  function restoreAgendaEmptyText(){
    var empty=qs('#agendaEmpty');
    if(empty&&empty.dataset.mfOriginalText)empty.textContent=empty.dataset.mfOriginalText;
  }
  function createOrphanTab(host,fixed,count){
    if(!host)return null;
    var selector=fixed?'.mf-stage1-fixed-prof[data-mf-orphan="1"]':'.prof-tab[data-mf-orphan="1"]';
    var btn=qs(selector,host);
    if(!btn){
      btn=document.createElement('button');btn.type='button';btn.dataset.prof=MF_ORPHAN_PROF;btn.dataset.mfOrphan='1';
      if(fixed){
        btn.className='mf-stage1-fixed-prof';
        var label=document.createElement('span');label.textContent='Sem profissional';
        var badge=document.createElement('b');badge.textContent=String(count);
        btn.appendChild(label);btn.appendChild(badge);
      }else{
        btn.className='prof-tab';
        btn.appendChild(document.createTextNode('Sem profissional '));
        var badge=document.createElement('span');badge.className='count';badge.textContent=String(count);btn.appendChild(badge);
      }
      host.appendChild(btn);
    }
    var badge=fixed?btn.querySelector('b'):btn.querySelector('.count');
    if(badge&&badge.textContent!==String(count))badge.textContent=String(count);
    btn.title=count+' agendamento'+(count===1?'':'s')+' de profissional removido ou não cadastrado';
    btn.onclick=function(){
      applyOrphanProfessionalFilter();
      syncFixedProfessionals();
      document.dispatchEvent(new CustomEvent('mf:agenda-orphan-selected'));
    };
    return btn;
  }
  function ensureOrphanProfessionalTabs(){
    var count=orphanCardsForSelectedDate().length;
    var originalHost=qs('#profTabsAgenda');
    var fixedHost=qs('[data-mf-stage1-fixed-professionals]');
    if(!count){
      qsa('[data-mf-orphan="1"]').forEach(function(btn){btn.remove();});
      removeOrphanSyntheticSlots();
      if(localStorage.getItem('mf_admin_prof_agenda')===MF_ORPHAN_PROF){
        var first=qs('#profTabsAgenda .prof-tab');
        if(first&&typeof window.setProf==='function')window.setProf(first.dataset.prof);
      }
      return;
    }
    ensureOrphanSyntheticSlots();
    createOrphanTab(originalHost,false,count);
    createOrphanTab(fixedHost,true,count);
    if(localStorage.getItem('mf_admin_prof_agenda')===MF_ORPHAN_PROF)applyOrphanProfessionalFilter();
  }
  function installOrphanProfessionalFilter(){
    if(window.__MF_ORPHAN_FILTER_INSTALLED__)return;
    var tries=0,timer=setInterval(function(){
      tries++;
      if(typeof window.setProf==='function'&&typeof window.filtrarAgenda==='function'){
        var originalSetProf=window.setProf,originalFilter=window.filtrarAgenda;
        window.setProf=function(prof){
          if(prof===MF_ORPHAN_PROF)return applyOrphanProfessionalFilter();
          restoreAgendaEmptyText();
          return originalSetProf.apply(this,arguments);
        };
        window.filtrarAgenda=function(){
          if(localStorage.getItem('mf_admin_prof_agenda')===MF_ORPHAN_PROF)return applyOrphanProfessionalFilter();
          restoreAgendaEmptyText();
          return originalFilter.apply(this,arguments);
        };
        window.__MF_ORPHAN_FILTER_INSTALLED__=true;clearInterval(timer);
      }
      if(tries>60)clearInterval(timer);
    },100);
  }
  window.mfRefreshOrphanProfessionals=function(){ensureOrphanProfessionalTabs();mfApplyProfessionalAppointmentCounts();};
  function agendaDayCounts(){
    var counts={};
    qsa('#reservasGrid .reserva-card').forEach(function(card){
      if(!activeAgendaStatus(card.dataset.status))return;
      var date=normCardDate(card.dataset.date);
      if(date)counts[date]=(counts[date]||0)+1;
    });
    return counts;
  }
  function refreshDayCountBadges(){
    var counts=agendaDayCounts();
    qsa('.mf-stage1-date-day').forEach(function(btn){
      var count=counts[btn.dataset.date]||0;
      var badge=qs('.mf-stage1-day-count',btn);
      if(!count){if(badge)badge.remove();btn.removeAttribute('data-active-count');return;}
      if(!badge){badge=document.createElement('small');badge.className='mf-stage1-day-count';btn.appendChild(badge);}
      badge.textContent=count>99?'99+':String(count);
      btn.dataset.activeCount=String(count);
      btn.setAttribute('aria-label',(btn.textContent||'Dia').replace(/\s+/g,' ').trim()+': '+count+' agendamento'+(count===1?'':'s')+' ativo'+(count===1?'':'s'));
      btn.title=count+' agendamento'+(count===1?'':'s')+' ativo'+(count===1?'':'s');
    });
    mfApplyProfessionalAppointmentCounts();
    ensureOrphanProfessionalTabs();
  }
  window.mfRefreshAgendaDayCounts=refreshDayCountBadges;
  var agendaDateRequest=null;
  function updateDateHeading(value){
    var selected=parseIso(value);
    var title=qs('[data-mf-stage1-date-title]');
    if(title)title.textContent=formatTitle(selected);
    var month=qs('.mf-stage1-date-month');
    if(month)month.textContent=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(selected).replace(/^./,function(c){return c.toUpperCase()});
  }
  function setDateBusy(active){
    var agenda=qs('#agendaDia');
    if(agenda)agenda.classList.toggle('mf-stage1-date-loading',!!active);
    var strip=qs('[data-mf-stage1-date-strip]');
    if(strip)strip.classList.toggle('is-loading',!!active);
  }
  function replaceHtmlFromDocument(doc,id){
    var current=qs('#'+id),incoming=doc.getElementById(id);
    if(current&&incoming)current.innerHTML=incoming.innerHTML;
  }
  async function loadAgendaDate(value){
    var input=qs('#dataAgendaDia');
    if(!input||!value)return;
    if(agendaDateRequest)agendaDateRequest.abort();
    agendaDateRequest=new AbortController();
    input.value=value;
    updateDateHeading(value);
    qsa('.mf-stage1-date-day').forEach(function(btn){btn.classList.toggle('is-active',btn.dataset.date===value)});
    setDateBusy(true);
    var started=Date.now();
    try{
      var url=new URL(window.location.href);
      url.searchParams.set('data',value);
      url.searchParams.set('_mf_mobile',String(Date.now()));
      var response=await fetch(url.toString(),{credentials:'same-origin',signal:agendaDateRequest.signal,headers:{'X-Requested-With':'XMLHttpRequest'}});
      if(!response.ok)throw new Error('Falha ao atualizar a agenda');
      var html=await response.text();
      var doc=new DOMParser().parseFromString(html,'text/html');
      replaceHtmlFromDocument(doc,'agendaGrid');
      replaceHtmlFromDocument(doc,'reservasGrid');
      replaceHtmlFromDocument(doc,'agendaEmpty');
      replaceHtmlFromDocument(doc,'reservasEmpty');
      var incomingInput=doc.getElementById('dataAgendaDia');
      if(incomingInput)input.value=incomingInput.value||value;
      var print=qs('.imprimir-dia-btn'),incomingPrint=doc.querySelector('.imprimir-dia-btn');
      if(print&&incomingPrint)print.href=incomingPrint.href;
      url.searchParams.delete('_mf_mobile'); window.history.replaceState({},'',url.pathname+url.search);
      buildDates(false);
      ensureFixedProfessionals();
      if(typeof window.contarAgenda==='function')window.contarAgenda();
      if(typeof window.filtrarAgenda==='function')window.filtrarAgenda();
      if(typeof window.contarAgendamentos==='function')window.contarAgendamentos();
      var activeStatus=qs('#statusTabs .tab.active');
      if(activeStatus&&typeof window.filtrarAgendamentos==='function')window.filtrarAgendamentos(activeStatus.dataset.status||'todas');
      ensureOrphanProfessionalTabs();
      syncFixedProfessionals();
      refreshDayCountBadges();
      document.dispatchEvent(new CustomEvent('mf:agenda-updated',{detail:{date:value}}));
    }catch(err){
      if(err&&err.name==='AbortError')return;
      var form=qs('#formDataAgenda');
      if(form){form.removeAttribute('onsubmit');form.submit();}
      return;
    }finally{
      var wait=Math.max(0,180-(Date.now()-started));
      setTimeout(function(){setDateBusy(false)},wait);
    }
  }
  window.mfLoadAgendaDate=loadAgendaDate;
  function buildDates(centerSelected){
    var host=qs('[data-mf-stage1-date-strip]'),input=qs('#dataAgendaDia'); if(!host||!input)return;
    var selected=parseIso(input.value),start=new Date(selected);start.setDate(selected.getDate()-7);
    host.innerHTML='';
    var month=document.createElement('div');month.className='mf-stage1-date-month';month.textContent=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(selected).replace(/^./,function(c){return c.toUpperCase()});host.appendChild(month);
    var days=document.createElement('div');days.className='mf-stage1-date-days';days.setAttribute('role','list');
    for(var i=0;i<15;i++){
      var d=new Date(start);d.setDate(start.getDate()+i);var value=iso(d);var btn=document.createElement('button');btn.type='button';btn.dataset.date=value;btn.className='mf-stage1-date-day'+(value===input.value?' is-active':'');btn.setAttribute('role','listitem');btn.innerHTML='<span>'+new Intl.DateTimeFormat('pt-BR',{weekday:'short'}).format(d).replace('.','')+'</span><strong>'+d.getDate()+'</strong>';
      var dayCount=agendaDayCounts()[value]||0;if(dayCount){var badge=document.createElement('small');badge.className='mf-stage1-day-count';badge.textContent=dayCount>99?'99+':String(dayCount);btn.dataset.activeCount=String(dayCount);btn.appendChild(badge);btn.title=dayCount+' agendamento'+(dayCount===1?'':'s')+' ativo'+(dayCount===1?'':'s');}
      (function(dateValue){btn.addEventListener('click',function(){if(input.value===dateValue)return;loadAgendaDate(dateValue)})})(value);days.appendChild(btn)
    }
    host.appendChild(days);updateDateHeading(input.value);refreshDayCountBadges();
    requestAnimationFrame(function(){
      var active=qs('.mf-stage1-date-day.is-active',days);
      if(active&&(centerSelected!==false||!days.dataset.initialized))active.scrollIntoView({behavior:'auto',block:'nearest',inline:'center'});
      days.dataset.initialized='1';
    });
  }


  function ensureFixedProfessionals(){
    var agenda=qs('#agendaDia');
    if(!agenda)return;
    var tabs=qs('#profTabsAgenda');
    if(!tabs){
      tabs=document.createElement('div');
      tabs.id='profTabsAgenda';
      tabs.className='prof-tabs agenda-profissionais-fixa';
      var body=qs('.card-body',agenda);
      agenda.insertBefore(tabs,body||null);
    }
    var select=qs('#profissionalAgenda');
    var names=select?qsa('option',select).map(function(o){return String(o.textContent||'').trim()}).filter(Boolean):[];
    var existing={};
    qsa('.prof-tab',tabs).forEach(function(b){existing[b.dataset.prof]=b});
    names.forEach(function(name){
      if(existing[name])return;
      var b=document.createElement('button');
      b.type='button';b.className='prof-tab';b.dataset.prof=name;
      b.appendChild(document.createTextNode(name+' '));
      var c=document.createElement('span');c.className='count';c.textContent='0';b.appendChild(c);
      tabs.appendChild(b);existing[name]=b;
    });
    qsa('.prof-tab',tabs).forEach(function(b){
      b.onclick=function(){if(typeof window.setProf==='function')window.setProf(b.dataset.prof)};
    });
    var saved=localStorage.getItem('mf_admin_prof_agenda');
    var active=qsa('.prof-tab',tabs).find(function(b){return b.dataset.prof===saved})||qs('.prof-tab',tabs);
    if(!qs('.prof-tab.active',tabs)&&active)active.classList.add('active');
    tabs.style.display='flex';tabs.style.visibility='visible';tabs.style.opacity='1';
    if(typeof window.contarAgenda==='function')window.contarAgenda();
    if(typeof window.filtrarAgenda==='function')window.filtrarAgenda();
    mfApplyProfessionalAppointmentCounts();
    ensureOrphanProfessionalTabs();
  }

  function syncFixedProfessionals(){
    var fixed=qsa('[data-mf-stage1-fixed-professionals] .mf-stage1-fixed-prof');
    if(!fixed.length)return;
    var original=qsa('#profTabsAgenda .prof-tab');
    var activeOriginal=qs('#profTabsAgenda .prof-tab.active');
    var saved=localStorage.getItem('mf_admin_prof_agenda')||'';
    var activeName=activeOriginal?activeOriginal.dataset.prof:saved;
    if(!activeName&&fixed[0])activeName=fixed[0].dataset.prof;
    fixed.forEach(function(btn){
      var name=btn.dataset.prof||'';
      var source=original.find(function(o){return o.dataset.prof===name});
      var count=source&&source.querySelector('.count')?source.querySelector('.count').textContent:'0';
      var badge=btn.querySelector('b');var nextCount=count||'0';if(badge&&badge.textContent!==nextCount)badge.textContent=nextCount;
      btn.classList.toggle('is-active',name===activeName);
      btn.onclick=function(){
        if(typeof window.setProf==='function')window.setProf(name);
        else {
          original.forEach(function(o){o.classList.toggle('active',o.dataset.prof===name)});
          localStorage.setItem('mf_admin_prof_agenda',name);
        }
        syncFixedProfessionals();
      };
    });
  }


  /* v76 — data completa clicável com calendário mensal azul */
  function ensureAgendaCalendarPicker(){
    if(window.matchMedia && !window.matchMedia('(max-width: 768px)').matches)return;
    var heading=qs('.mf-stage1-date-title');
    var input=qs('#dataAgendaDia');
    if(!heading||!input||heading.dataset.mfCalendarReady==='1')return;
    heading.dataset.mfCalendarReady='1';
    var oldButton=qs('[data-mf-stage1-open-picker]',heading);
    if(oldButton)oldButton.remove();
    heading.classList.add('mf-stage1-calendar-trigger');
    heading.setAttribute('role','button');
    heading.setAttribute('tabindex','0');
    heading.setAttribute('aria-haspopup','dialog');
    heading.setAttribute('aria-label','Abrir calendário para escolher a data');
    var icon=document.createElement('span');
    icon.className='mf-stage1-calendar-trigger-icon';
    icon.setAttribute('aria-hidden','true');
    icon.innerHTML='<i class="fa-regular fa-calendar"></i>';
    heading.appendChild(icon);

    var overlay=document.createElement('div');
    overlay.className='mf-stage1-calendar-modal';
    overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML=''
      +'<section class="mf-stage1-calendar-card" role="dialog" aria-modal="true" aria-label="Escolher data">'
      +  '<header class="mf-stage1-calendar-head">'
      +    '<div><small>Selecionar data</small><strong data-mf-calendar-month>Calendário</strong></div>'
      +    '<button type="button" data-mf-calendar-close aria-label="Fechar calendário"><i class="fa-solid fa-xmark"></i></button>'
      +  '</header>'
      +  '<div class="mf-stage1-calendar-nav">'
      +    '<button type="button" data-mf-calendar-prev aria-label="Mês anterior"><i class="fa-solid fa-chevron-left"></i></button>'
      +    '<strong data-mf-calendar-caption></strong>'
      +    '<button type="button" data-mf-calendar-next aria-label="Próximo mês"><i class="fa-solid fa-chevron-right"></i></button>'
      +  '</div>'
      +  '<div class="mf-stage1-calendar-weekdays" aria-hidden="true"><span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span></div>'
      +  '<div class="mf-stage1-calendar-days" data-mf-calendar-days></div>'
      +  '<footer class="mf-stage1-calendar-foot">'
      +    '<button type="button" data-mf-calendar-today><i class="fa-regular fa-calendar-check"></i>Hoje</button>'
      +    '<button type="button" data-mf-calendar-cancel>Fechar</button>'
      +  '</footer>'
      +'</section>';
    document.body.appendChild(overlay);

    var viewDate=parseIso(input.value);
    viewDate=new Date(viewDate.getFullYear(),viewDate.getMonth(),1);
    var lastFocused=null;

    function renderAgendaCalendar(){
      var selected=parseIso(input.value);
      var caption=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(viewDate).replace(/^./,function(c){return c.toUpperCase()});
      var monthTitle=qs('[data-mf-calendar-month]',overlay);
      var monthCaption=qs('[data-mf-calendar-caption]',overlay);
      if(monthTitle)monthTitle.textContent=caption;
      if(monthCaption)monthCaption.textContent=caption;
      var grid=qs('[data-mf-calendar-days]',overlay);
      if(!grid)return;
      grid.innerHTML='';
      var first=new Date(viewDate.getFullYear(),viewDate.getMonth(),1);
      var start=new Date(first);
      start.setDate(first.getDate()-first.getDay());
      var today=new Date();
      var todayValue=iso(today);
      var selectedValue=iso(selected);
      for(var i=0;i<42;i++){
        var d=new Date(start);
        d.setDate(start.getDate()+i);
        var value=iso(d);
        var btn=document.createElement('button');
        btn.type='button';
        btn.className='mf-stage1-calendar-day';
        if(d.getMonth()!==viewDate.getMonth())btn.classList.add('is-other-month');
        if(value===selectedValue)btn.classList.add('is-selected');
        if(value===todayValue)btn.classList.add('is-today');
        btn.dataset.date=value;
        btn.textContent=String(d.getDate());
        btn.setAttribute('aria-label',formatTitle(d));
        if(value===selectedValue)btn.setAttribute('aria-current','date');
        btn.addEventListener('click',function(){
          var value=this.dataset.date;
          closeAgendaCalendar();
          if(input.value!==value)loadAgendaDate(value);
        });
        grid.appendChild(btn);
      }
    }

    function openAgendaCalendar(){
      lastFocused=document.activeElement;
      var selected=parseIso(input.value);
      viewDate=new Date(selected.getFullYear(),selected.getMonth(),1);
      renderAgendaCalendar();
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden','false');
      document.body.classList.add('mf-stage1-calendar-open');
      var close=qs('[data-mf-calendar-close]',overlay);
      if(close)setTimeout(function(){close.focus()},20);
    }

    function closeAgendaCalendar(){
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden','true');
      document.body.classList.remove('mf-stage1-calendar-open');
      if(lastFocused&&typeof lastFocused.focus==='function')lastFocused.focus();
    }

    heading.addEventListener('click',openAgendaCalendar);
    heading.addEventListener('keydown',function(e){
      if(e.key==='Enter'||e.key===' '){e.preventDefault();openAgendaCalendar();}
    });
    qs('[data-mf-calendar-close]',overlay).addEventListener('click',closeAgendaCalendar);
    qs('[data-mf-calendar-cancel]',overlay).addEventListener('click',closeAgendaCalendar);
    qs('[data-mf-calendar-prev]',overlay).addEventListener('click',function(){viewDate.setMonth(viewDate.getMonth()-1);renderAgendaCalendar();});
    qs('[data-mf-calendar-next]',overlay).addEventListener('click',function(){viewDate.setMonth(viewDate.getMonth()+1);renderAgendaCalendar();});
    qs('[data-mf-calendar-today]',overlay).addEventListener('click',function(){
      var value=iso(new Date());
      closeAgendaCalendar();
      if(input.value!==value)loadAgendaDate(value);
    });
    overlay.addEventListener('click',function(e){if(e.target===overlay)closeAgendaCalendar();});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&overlay.classList.contains('is-open'))closeAgendaCalendar();});
  }

  function showAgenda(){document.body.classList.remove('mf-stage1-setup-open','mf-stage1-history-open');var c=qs('#agendaDia');if(c){c.classList.remove('collapsed');var b=qs('.card-body',c);if(b)b.style.display=''}window.scrollTo({top:0,behavior:'smooth'})}
  function showSetup(){document.body.classList.remove('mf-stage1-history-open');document.body.classList.add('mf-stage1-setup-open');var c=qs('#setupCard');if(c){c.classList.remove('collapsed');var b=qs('.card-body',c);if(b)b.style.display='block'}window.scrollTo({top:0,behavior:'smooth'})}
  function showHistory(){document.body.classList.remove('mf-stage1-setup-open');document.body.classList.add('mf-stage1-history-open');window.scrollTo({top:0,behavior:'smooth'})}
  document.addEventListener('DOMContentLoaded',function(){
    buildDates();
    var agendaInput=qs('#dataAgendaDia');
    if(agendaInput){
      agendaInput.removeAttribute('onchange');
      agendaInput.onchange=null;
      agendaInput.addEventListener('change',function(e){e.preventDefault();e.stopImmediatePropagation();loadAgendaDate(agendaInput.value)},true);
    }
    installOrphanProfessionalFilter();
    ensureFixedProfessionals();
    ensureOrphanProfessionalTabs();
    mfApplyProfessionalAppointmentCounts();
    syncFixedProfessionals();
    setTimeout(function(){ensureFixedProfessionals();ensureOrphanProfessionalTabs();mfApplyProfessionalAppointmentCounts();syncFixedProfessionals();document.dispatchEvent(new CustomEvent('mf:agenda-updated',{detail:{orphanInit:true}}));},250);
    ensureAgendaCalendarPicker();
    var wrap=qs('[data-mf-stage1-fab-wrap]'),fab=qs('[data-mf-stage1-fab]');if(fab&&wrap)fab.addEventListener('click',function(){wrap.classList.toggle('is-open')});
    qsa('[data-mf-stage1-action]').forEach(function(btn){btn.addEventListener('click',function(){if(wrap)wrap.classList.remove('is-open');var a=btn.dataset.mfStage1Action;if(a==='setup')showSetup();else if(a==='history')showHistory();else showAgenda()})});
    var profSource=qs('#profTabsAgenda');
    if(profSource){
      var profSyncQueued=false;
      new MutationObserver(function(){
        if(profSyncQueued)return;
        profSyncQueued=true;
        requestAnimationFrame(function(){
          profSyncQueued=false;
          ensureFixedProfessionals();
          ensureOrphanProfessionalTabs();
          mfApplyProfessionalAppointmentCounts();
          syncFixedProfessionals();
        });
      }).observe(profSource,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    }
    var more=qs('[data-mf-stage1-more]'),sheet=qs('[data-mf-stage1-more-sheet]'),close=qs('[data-mf-stage1-more-close]');if(more&&sheet)more.addEventListener('click',function(){sheet.classList.add('is-open')});if(close&&sheet)close.addEventListener('click',function(){sheet.classList.remove('is-open')});if(sheet)sheet.addEventListener('click',function(e){if(e.target===sheet)sheet.classList.remove('is-open')});
    document.addEventListener('mf:agenda-updated',function(){ensureOrphanProfessionalTabs();refreshDayCountBadges();});
    setTimeout(refreshDayCountBadges,300);
  });
})();
