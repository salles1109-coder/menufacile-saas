/* MenuFacile v812 — upload/editor da apresentação institucional */
(function(){
  const editor = document.querySelector('[data-enc-intro-editor-v812]');
  if(!editor) return;

  const toggle = editor.querySelector('#enc_intro_ativo');
  const syncState = () => editor.classList.toggle('is-off-v812', !(toggle && toggle.checked));
  if(toggle){ toggle.addEventListener('change', syncState); syncState(); }

  function preview(slot, url){
    const box = editor.querySelector(`[data-enc-intro-preview-v812="${slot}"]`);
    if(!box) return;
    box.innerHTML = url
      ? `<img src="${String(url).replace(/"/g,'&quot;')}" alt="Foto ${slot} da apresentação">`
      : `<span class="mf-enc-intro-empty-v812"><i class="fa-regular fa-image"></i>Foto opcional</span>`;
  }

  async function upload(slot, fileInput){
    const hidden = editor.querySelector(`#enc_intro_foto${slot}_url`);
    const status = editor.querySelector(`[data-enc-intro-status-v812="${slot}"]`);
    const file = fileInput && fileInput.files ? fileInput.files[0] : null;
    if(!hidden || !file) return;
    if(!String(file.type || '').startsWith('image/')){
      if(status) status.textContent = 'Escolha uma imagem JPG, PNG ou WEBP.';
      fileInput.value = '';
      return;
    }
    if(status) status.textContent = 'Enviando foto...';
    const fd = new FormData();
    fd.append('file', file);
    try{
      const response = await fetch('/upload-imagem', {method:'POST', credentials:'same-origin', body:fd});
      const data = await response.json();
      if(!response.ok || data.error) throw new Error(data.error || 'Erro ao enviar a foto.');
      hidden.value = data.url || '';
      preview(slot, hidden.value);
      if(status) status.textContent = 'Foto enviada. Clique em Salvar configurações.';
    }catch(error){
      if(status) status.textContent = error.message || 'Não foi possível enviar a foto.';
    }finally{
      fileInput.value = '';
    }
  }

  editor.addEventListener('click', function(event){
    const uploadBtn = event.target.closest('[data-enc-intro-upload-v812]');
    if(uploadBtn){
      const slot = uploadBtn.dataset.slot;
      const input = editor.querySelector(`#enc_intro_foto${slot}_file`);
      if(input) input.click();
      return;
    }
    const removeBtn = event.target.closest('[data-enc-intro-remove-v812]');
    if(removeBtn){
      const slot = removeBtn.dataset.slot;
      const hidden = editor.querySelector(`#enc_intro_foto${slot}_url`);
      const status = editor.querySelector(`[data-enc-intro-status-v812="${slot}"]`);
      if(hidden) hidden.value = '';
      preview(slot, '');
      if(status) status.textContent = 'Foto removida. Clique em Salvar configurações.';
    }
  });

  editor.querySelectorAll('[data-enc-intro-file-v812]').forEach(function(input){
    input.addEventListener('change', function(){ upload(this.dataset.slot, this); });
  });
})();
