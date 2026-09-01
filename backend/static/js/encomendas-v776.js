(function(){
  'use strict';
  if(window.__MF_ENCOMENDAS_V776__) return;
  window.__MF_ENCOMENDAS_V776__=true;

  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>Array.from(r.querySelectorAll(s));

  function toast(message){
    const el=q('#encToast');
    if(!el) return;
    el.textContent=message;
    el.classList.add('show');
    clearTimeout(el.__v776Timer);
    el.__v776Timer=setTimeout(()=>el.classList.remove('show'),2300);
  }

  /* Card inteiro abre o mesmo modal do botão Encomendar. */
  qa('[data-enc-product-card]').forEach(card=>{
    if(card.dataset.v776CardReady==='1') return;
    card.dataset.v776CardReady='1';
    card.addEventListener('click',event=>{
      if(event.target.closest('button,a,input,select,textarea,label')) return;
      const trigger=q('[data-enc-open-product]',card);
      if(trigger) trigger.click();
    });
    card.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ') return;
      if(event.target.closest('button,a,input,select,textarea,label')) return;
      event.preventDefault();
      const trigger=q('[data-enc-open-product]',card);
      if(trigger) trigger.click();
    });
  });

  function anyPublicLayerOpen(){
    return !!q('.enc-modal-backdrop.open,.enc-drawer-backdrop.open,.enc-checkout-backdrop.open,.enc-info-backdrop-v776.open');
  }
  function syncBodyLock(){
    if(!anyPublicLayerOpen()) document.body.style.overflow='';
  }
  function openInfo(id){
    const el=q(id);if(!el)return;
    el.classList.add('open');el.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
  }
  function closeInfo(id){
    const el=q(id);if(!el)return;
    el.classList.remove('open');el.setAttribute('aria-hidden','true');syncBodyLock();
  }

  qa('[data-enc-open-contact]').forEach(btn=>btn.addEventListener('click',()=>openInfo('#encContactBackdropV776')));
  qa('[data-enc-open-location]').forEach(btn=>btn.addEventListener('click',()=>openInfo('#encLocationBackdropV776')));
  qa('[data-enc-close-contact]').forEach(btn=>btn.addEventListener('click',()=>closeInfo('#encContactBackdropV776')));
  qa('[data-enc-close-location]').forEach(btn=>btn.addEventListener('click',()=>closeInfo('#encLocationBackdropV776')));
  q('#encContactBackdropV776')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeInfo('#encContactBackdropV776')});
  q('#encLocationBackdropV776')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeInfo('#encLocationBackdropV776')});
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape') return;
    closeInfo('#encContactBackdropV776');
    closeInfo('#encLocationBackdropV776');
  });

  /*
   * Após uma encomenda concluída sem pagamento pendente, mostra o sucesso
   * por um instante e retorna sozinho ao catálogo. Pix/chave pendente permanece
   * aberto porque o cliente ainda precisa concluir a etapa.
   */
  const success=q('#encOrderSuccess');
  let autoCloseTimer=null;
  function closeCheckoutAfterSuccess(){
    const checkout=q('#encCheckoutBackdrop');
    if(checkout){checkout.classList.remove('open');checkout.setAttribute('aria-hidden','true')}
    syncBodyLock();
    toast('Encomenda enviada com sucesso.');
  }
  function evaluateSuccess(){
    if(!success||success.hidden) return;
    const text=String(success.textContent||'').trim();
    if(!text) return;
    const stage=q('#encPaymentStage');
    const confirmed=/pagamento\s+confirmado/i.test(text);
    const registered=/encomenda\s+#?.*registrad/i.test(text)||/encomenda.*recebeu/i.test(text);
    const paymentPending=stage && !stage.hidden && String(stage.textContent||'').trim().length>0;
    if(!confirmed && (!registered || paymentPending)) return;
    if(success.dataset.v776AutoClose==='1') return;
    success.dataset.v776AutoClose='1';
    clearTimeout(autoCloseTimer);
    autoCloseTimer=setTimeout(closeCheckoutAfterSuccess,1600);
  }
  if(success){
    const observer=new MutationObserver(()=>{
      if(success.hidden) success.dataset.v776AutoClose='0';
      evaluateSuccess();
    });
    observer.observe(success,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden']});
  }
})();
