(function(){
  'use strict';
  function q(s,r){return (r||document).querySelector(s)}
  function qa(s,r){return Array.from((r||document).querySelectorAll(s))}
  function toast(text){var el=q('#encToast');if(!el)return;el.textContent=text;el.classList.add('show');clearTimeout(el.__timer);el.__timer=setTimeout(function(){el.classList.remove('show')},1900)}
  function euro(value){var n=Number(value||0);return '€ '+n.toFixed(2).replace('.',',')}

  // Central de Encomendas: V948 — status globais por padrão + filtro de datas opcional.
  var fsTarget=q('.enc-page');
  var activeStatus='nova';
  var viewMode='status';
  var periodMode='none';
  var rangeFrom='';
  var rangeTo='';

  function todayYmd(){var d=new Date();return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())}
  function addDaysYmd(base,days){var d=dateFromYmd(base)||new Date();d.setDate(d.getDate()+Number(days||0));return ymd(d)}
  function dateInputFrom(){return q('#encDateFrom',fsTarget)}
  function dateInputTo(){return q('#encDateTo',fsTarget)}
  function allOrderCards(){return fsTarget?qa('[data-enc-order]',fsTarget):[]}
  function cardStatus(card){return String((card&&card.dataset&&(card.dataset.encStatusCard||card.dataset.encStatus))||'').trim()}
  function readActiveStatus(){var current=q('[data-enc-status-filter].active',fsTarget);activeStatus=current&&current.dataset?current.dataset.encStatusFilter:'nova'}
  function normalizeRange(rawFrom,rawTo){var from=String(rawFrom||'').trim(),to=String(rawTo||'').trim();if(from&&to&&from>to){var tmp=from;from=to;to=tmp}return {from:from,to:to}}
  function getCurrentRange(){
    if(periodMode==='range')return normalizeRange(rangeFrom,rangeTo);
    return {from:'',to:''};
  }
  function cardMatchesDate(card){
    /* Sem filtro escolhido, qualquer data fica visível. */
    if(periodMode==='none')return true;
    var date=String((card&&card.dataset?card.dataset.encDate:'')||'').trim();
    if(!date)return false;
    var range=getCurrentRange();
    if(range.from&&date<range.from)return false;
    if(range.to&&date>range.to)return false;
    return true;
  }
  function isInactiveStatus(status){return ['cancelada','finalizada'].includes(status)}
  function parseBrlNumber(text){var raw=String(text||'');var m=raw.match(/R\$\s*([\d.]+,\d{2})/i);if(!m)return 0;return Number(m[1].replace(/\./g,'').replace(',','.'))||0}
  function outstandingValue(card){
    var detail=String(((q('.enc-finance-detail',card)||{}).textContent)||'').trim();
    var low=detail.toLowerCase();
    var saldo=low.match(/saldo\s+r\$\s*([\d.]+,\d{2})/i);if(saldo)return Number(saldo[1].replace(/\./g,'').replace(',','.'))||0;
    if(low.indexOf('a receber')!==-1||low.indexOf('aguardando')!==-1)return parseBrlNumber(detail);
    return 0;
  }
  function formatBrl(value){return Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
  function readableTodayV948(){
    var d=new Date();
    var text=d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
    return text?text.charAt(0).toUpperCase()+text.slice(1):'';
  }
  function syncPeriodUi(){
    if(!fsTarget)return;
    var inputFrom=dateInputFrom(),inputTo=dateInputTo();
    if(periodMode==='range'){
      var normalized=normalizeRange(rangeFrom,rangeTo);rangeFrom=normalized.from;rangeTo=normalized.to;
      if(inputFrom)inputFrom.value=rangeFrom;
      if(inputTo)inputTo.value=rangeTo;
    }else{
      rangeFrom='';rangeTo='';
      if(inputFrom)inputFrom.value='';
      if(inputTo)inputTo.value='';
    }
    var todayLabel=q('#encTodayReadableV948',fsTarget);if(todayLabel)todayLabel.textContent=readableTodayV948();
    var clear=q('[data-enc-clear-dates-v948]',fsTarget);if(clear)clear.hidden=periodMode==='none';
  }
  function statusCountsForPeriod(){
    var counts={nova:0,confirmada:0,producao:0,pronta:0,finalizada:0,cancelada:0};
    allOrderCards().forEach(function(card){
      var status=cardStatus(card);
      if(!counts.hasOwnProperty(status))return;
      /* V948: todos os status são globais; o período só atua quando o usuário escolhe datas. */
      if(cardMatchesDate(card))counts[status]+=1;
    });
    return counts;
  }
  function refreshSummary(){
    if(!fsTarget)return;
    var cards=allOrderCards(),counts=statusCountsForPeriod();
    qa('[data-enc-status-filter]',fsTarget).forEach(function(btn){var key=btn.dataset.encStatusFilter||'',badge=q('.enc-status-number',btn);if(badge&&counts.hasOwnProperty(key))badge.textContent=String(counts[key])});
    var activePeriod=cards.filter(function(card){return cardMatchesDate(card)&&!isInactiveStatus(cardStatus(card))});
    var openCards=cards.filter(function(card){return !isInactiveStatus(cardStatus(card))});
    var receiveCards=activePeriod.filter(function(card){return outstandingValue(card)>0.005});
    var receiveTotal=receiveCards.reduce(function(sum,card){return sum+outstandingValue(card)},0);
    var values={total:cards.length,open:openCards.length,nova:counts.nova,period:activePeriod.length,producao:counts.producao,receivable:formatBrl(receiveTotal)};
    Object.keys(values).forEach(function(key){var el=q('[data-enc-metric-value="'+key+'"]',fsTarget);if(el)el.textContent=String(values[key])});
  }
  function cardVisibleForMode(card){
    var status=cardStatus(card);
    if(viewMode==='total')return true;
    if(viewMode==='open')return !isInactiveStatus(status);
    if(viewMode==='period')return cardMatchesDate(card)&&!isInactiveStatus(status);
    if(viewMode==='receivable')return cardMatchesDate(card)&&!isInactiveStatus(status)&&outstandingValue(card)>0.005;
    /* V948: cada aba mostra todo o seu status; datas só filtram quando escolhidas. */
    return status===activeStatus&&cardMatchesDate(card);
  }
  function metricKeyForView(){if(viewMode==='total')return 'total';if(viewMode==='open')return 'open';if(viewMode==='period')return 'period';if(viewMode==='receivable')return 'receivable';if(activeStatus==='nova')return 'nova';if(activeStatus==='producao')return 'producao';return ''}
  function emptyCopy(){
    if(viewMode==='total')return ['Nenhuma encomenda cadastrada','Ainda não há encomendas na Central.'];
    if(viewMode==='open')return ['Nenhuma encomenda em aberto','Não há encomendas pendentes de ação, produção ou entrega.'];
    if(viewMode==='receivable')return ['Nenhum saldo a receber','Não há encomendas com saldo pendente neste período.'];
    if(viewMode==='period')return ['Nenhuma encomenda ativa','Não há retiradas ou entregas ativas neste período.'];
    var labels={nova:'novas',confirmada:'confirmadas',producao:'em produção',pronta:'prontas',finalizada:'finalizadas',cancelada:'canceladas'};
    return ['Nenhuma encomenda '+(labels[activeStatus]||''),periodMode==='range'?'Não há encomendas deste status no período escolhido.':'Não há encomendas neste status.'];
  }
  function applyCentralView(){
    if(!fsTarget)return;
    fsTarget.classList.toggle('enc-view-total',viewMode==='total');
    fsTarget.classList.toggle('enc-view-open',viewMode==='open');
    refreshSummary();
    qa('[data-enc-status-filter]',fsTarget).forEach(function(btn){var on=viewMode==='status'&&btn.dataset.encStatusFilter===activeStatus;btn.classList.toggle('active',on);btn.setAttribute('aria-selected',on?'true':'false')});
    var metricActive=metricKeyForView();
    qa('[data-enc-metric-card]',fsTarget).forEach(function(card){var on=card.dataset.encMetricCard===metricActive;card.classList.toggle('active',on);if(card.getAttribute('role')==='tab')card.setAttribute('aria-selected',on?'true':'false')});
    var visibleTotal=0;
    qa('[data-enc-status-panel]',fsTarget).forEach(function(panel){
      var kind=panel.dataset.encStatusPanel||'';
      var panelCards=qa('[data-enc-order]',panel);
      panelCards.forEach(function(card){var visible=cardVisibleForMode(card);card.hidden=!visible;if(visible)visibleTotal+=1});
      if(kind==='fluxo'){
        qa('[data-enc-flow-day]',panel).forEach(function(day){day.hidden=!qa('[data-enc-order]',day).some(function(card){return !card.hidden})});
        var flowCopy={confirmada:['Confirmadas','Programadas e prontas para iniciar'],producao:['Em produção','Equipe preparando agora'],pronta:['Prontas','Aguardando retirada ou entrega'],finalizada:['Finalizadas','Encomendas concluídas']};
        var copy=viewMode==='status'?(flowCopy[activeStatus]||['Acompanhamento','']):(viewMode==='total'?['Todas as encomendas','Todos os status e todas as datas']:(viewMode==='open'?['Em aberto','Todas as encomendas que ainda precisam ser atendidas']:(viewMode==='receivable'?['A receber','Encomendas com saldo pendente no período']:['Encomendas do período','Retiradas e entregas ativas no intervalo'])));
        var title=q('[data-enc-flow-title]',panel),subtitle=q('[data-enc-flow-subtitle]',panel);if(title)title.textContent=copy[0];if(subtitle)subtitle.textContent=copy[1];
      }
      var hasVisible=panelCards.some(function(card){return !card.hidden});
      if(viewMode==='status'){
        var targetKind=['confirmada','producao','pronta','finalizada'].includes(activeStatus)?'fluxo':activeStatus;
        panel.hidden=kind!==targetKind||!hasVisible;
      }else{
        panel.hidden=!hasVisible;
      }
      if(kind==='cancelada'&&panel.tagName==='DETAILS'&&!panel.hidden)panel.open=true;
    });
    var inboxCount=q('[data-enc-inbox-count]',fsTarget);if(inboxCount)inboxCount.textContent=String(allOrderCards().filter(function(card){return cardStatus(card)==='nova'&&cardVisibleForMode(card)}).length);
    var cancelCount=q('[data-enc-cancelled-count]',fsTarget);if(cancelCount)cancelCount.textContent=String(allOrderCards().filter(function(card){return cardStatus(card)==='cancelada'&&cardVisibleForMode(card)}).length);
    var empty=q('[data-enc-view-empty]',fsTarget);if(empty){empty.hidden=visibleTotal>0;var copy=emptyCopy(),strong=q('strong',empty),span=q('span',empty);if(strong)strong.textContent=copy[0];if(span)span.textContent=copy[1]}
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
  function scrollToCurrentView(){if(!fsTarget)return;var target=viewMode==='status'?q(statusPanelSelector(activeStatus),fsTarget):q('[data-enc-status-panel]:not([hidden])',fsTarget);if(!target)return;setTimeout(function(){try{target.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){}},40)}
  function setActionLoading(form,on){var btn=q('button[type="submit"]',form);if(!btn)return;if(on){if(!btn.dataset.encOriginalHtml)btn.dataset.encOriginalHtml=btn.innerHTML;btn.disabled=true;btn.classList.add('enc-action-loading');btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Atualizando...'}else{btn.disabled=false;btn.classList.remove('enc-action-loading');if(btn.dataset.encOriginalHtml)btn.innerHTML=btn.dataset.encOriginalHtml}}
  async function refreshCentralInPlace(url,targetStatus){
    var response=await fetch(url,{headers:{'X-Requested-With':'XMLHttpRequest'},credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error('Não foi possível atualizar a Central.');
    var html=await response.text(),doc=new DOMParser().parseFromString(html,'text/html'),fresh=doc.querySelector('.enc-page');if(!fresh)throw new Error('A Central não pôde ser recarregada.');
    fsTarget.innerHTML=fresh.innerHTML;activeStatus=targetStatus||activeStatus||'nova';viewMode='status';syncPeriodUi();applyCentralView();syncFullscreenButton();scrollToCurrentView();
  }
  async function submitStatusAjax(form){
    if(form.dataset.encSubmitting==='1')return;form.dataset.encSubmitting='1';setActionLoading(form,true);
    try{var response=await fetch(form.action,{method:'POST',body:new FormData(form),headers:{'X-Requested-With':'XMLHttpRequest','Accept':'application/json'},credentials:'same-origin'});var data={};try{data=await response.json()}catch(e){}if(!response.ok||!data.ok)throw new Error(data.error||'Não foi possível atualizar a encomenda.');await refreshCentralInPlace(data.refresh_url||window.location.pathname,data.status_retorno||activeStatus);toast('Encomenda atualizada.')}catch(err){setActionLoading(form,false);toast(err&&err.message?err.message:'Não foi possível atualizar a encomenda.')}finally{form.dataset.encSubmitting='0'}
  }
  function cardsForPrint(scope){
    var cards=allOrderCards();scope=String(scope||'period');
    if(scope==='total')return cards;
    if(scope==='open')return cards.filter(function(card){return !isInactiveStatus(cardStatus(card))});
    if(scope==='period')return cards.filter(function(card){return cardMatchesDate(card)&&!isInactiveStatus(cardStatus(card))});
    if(scope==='receivable')return cards.filter(function(card){return cardMatchesDate(card)&&!isInactiveStatus(cardStatus(card))&&outstandingValue(card)>0.005});
    if(scope.indexOf('status:')===0){var wanted=scope.split(':')[1]||'';return cards.filter(function(card){return cardStatus(card)===wanted&&cardMatchesDate(card)})}
    return cards.filter(cardMatchesDate);
  }
  function collectPrintableOrders(scope){
    var cards=cardsForPrint(scope);cards.sort(function(a,b){var ad=(a.dataset.encDate||'')+' '+(a.dataset.encTime||''),bd=(b.dataset.encDate||'')+' '+(b.dataset.encTime||'');return ad.localeCompare(bd)});
    return cards.map(function(card){var items=qa('.enc-product-line',card).map(function(line){var strong=line.querySelector('strong'),span=line.querySelector('span');return '<li><strong>'+((strong||{}).textContent||'')+'</strong> <span>'+((span||{}).textContent||'')+'</span></li>'}).join('');var obs=((q('.enc-personalization',card)||{}).textContent)||'',total=((q('.enc-payment > div strong',card)||{}).textContent)||'',chip=((q('.enc-finance-chip',card)||{}).textContent||'').trim(),detail=((q('.enc-finance-detail',card)||{}).textContent||'').trim(),status=((q('.enc-status',card)||{}).textContent||'').trim();return {numero:card.dataset.encNumber||'',cliente:card.dataset.encClient||'',telefone:card.dataset.encPhone||'',tipo:card.dataset.encKind||'',data:card.dataset.encDate||'',hora:card.dataset.encTime||'',endereco:card.dataset.encAddress||'',items:items,obs:obs,total:total,pagamento:[chip,detail].filter(Boolean).join(' · '),status:status}})
  }
  function formatDatePtBr(value){if(!value)return '';var p=String(value).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:value}
  function printScopeLabel(scope){
    if(scope==='total')return 'Todas as encomendas · todos os dias';
    if(scope==='open')return 'Em aberto · todas as datas';
    var range=getCurrentRange(),period=periodMode==='range'?('Período: '+formatDatePtBr(range.from)+' até '+formatDatePtBr(range.to)):'Todas as datas';
    if(scope==='period')return period+' · encomendas ativas';if(scope==='receivable')return period+' · saldos a receber';
    if(scope.indexOf('status:')===0){var key=scope.split(':')[1],labels={nova:'Novas',confirmada:'Confirmadas',producao:'Em produção',pronta:'Prontas',finalizada:'Finalizadas',cancelada:'Canceladas'};return (labels[key]||key)+' · '+period}
    return period;
  }
  function printOrders(scope){
    var orders=collectPrintableOrders(scope);if(!orders.length){toast('Não há encomendas para esta impressão.');return}
    var company=(fsTarget.dataset.encCompany||'Empresa').replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]});
    var body=orders.map(function(o){return '<section class="order"><div class="head"><div><h3>#'+o.numero+' · '+o.cliente+'</h3><div class="sub">'+(o.telefone||'')+' · '+(o.tipo||'')+' · '+formatDatePtBr(o.data)+' · '+(o.hora||'')+'</div></div><div class="status">'+(o.status||'')+'</div></div>'+(o.endereco&&String(o.tipo).toLowerCase().indexOf('entrega')!==-1?'<div class="box"><strong>Endereço:</strong> '+o.endereco+'</div>':'')+'<div class="items"><ul>'+o.items+'</ul></div>'+(o.obs?'<div class="box"><strong>Observação:</strong> '+o.obs+'</div>':'')+'<div class="foot"><div><strong>Total:</strong> '+o.total+'</div><div><strong>Pagamento:</strong> '+o.pagamento+'</div></div></section>'}).join('');
    var html='<!doctype html><html><head><meta charset="utf-8"><title>Encomendas</title><style>body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;margin:24px}h1{margin:0 0 4px;font-size:22px}p.meta{margin:0 0 18px;color:#667085;font-size:12px}.order{border:1px solid #d8dee6;border-radius:12px;padding:14px 16px;margin:0 0 14px;page-break-inside:avoid}.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}.head h3{margin:0 0 4px;font-size:18px}.sub{font-size:12px;color:#667085}.status{font-size:12px;font-weight:700;border:1px solid #d8dee6;border-radius:999px;padding:6px 10px}.items ul{margin:0;padding-left:18px}.items li{margin:0 0 5px}.items span{color:#667085}.box{margin-top:10px;padding:9px 10px;border-radius:10px;background:#f8fafc;font-size:12px}.foot{margin-top:12px;display:flex;justify-content:space-between;gap:12px;font-size:13px}@media print{body{margin:12px}.order{break-inside:avoid}}</style></head><body><h1>'+company+' — Encomendas</h1><p class="meta">'+printScopeLabel(scope)+'</p>'+body+'<script>window.onload=function(){window.print();setTimeout(function(){window.close();},180);}<\/script></body></html>';
    var w=window.open('','_blank','noopener,noreferrer,width=960,height=720');if(!w){toast('Não foi possível abrir a impressão.');return}w.document.open();w.document.write(html);w.document.close();
  }
  function selectMetric(mode){
    if(mode==='total'){viewMode='total'}else if(mode==='open'){viewMode='open'}else if(mode==='period'){viewMode='period'}else if(mode==='receivable'){viewMode='receivable'}else{viewMode='status';activeStatus=mode||'nova'}
    applyCentralView();scrollToCurrentView();
  }

  // V849 — Ver detalhes usa os mesmos dados financeiros montados pelo backend.
  var detailModalV849=q('#encDetailModalV849');
  function detailMoneyV849(value){return Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
  function detailSetV849(id,value,fallback){var el=q('#'+id);if(el)el.textContent=String(value||fallback||'')}
  function detailCloseV849(){if(!detailModalV849)return;detailModalV849.hidden=true;document.body.style.overflow=''}
  function detailPaymentLineV849(kind,method,state,amount,sub){
    var row=document.createElement('div');row.className='enc-detail-payment-line-v849';
    var kindEl=document.createElement('span');kindEl.className='kind';kindEl.textContent=kind;
    var methodEl=document.createElement('span');methodEl.className='method';methodEl.textContent=method||'Não informado';
    var small=document.createElement('small');small.textContent=[state,sub].filter(Boolean).join(' · ');methodEl.appendChild(small);
    var amountEl=document.createElement('strong');amountEl.className='amount';amountEl.textContent=detailMoneyV849(amount);
    row.appendChild(kindEl);row.appendChild(methodEl);row.appendChild(amountEl);return row;
  }
  function openOrderDetailV849(button){
    if(!detailModalV849)return;
    var raw=String((button&&button.dataset?button.dataset.encDetailJson:'')||'');var data={};
    try{data=JSON.parse(raw)}catch(_){toast('Não foi possível abrir os detalhes desta encomenda.');return}
    detailSetV849('encDetailTitleV849','#'+(data.numero||'')+' · Detalhes da encomenda');
    detailSetV849('encDetailSubtitleV849',data.tipo||'Encomenda');
    detailSetV849('encDetailStatusV849',data.status||'Status não informado');
    detailSetV849('encDetailClientV849',data.cliente,'Não informado');
    detailSetV849('encDetailPhoneV849',data.telefone,'Não informado');
    detailSetV849('encDetailEmailV849',data.email,'Não informado');
    detailSetV849('encDetailTypeV849',data.tipo,'Não informado');
    detailSetV849('encDetailDateV849',data.data,'Não informado');
    detailSetV849('encDetailTimeV849',data.hora,'Não informado');
    detailSetV849('encDetailAddressV849',data.endereco,(String(data.tipo||'').toLowerCase().indexOf('retirada')>=0?'Retirada na loja':'Não informado'));
    var obs=q('#encDetailObservationV849');if(obs){obs.textContent=data.observacao||'Nenhuma observação.';obs.classList.toggle('enc-detail-empty-v849',!data.observacao)}
    var items=q('#encDetailItemsV849');if(items){items.innerHTML='';(Array.isArray(data.itens)?data.itens:[]).forEach(function(item){
      var box=document.createElement('div');box.className='enc-detail-item-v849';var top=document.createElement('div');top.className='enc-detail-item-v849-top';
      var name=document.createElement('strong');name.textContent=item.nome||'Item';var price=document.createElement('strong');price.className='price';price.textContent=detailMoneyV849(item.subtotal||0);top.appendChild(name);top.appendChild(price);box.appendChild(top);
      var info=[item.opcao||'',(Number(item.quantidade||1))+' un.',item.recheio_sabor?('Sabor/recheio: '+item.recheio_sabor):'',item.personalizacao?('Personalização: '+item.personalizacao):''].filter(Boolean);var small=document.createElement('small');small.textContent=info.join(' · ');box.appendChild(small);items.appendChild(box)
    });if(!items.children.length){var empty=document.createElement('div');empty.className='enc-detail-empty-v849';empty.textContent='Nenhum item encontrado.';items.appendChild(empty)}}
    var pay=data.pagamento||{};detailSetV849('encDetailPayTotalV849',detailMoneyV849(pay.total||0));detailSetV849('encDetailPayReceivedV849',detailMoneyV849(pay.recebido||0));detailSetV849('encDetailPayPendingV849',detailMoneyV849(pay.pendente||0));
    var lines=q('#encDetailPaymentLinesV849');if(lines){lines.innerHTML='';var signal=pay.sinal||{},balance=pay.saldo||{};
      if(signal.existe){lines.appendChild(detailPaymentLineV849('Sinal',signal.forma_label||'Não informado',signal.estado||'',signal.valor||0,''))}
      if(balance.existe){var received=String(balance.estado||'')==='Recebido';var method=received?(balance.forma_label||'Não informado'):'Ainda não recebido';var sub=received?(balance.pago_em||''):(balance.forma_prevista_label&&balance.forma_prevista_label!=='A combinar'?('Previsto: '+balance.forma_prevista_label):'');lines.appendChild(detailPaymentLineV849(signal.existe?'Saldo':'Pagamento',method,balance.estado||'',balance.valor||0,sub))}
      if(!lines.children.length){var emptyPay=document.createElement('div');emptyPay.className='enc-detail-empty-v849';emptyPay.textContent='Nenhum pagamento registrado.';lines.appendChild(emptyPay)}
    }
    detailModalV849.hidden=false;document.body.style.overflow='hidden';
  }
  if(detailModalV849){detailModalV849.addEventListener('click',function(e){if(e.target.closest('[data-enc-detail-close-v849]'))detailCloseV849()});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!detailModalV849.hidden)detailCloseV849()})}

  if(fsTarget){
    readActiveStatus();activeStatus='nova';viewMode='status';syncPeriodUi();applyCentralView();syncFullscreenButton();
    fsTarget.addEventListener('click',function(e){
      var clearDates=e.target.closest('[data-enc-clear-dates-v948]');if(clearDates){e.preventDefault();rangeFrom='';rangeTo='';periodMode='none';syncPeriodUi();applyCentralView();return}
      var metricPrint=e.target.closest('[data-enc-print-scope]');if(metricPrint){e.preventDefault();e.stopPropagation();printOrders(metricPrint.dataset.encPrintScope||'period');return}
      var statusPrint=e.target.closest('[data-enc-print-status]');if(statusPrint){e.preventDefault();e.stopPropagation();printOrders('status:'+(statusPrint.dataset.encPrintStatus||''));return}
      var metric=e.target.closest('[data-enc-metric-filter]');if(metric){selectMetric(metric.dataset.encMetricFilter||'nova');return}
      var statusTrigger=e.target.closest('[data-enc-status-trigger]');if(statusTrigger){var wrap=statusTrigger.closest('[data-enc-status-quick]'),menu=wrap?q('[data-enc-status-menu]',wrap):null;if(menu){var willOpen=menu.hidden;closeStatusMenus(menu);menu.hidden=!willOpen;statusTrigger.setAttribute('aria-expanded',willOpen?'true':'false')}return}
      if(!e.target.closest('[data-enc-status-menu]'))closeStatusMenus();
      var period=e.target.closest('[data-enc-period]');if(period){var kind=period.dataset.encPeriod||'';if(kind==='today'){periodMode='today';rangeFrom='';rangeTo='';syncPeriodUi();applyCentralView();return}if(kind==='next7'){periodMode='next7';rangeFrom='';rangeTo='';syncPeriodUi();applyCentralView();return}}
      var filter=e.target.closest('[data-enc-status-filter]');if(filter){viewMode='status';activeStatus=filter.dataset.encStatusFilter||'nova';applyCentralView();var target=q(statusPanelSelector(activeStatus),fsTarget);if(target&&window.innerWidth<760)target.scrollIntoView({behavior:'smooth',block:'start'});return}
      var printBtn=e.target.closest('[data-enc-print]');if(printBtn){printOrders('all-period');return}
      var detail=e.target.closest('[data-enc-detail]');if(detail){e.preventDefault();e.stopPropagation();openOrderDetailV849(detail);return}
      var full=e.target.closest('[data-enc-fullscreen]');if(full){if(fsTarget.classList.contains('enc-focus-mode')){toggleFocusFallback();return}if(document.fullscreenElement===fsTarget){document.exitFullscreen&&document.exitFullscreen();return}if(fsTarget.requestFullscreen){fsTarget.requestFullscreen().catch(toggleFocusFallback)}else{toggleFocusFallback()}return}
      var delivery=e.target.closest('[data-enc-delivery]');if(delivery){currentDeliveryOrder={number:delivery.dataset.orderNumber||'',client:delivery.dataset.orderClient||'',phone:delivery.dataset.orderPhone||'',kind:delivery.dataset.orderKind||'',date:delivery.dataset.orderDate||'',time:delivery.dataset.orderTime||'',address:delivery.dataset.orderAddress||''};if(driverBackdrop){driverBackdrop.classList.add('open');driverBackdrop.setAttribute('aria-hidden','false')}return}
    });
    fsTarget.addEventListener('change',function(e){if(e.target&&(e.target.id==='encDateFrom'||e.target.id==='encDateTo')){var from=dateInputFrom(),to=dateInputTo();rangeFrom=from?String(from.value||''):'';rangeTo=to?String(to.value||''):'';if(rangeFrom&&rangeTo&&rangeFrom>rangeTo){var tmp=rangeFrom;rangeFrom=rangeTo;rangeTo=tmp}periodMode=(!rangeFrom&&!rangeTo)?'none':'range';syncPeriodUi();applyCentralView();scrollToCurrentView()}});
    fsTarget.addEventListener('focusin',function(e){if(!e.target||(e.target.id!=='encDateFrom'&&e.target.id!=='encDateTo'))return;if(periodMode==='none'&&!rangeFrom&&!rangeTo){var today=todayYmd();rangeFrom=today;rangeTo=today;periodMode='range';syncPeriodUi();applyCentralView()}});
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
