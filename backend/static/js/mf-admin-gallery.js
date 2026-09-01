(function(){
  'use strict';
  if(window.__MF_ADMIN_GALLERY__) return;
  window.__MF_ADMIN_GALLERY__=true;
  var galleries=[];

  function upload(file){
    var data=new FormData();data.append('file',file);
    return fetch('/upload-imagem',{method:'POST',credentials:'same-origin',body:data}).then(async function(response){
      var result=await response.json().catch(function(){return {}});
      if(!response.ok||result.error) throw new Error(result.error||'Não foi possível enviar a foto.');
      return result.url||'';
    });
  }
  function refreshCard(card,input){
    var preview=card.querySelector('.mf-admin-photo-preview');var image=preview.querySelector('img');var value=String(input.value||'').trim();
    image.src=value;preview.classList.toggle('has-image',!!value);
    if(!value) image.removeAttribute('src');
  }
  function build(prefix){
    var first=document.getElementById(prefix);if(!first||first.dataset.mfGalleryReady==='1')return;
    first.dataset.mfGalleryReady='1';
    var field=first.closest('.field')||first.parentElement;
    var oldActions=field.querySelector('.foto-upload-actions');if(oldActions)oldActions.style.display='none';
    var oldPreview=field.querySelector('.foto-preview-mini');if(oldPreview)oldPreview.style.display='none';
    var originalGroup=field.querySelector('.mf-gallery-admin');
    var grid=document.createElement('div');grid.className='mf-admin-photo-grid';
    var inputs=[];
    for(let number=1;number<=5;number++){
      const input=document.getElementById(prefix+(number===1?'':number));if(!input)continue;inputs.push(input);
      input.type='text';
      const card=document.createElement('div');card.className='mf-admin-photo-card';
      const title=document.createElement('strong');title.textContent=number===1?'Foto principal':'Foto '+number;
      const preview=document.createElement('div');preview.className='mf-admin-photo-preview';preview.innerHTML='<span>Nenhuma foto</span><img alt="Prévia da foto '+number+'">';
      const file=document.createElement('input');file.type='file';file.accept='image/*';file.hidden=true;
      const actions=document.createElement('div');actions.className='mf-admin-photo-actions';
      const send=document.createElement('button');send.type='button';send.className='mf-admin-photo-upload';send.textContent='Enviar arquivo';
      const remove=document.createElement('button');remove.type='button';remove.className='mf-admin-photo-remove';remove.setAttribute('aria-label','Remover foto');remove.textContent='×';
      const status=document.createElement('div');status.className='mf-admin-photo-status';
      send.addEventListener('click',function(){file.click()});
      file.addEventListener('change',async function(){
        if(!file.files||!file.files[0])return;
        if(!String(file.files[0].type||'').startsWith('image/')){await mfAlert('Escolha um arquivo de imagem.',{title:'Arquivo inválido',type:'warning'});file.value='';return}
        send.disabled=true;status.textContent='Enviando...';
        try{input.value=await upload(file.files[0]);input.dispatchEvent(new Event('input',{bubbles:true}));status.textContent='Foto enviada. Salve o item.'}
        catch(error){status.textContent='';await mfAlert(error.message,{title:'Erro ao enviar',type:'error'})}
        finally{send.disabled=false;file.value=''}
      });
      remove.addEventListener('click',function(){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));status.textContent='Foto removida. Salve o item.'});
      input.addEventListener('input',function(){refreshCard(card,input)});
      actions.append(send,remove);card.append(title,preview,input,file,actions,status);grid.appendChild(card);refreshCard(card,input);
    }
    if(document.documentElement.classList.contains('mf-food-admin')){
      var layout=document.createElement('div');layout.className='mf-food-photo-layout';
      var primary=grid.firstElementChild;
      if(primary){primary.classList.add('mf-food-photo-primary');layout.appendChild(primary)}
      if(grid.children.length){
        var details=document.createElement('details');details.className='mf-food-extra-photos';
        var summary=document.createElement('summary');summary.innerHTML='<span><i class="fa-regular fa-images"></i> Fotos adicionais</span><small>Opcional · até 4 imagens</small>';
        var extras=document.createElement('div');extras.className='mf-admin-photo-grid mf-food-extra-photo-grid';
        while(grid.firstElementChild)extras.appendChild(grid.firstElementChild);
        details.append(summary,extras);layout.appendChild(details);
      }
      if(originalGroup) originalGroup.replaceWith(layout); else first.insertAdjacentElement('afterend',layout);
    }else{
      if(originalGroup) originalGroup.replaceWith(grid); else first.insertAdjacentElement('afterend',grid);
    }
    galleries.push(inputs);
  }
  window.mfRefreshAdminPhotos=function(){
    galleries.forEach(function(inputs){inputs.forEach(function(input){var card=input.closest('.mf-admin-photo-card');if(card)refreshCard(card,input)})});
  };
  function init(){build('itemFoto');build('editItemFoto');window.mfRefreshAdminPhotos()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
