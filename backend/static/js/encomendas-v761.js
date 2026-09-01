(function(){
  'use strict';
  function q(s,r){return (r||document).querySelector(s)}
  function qa(s,r){return Array.from((r||document).querySelectorAll(s))}
  function toast(text){
    var el=q('#encToast'); if(!el)return;
    el.textContent=text; el.classList.add('show');
    clearTimeout(el.__timer); el.__timer=setTimeout(function(){el.classList.remove('show')},1900);
  }

  // Gestão: filtros apenas demonstrativos, sem mutar o banco.
  qa('[data-enc-period]').forEach(function(btn){btn.addEventListener('click',function(){qa('[data-enc-period]').forEach(function(x){x.classList.remove('active')});btn.classList.add('active');toast('Prévia: filtro “'+btn.textContent.trim()+'” selecionado.')})});
  qa('[data-enc-flow-tab]').forEach(function(btn){btn.addEventListener('click',function(){qa('[data-enc-flow-tab]').forEach(function(x){x.classList.remove('active')});btn.classList.add('active');var wanted=btn.dataset.encFlowTab;qa('[data-enc-status-card]').forEach(function(card){card.hidden=(wanted!=='todos' && card.dataset.encStatusCard!==wanted)});})});
  var search=q('#encSearch');
  if(search){search.addEventListener('input',function(){var term=String(search.value||'').trim().toLowerCase();qa('[data-enc-order]').forEach(function(card){card.hidden=!!term && !String(card.textContent||'').toLowerCase().includes(term)})})}
  qa('[data-enc-accept]').forEach(function(btn){btn.addEventListener('click',function(){var card=btn.closest('[data-enc-order]');if(card){card.style.opacity='.45';card.style.transform='scale(.99)'}toast('Prévia: encomenda aceita. Na versão ligada ao banco, ela irá para Confirmadas.')})});
  qa('[data-enc-reject]').forEach(function(btn){btn.addEventListener('click',function(){toast('Prévia: abriríamos a confirmação para recusar esta encomenda.')})});
  qa('[data-enc-detail]').forEach(function(btn){btn.addEventListener('click',function(){toast('Detalhes completos da encomenda — etapa seguinte do módulo.')})});

  // Cadastro: linhas de opções e switches.
  var options=q('#encOptionList');
  var add=q('#encAddOption');
  if(options&&add){
    add.addEventListener('click',function(){
      var row=document.createElement('div'); row.className='enc-option-row';
      row.innerHTML='<input class="enc-control" value="Nova opção" aria-label="Nome da opção"><input class="enc-control" value="0,00" aria-label="Preço"><button type="button" class="enc-remove-option" aria-label="Remover opção"><i class="fa-solid fa-xmark"></i></button>';
      options.appendChild(row);
    });
    options.addEventListener('click',function(e){var b=e.target.closest('.enc-remove-option');if(b&&options.children.length>1)b.closest('.enc-option-row').remove()});
  }
  qa('.enc-switch').forEach(function(btn){btn.addEventListener('click',function(){btn.classList.toggle('on');btn.setAttribute('aria-pressed',btn.classList.contains('on')?'true':'false')})});
  var itemName=q('#encItemName'), previewName=q('#encPreviewName');
  if(itemName&&previewName)itemName.addEventListener('input',function(){previewName.textContent=itemName.value||'Nome da encomenda'});
  var save=q('#encPreviewSave'); if(save)save.addEventListener('click',function(){toast('Prévia salva visualmente. Nenhum dado foi gravado no banco.')});

  // Menu público: modal, carrinho e atualização de preço.
  var modal=q('#encProductModalBackdrop');
  var drawer=q('#encCartDrawerBackdrop');
  var total=q('#encModalTotal');
  var cartCount=q('#encCartCount');
  function openModal(){if(modal){modal.classList.add('open');document.body.style.overflow='hidden'}}
  function closeModal(){if(modal){modal.classList.remove('open');document.body.style.overflow=''}}
  function openDrawer(){if(drawer){drawer.classList.add('open');document.body.style.overflow='hidden'}}
  function closeDrawer(){if(drawer){drawer.classList.remove('open');document.body.style.overflow=''}}
  qa('[data-enc-open-product]').forEach(function(btn){btn.addEventListener('click',openModal)});
  if(q('#encModalClose'))q('#encModalClose').addEventListener('click',closeModal);
  if(modal)modal.addEventListener('click',function(e){if(e.target===modal)closeModal()});
  if(q('#encCartButton'))q('#encCartButton').addEventListener('click',openDrawer);
  if(q('#encCartClose'))q('#encCartClose').addEventListener('click',closeDrawer);
  if(drawer)drawer.addEventListener('click',function(e){if(e.target===drawer)closeDrawer()});
  qa('input[name="enc-size"]').forEach(function(r){r.addEventListener('change',function(){if(total)total.textContent=r.dataset.price||'€ 58,00'})});
  var addCart=q('#encAddCart');
  if(addCart)addCart.addEventListener('click',function(){closeModal();if(cartCount)cartCount.textContent='1';toast('Adicionado à encomenda');setTimeout(openDrawer,230)});
  var checkout=q('#encCheckout'); if(checkout)checkout.addEventListener('click',function(){toast('Próxima etapa: dados do cliente e confirmação da encomenda.')});
  qa('[data-enc-category]').forEach(function(btn){btn.addEventListener('click',function(){qa('[data-enc-category]').forEach(function(x){x.classList.remove('active')});btn.classList.add('active')})});
})();
