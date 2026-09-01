(function(){
  'use strict';
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const cfg=window.MF_ENCOMENDAS_CONFIG||{};
  const paymentCfg=cfg.pagamentos||{};
  const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
  const toast=text=>{const el=q('#encToast');if(!el)return;el.textContent=text;el.classList.add('show');clearTimeout(el.__t);el.__t=setTimeout(()=>el.classList.remove('show'),2100)};
  const escapeHtml=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  const modal=q('#encProductModalBackdrop');
  const drawer=q('#encCartDrawerBackdrop');
  const checkout=q('#encCheckoutBackdrop');
  const cartCount=q('#encCartCount');
  let currentCard=null;
  let currentOption=null;
  let cartState=null;
  let pendingOrder=null;
  let cardBrickController=null;

  function parseJSON(value,fallback=[]){try{return JSON.parse(value||'')||fallback}catch(_){return fallback}}
  function showBodyLocked(locked){document.body.style.overflow=locked?'hidden':''}
  function openLayer(el){if(!el)return;el.classList.add('open');el.setAttribute('aria-hidden','false');showBodyLocked(true)}
  function closeLayer(el){if(!el)return;el.classList.remove('open');el.setAttribute('aria-hidden','true');if(!q('.enc-modal-backdrop.open,.enc-drawer-backdrop.open,.enc-checkout-backdrop.open'))showBodyLocked(false)}
  function toDateInput(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
  function parseTime(t){const m=String(t||'').match(/^(\d{2}):(\d{2})$/);return m?(Number(m[1])*60+Number(m[2])):null}
  function operationalNow(){const d=new Date(cfg.serverNow||Date.now());return Number.isNaN(d.getTime())?new Date():d}
  function scheduleForDate(dateValue){
    if(!dateValue)return null;
    const d=new Date(dateValue+'T12:00:00');
    // JS Sunday=0; Python Monday=0.
    const pyDay=(d.getDay()+6)%7;
    return (cfg.horarios||[]).find(x=>Number(x.dia_semana)===pyDay)||null;
  }
  function withinSchedule(minutes,line){
    if(!line||line.aberto===false)return false;
    const start=parseTime(line.hora_inicio),end=parseTime(line.hora_fim);
    if(start===null||end===null)return true;
    return start<=end?(minutes>=start&&minutes<=end):(minutes>=start||minutes<=end);
  }
  function refreshTimes(){
    const dateInput=q('#encModalDate'),select=q('#encModalTime');
    if(!dateInput||!select)return;
    const dateValue=dateInput.value;
    const line=scheduleForDate(dateValue);
    const earliest=operationalNow();
    earliest.setMinutes(earliest.getMinutes()+Math.max(0,Number(currentCard?.dataset.encItemAdvance||0))*60);
    const sameEarliestDate=toDateInput(earliest)===dateValue;
    const previous=select.value;
    select.innerHTML='';
    let count=0;
    for(let mins=0;mins<24*60;mins+=30){
      if(line && line.aberto===false)continue;
      if(line && !withinSchedule(mins,line))continue;
      if(!line && (mins<8*60||mins>20*60))continue;
      if(sameEarliestDate && mins < earliest.getHours()*60+earliest.getMinutes())continue;
      const hh=String(Math.floor(mins/60)).padStart(2,'0'),mm=String(mins%60).padStart(2,'0'),val=hh+':'+mm;
      const op=document.createElement('option');op.value=val;op.textContent=val;select.appendChild(op);count++;
    }
    if(!count){const op=document.createElement('option');op.value='';op.textContent='Sem horários disponíveis';select.appendChild(op)}
    if(previous&&qa('option',select).some(o=>o.value===previous))select.value=previous;
  }
  function ensureDate(){
    const input=q('#encModalDate');if(!input||!currentCard)return;
    const earliest=operationalNow();earliest.setMinutes(earliest.getMinutes()+Math.max(0,Number(currentCard.dataset.encItemAdvance||0))*60);
    input.min=toDateInput(earliest);
    if(!input.value||input.value<input.min)input.value=input.min;
    let tries=0;
    while(tries<14){const line=scheduleForDate(input.value);if(!line||line.aberto!==false)break;const d=new Date(input.value+'T12:00:00');d.setDate(d.getDate()+1);input.value=toDateInput(d);tries++}
    refreshTimes();
  }

  function updateModalTotal(){const el=q('#encModalTotal');if(el)el.textContent=money(currentOption?.preco||0)}
  function openProduct(card){
    if(!card||!modal)return;
    currentCard=card;currentOption=null;
    const opts=parseJSON(card.dataset.encItemOptions,[]);
    let fillings=parseJSON(card.dataset.encItemRecheios,[]);if(!fillings.length)fillings=parseJSON(card.dataset.encItemSabores,[]);
    q('#encModalName').textContent=card.dataset.encItemName||'Encomenda';
    q('#encModalDescription').textContent=card.dataset.encItemDescription||'';
    const photo=q('#encModalPhoto');if(photo)photo.style.backgroundImage=card.dataset.encItemPhoto?'url("'+String(card.dataset.encItemPhoto).replace(/"/g,'')+'")':'';
    const box=q('#encModalOptions');box.innerHTML='';
    opts.forEach((op,index)=>{
      const label=document.createElement('label');label.className='enc-radio';
      label.innerHTML='<span><input type="radio" name="enc-size" value="'+escapeHtml(op.nome||'')+'" data-option-id="'+Number(op.id||0)+'" data-price="'+Number(op.preco||0)+'" '+(index===0?'checked':'')+'><b>'+escapeHtml(op.nome||'Opção')+'</b></span><strong>'+money(op.preco)+'</strong>';
      box.appendChild(label);
    });
    currentOption=opts[0]||null;updateModalTotal();
    qa('input[name="enc-size"]',box).forEach(r=>r.addEventListener('change',()=>{currentOption={id:Number(r.dataset.optionId||0),nome:r.value,preco:Number(r.dataset.price||0)};updateModalTotal()}));
    const fillGroup=q('#encModalFillGroup'),fillBox=q('#encModalFillings');fillGroup.hidden=!fillings.length;fillBox.innerHTML='';
    fillings.forEach((fill,index)=>{const label=document.createElement('label');label.className='enc-radio';label.innerHTML='<span><input type="radio" name="enc-fill" value="'+escapeHtml(fill)+'" '+(index===0?'checked':'')+'><b>'+escapeHtml(fill)+'</b></span>';fillBox.appendChild(label)});
    const advance=Number(card.dataset.encItemAdvance||0);q('#encModalAdvance').textContent=advance>=24?'Antecedência mínima: '+Math.ceil(advance/24)+' dia(s) · horários da empresa':'Antecedência mínima: '+advance+' h · horários da empresa';
    q('#encModalPersonalGroup').hidden=card.dataset.encPersonalization==='0';
    q('#encModalPersonal').value='';
    ensureDate();
    openLayer(modal);
  }
  qa('[data-enc-open-product]').forEach(btn=>btn.addEventListener('click',()=>openProduct(btn.closest('[data-enc-product-card]'))));
  q('#encModalDate')?.addEventListener('change',refreshTimes);
  q('#encModalClose')?.addEventListener('click',()=>closeLayer(modal));
  modal?.addEventListener('click',e=>{if(e.target===modal)closeLayer(modal)});

  function openDrawer(){openLayer(drawer)}
  q('#encCartButton')?.addEventListener('click',openDrawer);
  q('#encCartClose')?.addEventListener('click',()=>closeLayer(drawer));
  drawer?.addEventListener('click',e=>{if(e.target===drawer)closeLayer(drawer)});

  q('#encAddCart')?.addEventListener('click',()=>{
    if(!currentCard||!currentOption)return;
    const date=q('#encModalDate')?.value||'',time=q('#encModalTime')?.value||'';
    if(!date||!time){toast('Escolha a data e um horário disponível.');return}
    const selected=q('input[name="enc-size"]:checked');
    cartState={
      itemId:Number(currentCard.dataset.encItemId||0),
      optionId:Number(selected?.dataset.optionId||currentOption.id||0),
      itemName:currentCard.dataset.encItemName||'Encomenda',
      optionName:selected?.value||currentOption.nome||'',
      price:Number(selected?.dataset.price||currentOption.preco||0),
      fill:q('input[name="enc-fill"]:checked')?.value||'',
      personalization:q('#encModalPersonal')?.value.trim()||'',
      date,time,
      allowPickup:currentCard.dataset.encItemRetirada!=='0',
      allowDelivery:currentCard.dataset.encItemEntrega==='1'
    };
    q('#encCartItemName').textContent=cartState.itemName+' · '+cartState.optionName;
    q('#encCartItemDetail').textContent=[cartState.fill,cartState.personalization?('Personalização: '+cartState.personalization):''].filter(Boolean).join(' · ')||'Produto personalizado';
    q('#encCartProductTotal').textContent=money(cartState.price);q('#encCartTotal').textContent=money(cartState.price);q('#encCartSchedule').textContent=formatDate(cartState.date)+' · '+cartState.time;
    if(cartCount)cartCount.textContent='1';
    closeLayer(modal);setTimeout(openDrawer,120);
  });

  function formatDate(value){if(!value)return'—';const d=new Date(value+'T12:00:00');return d.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'}).replace('.','')}
  function signalAmount(total){
    if(!paymentCfg.sinalAtivo)return 0;
    const type=String(paymentCfg.sinalTipo||'percentual');const val=Number(paymentCfg.sinalValor||0);
    if(type==='integral')return total;
    if(type==='percentual')return Math.min(total,Math.max(0,total*val/100));
    return Math.min(total,Math.max(0,val));
  }
  function allowedReceiving(){
    const menu=cfg.menu||{},del=cfg.entrega||{};const result=[];
    if(cartState?.allowPickup && menu.retirada!==false && del.retirada_ativa!==false)result.push({id:'retirada',icon:'fa-store',name:'Retirada',desc:del.instrucoes_retirada||'Retirar no estabelecimento'});
    if(cartState?.allowDelivery && menu.entrega!==false && del.entrega_ativa!==false)result.push({id:'entrega',icon:'fa-truck',name:'Entrega',desc:del.mensagem_entrega||'Receber no endereço informado'});
    return result;
  }
  function allowedPayments(){
    const p=paymentCfg,result=[];const signal=signalAmount(cartState?.price||0)>0;
    if(p.onlineAtivo&&p.pixOnline)result.push({id:'pix_online',icon:'fa-qrcode',name:'Pix online',desc:signal?'Pagar o sinal agora':'Pagamento imediato'});
    if(p.onlineAtivo&&p.cartaoOnline)result.push({id:'cartao_online',icon:'fa-credit-card',name:'Cartão online',desc:signal?'Pagar o sinal no cartão':'Pagamento seguro pelo Mercado Pago'});
    if(signal&&p.pixManualChave)result.push({id:'pix_sinal_manual',icon:'fa-key',name:'Pix para sinal',desc:'Receba a chave após confirmar'});
    if(!signal&&p.dinheiro)result.push({id:'dinheiro',icon:'fa-money-bill-wave',name:'Dinheiro',desc:'Pagar na retirada/entrega'});
    if(!signal&&p.cartaoPresencial)result.push({id:'cartao_presencial',icon:'fa-credit-card',name:'Cartão presencial',desc:'Pagar na retirada/entrega'});
    return result;
  }
  function optionMarkup(opt,type,index){return '<label class="enc-check-option"><input type="radio" name="'+type+'" value="'+opt.id+'" '+(index===0?'checked':'')+'><span class="icon"><i class="fa-solid '+opt.icon+'"></i></span><span><strong>'+escapeHtml(opt.name)+'</strong><small>'+escapeHtml(opt.desc||'')+'</small></span></label>'}
  function updateReceiveUI(){
    const selected=q('input[name="enc-receive"]:checked')?.value||'';const address=q('#encAddressField');if(address)address.hidden=selected!=='entrega';
    const pickup=q('#encPickupNote'),delivery=q('#encDeliveryNote');if(pickup)pickup.hidden=selected==='entrega';if(delivery)delivery.hidden=selected!=='entrega';
  }
  function renderCheckout(){
    if(!cartState)return;
    q('#encCheckoutProduct').textContent=cartState.itemName+' · '+cartState.optionName;
    q('#encCheckoutSchedule').textContent=formatDate(cartState.date)+' às '+cartState.time;
    q('#encCheckoutTotal').textContent=q('#encCheckoutFooterTotal').textContent=money(cartState.price);
    const receive=allowedReceiving(),receiveBox=q('#encReceiveOptions');receiveBox.innerHTML=receive.map((o,i)=>optionMarkup(o,'enc-receive',i)).join('');qa('input[name="enc-receive"]',receiveBox).forEach(r=>r.addEventListener('change',updateReceiveUI));updateReceiveUI();
    const payments=allowedPayments(),payBox=q('#encPaymentOptions');payBox.innerHTML=payments.length?payments.map((o,i)=>optionMarkup(o,'enc-payment',i)).join(''):'<div class="enc-checkout-error" style="grid-column:1/-1">Nenhuma forma de pagamento está habilitada. O estabelecimento precisa configurar Pagamentos Online.</div>';
    const signal=signalAmount(cartState.price),signalBox=q('#encSignalBox');signalBox.hidden=signal<=0;if(signal>0){q('#encSignalNow').textContent=money(signal);q('#encSignalBalance').textContent=money(cartState.price-signal);q('#encSignalPolicy').textContent=paymentCfg.sinalPolitica||'O sinal confirma a solicitação conforme a política do estabelecimento.'}
    q('#encPaymentStage').hidden=true;q('#encPaymentStage').innerHTML='';q('#encCheckoutError').hidden=true;q('#encOrderSuccess').hidden=true;q('#encOrderSuccess').innerHTML='';
    q('#encConfirmOrder').hidden=false;q('#encConfirmOrder').disabled=false;q('#encConfirmOrder').textContent='Confirmar encomenda';
    pendingOrder=null;
  }
  q('#encCheckout')?.addEventListener('click',()=>{
    if(!cartState){toast('Escolha um produto primeiro.');return}
    closeLayer(drawer);renderCheckout();setTimeout(()=>openLayer(checkout),80);
  });
  q('#encCheckoutClose')?.addEventListener('click',()=>closeLayer(checkout));
  checkout?.addEventListener('click',e=>{if(e.target===checkout)closeLayer(checkout)});

  function setError(message){const el=q('#encCheckoutError');el.textContent=message;el.hidden=false;el.scrollIntoView({behavior:'smooth',block:'nearest'})}
  async function jsonFetch(url,options){
    const res=await fetch(url,options);let data={};try{data=await res.json()}catch(_){}
    if(!res.ok||data.error||data.detail){throw new Error(data.detail||data.error||'Não foi possível concluir esta etapa.')}
    return data;
  }
  function payloadFromCheckout(){
    const name=q('#encCustomerName').value.trim(),phone=q('#encCustomerPhone').value.trim(),email=q('#encCustomerEmail').value.trim();
    const receive=q('input[name="enc-receive"]:checked')?.value||'',payment=q('input[name="enc-payment"]:checked')?.value||'';
    if(name.length<2)throw new Error('Informe seu nome.');if(phone.replace(/\D/g,'').length<8)throw new Error('Informe um WhatsApp válido.');if(!receive)throw new Error('Escolha retirada ou entrega.');if(!payment)throw new Error('Escolha a forma de pagamento.');
    const address=q('#encCustomerAddress').value.trim();if(receive==='entrega'&&address.length<8)throw new Error('Informe o endereço de entrega.');
    if((payment==='pix_online'||payment==='cartao_online')&&!/^\S+@\S+\.\S+$/.test(email))throw new Error('Informe um e-mail válido para o pagamento online.');
    if(!q('#encTermsAccepted').checked)throw new Error('Confirme que você conferiu os dados da encomenda.');
    return {item_id:cartState.itemId,opcao_id:cartState.optionId,cliente_nome:name,telefone:phone,email:email,data:cartState.date,horario:cartState.time,tipo_recebimento:receive,endereco:address,forma_pagamento:payment,recheio_sabor:cartState.fill,personalizacao:cartState.personalization,observacao:q('#encCustomerObservation').value.trim()};
  }
  function finishSuccess(order,extra){
    const box=q('#encOrderSuccess');box.hidden=false;box.innerHTML='<strong>Encomenda #'+escapeHtml(order.numero||order.encomenda_id)+' registrada ✓</strong>'+(extra||'O estabelecimento recebeu sua solicitação.');
    q('#encConfirmOrder').hidden=true;box.scrollIntoView({behavior:'smooth',block:'nearest'});if(cartCount)cartCount.textContent='0';
  }
  function showManualPix(order){
    const pix=order.pix_manual||{};const stage=q('#encPaymentStage');stage.hidden=false;stage.innerHTML='<strong>Pix para confirmar o sinal</strong><p>Faça o Pix de <b>'+money(order.sinal_valor)+'</b>'+(pix.titular?' para <b>'+escapeHtml(pix.titular)+'</b>':'')+'.</p><div class="enc-copy-row"><input readonly value="'+escapeHtml(pix.chave||'')+'"><button type="button" data-copy-pix>Copiar</button></div>'+(pix.prazo_minutos?'<p>Prazo informado: '+Number(pix.prazo_minutos)+' minutos.</p>':'')+(pix.politica?'<p>'+escapeHtml(pix.politica)+'</p>':'');
    q('[data-copy-pix]',stage)?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(pix.chave||'');toast('Chave Pix copiada.')}catch(_){toast('Selecione e copie a chave Pix.')}});
    finishSuccess(order,'A solicitação foi enviada. O estabelecimento verá que o sinal ainda está aguardando confirmação.');
  }
  async function processPixOnline(order,email){
    const stage=q('#encPaymentStage');stage.hidden=false;stage.innerHTML='<strong>Gerando seu Pix…</strong><p>Aguarde alguns segundos.</p>';
    const result=await jsonFetch('/api/pagamentos/mercadopago/'+cfg.empresaId+'/encomenda/processar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({encomenda_id:order.encomenda_id,public_token:order.public_token,email:email,formData:{payment_method_id:'pix',payer:{email:email}}})});
    if(result.status==='approved'){finishSuccess(order,'Pagamento aprovado. A encomenda já foi enviada ao estabelecimento.');return}
    const qr=result.qr_code_base64?'<img class="enc-pix-qr" alt="QR Code Pix" src="data:image/png;base64,'+result.qr_code_base64+'">':'';
    const code=result.qr_code||'';stage.innerHTML='<strong>Pix gerado</strong><p>Valor a pagar agora: <b>'+money(order.sinal_valor>0?order.sinal_valor:order.total)+'</b></p>'+qr+(code?'<div class="enc-copy-row"><input readonly value="'+escapeHtml(code)+'"><button type="button" data-copy-code>Copiar Pix</button></div>':'')+'<p>Assim que o Mercado Pago confirmar, o status da encomenda será atualizado automaticamente.</p>';
    q('[data-copy-code]',stage)?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(code);toast('Código Pix copiado.')}catch(_){toast('Selecione e copie o código Pix.')}});
    finishSuccess(order,'A encomenda foi registrada e está aguardando a confirmação do Pix.');pollPayment(order);
  }
  async function pollPayment(order){
    let count=0;const timer=setInterval(async()=>{count++;try{const st=await jsonFetch('/api/pagamentos/mercadopago/'+cfg.empresaId+'/encomenda/'+order.encomenda_id+'/status?token='+encodeURIComponent(order.public_token));if(['pago','sinal_pago'].includes(st.status_pagamento)){clearInterval(timer);const box=q('#encOrderSuccess');box.innerHTML='<strong>Pagamento confirmado ✓</strong>Sua encomenda #'+escapeHtml(order.numero)+' já está registrada para o estabelecimento.'}else if(count>=30)clearInterval(timer)}catch(_){if(count>=30)clearInterval(timer)}},4000);
  }
  async function startCardBrick(order,email){
    const stage=q('#encPaymentStage');stage.hidden=false;stage.innerHTML='<strong>Pagamento com cartão</strong><p>Preencha os dados abaixo. O cartão é processado diretamente pelo Mercado Pago.</p><div id="encCardBrickContainer"></div>';
    q('#encConfirmOrder').hidden=true;
    if(!window.MercadoPago||!paymentCfg.publicKey){stage.innerHTML+='<div class="enc-checkout-error">O cartão online está habilitado, mas a Public Key do Mercado Pago não está disponível.</div>';return}
    try{if(cardBrickController&&cardBrickController.unmount)await cardBrickController.unmount()}catch(_){}
    const mp=new MercadoPago(paymentCfg.publicKey,{locale:'pt-BR'});const bricks=mp.bricks();const amount=order.sinal_valor>0?order.sinal_valor:order.total;
    cardBrickController=await bricks.create('cardPayment','encCardBrickContainer',{initialization:{amount:amount,payer:{email:email}},customization:{paymentMethods:{maxInstallments:1}},callbacks:{onReady:()=>{},onError:(err)=>setError(err?.message||'Não foi possível carregar o pagamento com cartão.'),onSubmit:(formData)=>new Promise(async(resolve,reject)=>{try{const result=await jsonFetch('/api/pagamentos/mercadopago/'+cfg.empresaId+'/encomenda/processar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({encomenda_id:order.encomenda_id,public_token:order.public_token,email:email,formData:formData})});if(result.status==='approved'){finishSuccess(order,'Pagamento aprovado. A encomenda foi enviada ao estabelecimento.');try{await cardBrickController.unmount()}catch(_){}}else{setError('Pagamento em análise. Acompanhe a confirmação com o estabelecimento.');pollPayment(order)}resolve()}catch(err){setError(err.message);reject(err)}})}});
  }

  q('#encConfirmOrder')?.addEventListener('click',async()=>{
    const btn=q('#encConfirmOrder');q('#encCheckoutError').hidden=true;
    try{
      const payload=payloadFromCheckout();btn.disabled=true;btn.textContent='Confirmando…';
      const order=await jsonFetch('/api/publico/'+encodeURIComponent(cfg.slug)+'/encomendas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});pendingOrder=order;
      if(payload.forma_pagamento==='pix_sinal_manual')showManualPix(order);
      else if(payload.forma_pagamento==='pix_online')await processPixOnline(order,payload.email);
      else if(payload.forma_pagamento==='cartao_online')await startCardBrick(order,payload.email);
      else finishSuccess(order,'O estabelecimento recebeu sua encomenda. O pagamento será feito na retirada/entrega.');
    }catch(err){setError(err.message||'Não foi possível confirmar a encomenda.');btn.disabled=false;btn.textContent='Confirmar encomenda'}
  });

  // Filtro por categorias sem interferir na vitrine.
  qa('[data-enc-category]').forEach(btn=>btn.addEventListener('click',()=>{qa('[data-enc-category]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');const wanted=String(btn.dataset.encCategory||'todos').toLowerCase();qa('[data-enc-product-card]').forEach(card=>{card.hidden=wanted!=='todos'&&String(card.dataset.encCategoryName||'').toLowerCase()!==wanted})}));
})();
