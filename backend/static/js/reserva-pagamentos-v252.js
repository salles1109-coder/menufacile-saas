/* MenuFacile v252 — pagamento integrado para reservas/agendamentos */
(function(window,document){
  'use strict';
  if(window.MFReservaPagamentos)return;

  let origem=null;
  let brickController=null;
  let pollingTimer=null;

  function money(value){
    return Number(value||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function box(){return document.getElementById('mfReservaPagamentoBox')}
  function selected(){
    const input=document.querySelector('input[name="mf_reserva_pagamento"]:checked');
    return input?String(input.value||''):'';
  }
  function ensureSelected(){
    const inputs=[...document.querySelectorAll('input[name="mf_reserva_pagamento"]')];
    if(inputs.length&&!inputs.some(i=>i.checked))inputs[0].checked=true;
    sync();
  }
  function sync(){
    const current=selected();
    const el=box();
    if(el)el.dataset.forma=current;
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
  }
  function setTitle(){
    const title=document.getElementById('mfReservaPaymentTitle');
    if(!title||!origem)return;
    const sinal=Number(origem.valor_sinal||0)>0;
    title.textContent=sinal?'Pagamento do sinal':'Pagamento do agendamento';
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
    status('Pix gerado. Aguarde a confirmação automática.');
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
      else if(st==='rejected'){stopPolling();status('Pagamento recusado ou cancelado. Escolha outra forma de pagamento.','error')}
    }catch(e){}
  }
  function startPolling(){
    stopPolling();
    checkStatus();
    pollingTimer=setInterval(checkStatus,4000);
  }
  async function renderBrick(){
    const container=document.getElementById('mfReservaPaymentBrick');
    if(!container||!origem)return;
    await unmount();
    container.style.display='block';
    container.replaceChildren();
    const pix=document.getElementById('mfReservaPixResult');
    if(pix)pix.classList.remove('ativo');
    const api=window.MenuFacileCheckout;
    const amount=Math.max(.01,Number(origem.valor_pagamento_online||origem.valor_sinal||origem.valor_total||0));
    if(!api||!api.obterMercadoPago){status('Não foi possível carregar o pagamento online.','error');return}
    const mp=api.obterMercadoPago('pt-BR');
    if(!mp){status('Confira a Public Key e a ativação do Mercado Pago.','error');return}
    const method=String(origem.forma_pagamento||formaSelecionada()||'');
    const card=method==='cartao_online';
    status(card?'Informe os dados do cartão para concluir.':'Gere o Pix para concluir o pagamento.');
    try{
      const builder=mp.bricks();
      brickController=await builder.create('payment','mfReservaPaymentBrick',{
        initialization:{amount:amount},
        customization:{
          visual:{style:{theme:'default'}},
          paymentMethods:{
            creditCard:card?'all':[],debitCard:card?'all':[],prepaidCard:card?'all':[],
            bankTransfer:card?[]:'all',ticket:[]
          }
        },
        callbacks:{
          onReady:function(){},
          onError:function(error){console.error(error);status('Não foi possível carregar o pagamento. Confira as credenciais.','error')},
          onSubmit:async function(event){
            try{
              status('Processando pagamento...');
              const data=await api.processarPagamento('reserva',{
                reserva_id:origem.id,
                public_token:origem.public_token,
                formData:(event&&event.formData)||{},
                email:''
              });
              const st=normalized(data);
              if(st==='approved')approved();
              else if(data.qr_code||data.qr_code_base64)showPix(data);
              else if(st==='rejected')status('Pagamento recusado. Confira os dados ou escolha outra forma.','error');
              else{status('Pagamento pendente. A confirmação será atualizada automaticamente.');startPolling()}
              return data;
            }catch(error){status(error&&error.message?error.message:'Não foi possível processar o pagamento.','error');throw error}
          }
        }
      });
    }catch(error){console.error(error);status('Não foi possível iniciar o pagamento online.','error')}
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
    await renderBrick();
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
    try{await window.MenuFacileCheckout.copiarTexto(input.value);status('Código Pix copiado.')}catch(e){input.select();document.execCommand('copy');status('Código Pix copiado.')}
  }

  document.addEventListener('change',function(event){if(event.target&&event.target.name==='mf_reserva_pagamento')sync()});
  document.addEventListener('DOMContentLoaded',ensureSelected);
  document.addEventListener('click',function(event){if(event.target===modal())fechar()});

  window.MFReservaPagamentos=Object.freeze({formaSelecionada,prepararPayload,abrir,fechar,copiarPix,sincronizar:sync});
})(window,document);
