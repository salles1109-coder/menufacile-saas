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

  // Se o cadastro de produto estiver aberto, criar categoria sem recarregar a página
  // para não perder os dados que o usuário já digitou.
  const newCategoryForm=q('.enc-new-category-form');
  newCategoryForm?.addEventListener('submit',async e=>{
    const liveSelect=q('#encCategorySelect');
    if(!liveSelect)return; // fora do editor: mantém o POST/redirect tradicional.
    e.preventDefault();
    const input=q('input[name="nome"]',newCategoryForm);
    const name=String(input?.value||'').trim();
    if(!name){input?.focus();return;}
    const submit=q('button[type="submit"]',newCategoryForm);
    if(submit)submit.disabled=true;
    try{
      const res=await fetch(newCategoryForm.action,{
        method:'POST',
        credentials:'same-origin',
        headers:{'X-Requested-With':'XMLHttpRequest','Accept':'application/json'},
        body:new FormData(newCategoryForm)
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok||!data.ok)throw new Error(data.erro||'Não foi possível criar a categoria.');
      let option=Array.from(liveSelect.options).find(o=>String(o.value)===String(data.id));
      if(!option){
        option=document.createElement('option');
        option.value=String(data.id);
        option.textContent=data.nome;
        liveSelect.appendChild(option);
      }
      liveSelect.value=String(data.id);
      liveSelect.dispatchEvent(new Event('change',{bubbles:true}));
      if(input)input.value='';
      closeCategories();
    }catch(err){
      alert(err.message||'Não foi possível criar a categoria.');
    }finally{
      if(submit)submit.disabled=false;
    }
  });

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
  const modeConfig={
    quantidade:{placeholder:'Ex.: 50 unidades',help:'Ex.: 50 unidades — R$ 90,00'},
    peso:{placeholder:'Ex.: 1 kg',help:'Ex.: 1 kg — R$ 70,00'},
    tamanho:{placeholder:'Ex.: Médio',help:'Ex.: Médio — R$ 85,00'},
    kit:{placeholder:'Ex.: Caixa com 12',help:'Ex.: Caixa com 12 — R$ 45,00'},
    unidade:{placeholder:'Ex.: Unidade',help:'Ex.: Unidade — R$ 8,00'},
    personalizado:{placeholder:'Ex.: Modelo personalizado',help:'Cadastre cada opção que o cliente poderá escolher.'}
  };
  function refreshMode(){
    const mode=saleMode?.value||'quantidade';
    const cfg=modeConfig[mode]||modeConfig.quantidade;
    qa('[data-sale-mode]').forEach(btn=>btn.classList.toggle('active',btn.dataset.saleMode===mode));
    qa('.enc-option-name').forEach(input=>input.placeholder=cfg.placeholder);
    if(optionHelp)optionHelp.textContent=cfg.help;
  }
  qa('[data-sale-mode]').forEach(btn=>btn.addEventListener('click',()=>{if(saleMode)saleMode.value=btn.dataset.saleMode||'quantidade';refreshMode();}));

  // Opções e preços
  const optionList=q('#encOptionList');
  const addOption=q('#encAddOption');
  function createOptionRow(){
    const cfg=modeConfig[saleMode?.value||'quantidade']||modeConfig.quantidade;
    const row=document.createElement('div');row.className='enc-option-row-v803';
    row.innerHTML='<input name="opcao_nome" class="enc-input-v803 enc-option-name" placeholder="'+cfg.placeholder.replace(/"/g,'&quot;')+'" aria-label="Nome da opção">'+
      '<div class="enc-price-input"><span>R$</span><input name="opcao_preco" class="enc-input-v803 enc-option-price" inputmode="decimal" placeholder="0,00" aria-label="Preço"></div>'+
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
    const rows=qa('.enc-option-row-v803',optionList||document);
    const prices=rows.map(r=>({name:(q('.enc-option-name',r)?.value||'').trim(),price:parseMoney(q('.enc-option-price',r)?.value)})).filter(x=>x.name);
    const valid=prices.length?Math.min(...prices.map(x=>x.price)):0;
    if(previewPrice)previewPrice.textContent=moneyBR(valid);
  }
  optionList?.addEventListener('input',updatePreviewPrice);

  // Switches nativos sincronizados com os hidden usados pelo backend.
  qa('input[type="checkbox"][data-enc-hidden]',form).forEach(check=>{
    const sync=()=>{const hidden=document.getElementById(check.dataset.encHidden||'');if(hidden)hidden.value=check.checked?'1':'0';};
    check.addEventListener('change',sync);sync();
  });

  // Validação simples e clara antes de enviar.
  form.addEventListener('submit',e=>{
    const category=String(categorySelect?.value||'').trim();
    const options=qa('.enc-option-row-v803',optionList||document).filter(row=>(q('.enc-option-name',row)?.value||'').trim());
    const pickup=q('input[data-enc-hidden="encAllowPickup"]')?.checked;
    const delivery=q('input[data-enc-hidden="encAllowDelivery"]')?.checked;
    if(!category){e.preventDefault();categorySelect?.focus();alert('Escolha uma categoria para o produto.');return;}
    if(!options.length){e.preventDefault();q('.enc-option-name',optionList||document)?.focus();alert('Adicione pelo menos uma opção com preço.');return;}
    if(!pickup&&!delivery){e.preventDefault();alert('Ative retirada ou entrega para este produto.');return;}
  });

  refreshMode();setPreviewText();updatePreviewPrice();
})();
