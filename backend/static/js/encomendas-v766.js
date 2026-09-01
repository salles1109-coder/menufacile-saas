(function(){
  'use strict';
  function q(s,r){return (r||document).querySelector(s)}
  function qa(s,r){return Array.from((r||document).querySelectorAll(s))}
  function toast(text){var el=q('#encToast');if(!el)return;el.textContent=text;el.classList.add('show');clearTimeout(el.__timer);el.__timer=setTimeout(function(){el.classList.remove('show')},1900)}
  function euro(value){var n=Number(value||0);return '€ '+n.toFixed(2).replace('.',',')}

  // Central de Encomendas: v832 — filtro por período + impressão operacional.
  var fsTarget=q('.enc-page');
  var activeStatus='nova';
  var selectedStart='';
  var selectedEnd='';
  function todayIso(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function readActiveStatus(){var current=q('[data-enc-status-filter].active',fsTarget);activeStatus=current&&current.dataset?current.dataset.encStatusFilter:'nova'}
  function cardMatchesDate(card){var value=String(card.dataset.encDate||'');if(!value)return !(selectedStart||selectedEnd);if(selectedStart&&value<selectedStart)return false;if(selectedEnd&&value>selectedEnd)return false;return true}
  function applyCentralStatus(){
    if(!fsTarget)return;
    qa('[data-enc-status-filter]',fsTarget).forEach(function(btn){var on=btn.dataset.encStatusFilter===activeStatus;btn.classList.toggle('active',on);btn.setAttribute('aria-selected',on?'true':'false')});
    qa('[data-enc-status-panel]',fsTarget).forEach(function(panel){
      var kind=panel.dataset.encStatusPanel||'';
      var showPanel=(kind===activeStatus)||(kind==='fluxo'&&['confirmada','producao','pronta','finalizada'].includes(activeStatus));
      panel.hidden=!showPanel;
      if(!showPanel)return;
      if(kind==='fluxo'){
        var flowCopy={confirmada:['Confirmadas','Programadas e prontas para iniciar'],producao:['Em produção','Equipe preparando agora'],pronta:['Prontas','Aguardando retirada ou entrega'],finalizada:['Finalizadas','Encomendas concluídas']};
        var copy=flowCopy[activeStatus]||['Acompanhamento',''];
        var title=q('[data-enc-flow-title]',panel),subtitle=q('[data-enc-flow-subtitle]',panel);if(title)title.textContent=copy[0];if(subtitle)subtitle.textContent=copy[1];
        qa('[data-enc-status-card]',panel).forEach(function(card){card.hidden=card.dataset.encStatusCard!==activeStatus||!cardMatchesDate(card)});
        qa('[data-enc-flow-day]',panel).forEach(function(day){day.hidden=!qa('[data-enc-status-card]',day).some(function(card){return !card.hidden})});
      }else{
        qa('[data-enc-order]',panel).forEach(function(card){card.hidden=!cardMatchesDate(card)});
      }
      if(kind==='cancelada'&&panel.tagName==='DETAILS')panel.open=true;
    });
  }
  function formatDatePtBr(value){if(!value)return '';var p=value.split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:value}
  function syncRangeUi(){
    if(!fsTarget)return;
    var from=q('#encDateFrom',fsTarget),to=q('#encDateTo',fsTarget);
    if(from&&from.value!==selectedStart)from.value=selectedStart;
    if(to&&to.value!==selectedEnd)to.value=selectedEnd;
    var today=todayIso(),todayBtn=q('[data-enc-period="today"]',fsTarget);
    var isToday=selectedStart===today&&selectedEnd===today;
    if(todayBtn)todayBtn.classList.toggle('active',isToday);
    var label=q('[data-enc-range-label]',fsTarget);
    if(label){var text=isToday?'Hoje':(selectedStart&&selectedEnd?(formatDatePtBr(selectedStart)+' até '+formatDatePtBr(selectedEnd)):(selectedStart?('A partir de '+formatDatePtBr(selectedStart)):(selectedEnd?('Até '+formatDatePtBr(selectedEnd)):'Todos')));label.innerHTML='<i class="fa-regular fa-calendar"></i> '+text}
  }
  function setTodayRange(){selectedStart=todayIso();selectedEnd=selectedStart;syncRangeUi();applyCentralStatus()}
  function escapeHtml(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]})}
  function orderPrintData(card){
    var items=qa('.enc-product-line',card).map(function(line){var a=q('strong',line),b=q('span',line);return {nome:a?a.textContent.trim():'',detalhe:b?b.textContent.trim():''}});
    var obs=q('.enc-personalization',card),total=q('.enc-payment>div:first-child strong',card),pay=q('.enc-finance-chip',card);
    return {date:String(card.dataset.encDate||''),time:String(card.dataset.encTime||''),status:String(card.dataset.encStatus||''),number:String(card.dataset.encNumber||''),client:String(card.dataset.encClient||''),phone:String(card.dataset.encPhone||''),kind:String(card.dataset.encKind||''),address:String(card.dataset.encAddress||''),items:items,obs:obs?obs.textContent.trim():'',total:total?total.textContent.trim():'',payment:pay?pay.textContent.trim():''}
  }
  function printSelectedOrders(){
    if(!fsTarget)return;
    var cards=qa('[data-enc-order]',fsTarget).filter(function(card){return cardMatchesDate(card)&&String(card.dataset.encStatus||'')!=='cancelada'});
    var seen={};var orders=[];cards.forEach(function(card){var d=orderPrintData(card);var key=d.number+'|'+d.date+'|'+d.time;if(seen[key])return;seen[key]=1;orders.push(d)});
    orders.sort(function(a,b){return (a.date+' '+a.time).localeCompare(b.date+' '+b.time)});
    if(!orders.length){toast('Nenhuma encomenda encontrada nesse período.');return}
    var company=String(fsTarget.dataset.encCompany||'MenuFacile');
    var period=selectedStart===selectedEnd?formatDatePtBr(selectedStart):(formatDatePtBr(selectedStart)+' até '+formatDatePtBr(selectedEnd));
    var statusLabel={nova:'Nova',confirmada:'Confirmada',producao:'Em produção',pronta:'Pronta',finalizada:'Finalizada'};
    var blocks=orders.map(function(o){
      var isDelivery=(o.kind||'').toLowerCase().indexOf('entrega')>=0;
      var itemHtml=o.items.map(function(item){return '<li><strong>'+escapeHtml(item.nome)+'</strong>'+(item.detalhe?'<span>'+escapeHtml(item.detalhe)+'</span>':'')+'</li>'}).join('');
      return '<article class="order"><div class="order-head"><div><small>PEDIDO</small><h2>#'+escapeHtml(o.number)+' · '+escapeHtml(o.client)+'</h2></div><div class="badge '+(isDelivery?'delivery':'pickup')+'">'+escapeHtml(o.kind||'Retirada')+'</div></div>'+
        '<div class="meta"><div><small>Data / hora</small><strong>'+escapeHtml(formatDatePtBr(o.date))+' · '+escapeHtml(o.time)+'</strong></div><div><small>Status</small><strong>'+escapeHtml(statusLabel[o.status]||o.status)+'</strong></div><div><small>Telefone</small><strong>'+escapeHtml(o.phone||'—')+'</strong></div></div>'+
        (isDelivery?'<div class="address"><small>ENDEREÇO DE ENTREGA</small><strong>'+escapeHtml(o.address||'Endereço não informado')+'</strong></div>':'')+
        '<ul class="items">'+itemHtml+'</ul>'+(o.obs?'<div class="obs"><small>OBSERVAÇÃO / PERSONALIZAÇÃO</small><p>'+escapeHtml(o.obs)+'</p></div>':'')+
        '<div class="finance"><span><small>Total</small><strong>'+escapeHtml(o.total||'—')+'</strong></span><span><small>Pagamento</small><strong>'+escapeHtml(o.payment||'—')+'</strong></span></div></article>'
    }).join('');
    var win=window.open('','_blank');if(!win){toast('O navegador bloqueou a janela de impressão.');return}
    win.document.open();win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Encomendas - '+escapeHtml(period)+'</title><style>@page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#172033;background:#fff}.sheet-head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;padding:0 0 12px;border-bottom:2px solid #172033;margin-bottom:14px}.sheet-head h1{font-size:20px;margin:0}.sheet-head p{margin:4px 0 0;color:#667085;font-size:11px}.sheet-head strong{font-size:12px}.order{break-inside:avoid;border:1px solid #d7dde5;border-radius:10px;padding:12px;margin:0 0 12px}.order-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.order small{display:block;color:#667085;font-size:8px;font-weight:700;letter-spacing:.05em}.order h2{font-size:15px;margin:2px 0 0}.badge{padding:6px 9px;border-radius:999px;font-size:9px;font-weight:800}.badge.delivery{background:#eef4ff;color:#175cd3}.badge.pickup{background:#ecfdf3;color:#067647}.meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px}.meta>div,.address{padding:8px;background:#f8fafc;border-radius:7px}.meta strong,.address strong{display:block;margin-top:3px;font-size:10px}.address{margin-top:8px;background:#fff7ed;border:1px solid #fed7aa}.items{list-style:none;margin:10px 0 0;padding:0;border-top:1px solid #e5e7eb}.items li{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #eef0f3;font-size:10px}.items li span{color:#667085;text-align:right}.obs{margin-top:9px;padding:8px;border-left:3px solid #f59e0b;background:#fffbeb}.obs p{font-size:10px;margin:3px 0 0}.finance{display:flex;justify-content:flex-end;gap:24px;margin-top:10px}.finance span{text-align:right}.finance strong{display:block;font-size:11px;margin-top:2px}@media print{.no-print{display:none}}</style></head><body><header class="sheet-head"><div><h1>'+escapeHtml(company)+'</h1><p>Encomendas detalhadas para produção / retirada / entrega</p></div><div><small>PERÍODO</small><strong>'+escapeHtml(period)+'</strong></div></header>'+blocks+'<script>window.onload=function(){window.print()}<\/script></body></html>');win.document.close()
  }
  function closeStatusMenus(except){
    if(!fsTarget)return;
    qa('[data-enc-status-menu]',fsTarget).forEach(function(menu){if(menu!==except)menu.hidden=true});
    qa('[data-enc-status-trigger]',fsTarget).forEach(function(btn){var wrapper=btn.closest('[data-enc-status-quick]'),menu=wrapper?q('[data-enc-status-menu]',wrapper):null;btn.setAttribute('aria-expanded',menu&&!menu.hidden?'true':'false')});
  }
  function fullscreenOn(){return !!(fsTarget&&(document.fullscreenElement===fsTarget||fsTarget.classList.contains('enc-focus-mode')))}
  function syncFullscreenButton(){var fsBtn=q('[data-enc-fullscreen]',fsTarget);if(!fsBtn)return;var on=fullscreenOn();var icon=q('i',fsBtn),label=q('span',fsBtn);if(icon)icon.className='fa-solid '+(on?'fa-compress':'fa-expand');if(label)label.textContent=on?'Sair da tela cheia':'Tela cheia';fsBtn.setAttribute('aria-label',on?'Sair da tela cheia':'Abrir Central em tela cheia')}
  function toggleFocusFallback(){if(!fsTarget)return;var on=fsTarget.classList.toggle('enc-focus-mode');document.body.style.overflow=on?'hidden':'';syncFullscreenButton()}
  function statusPanelSelector(status){return '[data-enc-status-panel="'+(['confirmada','producao','pronta','finalizada'].includes(status)?'fluxo':status)+'"]'}
  function scrollToActivePanel(){if(!fsTarget)return;var target=q(statusPanelSelector(activeStatus),fsTarget);if(!target)return;setTimeout(function(){try{target.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){}},40)}
  function setActionLoading(form,on){var btn=q('button[type="submit"]',form);if(!btn)return;if(on){if(!btn.dataset.encOriginalHtml)btn.dataset.encOriginalHtml=btn.innerHTML;btn.disabled=true;btn.classList.add('enc-action-loading');btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Atualizando...'}else{btn.disabled=false;btn.classList.remove('enc-action-loading');if(btn.dataset.encOriginalHtml)btn.innerHTML=btn.dataset.encOriginalHtml}}
  async function refreshCentralInPlace(url,targetStatus){
    var response=await fetch(url,{headers:{'X-Requested-With':'XMLHttpRequest'},credentials:'same-origin',cache:'no-store'});
    if(!response.ok)throw new Error('Não foi possível atualizar a Central.');
    var html=await response.text();
    var doc=new DOMParser().parseFromString(html,'text/html');
    var fresh=doc.querySelector('.enc-page');
    if(!fresh)throw new Error('A Central não pôde ser recarregada.');
    fsTarget.innerHTML=fresh.innerHTML;
    activeStatus=targetStatus||((q('[data-enc-status-filter].active',fsTarget)||{}).dataset?.encStatusFilter)||'nova';
    applyCentralStatus();syncRangeUi();syncFullscreenButton();scrollToActivePanel();
  }
  async function submitStatusAjax(form){
    if(form.dataset.encSubmitting==='1')return;
    form.dataset.encSubmitting='1';setActionLoading(form,true);
    try{
      var response=await fetch(form.action,{method:'POST',body:new FormData(form),headers:{'X-Requested-With':'XMLHttpRequest','Accept':'application/json'},credentials:'same-origin'});
      var data={};try{data=await response.json()}catch(e){}
      if(!response.ok||!data.ok)throw new Error(data.error||'Não foi possível atualizar a encomenda.');
      await refreshCentralInPlace(data.refresh_url||window.location.pathname,data.status_retorno||activeStatus);
      toast('Encomenda atualizada.');
    }catch(err){
      setActionLoading(form,false);toast(err&&err.message?err.message:'Não foi possível atualizar a encomenda.');
    }finally{form.dataset.encSubmitting='0'}
  }

  // Um único listener fica preso ao elemento que entra em tela cheia. Como .enc-page não é removida,
  // trocar status, aceitar, recusar ou finalizar não encerra o Fullscreen API.
  if(fsTarget){
    readActiveStatus();selectedStart=todayIso();selectedEnd=selectedStart;applyCentralStatus();syncRangeUi();syncFullscreenButton();
    fsTarget.addEventListener('click',function(e){
      var statusTrigger=e.target.closest('[data-enc-status-trigger]');if(statusTrigger){var wrap=statusTrigger.closest('[data-enc-status-quick]'),menu=wrap?q('[data-enc-status-menu]',wrap):null;if(menu){var willOpen=menu.hidden;closeStatusMenus(menu);menu.hidden=!willOpen;statusTrigger.setAttribute('aria-expanded',willOpen?'true':'false')}return}
      if(!e.target.closest('[data-enc-status-menu]'))closeStatusMenus();
      var period=e.target.closest('[data-enc-period]');if(period){var kind=period.dataset.encPeriod||'';if(kind==='today'){setTodayRange();scrollToActivePanel()}return}
      var filter=e.target.closest('[data-enc-status-filter]');if(filter){activeStatus=filter.dataset.encStatusFilter||'nova';applyCentralStatus();var target=q(statusPanelSelector(activeStatus),fsTarget);if(target&&window.innerWidth<760)target.scrollIntoView({behavior:'smooth',block:'start'});return}
      var detail=e.target.closest('[data-enc-detail]');if(detail){toast('Detalhes completos da encomenda.');return}
      var printBtn=e.target.closest('[data-enc-print]');if(printBtn){printSelectedOrders();return}
      var full=e.target.closest('[data-enc-fullscreen]');if(full){if(fsTarget.classList.contains('enc-focus-mode')){toggleFocusFallback();return}if(document.fullscreenElement===fsTarget){document.exitFullscreen&&document.exitFullscreen();return}if(fsTarget.requestFullscreen){fsTarget.requestFullscreen().catch(toggleFocusFallback)}else{toggleFocusFallback()}return}
      var delivery=e.target.closest('[data-enc-delivery]');if(delivery){currentDeliveryOrder={number:delivery.dataset.orderNumber||'',client:delivery.dataset.orderClient||'',phone:delivery.dataset.orderPhone||'',kind:delivery.dataset.orderKind||'',date:delivery.dataset.orderDate||'',time:delivery.dataset.orderTime||'',address:delivery.dataset.orderAddress||''};if(driverBackdrop){driverBackdrop.classList.add('open');driverBackdrop.setAttribute('aria-hidden','false')}return}
    });
    fsTarget.addEventListener('change',function(e){if(!e.target)return;if(e.target.id==='encDateFrom'||e.target.id==='encDateTo'){var from=q('#encDateFrom',fsTarget),to=q('#encDateTo',fsTarget);var nextStart=from?String(from.value||''):'';var nextEnd=to?String(to.value||''):'';if(nextStart&&nextEnd&&nextStart>nextEnd){toast('A data inicial não pode ser depois da data final.');syncRangeUi();return}selectedStart=nextStart;selectedEnd=nextEnd;syncRangeUi();applyCentralStatus();scrollToActivePanel()}});
    fsTarget.addEventListener('submit',function(e){var form=e.target;if(!form||!form.matches('form[action*="/encomendas/"][action$="/status"]'))return;e.preventDefault();submitStatusAjax(form)});
  }
  document.addEventListener('fullscreenchange',syncFullscreenButton);

  // Delivery: escolhe um motoboy/parceiro cadastrado e abre o WhatsApp com os dados da encomenda.
  var driverBackdrop=q('#encDriverBackdrop'),currentDeliveryOrder=null;
  function closeDriver(){if(!driverBackdrop)return;driverBackdrop.classList.remove('open');driverBackdrop.setAttribute('aria-hidden','true');currentDeliveryOrder=null}
  qa('[data-enc-driver-close]').forEach(function(btn){btn.addEventListener('click',closeDriver)});
  if(driverBackdrop)driverBackdrop.addEventListener('click',function(e){if(e.target===driverBackdrop)closeDriver()});
  qa('[data-enc-driver]').forEach(function(btn){btn.addEventListener('click',function(){if(!currentDeliveryOrder)return;var phone=String(btn.dataset.driverPhone||'').replace(/\D/g,'');if(!phone){toast('Este entregador não tem WhatsApp cadastrado.');return}var o=currentDeliveryOrder;var lines=['Olá! Solicitação de delivery do MenuFacile.','Encomenda #'+o.number,'Cliente: '+o.client,(o.phone?'Telefone: '+o.phone:''),'Modalidade: '+o.kind,'Data: '+o.date+' às '+o.time,'Endereço: '+(o.address||'não informado na encomenda')].filter(Boolean);window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(lines.join('\n')),'_blank','noopener');closeDriver()})});

  // Cadastro real.
  var options=q('#encOptionList'), add=q('#encAddOption');
  if(options&&add){
    add.addEventListener('click',function(){var row=document.createElement('div');row.className='enc-option-row';row.innerHTML='<input name="opcao_nome" class="enc-control" placeholder="Ex.: 50 unidades" aria-label="Nome da opção"><input name="opcao_preco" class="enc-control" value="0,00" inputmode="decimal" aria-label="Preço"><button type="button" class="enc-remove-option" aria-label="Remover opção"><i class="fa-solid fa-xmark"></i></button>';options.appendChild(row)});
    options.addEventListener('click',function(e){var b=e.target.closest('.enc-remove-option');if(b&&options.children.length>1)b.closest('.enc-option-row').remove()});
  }
  qa('.enc-switch').forEach(function(btn){btn.addEventListener('click',function(){btn.classList.toggle('on');var on=btn.classList.contains('on');btn.setAttribute('aria-pressed',on?'true':'false');var hidden=document.getElementById(btn.dataset.encHidden||'');if(hidden)hidden.value=on?'1':'0'})});
  var itemName=q('#encItemName'), previewName=q('#encPreviewName');
  if(itemName&&previewName)itemName.addEventListener('input',function(){previewName.textContent=itemName.value||'Nome da encomenda'});
  var desc=q('#encItemDescription'), previewDesc=q('#encPreviewDescription');
  if(desc&&previewDesc)desc.addEventListener('input',function(){previewDesc.textContent=desc.value||'A descrição curta aparecerá aqui.'});
  var photo=q('#encItemPhoto'), previewImage=q('#encPreviewImage');
  if(photo&&previewImage)photo.addEventListener('input',function(){var url=String(photo.value||'').trim();if(url)previewImage.style.backgroundImage='url("'+url.replace(/"/g,'')+'")'});

  // Menu público: abre o item escolhido usando os mesmos dados do catálogo.
  var modal=q('#encProductModalBackdrop'), drawer=q('#encCartDrawerBackdrop'), cartCount=q('#encCartCount');
  var currentCard=null, currentOption=null, currentAdvance=0;
  var scheduleCfg=window.MenuFacileEncomendasConfig||{};
  function pad2(n){return String(n).padStart(2,'0')}
  function ymd(date){return date.getFullYear()+'-'+pad2(date.getMonth()+1)+'-'+pad2(date.getDate())}
  function dateFromYmd(value){var m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12,0,0,0):null}
  function weekdayMonday0(date){return (date.getDay()+6)%7}
  function rowForDate(date){return (scheduleCfg.horarios||[]).find(function(h){return Number(h.dia_semana)===weekdayMonday0(date)})||null}
  function hhmmToMinutes(value){var m=String(value||'').match(/^(\d{2}):(\d{2})$/);if(!m)return null;var h=Number(m[1]),mi=Number(m[2]);return h>=0&&h<24&&mi>=0&&mi<60?h*60+mi:null}
  function minutesToHHMM(total){total=(total+1440)%1440;return pad2(Math.floor(total/60))+':'+pad2(total%60)}
  function firstAllowedDate(minDate){
    if(!scheduleCfg.restricaoHorariosAtiva)return minDate;
    var d=new Date(minDate.getFullYear(),minDate.getMonth(),minDate.getDate(),12);
    for(var i=0;i<90;i++){var row=rowForDate(d);if(row&&row.aberto)return d;d.setDate(d.getDate()+1)}
    return minDate;
  }
  function updateSchedule(){
    var dateInput=q('#encModalDate'), timeSelect=q('#encModalTime'), addBtn=q('#encAddCart');
    if(!dateInput||!timeSelect)return;
    var chosen=dateFromYmd(dateInput.value);
    timeSelect.innerHTML='';
    var slots=[];
    if(chosen){
      var row=rowForDate(chosen);
      if(!scheduleCfg.restricaoHorariosAtiva){
        slots=['09:00','10:30','12:00','15:30','16:00','17:30','18:30'];
      }else if(row&&row.aberto){
        var start=hhmmToMinutes(row.hora_inicio),end=hhmmToMinutes(row.hora_fim);
        if(start===null||end===null){slots=['09:00','10:30','12:00','15:30','16:00','17:30','18:30']}
        else if(start<=end){for(var t=start;t<=end;t+=30)slots.push(minutesToHHMM(t))}
        else{for(var a=start;a<1440;a+=30)slots.push(minutesToHHMM(a));for(var b=0;b<=end;b+=30)slots.push(minutesToHHMM(b))}
      }
      var limit=new Date();limit.setHours(limit.getHours()+currentAdvance);
      slots=slots.filter(function(slot){var mins=hhmmToMinutes(slot);var candidate=new Date(chosen.getFullYear(),chosen.getMonth(),chosen.getDate(),Math.floor(mins/60),mins%60,0,0);return candidate>=limit});
    }
    if(!slots.length){
      var empty=document.createElement('option');empty.value='';empty.textContent=chosen?'Sem horário disponível':'Escolha primeiro a data';timeSelect.appendChild(empty);timeSelect.disabled=true;if(addBtn)addBtn.disabled=true;
    }else{
      slots.forEach(function(slot,index){var o=document.createElement('option');o.value=slot;o.textContent=slot;if(index===0)o.selected=true;timeSelect.appendChild(o)});timeSelect.disabled=false;if(addBtn)addBtn.disabled=false;
    }
  }
  function prepareSchedule(advance){
    currentAdvance=Math.max(0,Number(advance||0));
    var dateInput=q('#encModalDate');if(!dateInput)return;
    var min=new Date();min.setHours(min.getHours()+currentAdvance);
    var first=firstAllowedDate(min);dateInput.min=ymd(min);
    var current=dateFromYmd(dateInput.value);if(!current||current<new Date(min.getFullYear(),min.getMonth(),min.getDate(),12)|| (scheduleCfg.restricaoHorariosAtiva&&(!rowForDate(current)||!rowForDate(current).aberto)))dateInput.value=ymd(first);
    dateInput.onchange=updateSchedule;updateSchedule();
  }
  function openModal(card){
    currentCard=card;
    if(!modal||!card)return;
    var name=card.dataset.encItemName||'Encomenda';
    var description=card.dataset.encItemDescription||'';
    var image=card.dataset.encItemPhoto||'';
    var advance=Number(card.dataset.encItemAdvance||0);
    var opts=[], fills=[];
    try{opts=JSON.parse(card.dataset.encItemOptions||'[]')}catch(e){}
    try{fills=JSON.parse(card.dataset.encItemRecheios||'[]')}catch(e){}
    if(!fills.length){try{fills=JSON.parse(card.dataset.encItemSabores||'[]')}catch(e){}}
    var nameEl=q('#encModalName'),descEl=q('#encModalDescription'),photoEl=q('#encModalPhoto'),optBox=q('#encModalOptions'),fillBox=q('#encModalFillings');
    if(nameEl)nameEl.textContent=name;if(descEl)descEl.textContent=description;if(photoEl)photoEl.style.backgroundImage=image?'url("'+image.replace(/"/g,'')+'")':'';
    if(optBox){optBox.innerHTML='';opts.forEach(function(op,index){var label=document.createElement('label');label.className='enc-radio';label.innerHTML='<span><input type="radio" name="enc-size" value="'+String(op.nome||'')+'" data-option-id="'+Number(op.id||0)+'" data-price="'+Number(op.preco||0)+'" '+(index===0?'checked':'')+'> '+String(op.nome||'Opção')+'</span><strong>'+euro(op.preco)+'</strong>';optBox.appendChild(label)});}
    currentOption=opts[0]||null;updateTotal();
    qa('input[name="enc-size"]',optBox).forEach(function(r){r.addEventListener('change',function(){currentOption={id:Number(r.dataset.optionId||0),nome:r.value,preco:Number(r.dataset.price||0)};updateTotal()})});
    var fillGroup=q('#encModalFillGroup');if(fillGroup)fillGroup.hidden=!fills.length;
    if(fillBox){fillBox.innerHTML='';fills.forEach(function(fill,index){var label=document.createElement('label');label.className='enc-radio';label.innerHTML='<span><input type="radio" name="enc-fill" value="'+String(fill)+'" '+(index===0?'checked':'')+'> '+String(fill)+'</span>';fillBox.appendChild(label)});}
    var adv=q('#encModalAdvance');if(adv)adv.textContent=(advance>=24?'Antecedência mínima: '+Math.ceil(advance/24)+' dia(s)':'Antecedência mínima: '+advance+' h')+(scheduleCfg.restricaoHorariosAtiva?' · horários da empresa':'');
    prepareSchedule(advance);
    var personalGroup=q('#encModalPersonalGroup');if(personalGroup)personalGroup.hidden=card.dataset.encPersonalization==='0';
    modal.classList.add('open');document.body.style.overflow='hidden';
  }
  function updateTotal(){var el=q('#encModalTotal');if(el)el.textContent=euro(currentOption?currentOption.preco:0)}
  function closeModal(){if(modal){modal.classList.remove('open');document.body.style.overflow=''}}
  function openDrawer(){if(drawer){drawer.classList.add('open');document.body.style.overflow='hidden'}}
  function closeDrawer(){if(drawer){drawer.classList.remove('open');document.body.style.overflow=''}}
  qa('[data-enc-open-product]').forEach(function(btn){btn.addEventListener('click',function(){openModal(btn.closest('[data-enc-product-card]')||btn.closest('.enc-product-card'))})});
  if(q('#encModalClose'))q('#encModalClose').addEventListener('click',closeModal);if(modal)modal.addEventListener('click',function(e){if(e.target===modal)closeModal()});
  if(q('#encCartButton'))q('#encCartButton').addEventListener('click',openDrawer);if(q('#encCartClose'))q('#encCartClose').addEventListener('click',closeDrawer);if(drawer)drawer.addEventListener('click',function(e){if(e.target===drawer)closeDrawer()});
  var addCart=q('#encAddCart');if(addCart)addCart.addEventListener('click',function(){if(!currentCard||!currentOption)return;var date=q('#encModalDate')?.value||'',time=q('#encModalTime')?.value||'',fill=q('input[name="enc-fill"]:checked')?.value||'',personal=q('#encModalPersonal')?.value||'';if(!date||!time){toast('Escolha uma data e um horário disponíveis.');return;}q('#encCartItemName').textContent=(currentCard.dataset.encItemName||'Encomenda')+' · '+(currentOption.nome||'');var detail=[fill,date&&time?('Data: '+date+' às '+time):'',personal?('Personalização: '+personal):''].filter(Boolean).join('\n');q('#encCartItemDetail').textContent=detail;q('#encCartProductTotal').textContent=euro(currentOption.preco);q('#encCartTotal').textContent=euro(currentOption.preco);q('#encCartSchedule').textContent=date&&time?(date+' · '+time):'—';if(cartCount)cartCount.textContent='1';window.MenuFacileEncomendasCart={itemId:Number(currentCard.dataset.encItemId||0),optionId:Number(currentOption.id||0),itemName:currentCard.dataset.encItemName||'Encomenda',optionName:currentOption.nome||'',price:Number(currentOption.preco||0),date:date,time:time,fill:fill,personal:personal,permiteRetirada:currentCard.dataset.encPermiteRetirada!=='0',permiteEntrega:currentCard.dataset.encPermiteEntrega!=='0'};closeModal();setTimeout(openDrawer,180)});

  // Categorias filtram os cards reais sem interferir na vitrine automática.
  qa('[data-enc-category]').forEach(function(btn){btn.addEventListener('click',function(){qa('[data-enc-category]').forEach(function(x){x.classList.remove('active')});btn.classList.add('active');var wanted=String(btn.dataset.encCategory||'todos').toLowerCase();qa('[data-enc-product-card]').forEach(function(card){card.hidden=wanted!=='todos'&&String(card.dataset.encCategoryName||'').toLowerCase()!==wanted})})});
})();
