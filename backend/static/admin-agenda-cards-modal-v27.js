(function(){
  'use strict';
  if(window.__MF_AGENDA_V27__)return;window.__MF_AGENDA_V27__=true;
  function q(s,r){return (r||document).querySelector(s)}
  function qa(s,r){return Array.from((r||document).querySelectorAll(s))}
  function normDate(v){v=String(v||'').trim();var m=v.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m)return m[1]+'-'+m[2]+'-'+m[3];m=v.match(/^(\d{2})[-\/]([0-9]{2})[-\/](\d{4})$/);return m?m[3]+'-'+m[2]+'-'+m[1]:v}
  function normTime(v){var m=String(v||'').match(/(\d{1,2}):(\d{2})/);return m?String(m[1]).padStart(2,'0')+':'+m[2]:''}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function statusKey(v){v=String(v||'pendente').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(v==='concluida'||v==='concluido')return 'concluida';if(v==='paga'||v==='pago')return 'paga';if(v==='confirmado')return 'confirmada';if(v==='cancelado')return 'cancelada';if(v==='recusado')return 'recusada';return v}
  function statusLabel(v){var k=statusKey(v);return {pendente:'Pendente',confirmada:'Confirmado',paga:'Pago',concluida:'Concluído',cancelada:'Cancelado',recusada:'Recusado'}[k]||'Pendente'}
  function nextTime(slot){var date=slot.dataset.date,prof=slot.dataset.prof,start=normTime(slot.dataset.hour||q('.time',slot)?.textContent);var mins=[];qa('#agendaGrid .slot').forEach(function(s){if(s.dataset.date===date&&s.dataset.prof===prof){var t=normTime(s.dataset.hour||q('.time',s)?.textContent);if(t){var p=t.split(':');mins.push(Number(p[0])*60+Number(p[1]))}}});mins.sort(function(a,b){return a-b});var sp=start.split(':'),cur=Number(sp[0])*60+Number(sp[1]),n=mins.find(function(x){return x>cur});if(n==null)n=cur+30;return String(Math.floor(n/60)%24).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
  function reservationsFor(slot){var d=normDate(slot.dataset.date),p=String(slot.dataset.prof||''),h=normTime(slot.dataset.hour||q('.time',slot)?.textContent);return qa('#reservasGrid .reserva-card').filter(function(c){return normDate(c.dataset.date)===d&&String(c.dataset.prof||'')===p&&normTime(c.dataset.hour)===h})}
  function choose(cards){var order={pendente:1,confirmada:2,paga:3,concluida:3,cancelada:4,recusada:5};return cards.slice().sort(function(a,b){return (order[statusKey(a.dataset.status)]||9)-(order[statusKey(b.dataset.status)]||9)})[0]}
  function cleanService(v){v=String(v||'').replace(/\s+/g,' ').trim();if(!v)return 'Serviço não informado';var cut=v.split(/\s*\|\s*Obs\.?\s*:/i)[0];return cut.replace(/^Serviços? selecionados?:\s*/i,'').trim()||'Serviço não informado'}
  function decorate(){
    qa('#agendaGrid .slot').forEach(function(slot){
      slot.classList.remove('mf-v27-booked','mf-v27-pendente','mf-v27-confirmada','mf-v27-paga','mf-v27-concluida','mf-v27-cancelada','mf-v27-recusada');
      var old=q('.mf-v27-slot-card',slot);if(old)old.remove();
      var cards=reservationsFor(slot);if(!cards.length)return;
      var card=choose(cards),k=statusKey(card.dataset.status),service=cleanService(card.dataset.servico||card.dataset.observacao),client=card.dataset.cliente||'Cliente',prof=card.dataset.prof||slot.dataset.prof||'',start=normTime(slot.dataset.hour||q('.time',slot)?.textContent),end=nextTime(slot);
      slot.classList.add('mf-v27-booked','mf-v27-'+k,'busy');
      var box=document.createElement('div');box.className='mf-v27-slot-card';box.innerHTML='<div class="mf-v27-slot-top"><span class="mf-v27-slot-time">'+esc(start+' – '+end)+'</span><span class="mf-v27-slot-status">'+esc(statusLabel(k))+'</span></div><div class="mf-v27-slot-client">'+esc(client)+'</div><div class="mf-v27-slot-service">'+esc(service)+'</div><div class="mf-v27-slot-prof">'+esc(prof)+'</div>';
      slot.appendChild(box);
    });
  }
  function moneyFrom(v){var m=String(v||'').match(/R\$\s*[\d.]+,\d{2}/);return m?m[0]:'—'}
  function paymentFrom(v){var m=String(v||'').match(/pagamento\s*=\s*([^|\s]+)/i);return m?m[1]:'Não informado'}
  function beautifyModal(card){
    if(!card)return;var info=q('#modalAgendaReserva .modal-agenda-info');if(!info)return;
    var service=cleanService(card.dataset.servico||card.dataset.observacao),value=moneyFrom(card.dataset.servico||card.dataset.observacao),payment=paymentFrom(card.dataset.servico||card.dataset.observacao);
    info.innerHTML='';[['Cliente',card.dataset.cliente||'—'],['Telefone',card.dataset.telefone||'—'],['Serviço',service],['Profissional',card.dataset.prof||'—'],['Valor',value],['Pagamento',payment]].forEach(function(row){var d=document.createElement('div');d.className='mf-v27-info-row';d.innerHTML='<strong>'+esc(row[0])+':</strong><span>'+esc(row[1])+'</span>';info.appendChild(d)});
    var st=q('#modalAgendaStatus');if(st)st.textContent=statusLabel(card.dataset.status);
  }
  document.addEventListener('DOMContentLoaded',function(){decorate();setTimeout(decorate,200)});
  document.addEventListener('click',function(e){var slot=e.target.closest('#agendaGrid .slot.mf-v27-booked');if(slot){setTimeout(function(){var c=choose(reservationsFor(slot));beautifyModal(c)},0)}},true);
  var tries=0,t=setInterval(function(){tries++;if(typeof window.abrirModalReservaCard==='function'&&!window.abrirModalReservaCard.__mfv27){var original=window.abrirModalReservaCard;var wrap=function(card,lista){var r=original.apply(this,arguments);setTimeout(function(){beautifyModal(card)},0);return r};wrap.__mfv27=true;window.abrirModalReservaCard=wrap;clearInterval(t)}if(tries>40)clearInterval(t)},100);
})();
