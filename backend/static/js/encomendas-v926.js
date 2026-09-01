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
  const signalBackdropV778=q('#encSignalBackdropV778');
  const cartCount=q('#encCartCount');
  let currentCard=null;
  let currentOption=null;
  let cartState=[];
  let pendingOrder=null;
  let cardBrickController=null;
  let onlineStageMethod="";
  let onlinePaymentLocked=false;
  let paymentSwitchArmedV786=false;

  function parseJSON(value,fallback=[]){try{return JSON.parse(value||'')||fallback}catch(_){return fallback}}
  function showBodyLocked(locked){document.body.style.overflow=locked?'hidden':''}
  function openLayer(el){if(!el)return;el.classList.add('open');el.setAttribute('aria-hidden','false');showBodyLocked(true)}
  function closeLayer(el){if(!el)return;el.classList.remove('open');el.setAttribute('aria-hidden','true');if(!q('.enc-modal-backdrop.open,.enc-drawer-backdrop.open,.enc-checkout-backdrop.open,.enc-signal-backdrop-v778.open'))showBodyLocked(false)}
  function cartTotal(){return cartState.reduce((sum,item)=>sum+(Number(item.price||0)*Number(item.quantity||1)),0)}
  function cartQuantity(){return cartState.reduce((sum,item)=>sum+Number(item.quantity||1),0)}
  function cartSchedule(){return cartState.length?{date:cartState[0].date,time:cartState[0].time}:null}
  function cartAllowsPickup(){return cartState.length>0&&cartState.every(item=>item.allowPickup)}
  function cartAllowsDelivery(){return cartState.length>0&&cartState.every(item=>item.allowDelivery)}
  function sameLine(a,b){return Number(a.itemId)===Number(b.itemId)&&Number(a.optionId)===Number(b.optionId)&&String(a.flavor||'')===String(b.flavor||'')&&String(a.filling||'')===String(b.filling||'')&&String(a.personalization||'')===String(b.personalization||'')&&String(a.date||'')===String(b.date||'')&&String(a.time||'')===String(b.time||'')}
  function toDateInput(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
  function parseTime(t){const m=String(t||'').match(/^(\d{2}):(\d{2})$/);return m?(Number(m[1])*60+Number(m[2])):null}
  const browserClockAnchor=Date.now();
  const serverWallClockAnchor=(function(){
    const raw=String(cfg.serverNow||'');
    const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
    if(!m)return null;
    const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]),Number(m[6]||0),0);
    return Number.isNaN(d.getTime())?null:d;
  })();
  function operationalNow(){
    const browserNow=new Date();
    if(!serverWallClockAnchor)return browserNow;
    const elapsed=Date.now()-browserClockAnchor;
    const serverNow=new Date(serverWallClockAnchor.getTime()+elapsed);
    // Para a data de hoje, nunca oferece ao cliente um horário que já passou
    // no relógio do aparelho. Em produção, normalmente ambos os relógios coincidem;
    // este fallback também deixa o teste local coerente quando o painel é aberto fora do Brasil.
    if(toDateInput(serverNow)===toDateInput(browserNow) && browserNow.getTime()>serverNow.getTime())return browserNow;
    return serverNow;
  }
  function itemAdvanceMinutes(card=currentCard){
    const precise=Number(card?.dataset.encItemAdvanceMinutes);
    if(Number.isFinite(precise))return Math.max(0,precise);
    return Math.max(0,Number(card?.dataset.encItemAdvance||0))*60;
  }
  function itemTodayWaitMinutes(card=currentCard){return Math.max(0,Number(card?.dataset.encItemTodayWait||0));}
  function itemAvailableToday(card=currentCard){return String(card?.dataset.encItemAvailableToday||'0')==='1';}
  function formatLeadMinutes(minutes){
    minutes=Math.max(0,Math.round(Number(minutes||0)));
    if(minutes===0)return 'sem antecedência';
    if(minutes%1440===0){const d=minutes/1440;return d+' dia'+(d===1?'':'s');}
    if(minutes%60===0){const h=minutes/60;return h+' hora'+(h===1?'':'s');}
    return minutes+' min';
  }
  function leadMinutesForDate(dateValue,card=currentCard){
    // V926 — o mesmo prazo mostrado no card/modal precisa valer no fechamento.
    // Se o item é "Disponível hoje", ele fica pronto após o tempo de retirada
    // configurado (ex.: 30 min), mesmo quando esse prazo cruza a meia-noite ou
    // quando o cliente escolhe uma data futura.
    if(itemAvailableToday(card))return itemTodayWaitMinutes(card);
    return itemAdvanceMinutes(card);
  }
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
    earliest.setMinutes(earliest.getMinutes()+leadMinutesForDate(dateValue,currentCard));
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
    const earliest=operationalNow();
    earliest.setMinutes(earliest.getMinutes()+leadMinutesForDate('',currentCard));
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
    const saleMode=String(card.dataset.encSaleMode||'');
    const singlePrice=saleMode==='preco_unico';
    const flavors=parseJSON(card.dataset.encItemSabores,[]);
    const fillings=parseJSON(card.dataset.encItemRecheios,[]);
    q('#encModalName').textContent=card.dataset.encItemName||'Encomenda';
    q('#encModalDescription').textContent=card.dataset.encItemDescription||'';
    const photo=q('#encModalPhoto');if(photo)photo.style.backgroundImage=card.dataset.encItemPhoto?'url("'+String(card.dataset.encItemPhoto).replace(/"/g,'')+'")':'';
    const box=q('#encModalOptions');box.innerHTML='';
    const optionGroup=q('#encModalOptionGroup');
    const fixedPrice=q('#encModalFixedPrice');
    const fixedPriceValue=q('#encModalFixedPriceValue');
    if(optionGroup)optionGroup.hidden=singlePrice;
    if(fixedPrice)fixedPrice.hidden=!singlePrice;
    if(singlePrice){
      currentOption=opts[0]||null;
      if(fixedPriceValue)fixedPriceValue.textContent=money(currentOption?.preco||0);
    }else{
      opts.forEach((op,index)=>{
        const label=document.createElement('label');label.className='enc-radio';
        label.innerHTML='<span><input type="radio" name="enc-size" value="'+escapeHtml(op.nome||'')+'" data-option-id="'+Number(op.id||0)+'" data-price="'+Number(op.preco||0)+'" '+(index===0?'checked':'')+'><b>'+escapeHtml(op.nome||'Opção')+'</b></span><strong>'+money(op.preco)+'</strong>';
        box.appendChild(label);
      });
      currentOption=opts[0]||null;
      qa('input[name="enc-size"]',box).forEach(r=>r.addEventListener('change',()=>{currentOption={id:Number(r.dataset.optionId||0),nome:r.value,preco:Number(r.dataset.price||0)};updateModalTotal()}));
    }
    updateModalTotal();
    // V938 — Sabores e Recheios são grupos diferentes. Ambos opcionais e desmarcáveis.
    function renderOptionalGroup(groupSelector,boxSelector,inputName,values){
      const group=q(groupSelector),box=q(boxSelector);
      if(!group||!box)return;
      group.hidden=!values.length;box.innerHTML='';
      values.forEach(value=>{
        const label=document.createElement('label');label.className='enc-radio';
        label.innerHTML='<span><input type="radio" name="'+inputName+'" value="'+escapeHtml(value)+'"><b>'+escapeHtml(value)+'</b></span>';
        const radio=label.querySelector('input[name="'+inputName+'"]');
        label.addEventListener('pointerdown',()=>{label.dataset.wasChecked=radio?.checked?'1':'0'});
        label.addEventListener('click',event=>{
          if(label.dataset.wasChecked==='1'&&radio){
            event.preventDefault();event.stopPropagation();radio.checked=false;label.dataset.wasChecked='0';
            radio.dispatchEvent(new Event('change',{bubbles:true}));radio.blur();
          }
        },true);
        box.appendChild(label);
      });
    }
    renderOptionalGroup('#encModalFlavorGroup','#encModalFlavors','enc-flavor',flavors);
    renderOptionalGroup('#encModalFillingGroup','#encModalFillings','enc-filling',fillings);
    const advanceMinutes=itemAdvanceMinutes(card);
    const advanceLabel=q('#encModalAdvance');
    if(advanceLabel){
      const todayWait=itemTodayWaitMinutes(card);
      advanceLabel.textContent=itemAvailableToday(card)
        ? (todayWait>0?'Disponível hoje · pronto em cerca de '+formatLeadMinutes(todayWait):'Disponível hoje · retirada imediata')
        : 'Antecedência mínima: '+formatLeadMinutes(advanceMinutes)+' · horários da empresa';
    }
    q('#encModalPersonalGroup').hidden=card.dataset.encPersonalization==='0';
    q('#encModalPersonal').value='';
    ensureDate();
    const schedule=cartSchedule();
    if(schedule){
      const dateInput=q('#encModalDate'),timeSelect=q('#encModalTime');
      if(dateInput&&schedule.date>=String(dateInput.min||'')){
        dateInput.value=schedule.date;refreshTimes();
        if(timeSelect&&qa('option',timeSelect).some(o=>o.value===schedule.time))timeSelect.value=schedule.time;
      }
    }
    openLayer(modal);
  }
  qa('[data-enc-open-product]').forEach(btn=>btn.addEventListener('click',()=>openProduct(btn.closest('[data-enc-product-card]'))));
  q('#encModalDate')?.addEventListener('change',refreshTimes);
  q('#encModalTime')?.addEventListener('focus',refreshTimes);
  q('#encModalTime')?.addEventListener('pointerdown',refreshTimes);
  q('#encModalClose')?.addEventListener('click',()=>closeLayer(modal));
  modal?.addEventListener('click',e=>{if(e.target===modal)closeLayer(modal)});

  function openDrawer(){renderCart();openLayer(drawer)}
  q('#encCartButton')?.addEventListener('click',openDrawer);
  q('#encCartClose')?.addEventListener('click',()=>closeLayer(drawer));
  q('#encKeepShopping')?.addEventListener('click',()=>closeLayer(drawer));
  drawer?.addEventListener('click',e=>{if(e.target===drawer)closeLayer(drawer)});

  function renderCart(){
    const box=q('#encCartItems'),empty=q('#encCartEmpty'),summary=q('.enc-cart-summary'),checkoutBtn=q('#encCheckout');
    const qty=cartQuantity(),total=cartTotal(),schedule=cartSchedule();
    if(cartCount)cartCount.textContent=String(qty);
    if(q('#encCartItemsCount'))q('#encCartItemsCount').textContent=qty?String(qty):'0';
    if(q('#encCartTotal'))q('#encCartTotal').textContent=money(total);
    if(q('#encCartSchedule'))q('#encCartSchedule').textContent=schedule?(formatDate(schedule.date)+' · '+schedule.time):'—';
    if(empty)empty.hidden=cartState.length>0;
    if(summary)summary.hidden=cartState.length===0;
    if(checkoutBtn)checkoutBtn.disabled=cartState.length===0;
    if(!box)return;
    box.innerHTML=cartState.map((item,index)=>{
      const details=[item.optionName,item.flavor?('Sabor: '+item.flavor):'',item.filling?('Recheio: '+item.filling):'',item.personalization?('Personalização: '+item.personalization):''].filter(Boolean).join(' · ');
      return '<article class="enc-cart-line-v772" data-cart-index="'+index+'"><div class="enc-cart-line-copy-v772"><strong>'+escapeHtml(item.itemName)+'</strong><span>'+escapeHtml(details||'Encomenda personalizada')+'</span></div><div class="enc-cart-line-bottom-v772"><div class="enc-cart-qty-v772"><button type="button" data-cart-dec aria-label="Diminuir">−</button><b>'+Number(item.quantity||1)+'</b><button type="button" data-cart-inc aria-label="Aumentar">+</button></div><strong class="enc-cart-line-price-v772">'+money(Number(item.price||0)*Number(item.quantity||1))+'</strong><button class="enc-cart-remove-v772" type="button" data-cart-remove aria-label="Remover"><i class="fa-regular fa-trash-can"></i></button></div></article>';
    }).join('');
  }

  q('#encCartItems')?.addEventListener('click',e=>{
    const line=e.target.closest('[data-cart-index]');if(!line)return;
    const index=Number(line.dataset.cartIndex);if(!cartState[index])return;
    if(e.target.closest('[data-cart-inc]'))cartState[index].quantity=Number(cartState[index].quantity||1)+1;
    if(e.target.closest('[data-cart-dec]')){cartState[index].quantity=Math.max(1,Number(cartState[index].quantity||1)-1)}
    if(e.target.closest('[data-cart-remove]'))cartState.splice(index,1);
    renderCart();
  });

  q('#encAddCart')?.addEventListener('click',()=>{
    if(!currentCard||!currentOption)return;
    const date=q('#encModalDate')?.value||'',time=q('#encModalTime')?.value||'';
    if(!date||!time){toast('Escolha a data e um horário disponível.');return}
    const existingSchedule=cartSchedule();
    if(existingSchedule&&(existingSchedule.date!==date||existingSchedule.time!==time)){toast('Os itens da mesma encomenda precisam ter a mesma data e horário: '+formatDate(existingSchedule.date)+' às '+existingSchedule.time+'.');return}
    const selected=q('input[name="enc-size"]:checked');
    const singlePrice=String(currentCard.dataset.encSaleMode||'')==='preco_unico';
    const newItem={
      itemId:Number(currentCard.dataset.encItemId||0),
      optionId:Number(selected?.dataset.optionId||currentOption.id||0),
      itemName:currentCard.dataset.encItemName||'Encomenda',
      optionName:singlePrice?'':(selected?.value||currentOption.nome||''),
      price:Number(selected?.dataset.price||currentOption.preco||0),
      flavor:q('input[name="enc-flavor"]:checked')?.value||'',
      filling:q('input[name="enc-filling"]:checked')?.value||'',
      personalization:q('#encModalPersonal')?.value.trim()||'',
      date,time,quantity:1,
      allowPickup:currentCard.dataset.encItemRetirada!=='0',
      allowDelivery:currentCard.dataset.encItemEntrega==='1'
    };
    const existing=cartState.find(item=>sameLine(item,newItem));
    if(existing)existing.quantity=Number(existing.quantity||1)+1;else cartState.push(newItem);
    renderCart();
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
    if(cartAllowsPickup() && menu.retirada!==false && del.retirada_ativa!==false)result.push({id:'retirada',icon:'fa-store',name:'Retirada',desc:''});
    if(cartAllowsDelivery() && menu.entrega!==false && del.entrega_ativa!==false)result.push({id:'entrega',icon:'fa-truck',name:'Entrega',desc:''});
    return result;
  }
  function signalMethods(){
    if(signalAmount(cartTotal())<=0)return[];
    const result=[];
    if(paymentCfg.pixManualChave)result.push({id:'pix_sinal_manual',icon:'fa-qrcode',name:'Pix',desc:'Chave Pix e comprovante'});
    if(paymentCfg.onlineAtivo&&paymentCfg.pixOnline)result.push({id:'pix_online',icon:'fa-bolt',name:'Pix online',desc:'Confirmação automática'});
    if(paymentCfg.onlineAtivo&&paymentCfg.cartaoOnline)result.push({id:'cartao_online',icon:'fa-credit-card',name:'Cartão online',desc:'Pagamento seguro'});
    return result;
  }
  function signalMethod(){
    const available=signalMethods();
    const selected=q('input[name="enc-signal-payment"]:checked')?.value||'';
    if(selected&&available.some(item=>item.id===selected))return selected;
    return available[0]?.id||'';
  }
  function signalMethodLabel(method){
    if(method==='pix_sinal_manual')return'Pix';
    if(method==='pix_online')return'Pix online';
    if(method==='cartao_online')return'Cartão online';
    return'A definir';
  }
  function renderSignalChoices(){
    const total=cartTotal(),signal=signalAmount(total);
    const label=q('#encSignalPaymentLabel'),box=q('#encSignalPaymentOptions');
    if(!label||!box)return;
    if(signal<=0){label.hidden=true;box.hidden=true;box.innerHTML='';return}
    const methods=signalMethods();
    label.hidden=false;box.hidden=false;
    box.innerHTML=methods.length?methods.map((o,i)=>optionMarkup(o,'enc-signal-payment',i)).join(''):'<div class="enc-checkout-error enc-inline-payment-error">O sinal está ativo, mas nenhuma forma de pagamento do sinal foi configurada.</div>';
    qa('input[name="enc-signal-payment"]',box).forEach(input=>input.addEventListener('change',async()=>{
      const chosen=signalMethod();
      const badge=q('#encSignalMethod');if(badge)badge.textContent=signalMethodLabel(chosen);
      // v786: depois que a encomenda já existe, a troca passa pelo backend.
      // Se houver uma cobrança pendente, ela é cancelada antes de abrir a nova forma.
      if(pendingOrder&&chosen&&chosen!==onlineStageMethod&&(!onlinePaymentLocked||paymentSwitchArmedV786)){
        await switchPendingOnlineMethod(chosen);
      }
    }));
  }
  function presencialMode(receive){
    const raw=String(receive==='entrega'?paymentCfg.entregaModo:paymentCfg.retiradaModo).toLowerCase();
    if(['nenhum','dinheiro','cartao','ambos'].includes(raw))return raw;
    if(paymentCfg.dinheiro&&paymentCfg.cartaoPresencial)return'ambos';
    if(paymentCfg.dinheiro)return'dinheiro';
    if(paymentCfg.cartaoPresencial)return'cartao';
    return'nenhum';
  }
  function allowedPayments(receive){
    const p=paymentCfg,result=[];const total=cartTotal();const signal=signalAmount(total);const balance=Math.max(0,total-signal);
    const mode=presencialMode(receive||q('input[name="enc-receive"]:checked')?.value||'retirada');
    const allowCash=mode==='dinheiro'||mode==='ambos';
    const allowCard=mode==='cartao'||mode==='ambos';
    // Com sinal, a escolha abaixo representa como o cliente pretende pagar somente o saldo restante.
    if(signal>0){
      if(balance<=0)return result;
      if(allowCard)result.push({id:'cartao_presencial',icon:'fa-credit-card',name:'Cartão',desc:''});
      if(allowCash)result.push({id:'dinheiro',icon:'fa-money-bill-wave',name:'Dinheiro',desc:''});
      return result;
    }
    if(allowCard)result.push({id:'cartao_presencial',icon:'fa-credit-card',name:'Cartão',desc:''});
    if(allowCash)result.push({id:'dinheiro',icon:'fa-money-bill-wave',name:'Dinheiro',desc:''});
    if(p.onlineAtivo&&p.pixOnline)result.push({id:'pix_online',icon:'fa-qrcode',name:'Pix',desc:'Pagamento online'});
    if(p.onlineAtivo&&p.cartaoOnline)result.push({id:'cartao_online',icon:'fa-lock',name:'Cartão online',desc:'Pagamento seguro'});
    return result;
  }
  function optionMarkup(opt,type,index){return '<label class="enc-check-option"><input type="radio" name="'+type+'" value="'+opt.id+'" '+(index===0?'checked':'')+'><span class="icon"><i class="fa-solid '+opt.icon+'"></i></span><span><strong>'+escapeHtml(opt.name)+'</strong>'+(opt.desc?'<small>'+escapeHtml(opt.desc)+'</small>':'')+'</span><span class="enc-option-check"><i class="fa-solid fa-check"></i></span></label>'}
  function renderPaymentChoices(){
    const payBox=q('#encPaymentOptions');if(!payBox)return;
    const payLabel=q('#encPaymentBalanceLabel');
    const total=cartTotal(),signal=signalAmount(total),balance=Math.max(0,total-signal);
    if(signal>0&&balance<=0){payBox.innerHTML='';payBox.hidden=true;if(payLabel)payLabel.hidden=true;return}
    const receive=q('input[name="enc-receive"]:checked')?.value||'retirada';
    const payments=allowedPayments(receive);
    // v782: com sinal e sem forma presencial para o saldo, não mostramos um
    // aviso vermelho ao cliente. Essa ausência é uma configuração do negócio,
    // não um erro do checkout. O saldo continua visível no resumo da encomenda.
    if(signal>0&&balance>0&&!payments.length){
      payBox.innerHTML='';payBox.hidden=true;if(payLabel)payLabel.hidden=true;return;
    }
    payBox.hidden=false;if(payLabel)payLabel.hidden=false;
    payBox.innerHTML=payments.length?payments.map((o,i)=>optionMarkup(o,'enc-payment',i)).join(''):'<div class="enc-checkout-error enc-inline-payment-error">Nenhuma forma de pagamento está disponível no momento.</div>';
  }
  function updateReceiveUI(){
    const selected=q('input[name="enc-receive"]:checked')?.value||'';const address=q('#encAddressField');if(address)address.hidden=selected!=='entrega';renderPaymentChoices();
  }
  function clearAddressLookupStatus(){const el=q('#encCepStatus');if(el){el.textContent='';el.className='enc-cep-status'}}
  function formatCep(value){const digits=String(value||'').replace(/\D/g,'').slice(0,8);return digits.length>5?digits.slice(0,5)+'-'+digits.slice(5):digits}
  let cepTimer=null,lastCep='';
  async function lookupCep(force=false){
    const cepEl=q('#encCustomerCep');if(!cepEl)return;
    const digits=cepEl.value.replace(/\D/g,'');
    if(digits.length!==8){if(force&&digits.length)toast('Digite um CEP com 8 números.');return}
    if(!force&&digits===lastCep)return;
    lastCep=digits;const status=q('#encCepStatus');if(status){status.textContent='Buscando CEP…';status.className='enc-cep-status loading'}
    try{
      const res=await fetch('https://viacep.com.br/ws/'+digits+'/json/',{headers:{'Accept':'application/json'}});
      if(!res.ok)throw new Error('CEP indisponível');
      const data=await res.json();if(data.erro)throw new Error('CEP não encontrado');
      const set=(id,val)=>{const el=q(id);if(el&&val)el.value=val};
      set('#encCustomerStreet',data.logradouro);set('#encCustomerNeighborhood',data.bairro);set('#encCustomerCity',data.localidade);set('#encCustomerState',data.uf);
      if(status){status.textContent='Endereço encontrado ✓';status.className='enc-cep-status ok'}
      q('#encCustomerNumber')?.focus();
    }catch(err){if(status){status.textContent='CEP não encontrado — preencha manualmente';status.className='enc-cep-status error'}}
  }
  q('#encCustomerCep')?.addEventListener('input',e=>{e.target.value=formatCep(e.target.value);clearTimeout(cepTimer);if(e.target.value.replace(/\D/g,'').length===8)cepTimer=setTimeout(()=>lookupCep(false),350);else clearAddressLookupStatus()});
  q('#encCustomerCep')?.addEventListener('blur',()=>lookupCep(true));
  function deliveryAddress(){
    const cep=q('#encCustomerCep')?.value.trim()||'',street=q('#encCustomerStreet')?.value.trim()||'',num=q('#encCustomerNumber')?.value.trim()||'',comp=q('#encCustomerComplement')?.value.trim()||'',bairro=q('#encCustomerNeighborhood')?.value.trim()||'',city=q('#encCustomerCity')?.value.trim()||'',uf=(q('#encCustomerState')?.value.trim()||'').toUpperCase();
    return {cep,street,num,comp,bairro,city,uf,text:[street+(num?', '+num:''),comp,bairro,[city,uf].filter(Boolean).join(' - '),cep?('CEP '+cep):''].filter(Boolean).join(' · ')};
  }
  function renderCheckout(){
    if(!cartState.length)return;
    const total=cartTotal(),schedule=cartSchedule();
    const itemsBox=q('#encCheckoutItems');
    if(itemsBox)itemsBox.innerHTML=cartState.map(item=>'<div class="enc-checkout-cart-line-v772"><span>'+Number(item.quantity||1)+'× '+escapeHtml(item.itemName)+' <small>'+escapeHtml(item.optionName||'')+'</small></span><strong>'+money(Number(item.price||0)*Number(item.quantity||1))+'</strong></div>').join('');
    q('#encCheckoutSchedule').textContent=schedule?(formatDate(schedule.date)+' às '+schedule.time):'—';
    q('#encCheckoutTotal').textContent=q('#encCheckoutFooterTotal').textContent=money(total);
    const receive=allowedReceiving(),receiveBox=q('#encReceiveOptions');receiveBox.innerHTML=receive.map((o,i)=>optionMarkup(o,'enc-receive',i)).join('');qa('input[name="enc-receive"]',receiveBox).forEach(r=>r.addEventListener('change',updateReceiveUI));updateReceiveUI();
    const signal=signalAmount(total),balance=Math.max(0,total-signal),payLabel=q('#encPaymentBalanceLabel');
    renderSignalChoices();
    if(payLabel){payLabel.hidden=balance<=0;payLabel.textContent=signal>0?'Como prefere pagar o saldo restante?':'Como prefere pagar?'}
    renderPaymentChoices();
    const method=signalMethod(),signalBox=q('#encSignalBox');signalBox.hidden=signal<=0;
    if(signal>0){q('#encSignalNow').textContent=money(signal);q('#encSignalBalance').textContent=money(balance);q('#encSignalMethod').textContent=signalMethodLabel(method);q('#encSignalPolicy').textContent=paymentCfg.sinalPolitica||'O sinal reserva sua data e confirma a encomenda.'}
    q('#encPaymentStage').hidden=true;q('#encPaymentStage').innerHTML='';q('#encCheckoutError').hidden=true;q('#encOrderSuccess').hidden=true;q('#encOrderSuccess').innerHTML='';
    q('#encConfirmOrder').hidden=false;q('#encConfirmOrder').disabled=false;q('#encConfirmOrder').textContent='Confirmar encomenda';
    pendingOrder=null;
  }
  q('#encCheckout')?.addEventListener('click',()=>{
    if(!cartState.length){toast('Adicione pelo menos um item.');return}
    closeLayer(drawer);renderCheckout();setTimeout(()=>openLayer(checkout),80);
  });
  q('#encCheckoutClose')?.addEventListener('click',()=>closeLayer(checkout));
  checkout?.addEventListener('click',e=>{if(e.target===checkout)closeLayer(checkout)});

  function setError(message){const el=q('#encCheckoutError');el.textContent=message;el.hidden=false;el.scrollIntoView({behavior:'smooth',block:'nearest'})}
  function formatPaymentDiagnosticV784(diag){
    if(!diag)return'';
    if(typeof diag==='string')return diag;
    const parts=[];
    if(diag.message)parts.push(String(diag.message));
    if(diag.error&&String(diag.error)!==String(diag.message||''))parts.push('Erro: '+String(diag.error));
    if(diag.status)parts.push('Status: '+String(diag.status));
    if(diag.status_detail)parts.push('Detalhe: '+String(diag.status_detail));
    if(Array.isArray(diag.causes)){
      diag.causes.slice(0,4).forEach(c=>{
        if(!c)return;
        const code=c.code?('['+String(c.code)+'] '):'';
        const text=c.description||c.message||'';
        if(text)parts.push(code+String(text));
      });
    }
    return parts.filter(Boolean).join(' · ');
  }
  function waitV931(ms){return new Promise(resolve=>setTimeout(resolve,Math.max(0,Number(ms||0))))}
  function transientV931(err){const status=Number(err&&err.httpStatus||0),msg=String(err&&err.message||'').toLowerCase();return [0,408,429,502,503,504].includes(status)||msg.includes('demorando para responder')||msg.includes('tente novamente em alguns segundos')||msg.includes('failed to fetch')||msg.includes('networkerror')}
  async function jsonFetch(url,options){
    const opts=options||{},method=String(opts.method||'GET').toUpperCase(),maxRetries=method==='GET'?2:1;let last=null;
    for(let attempt=0;attempt<=maxRetries;attempt++){
      try{
        const res=await fetch(url,opts);let data={};try{data=await res.json()}catch(_){}
        if(!res.ok||data.error||data.detail){const err=new Error(data.detail||data.error||'Não foi possível concluir esta etapa.');err.httpStatus=Number(res.status||0);err.paymentDiagnostic=data.payment_debug_local?formatPaymentDiagnosticV784(data.diagnostico):'';if(attempt<maxRetries&&transientV931(err)){last=err;await waitV931(900*(attempt+1));continue}throw err}
        return data;
      }catch(err){last=err;if(attempt<maxRetries&&transientV931(err)){await waitV931(900*(attempt+1));continue}throw err}
    }
    throw last||new Error('Não foi possível concluir esta etapa.');
  }
  function payloadFromCheckout(){
    const name=q('#encCustomerName').value.trim(),phone=q('#encCustomerPhone').value.trim(),email=q('#encCustomerEmail').value.trim();
    const receive=q('input[name="enc-receive"]:checked')?.value||'';
    const total=cartTotal(),schedule=cartSchedule(),signal=signalAmount(total),balance=Math.max(0,total-signal),sigMethod=signalMethod();
    let payment=q('input[name="enc-payment"]:checked')?.value||'';
    if(!cartState.length)throw new Error('Adicione pelo menos um item à encomenda.');if(name.length<2)throw new Error('Informe seu nome.');if(phone.replace(/\D/g,'').length<8)throw new Error('Informe um WhatsApp válido.');if(!receive)throw new Error('Escolha retirada ou entrega.');
    if(signal>0&&!sigMethod)throw new Error('O estabelecimento exige sinal, mas ainda não configurou uma forma de recebê-lo.');
    if(balance>0&&!payment){
      const receivePayments=allowedPayments(receive);
      // v782: se o estabelecimento não aceita pagamento presencial do saldo,
      // não obrigamos o cliente a escolher uma opção inexistente.
      if(signal>0&&!receivePayments.length)payment='a_combinar';
      else throw new Error('Escolha como prefere pagar o saldo restante.');
    }
    if(balance<=0&&signal>0)payment=sigMethod;
    let address='';
    if(receive==='entrega'){
      const a=deliveryAddress();
      if(a.cep.replace(/\D/g,'').length!==8)throw new Error('Informe um CEP válido para a entrega.');
      if(a.street.length<3||!a.num||a.city.length<2||a.uf.length!==2)throw new Error('Confira rua, número, cidade e UF da entrega.');
      address=a.text;
    }
    if(((signal>0&&['pix_online','cartao_online'].includes(sigMethod))||(!signal&&['pix_online','cartao_online'].includes(payment)))&&!/^\S+@\S+\.\S+$/.test(email))throw new Error('Informe um e-mail válido para o pagamento online.');
    if(!q('#encTermsAccepted').checked)throw new Error('Confirme que você conferiu os dados da encomenda.');
    return {itens:cartState.map(item=>({item_id:item.itemId,opcao_id:item.optionId,quantidade:Number(item.quantity||1),sabor:item.flavor,recheio:item.filling,recheio_sabor:[item.flavor?('Sabor: '+item.flavor):'',item.filling?('Recheio: '+item.filling):''].filter(Boolean).join(' · '),personalizacao:item.personalization})),cliente_nome:name,telefone:phone,email:email,data:schedule?.date||'',horario:schedule?.time||'',tipo_recebimento:receive,endereco:address,forma_pagamento:payment,sinal_metodo:sigMethod,observacao:q('#encCustomerObservation').value.trim()};
  }
  function finishSuccess(order,extra){
    const box=q('#encOrderSuccess');box.hidden=false;box.innerHTML='<strong>Encomenda #'+escapeHtml(order.numero||order.encomenda_id)+' registrada ✓</strong>'+(extra||'O estabelecimento recebeu sua solicitação.');
    q('#encConfirmOrder').hidden=true;box.scrollIntoView({behavior:'smooth',block:'nearest'});cartState=[];renderCart();
  }
  function normalizeWhatsV778(value){
    let digits=String(value||'').replace(/\D/g,'');
    if(!digits)return'';
    if(digits.length===10||digits.length===11)digits='55'+digits;
    return digits;
  }
  function closeSignalV778(){
    if(!signalBackdropV778)return;
    signalBackdropV778.classList.remove('open');signalBackdropV778.setAttribute('aria-hidden','true');
    if(!q('.enc-modal-backdrop.open,.enc-drawer-backdrop.open,.enc-checkout-backdrop.open,.enc-signal-backdrop-v778.open'))showBodyLocked(false);
  }
  function showManualPix(order){
    const pix=order.pix_manual||{},signal=Number(order.sinal_valor||0),key=String(pix.chave||'').trim();
    const valueEl=q('#encSignalValueV778'),keyEl=q('#encSignalKeyV778'),deadline=q('#encSignalDeadlineV778'),intro=q('#encSignalIntroV778');
    if(valueEl)valueEl.textContent=money(signal);
    if(keyEl)keyEl.textContent=key||'Chave Pix não informada';
    if(deadline)deadline.textContent=pix.prazo_minutos?'Envie o comprovante em até '+Number(pix.prazo_minutos)+' minutos.':'';
    if(intro)intro.textContent=pix.politica||'Sua encomenda ficará aguardando confirmação. Faça o Pix e envie o comprovante ao estabelecimento.';
    const copyBtn=q('#encSignalCopyV778');if(copyBtn){copyBtn.disabled=!key;copyBtn.onclick=async()=>{try{await navigator.clipboard.writeText(key);toast('Chave Pix copiada.')}catch(_){toast('Não foi possível copiar automaticamente.')}}}
    const whats=q('#encSignalWhatsV778'),tel=normalizeWhatsV778(cfg.whatsapp||'');
    if(whats){whats.hidden=!tel;whats.onclick=()=>{if(!tel)return;const msg='Olá! Fiz o Pix do sinal de '+money(signal)+' para a encomenda #'+String(order.numero||order.encomenda_id||'')+'. Segue o comprovante.';window.open('https://wa.me/'+tel+'?text='+encodeURIComponent(msg),'_blank','noopener')}}
    q('#encSignalCloseV778')?.addEventListener('click',closeSignalV778,{once:true});
    q('#encSignalDoneV778')?.addEventListener('click',closeSignalV778,{once:true});
    closeLayer(checkout);
    cartState=[];renderCart();
    if(signalBackdropV778){signalBackdropV778.classList.add('open');signalBackdropV778.setAttribute('aria-hidden','false');showBodyLocked(true)}
  }
  signalBackdropV778?.addEventListener('click',e=>{if(e.target===signalBackdropV778)closeSignalV778()});
  async function unmountCardBrickV783(){
    try{if(cardBrickController&&cardBrickController.unmount)await cardBrickController.unmount()}catch(_){}
    cardBrickController=null;
  }
  function setSignalChoiceDisabledV783(disabled){
    qa('input[name="enc-signal-payment"]').forEach(input=>{input.disabled=!!disabled});
  }
  function paymentSwitchButtonMarkupV786(){
    return '<button type="button" class="enc-payment-switch-v786" data-payment-switch-v786>Trocar forma de pagamento</button>';
  }
  function bindPaymentSwitchV786(stage){
    q('[data-payment-switch-v786]',stage)?.addEventListener('click',()=>{
      paymentSwitchArmedV786=true;
      onlinePaymentLocked=false;
      setSignalChoiceDisabledV783(false);
      const old=q('.enc-payment-switch-note-v786',stage);if(old)old.remove();
      stage.insertAdjacentHTML('beforeend','<div class="enc-payment-switch-note-v786">Escolha outra forma de pagamento acima. A cobrança atual só será cancelada quando você selecionar a nova opção.</div>');
      toast('Escolha outra forma de pagamento.');
    });
  }
  function paymentResultMarkupV786(kind,title,message,allowSwitch=true){
    const done=kind==='is-approved'?'<button type="button" class="enc-payment-done-v931" data-payment-done-v931>Concluir</button>':'';
    return '<div class="enc-payment-result-v786 '+kind+'"><strong>'+escapeHtml(title)+'</strong><p>'+escapeHtml(message)+'</p>'+done+(allowSwitch?paymentSwitchButtonMarkupV786():'')+'</div>';
  }
  function bindPaymentDoneV931(stage){q('[data-payment-done-v931]',stage)?.addEventListener('click',()=>{cartState=[];renderCart();closeLayer(checkout)})}
  async function switchBackendMethodV786(method){
    return await jsonFetch('/api/pagamentos/mercadopago/'+cfg.empresaId+'/encomenda/'+pendingOrder.encomenda_id+'/trocar-metodo',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({public_token:pendingOrder.public_token,novo_metodo:method})
    });
  }
  function renderManualPixInlineV786(order,switchData){
    onlineStageMethod='pix_sinal_manual';onlinePaymentLocked=true;paymentSwitchArmedV786=false;setSignalChoiceDisabledV783(true);
    const pix=(switchData&&switchData.pix_manual)||{};
    const key=String(pix.chave||paymentCfg.pixManualChave||'').trim();
    const stage=q('#encPaymentStage');if(!stage)return;
    stage.hidden=false;
    stage.innerHTML='<div class="enc-payment-result-v786 is-pending enc-manual-pix-inline-v786"><strong>Pix por chave</strong><p>Faça o sinal de '+money(order.sinal_valor>0?order.sinal_valor:order.total)+' para confirmar a encomenda.</p><div class="enc-manual-pix-key-v786">Chave protegida</div>'+(key?'<button type="button" class="enc-payment-switch-v786" data-copy-manual-pix-v786>Copiar chave Pix</button>':'')+paymentSwitchButtonMarkupV786()+'</div>';
    q('[data-copy-manual-pix-v786]',stage)?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(key);toast('Chave Pix copiada.')}catch(_){toast('Não foi possível copiar automaticamente.')}});
    bindPaymentSwitchV786(stage);
    finishSuccess(order,'A encomenda foi registrada e está aguardando o sinal via Pix.');
  }
  async function switchPendingOnlineMethod(method){
    if(!pendingOrder||!method||method===onlineStageMethod)return;
    const email=(q('#encCustomerEmail')?.value||'').trim();
    if(['pix_online','cartao_online'].includes(method)&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){setError('Informe um e-mail válido para o pagamento online.');return}
    const stage=q('#encPaymentStage');
    try{
      setSignalChoiceDisabledV783(true);
      q('#encCheckoutError').hidden=true;
      if(stage){stage.hidden=false;stage.innerHTML='<strong>Alterando forma de pagamento…</strong><p>Aguarde alguns segundos.</p>'}
      const switched=await switchBackendMethodV786(method);
      await unmountCardBrickV783();
      pendingOrder.sinal_metodo=method;
      if(switched&&switched.pix_manual)pendingOrder.pix_manual=switched.pix_manual;
      onlineStageMethod=method;onlinePaymentLocked=false;paymentSwitchArmedV786=false;
      if(method==='pix_sinal_manual')renderManualPixInlineV786(pendingOrder,switched);
      else if(method==='pix_online')await processPixOnline(pendingOrder,email);
      else if(method==='cartao_online')await startCardBrick(pendingOrder,email);
    }catch(err){
      onlineStageMethod='';onlinePaymentLocked=true;paymentSwitchArmedV786=false;
      if(stage){
        stage.hidden=false;
        const diag=err?.paymentDiagnostic||'';
        stage.innerHTML=diag
          ? '<div class="enc-payment-debug-v784"><strong>Diagnóstico Mercado Pago · somente local</strong><p>'+escapeHtml(diag)+'</p><small>Nenhuma credencial, token ou dado de cartão é exibido aqui.</small></div>'
          : paymentResultMarkupV786('is-rejected','Não foi possível trocar',err?.message||'Tente novamente.',true);
        bindPaymentSwitchV786(stage);
      }
      setError(err?.message||'Não foi possível trocar a forma de pagamento.');
    }finally{
      setSignalChoiceDisabledV783(onlinePaymentLocked&&!paymentSwitchArmedV786);
    }
  }
  async function processPixOnline(order,email){
    onlineStageMethod='pix_online';paymentSwitchArmedV786=false;
    await unmountCardBrickV783();
    const stage=q('#encPaymentStage');stage.hidden=false;stage.innerHTML='<strong>Gerando seu Pix…</strong><p>Aguarde alguns segundos.</p>';
    const result=await jsonFetch('/api/pagamentos/mercadopago/'+cfg.empresaId+'/encomenda/processar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({encomenda_id:order.encomenda_id,public_token:order.public_token,email:email,formData:{payment_method_id:'pix',payer:{email:email}}})});
    const status=String(result.status||'').toLowerCase();
    if(status==='approved'){
      onlinePaymentLocked=true;setSignalChoiceDisabledV783(true);
      stage.innerHTML=paymentResultMarkupV786('is-approved','Pagamento aprovado ✓','O sinal foi confirmado e a encomenda já está registrada.',false);bindPaymentDoneV931(stage);
      finishSuccess(order,'Pagamento aprovado. A encomenda já foi enviada ao estabelecimento.');return;
    }
    if(['rejected','cancelled','refunded','charged_back'].includes(status)){
      onlinePaymentLocked=true;setSignalChoiceDisabledV783(true);
      stage.innerHTML=paymentResultMarkupV786('is-rejected','Pagamento não aprovado','O Pix não pôde ser criado. Escolha outra forma de pagamento e tente novamente.',true);bindPaymentSwitchV786(stage);return;
    }
    const qr=result.qr_code_base64?'<img class="enc-pix-qr" alt="QR Code Pix" src="data:image/png;base64,'+result.qr_code_base64+'">':'';
    const code=result.qr_code||'';
    if(!qr&&!code){
      onlinePaymentLocked=true;setSignalChoiceDisabledV783(true);
      stage.innerHTML=paymentResultMarkupV786('is-pending','Pagamento em análise','O Mercado Pago ainda está processando o Pix. Você pode aguardar ou trocar a forma de pagamento.',true);bindPaymentSwitchV786(stage);pollPayment(order);return;
    }
    stage.innerHTML='<strong>Pix gerado</strong><p>Valor a pagar agora: <b>'+money(order.sinal_valor>0?order.sinal_valor:order.total)+'</b></p>'+qr+(code?'<div class="enc-copy-row"><button type="button" data-copy-code>Copiar código Pix</button></div>':'')+'<p>Assim que o Mercado Pago confirmar, o status da encomenda será atualizado automaticamente.</p>'+paymentSwitchButtonMarkupV786();
    onlinePaymentLocked=true;setSignalChoiceDisabledV783(true);
    q('[data-copy-code]',stage)?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(code);toast('Código Pix copiado.')}catch(_){toast('Não foi possível copiar automaticamente.')}});
    bindPaymentSwitchV786(stage);
    finishSuccess(order,'A encomenda foi registrada e está aguardando a confirmação do Pix.');pollPayment(order);
  }
  async function pollPayment(order){
    let count=0;const timer=setInterval(async()=>{count++;try{const st=await jsonFetch('/api/pagamentos/mercadopago/'+cfg.empresaId+'/encomenda/'+order.encomenda_id+'/status?token='+encodeURIComponent(order.public_token));if(['pago','sinal_pago'].includes(st.status_pagamento)){clearInterval(timer);onlinePaymentLocked=true;setSignalChoiceDisabledV783(true);const box=q('#encOrderSuccess');box.innerHTML='<strong>Pagamento confirmado ✓</strong>Sua encomenda #'+escapeHtml(order.numero)+' já está registrada para o estabelecimento.';const stage=q('#encPaymentStage');if(stage){stage.hidden=false;stage.innerHTML=paymentResultMarkupV786('is-approved','Pagamento aprovado ✓','O Mercado Pago confirmou o pagamento.',false);bindPaymentDoneV931(stage)}}else if(count>=225)clearInterval(timer)}catch(_){if(count>=225)clearInterval(timer)}},4000);
  }
  async function startCardBrick(order,email){
    onlineStageMethod='cartao_online';onlinePaymentLocked=false;paymentSwitchArmedV786=false;setSignalChoiceDisabledV783(false);
    const stage=q('#encPaymentStage');stage.hidden=false;stage.innerHTML='<strong>Cartão de crédito ou débito</strong><p>Preencha os dados abaixo. O cartão é processado diretamente pelo Mercado Pago.</p><div id="encCardBrickContainer"></div>';
    q('#encConfirmOrder').hidden=true;
    if(!window.MercadoPago||!paymentCfg.publicKey){stage.innerHTML+=paymentResultMarkupV786('is-rejected','Cartão online indisponível','A Public Key do Mercado Pago não está disponível.',true);bindPaymentSwitchV786(stage);return}
    try{if(cardBrickController&&cardBrickController.unmount)await cardBrickController.unmount()}catch(_){}
    const mp=new MercadoPago(paymentCfg.publicKey,{locale:'pt-BR'});const bricks=mp.bricks();const amount=order.sinal_valor>0?order.sinal_valor:order.total;
    cardBrickController=await bricks.create('cardPayment','encCardBrickContainer',{initialization:{amount:amount,payer:{email:email}},customization:{paymentMethods:{maxInstallments:1}},callbacks:{onReady:()=>{},onError:(err)=>setError(err?.message||'Não foi possível carregar o pagamento com cartão.'),onSubmit:(formData,additionalData)=>new Promise(async(resolve,reject)=>{try{
      setSignalChoiceDisabledV783(true);q('#encCheckoutError').hidden=true;
      const result=await jsonFetch('/api/pagamentos/mercadopago/'+cfg.empresaId+'/encomenda/processar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({encomenda_id:order.encomenda_id,public_token:order.public_token,email:email,cardholderName:(additionalData?.cardholderName||''),deviceId:(window.MP_DEVICE_SESSION_ID||''),formData:formData})});
      const status=String(result.status||'').toLowerCase();
      try{await unmountCardBrickV783()}catch(_){}
      onlinePaymentLocked=true;paymentSwitchArmedV786=false;setSignalChoiceDisabledV783(true);
      if(status==='approved'){
        stage.innerHTML=paymentResultMarkupV786('is-approved','Pagamento aprovado ✓','O sinal foi confirmado e a encomenda foi enviada ao estabelecimento.',false);bindPaymentDoneV931(stage);
        finishSuccess(order,'Pagamento aprovado. A encomenda foi enviada ao estabelecimento.');
      }else if(['pending','in_process','authorized'].includes(status)){
        stage.innerHTML=paymentResultMarkupV786('is-pending','Pagamento em análise','O Mercado Pago ainda não confirmou o pagamento. Você pode aguardar ou trocar a forma de pagamento.',true);bindPaymentSwitchV786(stage);
        finishSuccess(order,'A encomenda foi registrada e o pagamento está em análise.');pollPayment(order);
      }else{
        stage.innerHTML=paymentResultMarkupV786('is-rejected','Pagamento não aprovado','O pagamento não foi aprovado. Tente outro cartão ou escolha outra forma de pagamento.',true);bindPaymentSwitchV786(stage);
      }
      resolve();
    }catch(err){
      setSignalChoiceDisabledV783(false);
      // A encomenda já existe neste ponto. O botão de criar encomenda não pode
      // voltar a aparecer nem ficar preso em "Confirmando…" durante o Brick.
      const confirmBtn=q('#encConfirmOrder');
      if(confirmBtn){confirmBtn.hidden=true;confirmBtn.disabled=false;confirmBtn.textContent='Confirmar encomenda'}
      const msg=String(err?.message||'');
      const transitorio=Number(err?.httpStatus||0)===503 || msg.toLowerCase().includes('demorando para responder') || msg.toLowerCase().includes('tente novamente em alguns segundos');
      if(transitorio){
        if(stage){stage.hidden=false;stage.innerHTML=paymentResultMarkupV786('is-pending','Reconectando ao pagamento…','Estamos verificando a tentativa anterior antes de liberar uma nova cobrança.',false)}
        try{
          const st=await jsonFetch('/api/pagamentos/mercadopago/'+cfg.empresaId+'/encomenda/'+order.encomenda_id+'/status?token='+encodeURIComponent(order.public_token));
          if(['pago','sinal_pago'].includes(String(st.status_pagamento||'').toLowerCase())){
            onlinePaymentLocked=true;setSignalChoiceDisabledV783(true);
            if(stage){stage.innerHTML=paymentResultMarkupV786('is-approved','Pagamento aprovado ✓','O Mercado Pago confirmou o pagamento.',false);bindPaymentDoneV931(stage)}
            finishSuccess(order,'Pagamento aprovado. A encomenda foi enviada ao estabelecimento.');resolve();return;
          }
        }catch(_recovery){}
        setError('Conexão recuperada. Revise os dados e toque em pagar novamente. O MenuFacile verificará a tentativa anterior antes de criar outra cobrança.');
        window.setTimeout(()=>startCardBrick(order,email).catch(()=>{}),500);resolve();return;
      }else{
        setError(msg||'Não foi possível processar o pagamento com cartão.');
      }
      reject(err)
    }})}});
  }

  q('#encConfirmOrder')?.addEventListener('click',async()=>{
    const btn=q('#encConfirmOrder');q('#encCheckoutError').hidden=true;
    try{
      onlineStageMethod='';onlinePaymentLocked=false;paymentSwitchArmedV786=false;
      const payload=payloadFromCheckout();btn.disabled=true;btn.textContent='Confirmando…';
      const order=await jsonFetch('/api/publico/'+encodeURIComponent(cfg.slug)+'/encomendas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});pendingOrder=order;
      const sinalMetodo=order.sinal_metodo||payload.sinal_metodo||'';
      if(sinalMetodo==='pix_sinal_manual')showManualPix(order);
      else if(sinalMetodo==='pix_online')await processPixOnline(order,payload.email);
      else if(sinalMetodo==='cartao_online')await startCardBrick(order,payload.email);
      else if(payload.forma_pagamento==='pix_online')await processPixOnline(order,payload.email);
      else if(payload.forma_pagamento==='cartao_online')await startCardBrick(order,payload.email);
      else finishSuccess(order,'O estabelecimento recebeu sua encomenda.');
    }catch(err){
      const diag=err?.paymentDiagnostic||'';
      const stage=q('#encPaymentStage');
      if(diag&&stage){
        stage.hidden=false;
        stage.innerHTML='<div class="enc-payment-debug-v784"><strong>Diagnóstico Mercado Pago · somente local</strong><p>'+escapeHtml(diag)+'</p><small>Nenhuma credencial, token ou dado de cartão é exibido aqui.</small></div>';
      }
      setError(err.message||'Não foi possível confirmar a encomenda.');btn.disabled=false;btn.textContent='Confirmar encomenda'
    }
  });

  // Políticas da loja — usa exatamente os textos já configurados em Entrega e Políticas.
  const policiesBackdropV814=q('#encPoliciesBackdropV814');
  function syncBodyAfterPoliciesV814(){
    if(!q('.enc-modal-backdrop.open,.enc-drawer-backdrop.open,.enc-checkout-backdrop.open,.enc-signal-backdrop-v778.open,.enc-info-backdrop-v776.open'))document.body.style.overflow='';
  }
  function openPoliciesV814(){
    if(!policiesBackdropV814)return;
    policiesBackdropV814.classList.add('open');
    policiesBackdropV814.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
  }
  function closePoliciesV814(){
    if(!policiesBackdropV814)return;
    policiesBackdropV814.classList.remove('open');
    policiesBackdropV814.setAttribute('aria-hidden','true');
    syncBodyAfterPoliciesV814();
  }
  qa('[data-enc-open-policies-v814]').forEach(btn=>btn.addEventListener('click',openPoliciesV814));
  qa('[data-enc-close-policies-v814]').forEach(btn=>btn.addEventListener('click',closePoliciesV814));
  policiesBackdropV814?.addEventListener('click',event=>{if(event.target===policiesBackdropV814)closePoliciesV814()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closePoliciesV814()});

  renderCart();

  // Filtro por categorias sem interferir na vitrine.
  qa('[data-enc-category]').forEach(btn=>btn.addEventListener('click',()=>{qa('[data-enc-category]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');const wanted=String(btn.dataset.encCategory||'todos').toLowerCase();qa('[data-enc-product-card]').forEach(card=>{card.hidden=wanted!=='todos'&&String(card.dataset.encCategoryName||'').toLowerCase()!==wanted})}));
})();
