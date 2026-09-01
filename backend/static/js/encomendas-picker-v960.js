(function(){
  'use strict';
  var activePopover=null;
  var controls=[];
  var monthNames=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  var weekNames=['D','S','T','Q','Q','S','S'];
  function q(s,r){return (r||document).querySelector(s)}
  function pad(n){return String(n).padStart(2,'0')}
  function ymd(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
  function parseYmd(v){var m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12,0,0,0):null}
  function sameMonth(a,b){return !!(a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth())}
  function labelDate(v){var d=parseYmd(v);return d?pad(d.getDate())+'/'+pad(d.getMonth()+1)+'/'+d.getFullYear():'Escolher data'}
  function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
  function closePopover(pop){if(!pop)return;pop.classList.remove('open');var owner=pop.__owner;if(owner)owner.setAttribute('aria-expanded','false');if(activePopover===pop)activePopover=null}
  function positionPopover(pop,owner){
    if(!pop||!owner)return;
    if(window.innerWidth<=720){pop.style.left='50%';pop.style.top='50%';return}
    pop.style.left='0px';pop.style.top='0px';
    var r=owner.getBoundingClientRect(),w=pop.offsetWidth||286,h=pop.offsetHeight||280;
    var left=clamp(r.left,12,Math.max(12,window.innerWidth-w-12));
    var top=r.bottom+7;
    if(top+h>window.innerHeight-12)top=Math.max(12,r.top-h-7);
    pop.style.left=Math.round(left)+'px';pop.style.top=Math.round(top)+'px';
  }
  function openPopover(pop,owner){
    if(activePopover&&activePopover!==pop)closePopover(activePopover);
    pop.__owner=owner;pop.classList.add('open');owner.setAttribute('aria-expanded','true');activePopover=pop;
    requestAnimationFrame(function(){positionPopover(pop,owner)});
  }
  function floatPopover(pop){if(pop&&pop.parentNode!==document.body)document.body.appendChild(pop)}
  function setupDate(nativeId,buttonId,popId){
    var input=document.getElementById(nativeId),button=document.getElementById(buttonId),pop=document.getElementById(popId);if(!input||!button||!pop)return null;
    /* V960 — no calendário público de encomenda, datas futuras não têm limite máximo. */
    if(nativeId==='encModalDate')input.removeAttribute('max');
    floatPopover(pop);
    var valueNode=q('.mf-picker-value',button),view=parseYmd(input.value)||parseYmd(input.min)||new Date();
    function syncButton(){if(valueNode)valueNode.textContent=labelDate(input.value)}
    function within(v){if(input.min&&v<input.min)return false;if(input.max&&v>input.max)return false;return true}
    function normalizeView(){
      var selected=parseYmd(input.value),min=parseYmd(input.min),max=parseYmd(input.max);
      if(selected)view=new Date(selected.getFullYear(),selected.getMonth(),1,12);
      else if(min)view=new Date(min.getFullYear(),min.getMonth(),1,12);
      if(min&&new Date(view.getFullYear(),view.getMonth()+1,0,12)<min)view=new Date(min.getFullYear(),min.getMonth(),1,12);
      if(max&&new Date(view.getFullYear(),view.getMonth(),1,12)>max)view=new Date(max.getFullYear(),max.getMonth(),1,12);
    }
    function monthAllowed(year,month){
      var first=new Date(year,month,1,12),last=new Date(year,month+1,0,12),min=parseYmd(input.min),max=parseYmd(input.max);
      if(min&&last<min)return false;if(max&&first>max)return false;return true;
    }
    function render(){
      /* V960 — não recentralizar no mês selecionado durante navegação.
         normalizeView() já roda ao ABRIR o calendário; depois as setas ficam livres. */
      var selected=parseYmd(input.value),today=new Date(),min=parseYmd(input.min),max=parseYmd(input.max);
      var year=view.getFullYear(),month=view.getMonth(),daysInMonth=new Date(year,month+1,0,12).getDate();
      var startDay=1,endDay=daysInMonth;
      /* No menu público, começa no primeiro dia realmente permitido (ex.: 12) e não desenha os dias anteriores. */
      if(nativeId==='encModalDate'&&min&&sameMonth(min,view))startDay=min.getDate();
      if(max&&sameMonth(max,view))endDay=Math.min(endDay,max.getDate());
      var startDate=new Date(year,month,startDay,12),leading=startDate.getDay();
      var prevYear=month===0?year-1:year,prevMonth=month===0?11:month-1,nextYear=month===11?year+1:year,nextMonth=month===11?0:month+1;
      var html='<div class="mf-picker-calendar-head"><button type="button" class="mf-picker-nav" data-mf-cal-prev aria-label="Mês anterior"'+(monthAllowed(prevYear,prevMonth)?'':' disabled')+'><i class="fa-solid fa-chevron-left"></i></button><div class="mf-picker-month">'+monthNames[month]+' de '+year+'</div><button type="button" class="mf-picker-nav" data-mf-cal-next aria-label="Próximo mês"'+(monthAllowed(nextYear,nextMonth)?'':' disabled')+'><i class="fa-solid fa-chevron-right"></i></button></div>';
      html+='<div class="mf-picker-week">'+weekNames.map(function(w){return '<span>'+w+'</span>'}).join('')+'</div><div class="mf-picker-days">';
      for(var b=0;b<leading;b++)html+='<span class="mf-picker-blank" aria-hidden="true"></span>';
      for(var day=startDay;day<=endDay;day++){
        var d=new Date(year,month,day,12),v=ymd(d),cls='mf-picker-day';
        if(ymd(today)===v)cls+=' today';if(selected&&ymd(selected)===v)cls+=' selected';
        html+='<button type="button" class="'+cls+'" data-mf-day="'+v+'"'+(within(v)?'':' disabled')+'>'+day+'</button>';
      }
      html+='</div><div class="mf-picker-calendar-foot"><button type="button" class="mf-picker-link" data-mf-cal-clear>Limpar</button><button type="button" class="mf-picker-link" data-mf-cal-today'+(within(ymd(new Date()))?'':' disabled')+'>Hoje</button></div>';
      pop.innerHTML=html;
      requestAnimationFrame(function(){if(pop.classList.contains('open'))positionPopover(pop,button)});
    }
    button.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();normalizeView();render();pop.classList.contains('open')?closePopover(pop):openPopover(pop,button)});
    pop.addEventListener('click',function(e){
      var prev=e.target.closest('[data-mf-cal-prev]'),next=e.target.closest('[data-mf-cal-next]'),day=e.target.closest('[data-mf-day]'),today=e.target.closest('[data-mf-cal-today]'),clear=e.target.closest('[data-mf-cal-clear]');
      if(prev&&!prev.disabled){view=new Date(view.getFullYear(),view.getMonth()-1,1,12);render();return}
      if(next&&!next.disabled){view=new Date(view.getFullYear(),view.getMonth()+1,1,12);render();return}
      if(today&&!today.disabled){var v=ymd(new Date());input.value=v;input.dispatchEvent(new Event('change',{bubbles:true}));syncButton();closePopover(pop);return}
      if(clear){input.value='';input.dispatchEvent(new Event('change',{bubbles:true}));syncButton();closePopover(pop);return}
      if(day&&!day.disabled){input.value=day.dataset.mfDay||'';input.dispatchEvent(new Event('change',{bubbles:true}));syncButton();closePopover(pop)}
    });
    input.addEventListener('change',syncButton);input.addEventListener('input',syncButton);
    syncButton();return {sync:syncButton,render:render,pop:pop,button:button};
  }
  function setupTime(selectId,buttonId,popId){
    var select=document.getElementById(selectId),button=document.getElementById(buttonId),pop=document.getElementById(popId);if(!select||!button||!pop)return null;
    floatPopover(pop);
    var valueNode=q('.mf-picker-value',button);
    function syncButton(){var op=select.options[select.selectedIndex];if(valueNode)valueNode.textContent=(op&&op.value)?op.textContent:'Escolher horário'}
    function render(){
      var options=Array.from(select.options||[]),usable=options.filter(function(op){return !!op.value});
      if(!usable.length){pop.innerHTML='<div class="mf-time-list"><div class="mf-time-option empty">Sem horários disponíveis</div></div>';return}
      pop.innerHTML='<div class="mf-time-list">'+usable.map(function(op){return '<button type="button" class="mf-time-option'+(op.value===select.value?' selected':'')+'" data-mf-time="'+op.value+'">'+op.textContent+'</button>'}).join('')+'</div>';
      requestAnimationFrame(function(){if(pop.classList.contains('open'))positionPopover(pop,button)});
    }
    button.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();render();pop.classList.contains('open')?closePopover(pop):openPopover(pop,button)});
    pop.addEventListener('click',function(e){var item=e.target.closest('[data-mf-time]');if(!item)return;select.value=item.dataset.mfTime||'';select.dispatchEvent(new Event('change',{bubbles:true}));syncButton();closePopover(pop)});
    select.addEventListener('change',syncButton);
    new MutationObserver(function(){setTimeout(function(){syncButton();if(pop.classList.contains('open'))render()},0)}).observe(select,{childList:true,subtree:true});
    syncButton();return {sync:syncButton,render:render,pop:pop,button:button};
  }
  controls=[
    setupDate('encModalDate','encModalDateButton','encModalCalendar'),
    setupTime('encModalTime','encModalTimeButton','encModalTimeList'),
    setupDate('encDateFrom','encDateFromButton','encDateFromCalendar'),
    setupDate('encDateTo','encDateToButton','encDateToCalendar')
  ].filter(Boolean);
  function syncAll(){controls.forEach(function(c){if(c&&c.sync)c.sync()})}
  document.addEventListener('click',function(e){
    if(e.target.closest('[data-enc-period]'))setTimeout(syncAll,0);
    if(activePopover&&!activePopover.contains(e.target)&&!(activePopover.__owner&&activePopover.__owner.contains(e.target)))closePopover(activePopover);
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&activePopover)closePopover(activePopover)});
  var modal=document.getElementById('encProductModalBackdrop');if(modal)new MutationObserver(function(){setTimeout(syncAll,20)}).observe(modal,{attributes:true,attributeFilter:['class','aria-hidden']});
  window.addEventListener('resize',function(){if(activePopover)positionPopover(activePopover,activePopover.__owner)});
  window.addEventListener('scroll',function(){if(activePopover&&window.innerWidth>720)positionPopover(activePopover,activePopover.__owner)},{passive:true});
})();
