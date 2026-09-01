(function(){
  'use strict';
  if(window.__MF_AGENDA_WA_STATUS_V736__) return;
  window.__MF_AGENDA_WA_STATUS_V736__ = true;

  function cleanPhone(value){ return String(value || '').replace(/\D/g, ''); }
  function formatDate(value){
    var v = String(value || '').trim();
    var m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m) return m[3] + '/' + m[2] + '/' + m[1];
    m = v.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
    if(m) return m[1] + '/' + m[2] + '/' + m[3];
    return v;
  }
  function normalizeStatus(value){
    var v = String(value || 'pendente').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if(v === 'confirmado') return 'confirmada';
    if(v === 'pago') return 'paga';
    if(v === 'concluido') return 'concluida';
    if(v === 'cancelado') return 'cancelada';
    if(v === 'recusado') return 'recusada';
    return v;
  }
  function cleanService(value){
    var v = String(value || '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
    v = v.split(/FINANCEIRO_SERVICO/i)[0].trim();
    v = v.split(/\|\s*Obs\.?\s*:/i)[0].trim();
    v = v.replace(/^Serviços? selecionados?:\s*/i, '').trim();
    return v || 'Serviço não informado';
  }
  function companyName(){
    var node = document.querySelector('[data-empresa-nome]');
    return (node && node.dataset.empresaNome) || document.title.split('-')[0].trim() || 'MenuFacile';
  }
  function messageFor(card, type){
    var nome = card.dataset.cliente || 'cliente';
    var data = formatDate(card.dataset.date || '');
    var hora = card.dataset.hour || '';
    var profissional = card.dataset.prof || 'profissional não informado';
    var servico = cleanService(card.dataset.servico || card.dataset.observacao || '');
    var status = normalizeStatus(card.dataset.status);
    var empresa = companyName();
    var detalhes = '\nData: ' + data + '\nHorário: ' + hora + '\nProfissional: ' + profissional + '\nServiço: ' + servico;

    if(type === 'lembrete'){
      return 'Olá, ' + nome + '!\n\nPassando para lembrar do seu agendamento.' + detalhes + '\n\nAguardamos você!\n' + empresa;
    }

    var textos = {
      pendente: 'Recebemos sua solicitação de agendamento. Ela está aguardando confirmação.',
      confirmada: 'Seu agendamento foi confirmado.',
      paga: 'O pagamento do seu agendamento foi confirmado.',
      recusada: 'Não foi possível confirmar o seu agendamento.',
      cancelada: 'Seu agendamento foi cancelado.',
      concluida: 'Seu atendimento foi concluído. Agradecemos pela preferência!'
    };
    var abertura = textos[status] || textos.pendente;
    return 'Olá, ' + nome + '!\n\n' + abertura + detalhes + '\n\n' + empresa;
  }
  function openWhatsApp(card, type){
    var telefone = cleanPhone(card.dataset.telefone);
    if(!telefone){
      if(typeof window.mfAlert === 'function') window.mfAlert('Telefone do cliente não informado.');
      else alert('Telefone do cliente não informado.');
      return;
    }
    if(type === 'chat'){
      window.open('https://wa.me/' + telefone, '_blank');
      return;
    }
    var message = messageFor(card, type);
    window.open('https://wa.me/' + telefone + '?text=' + encodeURIComponent(message), '_blank');
  }
  function ensureStyle(){
    if(document.getElementById('mfWaStatusChoiceStyle')) return;
    var style = document.createElement('style');
    style.id = 'mfWaStatusChoiceStyle';
    style.textContent = '.mf-wa-status-choice{position:fixed;inset:0;z-index:1000000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.55)}.mf-wa-status-choice.open{display:flex}.mf-wa-status-card{width:min(390px,100%);padding:20px;border-radius:22px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.28)}.mf-wa-status-card h3{margin:0 0 6px;color:#0b2d91;font-size:20px}.mf-wa-status-card p{margin:0 0 16px;color:#667085;font-size:13px;font-weight:700}.mf-wa-status-actions{display:grid;gap:9px}.mf-wa-status-actions button{min-height:44px;border:0;border-radius:13px;font:800 13px Inter,Arial,sans-serif;cursor:pointer}.mf-wa-send{background:#087443;color:#fff}.mf-wa-reminder{background:#eef3ff;color:#0b2d91}.mf-wa-chat{background:#18a66b;color:#fff}.mf-wa-back{background:#eef1f5;color:#475467}';
    document.head.appendChild(style);
  }
  function chooser(card){
    ensureStyle();
    var modal = document.getElementById('mfWaStatusChoice');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'mfWaStatusChoice';
      modal.className = 'mf-wa-status-choice';
      modal.innerHTML = '<div class="mf-wa-status-card"><h3>Avisar cliente pelo WhatsApp</h3><p>Escolha o que deseja enviar ao cliente.</p><div class="mf-wa-status-actions"><button type="button" class="mf-wa-send">Enviar aviso</button><button type="button" class="mf-wa-reminder">Enviar lembrete</button><button type="button" class="mf-wa-chat">Escrever para o cliente</button><button type="button" class="mf-wa-back">Voltar</button></div></div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', function(event){ if(event.target === modal) modal.classList.remove('open'); });
      modal.querySelector('.mf-wa-back').addEventListener('click', function(){ modal.classList.remove('open'); });
    }
    modal.classList.add('open');
    modal.querySelector('.mf-wa-send').onclick = function(){ modal.classList.remove('open'); openWhatsApp(card, 'status'); };
    modal.querySelector('.mf-wa-reminder').onclick = function(){ modal.classList.remove('open'); openWhatsApp(card, 'lembrete'); };
    modal.querySelector('.mf-wa-chat').onclick = function(){ modal.classList.remove('open'); openWhatsApp(card, 'chat'); };
  }
  function install(){
    window.avisarWhatsappReserva = function(card){
      if(!card){
        if(typeof window.mfAlert === 'function') window.mfAlert('Agendamento não encontrado.');
        return;
      }
      chooser(card);
    };
  }
  install();
  document.addEventListener('DOMContentLoaded', install);
  setTimeout(install, 300);
  setTimeout(install, 1200);
})();
