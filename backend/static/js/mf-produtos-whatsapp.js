(function(){
  'use strict';
  function normal(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/_/g,' ').replace(/\s+/g,' ')}
  function cleanPhone(value){var phone=String(value||'').replace(/\D/g,'');if((phone.length===10||phone.length===11)&&!phone.startsWith('55')) phone='55'+phone;return phone}
  function text(node){return node?String(node.textContent||'').replace(/\s+/g,' ').trim():''}
  function statusLabel(value){
    var status=normal(value);
    return {
      'aguardando pagamento':'Aguardando pagamento','novo':'Novo','pagamento confirmado':'Pagamento confirmado','recebido':'Recebido',
      'em separacao':'Em separação','em preparo':'Em preparo','pronto para retirada':'Pronto para retirada','enviado':'Enviado',
      'saiu para entrega':'Saiu para entrega','finalizado':'Concluído','concluido':'Concluído','cancelado':'Cancelado'
    }[status]||String(value||'Atualizado');
  }
  function statusMessage(value,type){
    var status=normal(value);
    if(status==='aguardando pagamento') return 'Estamos aguardando a confirmação do pagamento para continuar.';
    if(status==='novo') return 'Recebemos o seu pedido e ele já está em nossa central.';
    if(status==='pagamento confirmado') return 'O pagamento foi confirmado e o pedido seguirá para atendimento.';
    if(status==='recebido') return 'O pedido foi recebido e será atendido pela nossa equipe.';
    if(status==='em separacao') return 'O pedido está em separação.';
    if(status==='em preparo') return 'O pedido está em preparo.';
    if(status==='pronto para retirada') return 'O pedido está pronto para retirada no estabelecimento.';
    if(status==='enviado') return type.toLowerCase().includes('retirada') ? 'O pedido está pronto para retirada no estabelecimento.' : 'O pedido foi enviado.';
    if(status==='saiu para entrega') return 'O pedido saiu para entrega e está a caminho.';
    if(status==='finalizado'||status==='concluido') return 'O pedido foi concluído. Agradecemos pela preferência.';
    if(status==='cancelado') return 'O pedido foi cancelado. Entre em contato conosco caso precise de esclarecimentos.';
    return 'Temos uma atualização sobre o seu pedido.';
  }
  function data(card){
    var select=card.querySelector('.product-status,.pp-status select');
    var items=Array.from(card.querySelectorAll('.product-item,.pp-item')).map(function(item){return text(item)}).filter(Boolean);
    var total=card.dataset.total;
    if(total!==undefined && total!=='') total=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(total||0));
    else total=text(card.querySelector('.product-order-total strong,.pp-total>strong'));
    return {
      phone:cleanPhone(card.dataset.phone||text(card.querySelector('.pp-badge'))),
      number:card.dataset.number||text(card.querySelector('.product-order-number,.pp-order-id strong')),
      client:card.dataset.client||text(card.querySelector('.product-order-client,.pp-order-id span'))||'Cliente',
      type:card.dataset.type||((text(card.querySelector('.product-order-time,.pp-order-id small')).split('·').pop())||'Pedido').trim(),
      status:select?select.value:(card.dataset.status||'novo'),
      company:card.dataset.company||document.title.split('-')[0].trim()||'MenuFacile',
      items:items,total:total
    };
  }
  function message(card){
    var d=data(card);
    var lines=['Olá, '+d.client+'!','',statusMessage(d.status,d.type),'','Pedido: '+d.number,'Empresa: '+d.company,'Status atual: '+statusLabel(d.status),'Recebimento: '+d.type];
    if(d.items.length){lines.push('','Itens:');d.items.forEach(function(item){lines.push('- '+item)})}
    if(d.total) lines.push('','Total: '+d.total);
    lines.push('','Obrigado!');
    return lines.join('\n');
  }
  async function open(card){
    if(!card) return;
    var d=data(card);
    if(!d.phone){await mfAlert('Telefone não informado para este cliente.',{title:'WhatsApp indisponível',type:'warning'});return}
    window.open('https://wa.me/'+d.phone+'?text='+encodeURIComponent(message(card)),'_blank','noopener');
  }
  window.mensagemWhatsAppProduto=message;
  window.ppMensagemWhatsApp=message;
  window.abrirWhatsAppProduto=open;
  window.ppAbrirWhatsAppPedido=open;
})();
