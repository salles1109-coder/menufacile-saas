(()=>{
  const $=id=>document.getElementById(id), cfg=window.MF_ORDERS_CONFIG||{};
  const trigger=$('mfOrdersTrigger'), overlay=$('mfOrdersOverlay');
  if(!trigger||!overlay||!cfg.slug)return;

  const cancelOverlay=$('mfProductCancelOverlay');
  const cancelBack=$('mfProductCancelBack');
  const cancelConfirm=$('mfProductCancelConfirm');
  let cancelTarget=null;
  let lastLookupCpf='';
  let lastLookupName='';
  let lastLookupPhone='';

  const close=()=>{overlay.hidden=true;document.body.style.overflow=''};
  const open=()=>{overlay.hidden=false;document.body.style.overflow='hidden';setTimeout(()=>$(cfg.cpfOnly?'mfOrdersCpf':'mfOrdersName')?.focus(),50)};
  trigger.addEventListener('click',open); $('mfOrdersClose').addEventListener('click',close);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    if(cancelOverlay&&!cancelOverlay.hidden){closeCancelModal();return}
    if(!overlay.hidden)close();
  });
  $('mfOrdersBack').addEventListener('click',()=>{$('mfOrdersResults').hidden=true;$('mfOrdersSearch').hidden=false});

  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
  const badge=(text,kind='')=>`<span class="mf-order-badge ${kind}">${esc(text)}</span>`;
  const onlyDigits=v=>String(v||'').replace(/\D/g,'');

  const whatsappNumber=()=>{
    let d=onlyDigits(cfg.whatsapp||'').replace(/^0+/, '');
    if(d.length===10||d.length===11)d='55'+d;
    return d;
  };
  const showResultMessage=text=>{
    const el=$('mfOrdersResultMessage');
    if(!el)return;
    el.textContent=text||'';
    el.classList.toggle('is-visible',Boolean(text));
  };

  const card=o=>{
    const items=(o.itens||[]).map(i=>`<div class="mf-order-item"><span>${esc(i.quantidade)}× ${esc(i.nome)}</span><span>${money(i.subtotal)}</span></div>`).join('');
    const payKind=o.pagamento_cor==='ok'?'is-ok':o.pagamento_cor==='bad'?'is-bad':'is-wait';
    const orderKind=o.pedido_cor==='ok'?'is-ok':o.pedido_cor==='bad'?'is-bad':'is-wait';
    const pix=o.pode_continuar_pix?`<div class="mf-order-pix"><button type="button" data-pix="${esc(o.tipo)}:${esc(o.id)}:${esc(o.token)}">Continuar pagamento Pix</button><div class="mf-order-pix-panel" id="mfPix-${esc(o.tipo)}-${esc(o.id)}" hidden></div></div>`:'';
    const pixManual=o.pode_copiar_pix_manual&&o.pix_manual_chave?`<div class="mf-order-pix"><button type="button" data-manual-pix="${esc(o.pix_manual_chave)}">Copiar chave Pix</button><small>A chave fica oculta na tela.</small></div>`:'';
    let actions='';
    if(o.tipo==='pedido'&&o.pode_cancelar_pedido){
      actions+=`<button type="button" class="mf-order-action-v916 is-cancel" data-cancel-order="${esc(o.id)}" data-cancel-token="${esc(o.token)}" data-cancel-title="${esc(o.titulo)}">Cancelar pedido</button>`;
    }
    if(o.tipo==='pedido'&&o.pode_solicitar_cancelamento){
      actions+=`<button type="button" class="mf-order-action-v916 is-whatsapp" data-request-cancel="${esc(o.numero_pedido||o.id)}" data-request-total="${esc(o.total)}">Solicitar cancelamento</button>`;
    }
    const actionBox=actions?`<div class="mf-order-actions-v916">${actions}</div>`:'';
    return `<article class="mf-order-card"><div class="mf-order-card-head"><div><div class="mf-order-number">${esc(o.titulo)}</div><div class="mf-order-date">${esc(o.data_hora)}</div></div><div class="mf-order-total">${money(o.total)}</div></div><div class="mf-order-badges">${badge(o.status_pedido_texto,orderKind)}${badge(o.status_pagamento_texto,payKind)}</div><div class="mf-order-meta"><strong>Forma:</strong> ${esc(o.forma_pagamento_texto)}${o.tipo_pedido_texto?`<br><strong>Atendimento:</strong> ${esc(o.tipo_pedido_texto)}`:''}</div>${items?`<div class="mf-order-items">${items}</div>`:''}${pixManual}${pix}${actionBox}</article>`;
  };

  const validCpf=v=>{
    const cpf=onlyDigits(v);
    if(cpf.length!==11||/^(\d)\1{10}$/.test(cpf))return false;
    const digit=size=>{let sum=0;for(let i=0;i<size;i++)sum+=Number(cpf[i])*(size+1-i);const d=(sum*10)%11;return d===10?0:d};
    return digit(9)===Number(cpf[9])&&digit(10)===Number(cpf[10]);
  };

  async function search(){
    const msg=$('mfOrdersMessage'), btn=$('mfOrdersSearchBtn');
    msg.textContent='';
    let payload;
    if(cfg.cpfOnly){
      const cpf=$('mfOrdersCpf')?.value.trim()||'';
      if(!validCpf(cpf)){msg.textContent='Informe um CPF válido.';return false}
      lastLookupCpf=onlyDigits(cpf);
      payload={modo:'produto_cpf',cpf};
    }else{
      const nome=$('mfOrdersName')?.value.trim()||'', telefone=$('mfOrdersPhone')?.value.trim()||'';
      if(nome.length<2||telefone.replace(/\D/g,'').length<8){msg.textContent='Informe o primeiro nome e um telefone válido.';return false}
      lastLookupName=nome;
      lastLookupPhone=telefone;
      payload={nome,telefone};
    }
    btn.disabled=true;btn.textContent='Buscando…';
    try{
      const r=await fetch(`/api/publico/${encodeURIComponent(cfg.slug)}/meus-pedidos`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d=await r.json(); if(!r.ok)throw new Error(d.detail||d.error||'Não foi possível buscar os pedidos.');
      $('mfOrdersList').innerHTML=d.pedidos.length?d.pedidos.map(card).join(''):'<div class="mf-orders-empty">Nenhum pedido recente foi encontrado com esses dados.</div>';
      $('mfOrdersCount').textContent=`${d.pedidos.length} encontrado${d.pedidos.length===1?'':'s'}`;
      $('mfOrdersSearch').hidden=true;$('mfOrdersResults').hidden=false;
      return true;
    }catch(e){msg.textContent=e.message;return false}finally{btn.disabled=false;btn.textContent='Buscar pedidos'}
  }

  function openCancelModal(data){
    if(!cancelOverlay)return;
    cancelTarget=data;
    const title=$('mfProductCancelTitle'), text=$('mfProductCancelText'), info=$('mfProductCancelInfo');
    if(title)title.textContent=`Cancelar ${data.title||'pedido'}?`;
    if(text)text.textContent=cfg.cpfOnly
      ? 'Este pedido ainda está aguardando pagamento. Nenhum valor confirmado será perdido.'
      : 'Este pedido ainda não foi aceito pelo estabelecimento e pode ser cancelado agora.';
    if(info)info.textContent=cfg.cpfOnly
      ? 'Ao confirmar, o pedido será encerrado, o estoque será liberado e o estabelecimento será avisado.'
      : 'Ao confirmar, o pedido será retirado da fila, irá para Cancelados e o estabelecimento será avisado.';
    cancelOverlay.hidden=false;
  }
  function closeCancelModal(){
    if(cancelOverlay)cancelOverlay.hidden=true;
    cancelTarget=null;
    if(cancelConfirm){cancelConfirm.disabled=false;cancelConfirm.textContent='Cancelar pedido'}
  }
  if(cancelBack)cancelBack.addEventListener('click',closeCancelModal);
  if(cancelOverlay)cancelOverlay.addEventListener('click',e=>{if(e.target===cancelOverlay)closeCancelModal()});
  if(cancelConfirm)cancelConfirm.addEventListener('click',async()=>{
    if(!cancelTarget)return;
    if(cfg.cpfOnly&&!lastLookupCpf)return;
    if(!cfg.cpfOnly&&(!lastLookupName||!lastLookupPhone))return;
    cancelConfirm.disabled=true;cancelConfirm.textContent='Cancelando…';
    try{
      const payload=cfg.cpfOnly
        ? {token:cancelTarget.token,cpf:lastLookupCpf}
        : {token:cancelTarget.token,nome:lastLookupName,telefone:lastLookupPhone};
      const r=await fetch(`/api/publico/${encodeURIComponent(cfg.slug)}/meus-pedidos/pedido/${encodeURIComponent(cancelTarget.id)}/cancelar`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
      });
      const d=await r.json();
      if(!r.ok)throw new Error(d.detail||d.error||'Não foi possível cancelar o pedido.');
      closeCancelModal();
      await search();
      showResultMessage(d.message||'Pedido cancelado. O estabelecimento foi avisado.');
    }catch(err){
      cancelConfirm.disabled=false;cancelConfirm.textContent='Cancelar pedido';
      const text=$('mfProductCancelText');if(text)text.textContent=err.message;
    }
  });

  $('mfOrdersSearchBtn').addEventListener('click',()=>{showResultMessage('');search()});
  ['mfOrdersName','mfOrdersPhone','mfOrdersCpf'].forEach(id=>{const el=$(id);if(el)el.addEventListener('keydown',e=>{if(e.key==='Enter'){showResultMessage('');search()}})});
  const cpfInput=$('mfOrdersCpf');if(cpfInput)cpfInput.addEventListener('input',function(){const d=onlyDigits(this.value).slice(0,11);this.value=d.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2')});

  $('mfOrdersList').addEventListener('click',async e=>{
    const manual=e.target.closest('[data-manual-pix]');
    if(manual){
      try{await navigator.clipboard.writeText(manual.dataset.manualPix||'');manual.textContent='Chave copiada!';setTimeout(()=>manual.textContent='Copiar chave Pix',1400)}
      catch(_){manual.textContent='Não foi possível copiar';setTimeout(()=>manual.textContent='Copiar chave Pix',1600)}
      return;
    }

    const cancel=e.target.closest('[data-cancel-order]');
    if(cancel){
      openCancelModal({id:cancel.dataset.cancelOrder,token:cancel.dataset.cancelToken,title:cancel.dataset.cancelTitle});
      return;
    }

    const requestCancel=e.target.closest('[data-request-cancel]');
    if(requestCancel){
      const phone=whatsappNumber();
      if(!phone){showResultMessage('O estabelecimento ainda não informou um WhatsApp para solicitações.');return}
      const number=requestCancel.dataset.requestCancel||'';
      const total=money(requestCancel.dataset.requestTotal||0);
      const message=`Olá! Gostaria de solicitar o cancelamento do pedido #${number}, no valor de ${total}. Poderiam verificar, por favor?`;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,'_blank','noopener,noreferrer');
      return;
    }

    const btn=e.target.closest('[data-pix]'); if(!btn)return;
    const [tipo,id,token]=btn.dataset.pix.split(':'); const panel=$(`mfPix-${tipo}-${id}`);
    if(!panel.hidden){panel.hidden=true;return} btn.disabled=true;btn.textContent='Carregando Pix…';
    try{
      const r=await fetch(`/api/publico/${encodeURIComponent(cfg.slug)}/meus-pedidos/${tipo}/${id}/pix?token=${encodeURIComponent(token)}`); const d=await r.json(); if(!r.ok)throw new Error(d.detail||'Pix indisponível.');
      if(d.status_pagamento==='pago'){panel.innerHTML='<strong>Pagamento confirmado ✅</strong>';}
      else {panel.innerHTML=`${d.qr_code_base64?`<img alt="QR Code Pix" src="data:image/png;base64,${d.qr_code_base64}">`:''}${d.qr_code?`<button class="mf-order-copy" type="button">Copiar código Pix</button><small>O código fica oculto na tela.</small>`:'<p>O código Pix não está mais disponível.</p>'}`; const cp=panel.querySelector('.mf-order-copy'); if(cp)cp.onclick=async()=>{await navigator.clipboard.writeText(d.qr_code);cp.textContent='Copiado!'}}
      panel.hidden=false;
    }catch(err){panel.innerHTML=`<p>${esc(err.message)}</p>`;panel.hidden=false}finally{btn.disabled=false;btn.textContent='Continuar pagamento Pix'}
  });
})();
