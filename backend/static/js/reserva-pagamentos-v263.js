/* MenuFacile v263 — força seletor Pagar online + escolha interna Pix/cartão */
(function(window,document){
  'use strict';
  if(window.MFReservaPagamentos)return;

  let origem=null;
  let brickController=null;
  let pollingTimer=null;
  let pixPromise=null;

  function money(value){
    return Number(value||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function box(){return document.getElementById('mfReservaPagamentoBox')}
  function selected(){
    const select=document.querySelector('select[name="mf_reserva_pagamento"]');
    if(select){
      const value=String(select.value||'');
      if(value==='pagamento_online')return selectedOnlineMethod();
      return value;
    }
    const input=document.querySelector('input[name="mf_reserva_pagamento"]:checked');
    return input?String(input.value||''):'';
  }
  function selectedBase(){
    const select=document.querySelector('select[name="mf_reserva_pagamento"]');
    if(select)return String(select.value||'');
    const input=document.querySelector('input[name="mf_reserva_pagamento"]:checked');
    return input?String(input.value||''):'';
  }
  function normalizeServiceSelect(){
    const select=document.querySelector('select[name="mf_reserva_pagamento"]');
    if(!select)return;
    const options=[...select.options];
    const hasPixOnline=options.some(o=>o.value==='pix_online');
    const hasCardOnline=options.some(o=>o.value==='cartao_online');
    const hasOnline=options.some(o=>o.value==='pagamento_online');
    if((hasPixOnline||hasCardOnline)&&!hasOnline){
      const current=String(select.value||'');
      const firstOnlineIndex=Math.min(...options.filter(o=>o.value==='pix_online'||o.value==='cartao_online').map(o=>o.index));
      options.filter(o=>o.value==='pix_online'||o.value==='cartao_online').forEach(o=>o.remove());
      const onlineOption=new Option('Pagar online','pagamento_online');
      select.add(onlineOption,Math.max(0,firstOnlineIndex));
      if(current==='pix_online'||current==='cartao_online'){
        const hidden=onlineHidden();
        if(hidden)hidden.value=current;
        select.value='pagamento_online';
      }
    }
  }
  function onlineHidden(){ return document.getElementById('mfReservaOnlineMethod'); }
  function selectedOnlineMethod(){
    const hidden=onlineHidden();
    if(hidden&&hidden.value)return String(hidden.value);
    const active=document.querySelector('.mf-reserva-online-method.active');
    return active?String(active.dataset.mfReservaOnlineMethod||''):'';
  }
  function chooseOnlineMethod(value){
    const hidden=onlineHidden();
    if(hidden)hidden.value=String(value||'');
    document.querySelectorAll('.mf-reserva-online-method').forEach(btn=>{
      const active=String(btn.dataset.mfReservaOnlineMethod||'')===String(value||'');
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-pressed',active?'true':'false');
    });
  }
  function ensureSelected(){
    normalizeServiceSelect();
    const select=document.querySelector('select[name="mf_reserva_pagamento"]');
    if(select){
      if(!select.value){
        const first=[...select.options].find(option=>option.value&&!option.disabled);
        if(first)select.value=first.value;
      }
      if(!selectedOnlineMethod()){
        const firstOnline=document.querySelector('.mf-reserva-online-method');
        if(firstOnline)chooseOnlineMethod(firstOnline.dataset.mfReservaOnlineMethod||'');
      }
      sync();
      return;
    }
    const inputs=[...document.querySelectorAll('input[name="mf_reserva_pagamento"]')];
    if(inputs.length&&!inputs.some(i=>i.checked))inputs[0].checked=true;
    sync();
  }
  function sync(){
    const base=selectedBase();
    const current=selected();
    const el=box();
    if(el)el.dataset.forma=current;
    const chooser=document.getElementById('mfReservaOnlineChooser');
    if(chooser)chooser.hidden=base!=='pagamento_online';
    document.querySelectorAll('.mf-sinal-pix-key').forEach(key=>{
      key.style.display=(current==='pix_manual'||!current)?'':'none';
    });
  }
  function formaSelecionada(){ensureSelected();return selected()}
  function prepararPayload(payload){
    return Object.assign({},payload||{},{forma_pagamento:formaSelecionada()||null});
  }
  function stopPolling(){if(pollingTimer){clearInterval(pollingTimer);pollingTimer=null}}
  async function unmount(){
    if(brickController){try{await brickController.unmount()}catch(e){}brickController=null}
  }
  function modal(){return document.getElementById('modalPagamentoReserva')}
  function status(text,type){
    const el=document.getElementById('mfReservaPaymentStatus');
    if(!el)return;
    el.textContent=text||'';
    el.className='mf-reserva-pay-status'+(type?' '+type:'');
    el.hidden=!text;
  }
  function method(){
    return String((origem&&origem.forma_pagamento)||formaSelecionada()||'');
  }
  function setTitle(){
    const title=document.getElementById('mfReservaPaymentTitle');
    if(!title||!origem)return;
    const sinal=Number(origem.valor_sinal||0)>0;
    if(method()==='cartao_online') title.textContent=sinal?'Pagar sinal com cartão':'Pagar com cartão';
    else title.textContent=sinal?'Pagar sinal por Pix':'Pagar por Pix';
  }
  function resetPanels(){
    const brick=document.getElementById('mfReservaPaymentBrick');
    const result=document.getElementById('mfReservaPixResult');
    if(brick){brick.style.display='none';brick.replaceChildren()}
    if(result)result.classList.remove('ativo');
  }
  function showPix(data){
    const brick=document.getElementById('mfReservaPaymentBrick');
    const result=document.getElementById('mfReservaPixResult');
    const img=document.getElementById('mfReservaPixQr');
    const code=document.getElementById('mfReservaPixCode');
    if(brick)brick.style.display='none';
    if(result)result.classList.add('ativo');
    if(img){
      const base64=String(data.qr_code_base64||'').trim();
      if(base64)img.src=base64.startsWith('data:')?base64:'data:image/png;base64,'+base64;
      else img.removeAttribute('src');
    }
    if(code)code.value=String(data.qr_code||'');
    status('Pix gerado. A confirmação será automática.','approved');
    startPolling();
  }
  function normalized(data){
    const api=window.MenuFacileCheckout;
    const raw=(data&&data.gateway_status)||(data&&data.status_pagamento)||(data&&data.status)||'';
    return api&&api.normalizarStatus?api.normalizarStatus(raw):String(raw).toLowerCase();
  }
  function approved(){
    stopPolling();
    const brick=document.getElementById('mfReservaPaymentBrick');
    const pix=document.getElementById('mfReservaPixResult');
    if(brick)brick.style.display='none';
    if(pix)pix.classList.remove('ativo');
    status(origem&&origem.confirmacao_automatica?'Pagamento aprovado! Agendamento confirmado.':'Pagamento aprovado! Aguarde a confirmação do estabelecimento.','approved');
  }
  async function checkStatus(){
    if(!origem||!window.MenuFacileCheckout)return;
    try{
      const data=await window.MenuFacileCheckout.consultarStatus('reserva',origem.id,origem.public_token);
      const st=normalized(data);
      if(st==='approved')approved();
      else if(st==='rejected'){stopPolling();status('Pagamento recusado ou cancelado.','error')}
    }catch(e){}
  }
  function startPolling(){
    stopPolling();
    checkStatus();
    pollingTimer=setInterval(checkStatus,4000);
  }
  async function processar(formData){
    const api=window.MenuFacileCheckout;
    if(!api||!api.processarPagamento)throw new Error('Não foi possível iniciar o pagamento online.');
    return api.processarPagamento('reserva',{
      reserva_id:origem.id,
      public_token:origem.public_token,
      formData:formData||{},
      email:''
    });
  }
  async function generatePix(){
    if(pixPromise)return pixPromise;
    resetPanels();
    status('Gerando o Pix...');
    pixPromise=(async()=>{
      try{
        const data=await processar({
          payment_method_id:'pix',
          payer:{email:'cliente@menufacile.org'}
        });
        const st=normalized(data);
        if(st==='approved')approved();
        else if(data.qr_code||data.qr_code_base64)showPix(data);
        else if(st==='rejected')status('Não foi possível gerar o Pix. Tente novamente.','error');
        else{status('Pagamento pendente. Aguarde a confirmação.');startPolling()}
        return data;
      }catch(error){
        status(error&&error.message?error.message:'Não foi possível gerar o Pix.','error');
        throw error;
      }finally{pixPromise=null}
    })();
    return pixPromise;
  }
  async function renderCard(){
    const container=document.getElementById('mfReservaPaymentBrick');
    if(!container||!origem)return;
    await unmount();
    resetPanels();
    container.style.display='block';
    const api=window.MenuFacileCheckout;
    const amount=Math.max(.01,Number(origem.valor_pagamento_online||origem.valor_sinal||origem.valor_total||0));
    if(!api||!api.obterMercadoPago){status('Não foi possível carregar o pagamento online.','error');return}
    const mp=api.obterMercadoPago('pt-BR');
    if(!mp){status('Confira a Public Key e a ativação do Mercado Pago.','error');return}
    status('Preencha os dados do cartão para concluir.');
    try{
      const builder=mp.bricks();
      brickController=await builder.create('cardPayment','mfReservaPaymentBrick',{
        initialization:{amount:amount},
        customization:{
          visual:{
            style:{theme:'default'},
            hideFormTitle:true,
            texts:{
              formSubmit:'Pagar com cartão',
              installmentsSectionTitle:'Parcelas',
              selectInstallments:'Escolha as parcelas'
            }
          },
          paymentMethods:{types:{excluded:['debit_card','prepaid_card']}}
        },
        callbacks:{
          onReady:function(){status('')},
          onError:function(error){console.error(error);status('Não foi possível carregar o formulário do cartão. Confira as credenciais.','error')},
          onSubmit:async function(formData){
            try{
              status('Processando pagamento...');
              const data=await processar(formData||{});
              const st=normalized(data);
              if(st==='approved')approved();
              else if(st==='rejected')status('Pagamento recusado. Confira os dados do cartão.','error');
              else{status('Pagamento pendente. A confirmação será atualizada automaticamente.');startPolling()}
              return data;
            }catch(error){status(error&&error.message?error.message:'Não foi possível processar o pagamento.','error');throw error}
          }
        }
      });
    }catch(error){console.error(error);status('Não foi possível iniciar o formulário do cartão.','error')}
  }
  async function abrir(data){
    origem=data||null;
    if(!origem)return;
    const m=modal();
    if(!m)return;
    setTitle();
    const amount=document.getElementById('mfReservaPaymentAmount');
    if(amount)amount.textContent='R$ '+money(origem.valor_pagamento_online||origem.valor_sinal||origem.valor_total||0);
    m.style.display='flex';
    document.body.style.overflow='hidden';
    if(method()==='cartao_online')await renderCard();
    else await generatePix();
  }
  async function fechar(){
    stopPolling();
    await unmount();
    const m=modal();if(m)m.style.display='none';
    document.body.style.overflow='';
  }
  async function copyPix(){
    const input=document.getElementById('mfReservaPixCode');
    if(!input||!input.value)return;
    try{await window.MenuFacileCheckout.copiarTexto(input.value);status('Código Pix copiado.','approved')}catch(e){input.select();document.execCommand('copy');status('Código Pix copiado.','approved')}
  }

  document.addEventListener('change',function(event){if(event.target&&event.target.name==='mf_reserva_pagamento')sync()});
  document.addEventListener('click',function(event){
    const btn=event.target&&event.target.closest?event.target.closest('.mf-reserva-online-method'):null;
    if(!btn)return;
    event.preventDefault();
    chooseOnlineMethod(btn.dataset.mfReservaOnlineMethod||'');
    sync();
  });
  document.addEventListener('DOMContentLoaded',function(){ normalizeServiceSelect(); ensureSelected(); });
  window.setTimeout(function(){ normalizeServiceSelect(); ensureSelected(); },250);
  document.addEventListener('click',function(event){if(event.target===modal())fechar()});

  window.MFReservaPagamentos=Object.freeze({formaSelecionada,prepararPayload,abrir,fechar,copiarPix,sincronizar:sync});
})(window,document);
