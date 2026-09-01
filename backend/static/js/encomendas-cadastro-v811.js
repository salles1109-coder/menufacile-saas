(function(){
  'use strict';
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>Array.from(r.querySelectorAll(s));

  // Modal de categorias
  const categoryModal=q('#encCategoryModal');
  function openCategories(){
    if(!categoryModal)return;
    categoryModal.classList.add('open');
    categoryModal.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
    setTimeout(()=>q('.enc-new-category-form input',categoryModal)?.focus(),80);
  }
  function closeCategories(){
    if(!categoryModal)return;
    categoryModal.classList.remove('open');
    categoryModal.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
  }
  qa('[data-enc-open-categories]').forEach(btn=>btn.addEventListener('click',openCategories));
  qa('[data-enc-close-categories]').forEach(btn=>btn.addEventListener('click',closeCategories));
  if(categoryModal?.classList.contains('open')) document.body.style.overflow='hidden';
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&categoryModal?.classList.contains('open'))closeCategories()});

  // v809: CREATE e UPDATE totalmente separados, inclusive endpoint, campo e estado.
  const newCategoryForm=q('#encNewCategoryFormV809')||q('.enc-new-category-form');
  function categoryBaseUrl(){
    return String(q('.enc-category-dialog')?.dataset.encCategoryBaseUrl||'').replace(/\/$/,'');
  }
  function createCategoryUrl(){
    return String(q('.enc-category-dialog')?.dataset.encCreateCategoryUrl||newCategoryForm?.action||'');
  }
  function addCategoryToSelect(data){
    const liveSelect=q('#encCategorySelect');
    if(!liveSelect)return;
    let option=Array.from(liveSelect.options).find(o=>String(o.value)===String(data.id));
    if(!option){
      option=document.createElement('option');
      option.value=String(data.id);
      liveSelect.appendChild(option);
    }
    option.textContent=String(data.nome||'Categoria');
    liveSelect.value=String(data.id);
    liveSelect.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function createCategoryBrowserCard(data){
    const id=String(data.id||'');
    if(!id||q(`[data-enc-category-card="${CSS.escape(id)}"]`))return;
    const browser=q('.enc-category-browser');
    if(!browser)return;
    const card=document.createElement('article');
    card.className='enc-category-browser-card';
    card.dataset.encCategoryCard=id;
    card.dataset.encCategoryCount='0';
    card.innerHTML=`
      <button type="button" class="enc-category-browser-main" data-enc-category-filter="${id}" data-enc-category-name="" aria-label="Ver produtos">
        <span class="enc-category-browser-icon"><i class="fa-solid fa-tag"></i></span>
        <span class="enc-category-browser-copy"><strong></strong><small data-enc-category-count-text>0 produtos</small></span>
        <i class="fa-solid fa-chevron-right"></i>
      </button>
      <div class="enc-category-card-actions">
        <button type="button" class="enc-category-action edit" data-enc-edit-category="${id}"><i class="fa-solid fa-pen"></i> Editar</button>
        <form method="post" action="${categoryBaseUrl()}/${encodeURIComponent(id)}/excluir?origem=lista" class="enc-delete-category-form" data-enc-category-id="${id}" data-enc-category-name="">
          <button type="submit" class="enc-category-action delete"><i class="fa-regular fa-trash-can"></i> Excluir</button>
        </form>
      </div>`;
    const name=String(data.nome||'Categoria');
    q('strong',card).textContent=name;
    const main=q('[data-enc-category-filter]',card); if(main){main.dataset.encCategoryName=name;main.setAttribute('aria-label',`Ver produtos de ${name}`);}
    const del=q('.enc-delete-category-form',card); if(del)del.dataset.encCategoryName=name;
    browser.appendChild(card);
    bindCategoryCardActions(card);
  }
  function createCategoryModalRow(data){
    const id=String(data.id||'');
    if(!id||q(`[data-enc-category-row="${CSS.escape(id)}"]`))return;
    const list=q('.enc-category-list');
    if(!list)return;
    const row=document.createElement('div');
    row.className='enc-category-row';
    row.dataset.encCategoryRow=id;
    row.dataset.encCategoryCount='0';
    row.innerHTML=`
      <form method="post" action="${categoryBaseUrl()}/${encodeURIComponent(id)}/editar" class="enc-category-edit-form" data-enc-category-id="${id}">
        <div class="enc-category-count"><strong data-enc-category-modal-count>0</strong><span data-enc-category-modal-count-label>produtos</span></div>
        <input name="nome_categoria_edicao" class="enc-category-name-input" required aria-label="Nome da categoria">
        <button type="submit" class="enc-category-save" title="Salvar nome"><i class="fa-solid fa-check"></i></button>
      </form>
      <form method="post" action="${categoryBaseUrl()}/${encodeURIComponent(id)}/excluir" class="enc-delete-category-form" data-enc-category-id="${id}" data-enc-category-name="">
        <button type="submit" class="enc-category-delete" title="Excluir categoria"><i class="fa-regular fa-trash-can"></i></button>
      </form>`;
    const name=String(data.nome||'Categoria');
    q('.enc-category-name-input',row).value=name;
    const del=q('.enc-delete-category-form',row); if(del)del.dataset.encCategoryName=name;
    list.appendChild(row);
  }
  function syncCreatedCategory(data){
    createCategoryBrowserCard(data);
    createCategoryModalRow(data);
    addCategoryToSelect(data);
    if(!data.existente){
      const current=intText(q('#encCategoryTotal'));
      setTextCount(q('#encCategoryTotal'),Number.isFinite(Number(data.categorias_ativas))?Number(data.categorias_ativas):current+1);
    }
    syncAllCategoryDeleteStates();
  }
  newCategoryForm?.addEventListener('submit',async e=>{
    e.preventDefault();
    e.stopPropagation();
    // CREATE nunca herda ID/estado de edição.
    newCategoryForm.removeAttribute('data-category-id');
    newCategoryForm.dataset.encMode='create';
    const input=q('input[name="nome_nova_categoria"]',newCategoryForm);
    const name=String(input?.value||'').trim();
    if(!name){input?.focus();return;}
    const submit=q('button[type="submit"]',newCategoryForm);
    const original=submit?.innerHTML||'';
    if(submit){submit.disabled=true;submit.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Adicionando...';}
    try{
      const createData=new FormData();
      createData.append('nome_nova_categoria',name);
      createData.append('modo','criar');
      const endpoint=createCategoryUrl();
      if(!endpoint)throw new Error('Endpoint de criação de categoria não encontrado.');
      const res=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest','Accept':'application/json'},body:createData});
      const data=await res.json().catch(()=>({}));
      if(!res.ok||!data.ok)throw new Error(data.erro||'Não foi possível criar a categoria.');
      syncCreatedCategory(data);
      if(input)input.value='';
      showToast('Nova categoria adicionada.');
      if(q('#encCategorySelect'))closeCategories(); else input?.focus();
    }catch(err){
      showToast(err.message||'Não foi possível criar a categoria.','error');
      input?.focus();
    }finally{
      if(submit){submit.disabled=false;submit.innerHTML=original;}
    }
  });

  // v804: Categorias primeiro; Produtos mostra todos ou apenas a categoria escolhida.
  const tabs=qa('[data-enc-tab]');
  const panels=qa('[data-enc-panel]');
  const productCards=()=>qa('[data-enc-product-category]');
  const productsTitle=q('#encProductsTitle');
  const productsSubtitle=q('#encProductsSubtitle');
  const clearCategoryFilter=q('#encClearCategoryFilter');
  function activateTab(name){
    tabs.forEach(tab=>{const active=tab.dataset.encTab===name;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',active?'true':'false');});
    panels.forEach(panel=>panel.classList.toggle('active',panel.dataset.encPanel===name));
  }
  function showAllProducts(){
    productCards().forEach(card=>card.classList.remove('enc-filter-hidden'));
    if(productsTitle)productsTitle.textContent='Produtos cadastrados';
    if(productsSubtitle)productsSubtitle.textContent='Use Editar para alterar o produto ou Excluir para removê-lo do catálogo.';
    if(clearCategoryFilter)clearCategoryFilter.hidden=true;
    activateTab('products');
    refreshProductEmptyState?.();
  }
  tabs.forEach(tab=>tab.addEventListener('click',()=>{if(tab.dataset.encTab==='products')showAllProducts();else activateTab('categories');}));
  function bindCategoryCardActions(scope=document){
    qa('[data-enc-category-filter]',scope).forEach(btn=>{
      if(btn.dataset.encBound==='1')return;
      btn.dataset.encBound='1';
      btn.addEventListener('click',()=>{
        const id=String(btn.dataset.encCategoryFilter||'');
        const name=String(btn.dataset.encCategoryName||'Categoria');
        productCards().forEach(card=>card.classList.toggle('enc-filter-hidden',String(card.dataset.encProductCategory||'')!==id));
        if(productsTitle)productsTitle.textContent=name;
        if(productsSubtitle)productsSubtitle.textContent='Produtos desta categoria.';
        if(clearCategoryFilter)clearCategoryFilter.hidden=false;
        activateTab('products');
        refreshProductEmptyState?.();
        q('[data-enc-panel="products"]')?.scrollIntoView?.({behavior:'smooth',block:'start'});
      });
    });
    qa('[data-enc-edit-category]',scope).forEach(btn=>{
      if(btn.dataset.encBound==='1')return;
      btn.dataset.encBound='1';
      btn.addEventListener('click',()=>{
        const id=String(btn.dataset.encEditCategory||'');
        openCategories();
        setTimeout(()=>{
          const row=q(`[data-enc-category-row="${CSS.escape(id)}"]`,categoryModal||document);
          const input=q('.enc-category-name-input',row||document);
          row?.scrollIntoView?.({behavior:'smooth',block:'center'});
          input?.focus?.();input?.select?.();
        },100);
      });
    });
  }
  bindCategoryCardActions();
  clearCategoryFilter?.addEventListener('click',showAllProducts);

  // v806: exclusão assíncrona de produtos e categorias, sem recarregar a página.
  const toast=q('#encToast');
  let toastTimer=null;
  function showToast(message,type='success'){
    if(!toast)return;
    toast.textContent=message;
    toast.classList.remove('success','error','show');
    toast.classList.add(type==='error'?'error':'success');
    requestAnimationFrame(()=>toast.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>toast.classList.remove('show'),2600);
  }
  function intText(el){const n=parseInt(String(el?.textContent||'0').replace(/\D/g,''),10);return Number.isFinite(n)?n:0;}
  function setTextCount(el,n){if(el)el.textContent=String(Math.max(0,Number(n)||0));}
  function currentCategoryTotal(){return intText(q('#encCategoryTotal'));}
  function setCategoryCount(id,count){
    const n=Math.max(0,Number(count)||0);
    const card=q(`[data-enc-category-card="${CSS.escape(String(id))}"]`);
    if(card){
      card.dataset.encCategoryCount=String(n);
      const txt=q('[data-enc-category-count-text]',card);
      if(txt)txt.textContent=`${n} produto${n===1?'':'s'}`;
    }
    const row=q(`[data-enc-category-row="${CSS.escape(String(id))}"]`);
    if(row){
      row.dataset.encCategoryCount=String(n);
      setTextCount(q('[data-enc-category-modal-count]',row),n);
      const lbl=q('[data-enc-category-modal-count-label]',row);
      if(lbl)lbl.textContent=n===1?'produto':'produtos';
    }
    syncCategoryDeleteState(id,n);
  }
  function getCategoryCount(id){
    const card=q(`[data-enc-category-card="${CSS.escape(String(id))}"]`);
    if(card)return Math.max(0,parseInt(card.dataset.encCategoryCount||'0',10)||0);
    const row=q(`[data-enc-category-row="${CSS.escape(String(id))}"]`);
    if(row)return Math.max(0,parseInt(row.dataset.encCategoryCount||'0',10)||0);
    return 0;
  }
  function syncCategoryDeleteState(id,count=getCategoryCount(id)){
    const last=currentCategoryTotal()<=1;
    qa(`.enc-delete-category-form[data-enc-category-id="${CSS.escape(String(id))}"]`).forEach(f=>{
      const btn=q('button[type="submit"]',f);
      if(!btn)return;
      const disabled=Number(count)>0||last;
      btn.disabled=disabled;
      btn.classList.toggle('disabled',disabled);
      if(Number(count)>0)btn.title='Mova ou exclua os produtos antes de excluir esta categoria';
      else if(last)btn.title='Mantenha pelo menos uma categoria ativa';
      else btn.title='Excluir categoria';
    });
  }
  function syncAllCategoryDeleteStates(){
    const ids=[...new Set(qa('.enc-delete-category-form').map(f=>String(f.dataset.encCategoryId||'')).filter(Boolean))];
    ids.forEach(id=>syncCategoryDeleteState(id));
  }
  function refreshProductEmptyState(){
    const panel=q('[data-enc-panel="products"]');
    const grid=q('.enc-admin-product-grid',panel||document);
    if(!panel||!grid)return;
    q('.enc-inline-empty',grid)?.remove();
    const cards=qa('.enc-admin-product-card',grid);
    const visible=cards.filter(card=>!card.classList.contains('enc-filter-hidden'));
    if(cards.length===0){
      grid.innerHTML='<div class="enc-inline-empty enc-inline-empty-all"><i class="fa-solid fa-box-open"></i><strong>Nenhum produto cadastrado</strong><span>Adicione um produto para ele aparecer no seu catálogo.</span></div>';
      return;
    }
    if(visible.length===0){
      const empty=document.createElement('div');
      empty.className='enc-inline-empty';
      empty.innerHTML='<i class="fa-regular fa-folder-open"></i><strong>Nenhum produto nesta categoria</strong><span>Você pode adicionar um produto ou voltar para todos os produtos.</span>';
      grid.appendChild(empty);
    }
  }

  document.addEventListener('submit',async e=>{
    const editCategoryForm=e.target.closest?.('.enc-category-edit-form');
    if(editCategoryForm){
      e.preventDefault();
      const input=q('input[name="nome_categoria_edicao"]',editCategoryForm);
      const name=String(input?.value||'').trim();
      if(!name){input?.focus();return;}
      const btn=q('button[type="submit"]',editCategoryForm);
      if(btn)btn.disabled=true;
      try{
        const res=await fetch(editCategoryForm.action,{method:'POST',credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest','Accept':'application/json'},body:new FormData(editCategoryForm)});
        const data=await res.json().catch(()=>({}));
        if(!res.ok||!data.ok)throw new Error(data.erro||'Não foi possível renomear a categoria.');
        const id=String(data.id||editCategoryForm.dataset.encCategoryId||'');
        const newName=String(data.nome||name);
        const card=q(`[data-enc-category-card="${CSS.escape(id)}"]`);
        const strong=q('.enc-category-browser-copy strong',card||document); if(strong)strong.textContent=newName;
        const main=q('[data-enc-category-filter]',card||document); if(main){main.dataset.encCategoryName=newName;main.setAttribute('aria-label',`Ver produtos de ${newName}`);}
        qa(`.enc-delete-category-form[data-enc-category-id="${CSS.escape(id)}"]`).forEach(f=>f.dataset.encCategoryName=newName);
        const opt=q(`#encCategorySelect option[value="${CSS.escape(id)}"]`); if(opt)opt.textContent=newName;
        showToast('Categoria atualizada.');
      }catch(err){showToast(err.message||'Não foi possível renomear a categoria.','error');}
      finally{if(btn)btn.disabled=false;}
      return;
    }

    const productForm=e.target.closest?.('.enc-delete-product-form');
    if(productForm){
      e.preventDefault();
      const name=String(productForm.dataset.encProductName||'este produto');
      if(!window.confirm(`Excluir o produto ${name}? Ele deixará de aparecer no catálogo.`))return;
      const btn=q('button[type="submit"]',productForm);
      if(btn)btn.disabled=true;
      try{
        const res=await fetch(productForm.action,{method:'POST',credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest','Accept':'application/json'}});
        const data=await res.json().catch(()=>({}));
        if(!res.ok||!data.ok)throw new Error(data.erro||'Não foi possível excluir o produto.');
        const card=productForm.closest('.enc-admin-product-card');
        if(card){card.classList.add('enc-removing');await new Promise(r=>setTimeout(r,160));card.remove();}
        const total=q('#encProductTotal');
        setTextCount(total,Math.max(0,intText(total)-1));
        if(data.categoria_id)setCategoryCount(data.categoria_id,data.categoria_itens);
        refreshProductEmptyState();
        showToast('Produto excluído.');
      }catch(err){
        if(btn)btn.disabled=false;
        showToast(err.message||'Não foi possível excluir o produto.','error');
      }
      return;
    }

    const categoryForm=e.target.closest?.('.enc-delete-category-form');
    if(categoryForm){
      e.preventDefault();
      const btn=q('button[type="submit"]',categoryForm);
      if(btn?.disabled)return;
      const name=String(categoryForm.dataset.encCategoryName||'esta categoria');
      if(!window.confirm(`Excluir a categoria ${name}?`))return;
      if(btn)btn.disabled=true;
      try{
        const res=await fetch(categoryForm.action,{method:'POST',credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest','Accept':'application/json'}});
        const data=await res.json().catch(()=>({}));
        if(!res.ok||!data.ok)throw new Error(data.erro||'Não foi possível excluir a categoria.');
        const id=String(data.categoria_id||categoryForm.dataset.encCategoryId||'');
        const browserCard=q(`[data-enc-category-card="${CSS.escape(id)}"]`);
        const modalRow=q(`[data-enc-category-row="${CSS.escape(id)}"]`);
        [browserCard,modalRow].filter(Boolean).forEach(el=>el.classList.add('enc-removing'));
        await new Promise(r=>setTimeout(r,160));
        browserCard?.remove();modalRow?.remove();
        setTextCount(q('#encCategoryTotal'),data.categorias_ativas);
        const opt=q(`#encCategorySelect option[value="${CSS.escape(id)}"]`);
        opt?.remove();
        syncAllCategoryDeleteStates();
        showToast('Categoria excluída.');
      }catch(err){
        if(btn)btn.disabled=false;
        showToast(err.message||'Não foi possível excluir a categoria.','error');
      }
    }
  });
  syncAllCategoryDeleteStates();

  // Campos e preview do editor
  const form=q('#encCadastroForm');
  if(!form)return;
  const nameInput=q('#encItemName');
  const descInput=q('#encItemDescription');
  const categorySelect=q('#encCategorySelect');
  const previewName=q('#encPreviewName');
  const previewDesc=q('#encPreviewDescription');
  const previewCategory=q('#encPreviewCategory');
  const previewPrice=q('#encPreviewPrice');
  const previewPriceLabel=q('#encPreviewPriceLabel');
  const previewImage=q('#encPreviewImage');
  const previewEmpty=q('#encPreviewEmpty');
  const photoHidden=q('#encItemPhoto');
  const photoUrl=q('#encItemPhotoUrl');
  const photoFile=q('#encItemPhotoFile');
  const choosePhoto=q('#encChoosePhoto');
  const photoStatus=q('#encPhotoStatus');
  const thumbImg=q('#encPhotoThumbImg');
  const thumbPlaceholder=q('#encPhotoPlaceholder');

  function setPreviewText(){
    if(previewName)previewName.textContent=(nameInput?.value||'').trim()||'Nome do produto';
    if(previewDesc)previewDesc.textContent=(descInput?.value||'').trim()||'Uma descrição curta ajuda o cliente a escolher.';
    if(previewCategory){
      const opt=categorySelect?.options?.[categorySelect.selectedIndex];
      previewCategory.textContent=(opt?.value?opt.textContent:'Categoria')||'Categoria';
    }
  }
  nameInput?.addEventListener('input',setPreviewText);
  descInput?.addEventListener('input',setPreviewText);
  categorySelect?.addEventListener('change',setPreviewText);

  function setImage(url){
    const value=String(url||'').trim();
    if(photoHidden)photoHidden.value=value;
    if(photoUrl&&photoUrl.value!==value)photoUrl.value=value;
    if(value){
      if(previewImage){previewImage.src=value;previewImage.hidden=false;}
      if(previewEmpty)previewEmpty.hidden=true;
      if(thumbImg){thumbImg.src=value;thumbImg.hidden=false;}
      if(thumbPlaceholder)thumbPlaceholder.hidden=true;
    }else{
      if(previewImage){previewImage.removeAttribute('src');previewImage.hidden=true;}
      if(previewEmpty)previewEmpty.hidden=false;
      if(thumbImg){thumbImg.removeAttribute('src');thumbImg.hidden=true;}
      if(thumbPlaceholder)thumbPlaceholder.hidden=false;
    }
  }
  photoUrl?.addEventListener('input',()=>setImage(photoUrl.value));
  choosePhoto?.addEventListener('click',()=>photoFile?.click());
  photoFile?.addEventListener('change',async()=>{
    const file=photoFile.files&&photoFile.files[0];
    if(!file)return;
    if(!file.type||!file.type.startsWith('image/')){
      if(photoStatus){photoStatus.textContent='Escolha uma imagem válida.';photoStatus.className='enc-photo-status error';}
      photoFile.value='';return;
    }
    const fd=new FormData();fd.append('file',file);
    if(photoStatus){photoStatus.textContent='Enviando foto...';photoStatus.className='enc-photo-status';}
    choosePhoto.disabled=true;
    try{
      const res=await fetch('/upload-imagem',{method:'POST',credentials:'same-origin',body:fd});
      const data=await res.json().catch(()=>({}));
      if(!res.ok||data.error)throw new Error(data.error||'Não foi possível enviar a foto.');
      setImage(data.url||'');
      if(photoStatus){photoStatus.textContent='Foto enviada.';photoStatus.className='enc-photo-status ok';}
    }catch(err){
      if(photoStatus){photoStatus.textContent=err.message||'Erro ao enviar foto.';photoStatus.className='enc-photo-status error';}
    }finally{choosePhoto.disabled=false;photoFile.value='';}
  });

  // Forma de venda + exemplos
  const saleMode=q('#encSaleMode');
  const optionHelp=q('#encOptionHelp');
  const optionsBox=q('#encOptionsBox');
  const singlePriceBox=q('#encSinglePriceBox');
  const singlePriceInput=q('#encSinglePrice');
  const modeConfig={
    preco_unico:{placeholder:'',help:'Preço fixo do produto'},
    quantidade:{placeholder:'Ex.: 50 unidades',help:'Ex.: 50 unidades — R$ 90,00'},
    peso:{placeholder:'Ex.: 1 kg',help:'Ex.: 1 kg — R$ 70,00'},
    tamanho:{placeholder:'Ex.: Médio',help:'Ex.: Médio — R$ 85,00'},
    kit:{placeholder:'Ex.: Caixa com 12',help:'Ex.: Caixa com 12 — R$ 45,00'},
    unidade:{placeholder:'Ex.: Unidade',help:'Ex.: Unidade — R$ 8,00'},
    personalizado:{placeholder:'Ex.: Modelo personalizado',help:'Cadastre cada opção que o cliente poderá escolher.'}
  };
  function refreshMode(){
    const mode=saleMode?.value||'preco_unico';
    const cfg=modeConfig[mode]||modeConfig.preco_unico;
    const isSingle=mode==='preco_unico';
    qa('[data-sale-mode]').forEach(btn=>btn.classList.toggle('active',btn.dataset.saleMode===mode));
    qa('.enc-option-name').forEach(input=>input.placeholder=cfg.placeholder||'Ex.: Opção');
    if(optionHelp)optionHelp.textContent=cfg.help;
    if(singlePriceBox)singlePriceBox.hidden=!isSingle;
    if(optionsBox)optionsBox.hidden=isSingle;
    if(previewPriceLabel)previewPriceLabel.textContent=isSingle?'Preço':'A partir de';
    qa('input[name="opcao_nome"],input[name="opcao_preco"]',optionList||document).forEach(input=>input.disabled=isSingle);
    if(singlePriceInput)singlePriceInput.disabled=!isSingle;
    if(isSingle && singlePriceInput && !singlePriceInput.value){
      const firstPrice=q('.enc-option-price',optionList||document);
      if(firstPrice?.value)singlePriceInput.value=firstPrice.value;
    }
    updatePreviewPrice();
  }
  qa('[data-sale-mode]').forEach(btn=>btn.addEventListener('click',()=>{if(saleMode)saleMode.value=btn.dataset.saleMode||'quantidade';refreshMode();}));

  // Opções e preços
  const optionList=q('#encOptionList');
  const addOption=q('#encAddOption');
  function createOptionRow(){
    const cfg=modeConfig[saleMode?.value||'quantidade']||modeConfig.quantidade;
    const row=document.createElement('div');row.className='enc-option-row-v803';
    row.innerHTML='<input name="opcao_nome" class="enc-input-v803 enc-option-name" placeholder="'+cfg.placeholder.replace(/"/g,'&quot;')+'" aria-label="Nome da opção">'+
      '<div class="enc-price-input"><span>R$</span><input name="opcao_preco" class="enc-input-v803 enc-option-price" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="0,00" aria-label="Preço"></div>'+
      '<button type="button" class="enc-remove-option-v803" aria-label="Remover opção"><i class="fa-solid fa-xmark"></i></button>';
    return row;
  }
  addOption?.addEventListener('click',()=>{const row=createOptionRow();optionList?.appendChild(row);q('.enc-option-name',row)?.focus();updatePreviewPrice();});
  optionList?.addEventListener('click',e=>{
    const btn=e.target.closest('.enc-remove-option-v803');if(!btn)return;
    const rows=qa('.enc-option-row-v803',optionList);
    if(rows.length<=1){qa('input',rows[0]).forEach(i=>i.value='');updatePreviewPrice();return;}
    btn.closest('.enc-option-row-v803')?.remove();updatePreviewPrice();
  });
  function parseMoney(value){
    let s=String(value||'').trim().replace(/\s/g,'');
    if(!s)return 0;
    if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
    else if(s.includes(','))s=s.replace(',','.');
    const n=Number(s.replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.max(0,n):0;
  }
  function moneyBR(n){return 'R$ '+Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function updatePreviewPrice(){
    const isSingle=(saleMode?.value||'preco_unico')==='preco_unico';
    if(isSingle){
      if(previewPrice)previewPrice.textContent=moneyBR(parseMoney(singlePriceInput?.value));
      return;
    }
    const rows=qa('.enc-option-row-v803',optionList||document);
    const prices=rows.map(r=>({name:(q('.enc-option-name',r)?.value||'').trim(),price:parseMoney(q('.enc-option-price',r)?.value)})).filter(x=>x.name);
    const valid=prices.length?Math.min(...prices.map(x=>x.price)):0;
    if(previewPrice)previewPrice.textContent=moneyBR(valid);
  }
  optionList?.addEventListener('input',updatePreviewPrice);
  singlePriceInput?.addEventListener('input',updatePreviewPrice);

  // Switches nativos sincronizados com os hidden usados pelo backend.
  qa('input[type="checkbox"][data-enc-hidden]',form).forEach(check=>{
    const sync=()=>{const hidden=document.getElementById(check.dataset.encHidden||'');if(hidden)hidden.value=check.checked?'1':'0';};
    check.addEventListener('change',sync);sync();
  });

  // v804: validação visível, sem o bloqueio silencioso do navegador.
  const formError=q('#encFormError');
  const saveButton=q('#encSaveProduct');
  function clearInvalid(){qa('.enc-field-invalid',form).forEach(el=>el.classList.remove('enc-field-invalid'));if(formError){formError.hidden=true;q('span',formError).textContent='';}}
  function showFormError(message,field){
    if(formError){q('span',formError).textContent=message;formError.hidden=false;}
    field?.classList?.add('enc-field-invalid');
    field?.scrollIntoView?.({behavior:'smooth',block:'center'});
    setTimeout(()=>field?.focus?.(),180);
  }
  form.addEventListener('submit',e=>{
    clearInvalid();
    const name=String(nameInput?.value||'').trim();
    const category=String(categorySelect?.value||'').trim();
    const rows=qa('.enc-option-row-v803',optionList||document);
    const filled=rows.filter(row=>(q('.enc-option-name',row)?.value||'').trim() || (q('.enc-option-price',row)?.value||'').trim());
    const isSingle=(saleMode?.value||'preco_unico')==='preco_unico';
    const pickup=q('input[data-enc-hidden="encAllowPickup"]')?.checked;
    const delivery=q('input[data-enc-hidden="encAllowDelivery"]')?.checked;
    if(!name){e.preventDefault();showFormError('Informe o nome do produto.',nameInput);return;}
    if(!category){e.preventDefault();showFormError('Escolha uma categoria para o produto.',categorySelect);return;}
    if(isSingle){
      if(!String(singlePriceInput?.value||'').trim()){e.preventDefault();showFormError('Informe o preço do produto.',singlePriceInput);return;}
    }else{
      if(!filled.length){e.preventDefault();showFormError('Adicione pelo menos uma opção e informe o preço.',q('.enc-option-name',optionList||document));return;}
      for(const row of filled){
        const optionName=q('.enc-option-name',row);const optionPrice=q('.enc-option-price',row);
        if(!String(optionName?.value||'').trim()){e.preventDefault();showFormError('Preencha o nome desta opção.',optionName);return;}
        if(!String(optionPrice?.value||'').trim()){e.preventDefault();showFormError('Informe o preço desta opção.',optionPrice);return;}
      }
    }
    if(!pickup&&!delivery){e.preventDefault();showFormError('Ative retirada ou entrega para este produto.',q('input[data-enc-hidden="encAllowPickup"]')?.closest('.enc-native-toggle'));return;}
    if(saveButton){saveButton.disabled=true;const label=q('span',saveButton);if(label)label.textContent='Salvando...';}
  });

  refreshMode();setPreviewText();updatePreviewPrice();
})();
