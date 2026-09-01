(function(){
  'use strict';
  if(window.__MF_AGENDA_V37__)return;window.__MF_AGENDA_V37__=true;
  function q(s,r){return (r||document).querySelector(s)}
  function qa(s,r){return Array.from((r||document).querySelectorAll(s))}
  function normDate(v){v=String(v||'').trim();var m=v.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m)return m[1]+'-'+m[2]+'-'+m[3];m=v.match(/^(\d{2})[-\/]([0-9]{2})[-\/](\d{4})$/);return m?m[3]+'-'+m[2]+'-'+m[1]:v}
  function normTime(v){var m=String(v||'').match(/(\d{1,2}):(\d{2})/);return m?String(m[1]).padStart(2,'0')+':'+m[2]:''}

  function displayDate(v){
    v=String(v||'').trim();
    var m=v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m)return m[3]+'/'+m[2]+'/'+m[1];
    m=v.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    if(m)return m[1]+'/'+m[2]+'/'+m[3];
    return v||'-';
  }
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function statusKey(v){v=String(v||'pendente').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(v==='concluida'||v==='concluido')return 'concluida';if(v==='paga'||v==='pago')return 'paga';if(v==='confirmado')return 'confirmada';if(v==='cancelado')return 'cancelada';if(v==='recusado')return 'recusada';if(v==='expirado')return 'expirada';return v}
  function statusLabel(v){var k=statusKey(v);return {pendente:'Pendente',confirmada:'Confirmado',paga:'Pago',concluida:'Concluído',cancelada:'Cancelado',recusada:'Recusado',expirada:'Expirado'}[k]||'Pendente'}
  function releasedClosed(card){if(!card)return false;var released=String(card.dataset.liberado||'0')==='1';var k=statusKey(card.dataset.status);return released&&['cancelada','recusada','expirada'].includes(k)}
  function nextTime(slot){var date=slot.dataset.date,prof=slot.dataset.prof,start=normTime(slot.dataset.hour||q('.time',slot)?.textContent);var mins=[];qa('#agendaGrid .slot').forEach(function(s){if(s.dataset.date===date&&s.dataset.prof===prof){var t=normTime(s.dataset.hour||q('.time',s)?.textContent);if(t){var p=t.split(':');mins.push(Number(p[0])*60+Number(p[1]))}}});mins.sort(function(a,b){return a-b});var sp=start.split(':'),cur=Number(sp[0])*60+Number(sp[1]),n=mins.find(function(x){return x>cur});if(n==null)n=cur+30;return String(Math.floor(n/60)%24).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
  function reservationsFor(slot){var reservationId=String(slot.dataset.reservationId||'').trim();if(reservationId){var exact=q('#reservasGrid .reserva-card[data-id="'+CSS.escape(reservationId)+'"]');return exact&&!releasedClosed(exact)?[exact]:[]}var d=normDate(slot.dataset.date),p=String(slot.dataset.prof||''),h=normTime(slot.dataset.hour||q('.time',slot)?.textContent);return qa('#reservasGrid .reserva-card').filter(function(c){return !releasedClosed(c)&&normDate(c.dataset.date)===d&&String(c.dataset.prof||'')===p&&normTime(c.dataset.hour)===h})}
  function choose(cards){var order={pendente:1,confirmada:2,paga:3,concluida:3,cancelada:4,recusada:5};return cards.slice().sort(function(a,b){return (order[statusKey(a.dataset.status)]||9)-(order[statusKey(b.dataset.status)]||9)})[0]}
  function cleanService(v){v=String(v||'').replace(/\s+/g,' ').trim();if(!v)return 'Serviço não informado';var cut=v.split(/\s*\|\s*Obs\.?\s*:/i)[0];return cut.replace(/^Serviços? selecionados?:\s*/i,'').trim()||'Serviço não informado'}
  function decorate(){
    qa('#agendaGrid .slot').forEach(function(slot){
      slot.classList.remove('mf-v27-booked','mf-v27-pendente','mf-v27-confirmada','mf-v27-paga','mf-v27-concluida','mf-v27-cancelada','mf-v27-recusada','mf-v27-expirada');
      var old=q('.mf-v27-slot-card',slot);if(old)old.remove();
      var cards=reservationsFor(slot);
      if(!cards.length){
        delete slot.dataset.slotStatus;
        if(Number(slot.dataset.count||0)===0){slot.classList.remove('busy','lotado','quase-lotado')}
        return;
      }
      var card=choose(cards),k=statusKey(card.dataset.status),service=cleanService(card.dataset.servico||card.dataset.observacao),client=card.dataset.cliente||'Cliente',prof=card.dataset.prof||slot.dataset.prof||'',start=normTime(slot.dataset.hour||q('.time',slot)?.textContent),end=nextTime(slot);
      slot.classList.add('mf-v27-booked','mf-v27-'+k,'busy');
      var box=document.createElement('div');box.className='mf-v27-slot-card';box.innerHTML='<div class="mf-v27-slot-top"><span class="mf-v27-slot-time">'+esc(start+' – '+end)+'</span><span class="mf-v27-slot-status">'+esc(statusLabel(k))+'</span></div><div class="mf-v27-slot-client">'+esc(client)+'</div><div class="mf-v27-slot-service">'+esc(service)+'</div><div class="mf-v27-slot-prof">'+esc(prof)+'</div>';
      slot.appendChild(box);
    });
  }
  function moneyFrom(v){var m=String(v||'').match(/R\$\s*[\d.]+,\d{2}/);return m?m[0]:'—'}
  function paymentFrom(v){var m=String(v||'').match(/pagamento\s*=\s*([^|\s]+)/i);return m?m[1]:'Não informado'}
  function beautifyModal(card){
    if(!card)return;mfCurrentEditCard=card;var info=q('#modalAgendaReserva .modal-agenda-info');if(!info)return;
    var st=q('#modalAgendaStatus');
    var pd=q('#modalAgendaProfData');
    if(pd)pd.textContent=((card.dataset.prof||'Profissional').toUpperCase())+' – '+displayDate(card.dataset.date||'-');
    if(st){
      st.textContent=statusLabel(card.dataset.status).toUpperCase();
      var profRow=q('#modalAgendaReserva .modal-agenda-prof');
      if(profRow && st.parentElement!==profRow)profRow.appendChild(st);
    }
    // V276: o modal novo já possui seções estruturadas de cliente,
    // atendimento e financeiro. Não apagar esse conteúdo.
    if(info.classList.contains('mf-agenda-detail-grid'))return;
    var service=cleanService(card.dataset.servico||card.dataset.observacao),value=moneyFrom(card.dataset.servico||card.dataset.observacao),payment=paymentFrom(card.dataset.servico||card.dataset.observacao);
    info.innerHTML='';
    [
      ['Cliente',card.dataset.cliente||'—','modalAgendaCliente'],
      ['Telefone',card.dataset.telefone||'—','modalAgendaTelefone'],
      ['Serviço',service,'modalAgendaServico'],
      ['Profissional',card.dataset.prof||'—',''],
      ['Valor',value,''],
      ['Pagamento',payment,'']
    ].forEach(function(row){
      var d=document.createElement('div');
      d.className='mf-v27-info-row';
      d.innerHTML='<strong>'+esc(row[0])+':</strong><span'+(row[2]?' id="'+row[2]+'"':'')+'>'+esc(row[1])+'</span>';
      info.appendChild(d);
    });
  }
  document.addEventListener('DOMContentLoaded',function(){decorate();setTimeout(decorate,200)});
  document.addEventListener('mf:agenda-updated',function(){decorate();setTimeout(decorate,80)});
  document.addEventListener('mf:agenda-orphan-slots-changed',function(){decorate();setTimeout(decorate,40)});
  document.addEventListener('mf:horario-liberado',function(){decorate();setTimeout(decorate,40)});
  document.addEventListener('click',function(e){var slot=e.target.closest('#agendaGrid .slot.mf-v27-booked');if(slot){setTimeout(function(){var c=choose(reservationsFor(slot));beautifyModal(c)},0)}},true);
  var tries=0,t=setInterval(function(){tries++;if(typeof window.abrirModalReservaCard==='function'&&!window.abrirModalReservaCard.__mfv28){var original=window.abrirModalReservaCard;var wrap=function(card,lista){mfCurrentEditCard=card;var r=original.apply(this,arguments);setTimeout(function(){beautifyModal(card)},0);return r};wrap.__mfv28=true;window.abrirModalReservaCard=wrap;clearInterval(t)}if(tries>40)clearInterval(t)},100);


  function hardCloseModal(){
    var modal=q('#modalAgendaReserva');
    if(modal){modal.classList.remove('show');modal.setAttribute('aria-hidden','true');}
    var box=q('#modalAgendaListaHorario');if(box){box.style.display='none';box.innerHTML='';}
    document.documentElement.style.removeProperty('overflow');
    document.body.style.removeProperty('overflow');
  }

  function openBookedSlot(slot){
    if(!slot)return;
    var cards=reservationsFor(slot),card=choose(cards);
    if(!card)return;mfCurrentEditCard=card;
    if(typeof window.abrirModalReservaCard==='function'){
      window.abrirModalReservaCard(card,cards);
      setTimeout(function(){beautifyModal(card);var m=q('#modalAgendaReserva');if(m){m.classList.add('show');m.removeAttribute('aria-hidden');}},0);
    }else if(typeof window.abrirReservaAgendaSlot==='function'){
      window.abrirReservaAgendaSlot(slot);
    }
  }

  document.addEventListener('click',function(e){
    var close=e.target.closest('#modalAgendaReserva .modal-agenda-close');
    if(close){e.preventDefault();e.stopPropagation();hardCloseModal();return;}
    var modal=e.target.closest('#modalAgendaReserva');
    if(modal&&e.target===modal){hardCloseModal();return;}
    var slot=e.target.closest('#agendaGrid .slot.mf-v27-booked');
    if(slot){e.preventDefault();e.stopPropagation();openBookedSlot(slot);}
  },true);

  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&q('#modalAgendaReserva.show'))hardCloseModal()});

  var closeTries=0,closeTimer=setInterval(function(){
    closeTries++;
    if(typeof window.fecharModalAgenda==='function'&&!window.fecharModalAgenda.__mfv28){
      var originalClose=window.fecharModalAgenda;
      var closeWrap=function(){try{originalClose.apply(this,arguments)}finally{hardCloseModal()}};
      closeWrap.__mfv28=true;window.fecharModalAgenda=closeWrap;clearInterval(closeTimer);
    }
    if(closeTries>50)clearInterval(closeTimer);
  },100);

  var mfCurrentEditCard=null;
  function editModal(){return q('#modalEditarAgendamento')}
  function currentEditCard(){return mfCurrentEditCard||window.modalAgendaCardAtual||null}
  function availableTimes(date,profId,profName){
    var out=[];
    qa('#agendaGrid .slot').forEach(function(slot){
      var slotDate=normDate(slot.dataset.date),slotProf=String(slot.dataset.prof||'');
      var slotProfId=String(slot.dataset.profId||slot.getAttribute('data-prof-id')||'');
      if(slotDate!==normDate(date))return;
      if(slotProfId&&String(profId)!==slotProfId)return;
      if(!slotProfId&&profName&&slotProf!==profName)return;
      var h=normTime(slot.dataset.hour||q('.time',slot)?.textContent);
      if(h&&!out.includes(h))out.push(h);
    });
    return out.sort();
  }
  function refreshEditTimes(preferred){
    var data=q('#editarAgendaData')?.value||'',ps=q('#editarAgendaProfissional'),profId=ps?.value||'',profName=ps?.selectedOptions?.[0]?.dataset.nome||ps?.selectedOptions?.[0]?.textContent||'';
    var select=q('#editarAgendaHorario');if(!select)return;
    var times=availableTimes(data,profId,profName);
    select.innerHTML='';
    times.forEach(function(h){var o=document.createElement('option');o.value=h;o.textContent=h;select.appendChild(o)});
    if(preferred&&times.includes(preferred))select.value=preferred;
    if(!times.length){var o=document.createElement('option');o.value='';o.textContent='Nenhum horário cadastrado';select.appendChild(o)}
  }
  window.abrirEditarAgendamento=function(){
    var card=currentEditCard();if(!card){if(window.mfAlert)mfAlert('Agendamento não encontrado. Feche e abra o card novamente.');else alert('Agendamento não encontrado. Feche e abra o card novamente.');return;}
    var m=editModal();if(!m)return;
    var data=q('#editarAgendaData'),prof=q('#editarAgendaProfissional'),serv=q('#editarAgendaServico');
    if(data)data.value=normDate(card.dataset.date);
    if(prof){var target=String(card.dataset.prof||'').trim().toLowerCase();Array.from(prof.options).forEach(function(o){if(String(o.dataset.nome||o.textContent).trim().toLowerCase()===target)prof.value=o.value})}
    if(serv){serv.value='';var current=cleanService(card.dataset.servico||card.dataset.observacao).toLowerCase();Array.from(serv.options).forEach(function(o){if(o.dataset.nome&&current.includes(String(o.dataset.nome).toLowerCase()))serv.value=o.value})}
    refreshEditTimes(normTime(card.dataset.hour));
    q('#modalAgendaReserva')?.classList.remove('show');
    m.classList.add('show');m.removeAttribute('aria-hidden');
  };
  window.fecharEditarAgendamento=function(){var m=editModal();if(m)m.classList.remove('show')};
  window.salvarEditarAgendamento=async function(){
    var card=currentEditCard();if(!card)return;
    var btn=q('#salvarEditarAgendamento'),payload={data:q('#editarAgendaData')?.value||'',horario:q('#editarAgendaHorario')?.value||'',profissional_id:Number(q('#editarAgendaProfissional')?.value||0)||null,servico_id:Number(q('#editarAgendaServico')?.value||0)||null};
    if(!payload.data||!payload.horario){if(window.mfAlert)mfAlert('Escolha uma data e um horário cadastrados.');else alert('Escolha uma data e um horário cadastrados.');return}
    if(btn){btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Salvando'}
    try{
      var r=await fetch('/reservas/'+card.dataset.id+'/editar',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),j=await r.json();
      if(!r.ok||j.error)throw new Error(j.error||'Não foi possível salvar.');
      window.fecharEditarAgendamento();
      if(typeof window.mfLoadAgendaDate==='function')await window.mfLoadAgendaDate(payload.data);
      else location.href=location.pathname+'?data='+encodeURIComponent(payload.data);
    }catch(err){if(window.mfAlert)mfAlert(err.message);else alert(err.message);if(btn){btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-check"></i> Salvar'}}
  };
  document.addEventListener('change',function(e){if(e.target&&['editarAgendaData','editarAgendaProfissional'].includes(e.target.id))refreshEditTimes()});
  document.addEventListener('click',function(e){var m=editModal();if(m&&e.target===m)window.fecharEditarAgendamento()});

  function selectedAgendaDate(){return q('#dataAgendaDia')?.value||normDate(currentEditCard()?.dataset.date||'')}
  function finishValue(card){
    var source=String(card?.dataset.servico||card?.dataset.observacao||'');
    var m=source.match(/R\$\s*([0-9.]+,\d{2})/i);
    if(m)return Number(String(m[1]).replace(/\./g,'').replace(',','.'))||0;
    m=source.match(/valor\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);
    return m?Number(m[1]||0):0;
  }
  async function refreshAgendaAfterAction(date){
    if(typeof window.fecharModalAgenda==='function')window.fecharModalAgenda();
    if(typeof window.mfLoadAgendaDate==='function')await window.mfLoadAgendaDate(date||selectedAgendaDate());
    else location.reload();
  }
  function installLiveAgendaActions(){
    var modernPayment=!!q('#pagamentoReservaTipo');
    var modalPayment=q('#modalAgendaPagoBtn');
    if(modalPayment&&modernPayment){
      modalPayment.innerHTML='<i class="fa-solid fa-cash-register"></i><span>Registrar pagamento</span>';
      modalPayment.classList.remove('mf-finalizar-atendimento');
    }

    // Mantém a referência do card para o modal de pagamento novo, sem trocar
    // a função por aquela versão antiga que concluía o atendimento.
    var originalFinalize=window.finalizarReservaFinanceiroCard;
    if(typeof originalFinalize==='function'&&!originalFinalize.__mfLiveCount){
      var finalizeWrap=function(card){window.__mfAgendaFinishCard=card||currentEditCard();return originalFinalize.apply(this,arguments)};
      finalizeWrap.__mfLiveCount=true;window.finalizarReservaFinanceiroCard=finalizeWrap;
    }

    // Compatibilidade somente para páginas antigas que ainda não possuem o
    // formulário V276. Na Agenda atual, confirmarPagamentoReserva permanece
    // responsável apenas pelo pagamento manual.
    if(!modernPayment){
      window.confirmarPagamentoReserva=async function(pagamento){
        var card=window.__mfAgendaFinishCard||currentEditCard();
        if(!card)return;
        var date=normDate(card.dataset.date||selectedAgendaDate());
        try{
          var r=await fetch('/reservas/'+card.dataset.id+'/concluir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valor:finishValue(card),pagamento:pagamento})});
          var j=await r.json();
          if(!r.ok||j.error)throw new Error(j.error||'Não foi possível finalizar o atendimento.');
          if(typeof window.fecharModalPagamentoReserva==='function')window.fecharModalPagamentoReserva();
          window.__mfAgendaFinishCard=null;
          await refreshAgendaAfterAction(selectedAgendaDate()||date);
        }catch(err){if(window.mfAlert)mfAlert(err.message);else alert(err.message)}
      };
    }

    window.atualizarReserva=async function(id,status){
      var date=selectedAgendaDate();
      try{
        var r=await fetch('/reservas/'+id+'/status',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:status})});
        var j=await r.json();
        if(!r.ok||j.error)throw new Error(j.error||'Não foi possível atualizar o agendamento.');
        await refreshAgendaAfterAction(date);
      }catch(err){if(window.mfAlert)mfAlert(err.message);else alert(err.message)}
    };
  }

  document.addEventListener('DOMContentLoaded',function(){installLiveAgendaActions();setTimeout(installLiveAgendaActions,250)});
  document.addEventListener('mf:agenda-updated',function(){decorate();installLiveAgendaActions();if(typeof window.mfRefreshAgendaDayCounts==='function')window.mfRefreshAgendaDayCounts()});


  // =============================================================
  // V277 — ações suaves, confirmação automática e edição pós-conclusão
  // =============================================================
  function v277CardById(id){return q('#reservasGrid .reserva-card[data-id="'+CSS.escape(String(id||''))+'"]')}
  function v277CollapseState(){var out={};['agendaDia','entitiesCard','setupCard','historyCard'].forEach(function(id){var el=q('#'+id);if(el)out[id]=el.classList.contains('collapsed')});return out}
  function v277RestoreCollapse(state){Object.keys(state||{}).forEach(function(id){var el=q('#'+id);if(!el)return;el.classList.toggle('collapsed',!!state[id]);var ico=q('.collapse-btn i',el);if(ico){ico.classList.toggle('fa-chevron-down',!!state[id]);ico.classList.toggle('fa-chevron-up',!state[id])}})}
  function v277SetBusy(on){document.body.classList.toggle('mf-agenda-soft-refresh',!!on)}
  async function v277Refresh(options){
    options=options||{};
    var scrollY=window.scrollY||0, collapsed=v277CollapseState();
    var status=q('#statusTabs .tab.active')?.dataset.status||'todas';
    var prof=q('#profTabsAgenda .prof-tab.active')?.dataset.prof||localStorage.getItem('mf_admin_prof_agenda')||'';
    var date=options.date||q('#dataAgendaDia')?.value||'';
    var reopenId=options.reopenId||'';
    v277SetBusy(true);
    try{
      var url=new URL(window.location.href);if(date)url.searchParams.set('data',date);url.searchParams.set('_v277',Date.now());
      var response=await fetch(url.toString(),{cache:'no-store',credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest'}});if(!response.ok)throw new Error('Falha ao atualizar a agenda');
      var doc=new DOMParser().parseFromString(await response.text(),'text/html');
      ['entitiesCard','setupCard','agendaDia','statusTabs','reservasGrid','reservasEmpty'].forEach(function(id){var current=q('#'+id),incoming=doc.getElementById(id);if(current&&incoming)current.innerHTML=incoming.innerHTML});
      var editCurrent=q('#modalEditarAgendamento'),editIncoming=doc.getElementById('modalEditarAgendamento');if(editCurrent&&editIncoming&&!editCurrent.classList.contains('show'))editCurrent.innerHTML=editIncoming.innerHTML;
      v277RestoreCollapse(collapsed);
      if(prof)localStorage.setItem('mf_admin_prof_agenda',prof);
      if(typeof window.bindStatusTabs==='function')window.bindStatusTabs();
      if(typeof window.bindProfTabs==='function')window.bindProfTabs();
      if(typeof window.contarAgendamentos==='function')window.contarAgendamentos();
      if(typeof window.filtrarAgendamentos==='function')window.filtrarAgendamentos(status);
      if(typeof window.initAgenda==='function')window.initAgenda();
      if(typeof window.syncAgendaSlotStatusColors==='function')window.syncAgendaSlotStatusColors();
      document.dispatchEvent(new CustomEvent('mf:agenda-updated',{detail:{date:date,source:'v277'}}));
      url.searchParams.delete('_v277');history.replaceState({},'',url.pathname+url.search);
      requestAnimationFrame(function(){window.scrollTo({top:scrollY,left:0,behavior:'auto'});if(reopenId){var card=v277CardById(reopenId);if(card&&typeof window.abrirModalReservaCard==='function')window.abrirModalReservaCard(card)}});
      return true;
    }catch(err){console.error(err);if(window.mfAlert)mfAlert('A alteração foi salva, mas não foi possível atualizar a tela automaticamente.');return false}
    finally{setTimeout(function(){v277SetBusy(false)},160)}
  }
  window.mfRefreshReservasView=v277Refresh;

  // Agenda aberta por padrão; a escolha manual permanece durante a sessão.
  var originalToggle=window.toggleCard;
  window.toggleCard=function(id){if(typeof originalToggle==='function')originalToggle(id);var el=q('#'+id);if(id==='agendaDia'&&el)sessionStorage.setItem('mf_agenda_dia_collapsed',el.classList.contains('collapsed')?'1':'0')};
  (function(){var el=q('#agendaDia');if(!el)return;var saved=sessionStorage.getItem('mf_agenda_dia_collapsed');el.classList.toggle('collapsed',saved==='1');v277RestoreCollapse({agendaDia:el.classList.contains('collapsed')})})();

  window.reabrirAtendimentoAgenda=async function(){
    var card=window.modalAgendaCardAtual||currentEditCard();if(!card)return;
    var ok=typeof window.mfConfirm==='function'?await mfConfirm('Reabrir este atendimento? Ele voltará para Confirmado e poderá ser editado novamente.',{title:'Reabrir atendimento',type:'warning',confirmText:'Reabrir'}):confirm('Reabrir este atendimento?');if(!ok)return;
    await window.atualizarReserva(card.dataset.id,'confirmada');
  };

  // Substitui a atualização antiga por uma versão que não recarrega a página.
  window.atualizarReserva=async function(id,status){
    try{var r=await fetch('/reservas/'+id+'/status',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:status})}),data=await r.json();if(!r.ok||data.error)throw new Error(data.error||'Não foi possível atualizar o agendamento.');await v277Refresh({reopenId:id});}
    catch(err){if(window.mfAlert)mfAlert(err.message);else alert(err.message)}
  };

  // Ações de cadastro/exclusão também atualizam apenas os blocos afetados.
  window.adicionarProfissional=async function(){var input=q('#novoProfissionalNome');var nome=String(input?.value||'').trim();if(!nome){mfAlert('Digite o nome.');return}var r=await fetch('/profissionais',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({empresa_id:Number(document.body.dataset.empresaId||0)||Number((location.pathname.match(/\/admin\/(\d+)/)||[])[1]),nome:nome,ativo:true})});var data=await r.json();if(!r.ok||data.error){mfAlert(data.error||'Não foi possível cadastrar.');return}if(input)input.value='';await v277Refresh()};
  window.removerProfissionalSelecionado=async function(){var sel=q('#profissionalAgenda');if(!sel||!sel.value){mfAlert('Selecione um profissional.');return}var nome=sel.selectedOptions?.[0]?.textContent||'este profissional';var ok=await mfConfirm('Remover '+nome+' da agenda? O histórico será mantido.',{title:'Remover profissional',type:'warning',confirmText:'Remover'});if(!ok)return;var r=await fetch('/profissionais/'+encodeURIComponent(sel.value),{method:'DELETE'}),data=await r.json().catch(function(){return {}});if(!r.ok||data.error){mfAlert(data.error||'Não foi possível remover.');return}await v277Refresh()};
  window.excluirHorario=async function(id){var ok=await mfConfirm('Excluir este horário? Esta ação não poderá ser desfeita.',{title:'Excluir horário',type:'warning',confirmText:'Excluir'});if(!ok)return;var r=await fetch('/horarios-reserva/'+id,{method:'DELETE'});if(!r.ok){mfAlert('Não foi possível excluir o horário.');return}await v277Refresh()};


  // Edita sem perder a posição e reabre o mesmo atendimento após salvar.
  window.salvarEditarAgendamento=async function(){
    var card=currentEditCard();if(!card)return;
    var btn=q('#salvarEditarAgendamento');
    var payload={data:q('#editarAgendaData')?.value||'',horario:q('#editarAgendaHorario')?.value||'',profissional_id:Number(q('#editarAgendaProfissional')?.value||0)||null,servico_id:Number(q('#editarAgendaServico')?.value||0)||null};
    if(!payload.data||!payload.horario){mfAlert('Escolha uma data e um horário cadastrados.');return}
    if(btn){btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Salvando'}
    try{
      var response=await fetch('/reservas/'+card.dataset.id+'/editar',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      var data=await response.json();if(!response.ok||data.error)throw new Error(data.error||'Não foi possível salvar.');
      window.fecharEditarAgendamento();
      await v277Refresh({date:payload.data,reopenId:card.dataset.id});
    }catch(err){mfAlert(err.message)}
    finally{if(btn){btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-check"></i> Salvar'}}
  };

  // Ajusta os botões conforme o estado do atendimento.
  var originalOpen=window.abrirModalReservaCard;
  if(typeof originalOpen==='function'){
    window.abrirModalReservaCard=function(card,lista){var result=originalOpen.apply(this,arguments);setTimeout(function(){var st=statusKey(card?.dataset.status);var completed=st==='concluida'||st==='paga';var closed=['cancelada','recusada','expirada'].includes(st);var edit=q('#modalAgendaEditarBtn'),pay=q('#modalAgendaPagoBtn'),reopen=q('#modalAgendaReabrirBtn');if(edit)edit.style.display=closed?'none':'';if(pay){var remaining=Number(card?.dataset.valorRestante||0);pay.style.display=(!closed&&(remaining>0.005||completed))?'':'none';pay.innerHTML='<i class="fa-solid fa-cash-register"></i>'+((completed&&remaining<=0.005)?'Ajustar pagamento':'Registrar pagamento')}if(reopen)reopen.style.display=completed?'':'none'},0);return result};
  }

})();
