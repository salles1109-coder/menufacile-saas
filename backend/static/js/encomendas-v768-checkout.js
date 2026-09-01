(function(){
  'use strict';
  const cfg=window.MenuFacileEncomendasConfig||{};
  const $=(s,r)=> (r||document).querySelector(s);
  const $$=(s,r)=>Array.from((r||document).querySelectorAll(s));
  const money=v=>'€ '+Number(v||0).toFixed(2).replace('.',',');
  let created=null;
  let brickController=null;
  let busy=false;

  function message(text,ok){const el=$('#encCheckoutMessageV768');if(!el)return;el.hidden=!text;el.textContent=text||'';el.classList.toggle('ok',!!ok)}
  function signalValue(total){
    if(!cfg.sinalAtivo)return 0;
    const type=String(cfg.sinalTipo||'percentual').toLowerCase();
    const val=Number(cfg.sinalValor||0);
    if(type==='integral')return total;
    if(type==='fixo')return Math.min(total,Math.max(0,val));
    return Math.min(total,total*Math.min(100,Math.max(0,val||50))/100);
  }
  function selected(name){return $(`input[name="${name}"]:checked`)?.value||''}
  function current(){return window.MenuFacileEncomendasCart||null}

  function updateAmounts(){
    const c=current();if(!c)return;
    const total=Number(c.price||0), sinal=signalValue(total), saldo=Math.max(0,total-sinal);
    const a=$('#encSignalAmount'),b=$('#encBalanceAmount');
    if(a)a.textContent=money(sinal);
    if(b)b.textContent=money(saldo);
    const ft=$('#encFinalTotal');if(ft)ft.textContent=money(total);
    const fs=$('#encFinalSchedule');if(fs)fs.textContent=(c.date&&c.time)?`${c.date} · ${c.time}`:'—';
  }

  function updateReceive(){
    const c=current();if(!c)return;
    $$('[data-enc-receive]').forEach(label=>{
      const value=label.dataset.encReceive;
      const allowed=value==='retirada' ? (cfg.retiradaAtiva!==false&&c.permiteRetirada) : (cfg.entregaAtiva===true&&c.permiteEntrega);
      label.hidden=!allowed;
      label.querySelector('input').disabled=!allowed;
    });
    let checked=$('input[name="enc-receive"]:checked:not(:disabled)');
    if(!checked){checked=$('input[name="enc-receive"]:not(:disabled)');if(checked)checked.checked=true}
    const receive=selected('enc-receive');
    const address=$('#encAddressWrap');if(address)address.hidden=receive!=='entrega';
    const pickup=$('#encPickupNote');if(pickup)pickup.hidden=receive==='entrega';
    const delivery=$('#encDeliveryNote');if(delivery)delivery.hidden=receive!=='entrega';
  }

  async function requestJson(url,options){
    const r=await fetch(url,options);let d={};try{d=await r.json()}catch(e){}
    if(!r.ok||d.error||d.detail)throw new Error(d.error||d.detail||'Não foi possível concluir a operação.');
    return d;
  }

  function payloadBase(){
    const c=current();if(!c)throw new Error('Escolha um produto antes de continuar.');
    const nome=$('#encCustomerName')?.value.trim()||'';
    const telefone=$('#encCustomerPhone')?.value.trim()||'';
    const email=$('#encCustomerEmail')?.value.trim()||'';
    const pagamento=selected('enc-payment');
    const receive=selected('enc-receive');
    if(nome.length<2)throw new Error('Informe seu nome.');
    if((telefone.match(/\d/g)||[]).length<8)throw new Error('Informe um WhatsApp válido.');
    if(!receive)throw new Error('Escolha retirada ou entrega.');
    if(receive==='entrega'&&($('#encCustomerAddress')?.value.trim()||'').length<8)throw new Error('Informe o endereço completo para entrega.');
    if(!pagamento)throw new Error('O estabelecimento ainda não configurou uma forma de pagamento disponível.');
    if((pagamento==='pix_online'||pagamento==='cartao_online')&&!/^\S+@\S+\.\S+$/.test(email))throw new Error('Informe um e-mail válido para o pagamento online.');
    return {
      nome,telefone,email,pagamento,tipo_recebimento:receive,
      endereco:$('#encCustomerAddress')?.value.trim()||'',
      observacao:$('#encCustomerNote')?.value.trim()||'',
      item_id:c.itemId,opcao_id:c.optionId,data:c.date,horario:c.time,
      recheio_sabor:c.fill||'',personalizacao:c.personal||''
    };
  }

  async function createOrder(){
    if(created)return created;
    const payload=payloadBase();
    created=await requestJson(`/api/publico/${encodeURIComponent(cfg.slug)}/encomendas`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
    });
    return created;
  }

  function showFinalSuccess(text){
    message(text||'Encomenda registrada com sucesso.',true);
    const confirm=$('#encConfirmOrderV768');if(confirm){confirm.disabled=true;confirm.textContent='Encomenda enviada';}
    const back=$('#encCheckoutBackV768');if(back)back.hidden=true;
  }

  function showManualPix(data){
    const box=$('#encPixManualV768');if(!box)return;
    const p=data.pix_manual||{};
    box.hidden=false;
    box.innerHTML=`<strong>Encomenda #${data.numero} registrada</strong>`+
      `<div>Envie o sinal de <b>${money(data.sinal)}</b> para <b>${String(p.titular||'titular informado')}</b>.</div>`+
      `<div style="margin-top:5px">Chave Pix: <b>${String(p.chave||'')}</b></div>`+
      (p.prazo_minutos?`<div style="margin-top:5px">Prazo informado: ${Number(p.prazo_minutos)} min.</div>`:'')+
      (p.politica?`<div style="margin-top:7px">${String(p.politica)}</div>`:'');
    showFinalSuccess('Encomenda recebida. O estabelecimento verá o sinal e o saldo separados.');
  }

  function showPix(data){
    const box=$('#encOnlinePaymentV768'),result=$('#encPixResultV768');
    if(box)box.hidden=false;if(result)result.hidden=false;
    const img=$('#encPixQrV768');if(img&&data.qr_code_base64)img.src='data:image/png;base64,'+data.qr_code_base64;
    const code=$('#encPixCodeV768');if(code)code.value=data.qr_code||'';
    const status=$('#encPixStatusV768');if(status)status.textContent='Aguardando confirmação do pagamento...';
    const copy=$('#encCopyPixV768');if(copy)copy.onclick=async()=>{await window.MenuFacileCheckout.copiarTexto(data.qr_code||'');copy.textContent='Código copiado';};
    if(data.encomenda_id&&data.public_token)poll(data.encomenda_id,data.public_token);
  }

  function poll(id,token){
    const api=window.MenuFacileCheckout;if(!api)return;
    api.iniciarPolling({
      url:`/api/pagamentos/mercadopago/${Number(cfg.empresaId)}/encomenda/${Number(id)}/status?token=${encodeURIComponent(token)}`,
      interval:4000,timeout:15*60*1000,
      onUpdate:(st)=>{const el=$('#encPixStatusV768');if(el&&st==='pending')el.textContent='Aguardando confirmação do pagamento...';},
      onFinish:(st)=>{const el=$('#encPixStatusV768');if(st==='approved'){if(el)el.textContent='Pagamento aprovado. Encomenda enviada!';showFinalSuccess('Pagamento aprovado. A encomenda já entrou em Recebidas.');}else{if(el)el.textContent='Pagamento não aprovado. Você pode tentar novamente.';message('O pagamento não foi aprovado.',false);}},
      onTimeout:()=>{const el=$('#encPixStatusV768');if(el)el.textContent='Pagamento ainda pendente. O estabelecimento receberá a atualização quando houver confirmação.';}
    });
  }

  async function payPix(){
    const order=await createOrder();
    const api=window.MenuFacileCheckout;if(!api)throw new Error('Checkout online indisponível.');
    const email=$('#encCustomerEmail')?.value.trim()||'cliente@menufacile.org';
    const data=await api.processarPagamento('encomenda',{
      encomenda_id:order.encomenda_id,public_token:order.public_token,email,
      formData:{payment_method_id:'pix',payer:{email}}
    });
    data.encomenda_id=order.encomenda_id;data.public_token=order.public_token;
    if(api.normalizarStatus(data.status)==='approved')showFinalSuccess('Pagamento aprovado. A encomenda já entrou em Recebidas.');
    else if(data.qr_code||data.qr_code_base64)showPix(data);
    else message('Pagamento criado e aguardando confirmação.',true);
  }

  async function renderCard(){
    const api=window.MenuFacileCheckout;
    if(!api||!cfg.pagamentoOnlineAtivo)throw new Error('Pagamento online indisponível.');
    const mp=api.obterMercadoPago('pt-BR');if(!mp)throw new Error('Não foi possível carregar o Mercado Pago.');
    const box=$('#encOnlinePaymentV768'),container=$('#encPaymentBrickV768');
    if(box)box.hidden=false;if(container)container.replaceChildren();
    if(brickController){try{await brickController.unmount()}catch(e){}brickController=null;}
    const c=current(),amount=Math.max(.01,signalValue(Number(c.price||0))||Number(c.price||0));
    const builder=mp.bricks();
    brickController=await builder.create('cardPayment','encPaymentBrickV768',{
      initialization:{amount,payer:{email:$('#encCustomerEmail')?.value.trim()||undefined}},
      customization:{visual:{style:{theme:'default'},hideFormTitle:true,texts:{formSubmit:'Pagar e confirmar encomenda'}}},
      callbacks:{
        onReady:()=>message('Preencha os dados do cartão e toque em “Pagar e confirmar encomenda”.',true),
        onError:(e)=>{console.error(e);message('Não foi possível carregar o formulário do cartão.',false)},
        onSubmit:async(formData)=>{
          const order=await createOrder();
          const result=await api.processarPagamento('encomenda',{encomenda_id:order.encomenda_id,public_token:order.public_token,email:$('#encCustomerEmail')?.value.trim()||'',formData:formData||{}});
          const st=api.normalizarStatus(result.status);
          if(st==='approved')showFinalSuccess('Pagamento aprovado. A encomenda já entrou em Recebidas.');
          else if(st==='rejected')message('Pagamento recusado. Confira os dados e tente novamente.',false);
          else{message('Pagamento pendente. A confirmação será atualizada automaticamente.',true);poll(order.encomenda_id,order.public_token)}
          return result;
        }
      }
    });
  }

  function enterCheckout(){
    if(!current()){message('Escolha um produto antes de continuar.',false);return;}
    created=null;message('',false);updateAmounts();updateReceive();
    $('#encCartReviewStep').hidden=true;$('#encCheckoutStepV768').hidden=false;
    $('#encCheckout').hidden=true;$('#encConfirmOrderV768').hidden=false;$('#encCheckoutBackV768').hidden=false;
    $('#encDrawerTitle').textContent='Confirmar encomenda';$('#encDrawerSubtitle').textContent='Dados, recebimento e pagamento';
  }
  function leaveCheckout(){
    if(brickController){try{brickController.unmount()}catch(e){}brickController=null;}
    created=null;message('',false);$('#encCartReviewStep').hidden=false;$('#encCheckoutStepV768').hidden=true;
    $('#encCheckout').hidden=false;$('#encConfirmOrderV768').hidden=true;$('#encCheckoutBackV768').hidden=true;
    $('#encDrawerTitle').textContent='Sua encomenda';$('#encDrawerSubtitle').textContent='Revise antes de confirmar';
  }

  $('#encCheckout')?.addEventListener('click',enterCheckout);
  $('#encCheckoutBackV768')?.addEventListener('click',leaveCheckout);
  $$('input[name="enc-receive"]').forEach(x=>x.addEventListener('change',updateReceive));
  $$('input[name="enc-payment"]').forEach(x=>x.addEventListener('change',async()=>{
    message('',false);const box=$('#encOnlinePaymentV768');if(box)box.hidden=true;
    if(brickController){try{await brickController.unmount()}catch(e){}brickController=null;}
  }));
  $('#encConfirmOrderV768')?.addEventListener('click',async()=>{
    if(busy)return;busy=true;message('',false);
    try{
      const p=payloadBase();
      if(p.pagamento==='cartao_online'){await renderCard();return;}
      const order=await createOrder();
      if(p.pagamento==='pix_online'){await payPix();return;}
      if(p.pagamento==='pix_sinal_manual'){showManualPix(order);return;}
      showFinalSuccess(`Encomenda #${order.numero} recebida. Pagamento será feito na ${p.tipo_recebimento==='entrega'?'entrega':'retirada'}.`);
    }catch(e){message(e.message||String(e),false)}finally{busy=false}
  });

  updateAmounts();
})();
