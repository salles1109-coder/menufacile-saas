(function(){
  'use strict';
  if(window.__MF_DIALOGS_READY__) return;
  window.__MF_DIALOGS_READY__ = true;

  var queue = Promise.resolve();
  var active = null;

  function normalizarMensagem(value){
    var text = String(value == null ? '' : value).trim();
    return text
      .replace(/\balle\b/gi, 'às')
      .replace(/\bSiamo chiusi al momento\.?/gi, 'Estamos fechados no momento.')
      .replace(/\bWe are (currently )?closed\.?/gi, 'Estamos fechados no momento.');
  }

  function tipoDaMensagem(message, requested){
    if(requested) return requested;
    var s = normalizarMensagem(message).toLowerCase();
    if(/fechad|horário|horario|atenção|atencao|aviso|obrigat|selecione|informe|preencha/.test(s)) return 'warning';
    if(/erro|falha|não foi possível|nao foi possivel|inválid|invalido|recusad|cancelad/.test(s)) return 'error';
    if(/sucesso|salv|conclu|enviad|removid|criad|atualizad|copiad/.test(s)) return 'success';
    return 'info';
  }

  function tituloPadrao(type, message, confirmMode){
    var s = normalizarMensagem(message).toLowerCase();
    if(/fechad/.test(s)) return 'Estabelecimento fechado';
    if(confirmMode) return 'Confirmar ação';
    if(type === 'success') return 'Tudo certo';
    if(type === 'error') return 'Não foi possível concluir';
    if(type === 'warning') return 'Atenção';
    return 'MenuFacile';
  }

  function iconFor(type){
    if(type === 'success') return 'fa-solid fa-check';
    if(type === 'error') return 'fa-solid fa-xmark';
    if(type === 'warning') return 'fa-solid fa-exclamation';
    return 'fa-solid fa-info';
  }

  function ensureStyles(){
    if(document.getElementById('mf-dialogs-style')) return;
    var style = document.createElement('style');
    style.id = 'mf-dialogs-style';
    style.textContent = `
      .mf-dialog-overlay{position:fixed;inset:0;z-index:2147483646;padding:18px;display:flex;align-items:center;justify-content:center;background:rgba(7,18,36,.58);backdrop-filter:blur(6px);opacity:0;visibility:hidden;transition:opacity .18s ease,visibility .18s ease}
      .mf-dialog-overlay.is-open{opacity:1;visibility:visible}
      .mf-dialog-card{width:min(430px,100%);overflow:hidden;border:1px solid rgba(255,255,255,.72);border-radius:24px;background:#fff;box-shadow:0 28px 90px rgba(4,18,50,.28);transform:translateY(10px) scale(.985);transition:transform .18s ease;font-family:Inter,Arial,sans-serif;color:#102033}
      .mf-dialog-overlay.is-open .mf-dialog-card{transform:translateY(0) scale(1)}
      .mf-dialog-content{padding:24px 24px 18px;text-align:center}
      .mf-dialog-icon{width:58px;height:58px;margin:0 auto 15px;border-radius:18px;display:grid;place-items:center;font-size:25px}
      .mf-dialog-overlay[data-type="info"] .mf-dialog-icon{color:#1237c5;background:#eef3ff}
      .mf-dialog-overlay[data-type="success"] .mf-dialog-icon{color:#087443;background:#e9f8f0}
      .mf-dialog-overlay[data-type="warning"] .mf-dialog-icon{color:#b45309;background:#fff4dd}
      .mf-dialog-overlay[data-type="error"] .mf-dialog-icon{color:#d92d20;background:#fff0ef}
      .mf-dialog-title{margin:0;color:#102033;font-size:22px;line-height:1.15;font-weight:950;letter-spacing:-.4px}
      .mf-dialog-message{margin:10px 0 0;color:#667085;font-size:15px;line-height:1.55;font-weight:650;white-space:pre-line;overflow-wrap:anywhere}
      .mf-dialog-input-wrap{display:none;margin:16px 0 0}.mf-dialog-input-wrap.is-visible{display:block}.mf-dialog-input{width:100%;height:46px;padding:0 13px;border:1px solid #cfd9e7;border-radius:12px;background:#f8fafc;color:#102033;font:700 13px/1.2 Inter,Arial,sans-serif;outline:0}.mf-dialog-input:focus{border-color:#1237c5;box-shadow:0 0 0 3px rgba(18,55,197,.10)}
      .mf-dialog-actions{display:flex;justify-content:center;gap:10px;padding:0 24px 24px}
      .mf-dialog-btn{min-width:126px;min-height:45px;padding:0 18px;border:0;border-radius:13px;font:850 14px/1 Inter,Arial,sans-serif;cursor:pointer;transition:transform .12s ease,filter .12s ease}
      .mf-dialog-btn:hover{filter:brightness(.97)}.mf-dialog-btn:active{transform:scale(.98)}
      .mf-dialog-btn.primary{color:#fff;background:#1237c5}.mf-dialog-overlay[data-type="success"] .mf-dialog-btn.primary{background:#087443}.mf-dialog-overlay[data-type="warning"] .mf-dialog-btn.primary{background:#b45309}.mf-dialog-overlay[data-type="error"] .mf-dialog-btn.primary{background:#d92d20}
      .mf-dialog-btn.secondary{color:#344054;background:#f5f7fa;border:1px solid #dbe3ee}
      .mf-dialog-actions.is-choice{display:grid;grid-template-columns:1fr;gap:9px}.mf-dialog-actions.is-choice .mf-dialog-btn{width:100%;min-width:0}.mf-dialog-choice-confirm{color:#fff;background:#087443}.mf-dialog-choice-info{color:#fff;background:#1237c5}
      @media(max-width:560px){.mf-dialog-overlay{padding:14px;align-items:center}.mf-dialog-card{border-radius:22px}.mf-dialog-content{padding:22px 18px 16px}.mf-dialog-title{font-size:20px}.mf-dialog-message{font-size:14px}.mf-dialog-actions{padding:0 18px 20px}.mf-dialog-btn{flex:1;min-width:0}}
    `;
    document.head.appendChild(style);
  }

  function build(){
    ensureStyles();
    var overlay = document.createElement('div');
    overlay.className = 'mf-dialog-overlay';
    overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML = '<section class="mf-dialog-card" role="dialog" aria-modal="true" aria-labelledby="mfDialogTitle" aria-describedby="mfDialogMessage"><div class="mf-dialog-content"><div class="mf-dialog-icon"><i></i></div><h2 class="mf-dialog-title" id="mfDialogTitle"></h2><p class="mf-dialog-message" id="mfDialogMessage"></p><div class="mf-dialog-input-wrap"><input class="mf-dialog-input" type="text" readonly></div></div><div class="mf-dialog-actions"><button type="button" class="mf-dialog-btn secondary" data-action="cancel">Cancelar</button><button type="button" class="mf-dialog-btn primary" data-action="confirm">Entendi</button></div></section>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function openDialog(message, options){
    options = options || {};
    var promptMode = !!options.prompt;
    var confirmMode = !!options.confirm || promptMode;
    var clean = normalizarMensagem(message);
    var type = tipoDaMensagem(clean, options.type);
    var overlay = build();
    var card = overlay.querySelector('.mf-dialog-card');
    var title = overlay.querySelector('.mf-dialog-title');
    var text = overlay.querySelector('.mf-dialog-message');
    var icon = overlay.querySelector('.mf-dialog-icon i');
    var cancel = overlay.querySelector('[data-action="cancel"]');
    var confirm = overlay.querySelector('[data-action="confirm"]');
    var inputWrap = overlay.querySelector('.mf-dialog-input-wrap');
    var input = overlay.querySelector('.mf-dialog-input');

    overlay.dataset.type = type;
    title.textContent = options.title || tituloPadrao(type, clean, confirmMode);
    text.textContent = clean || 'Ação concluída.';
    icon.className = iconFor(type);
    cancel.style.display = confirmMode ? '' : 'none';
    cancel.textContent = options.cancelText || (promptMode ? 'Fechar' : 'Cancelar');
    confirm.textContent = options.confirmText || (promptMode ? 'Copiar' : (confirmMode ? 'Confirmar' : 'Entendi'));
    inputWrap.classList.toggle('is-visible', promptMode);
    input.value = promptMode ? String(options.defaultValue || '') : '';

    return new Promise(function(resolve){
      var closed = false;
      var previousFocus = document.activeElement;
      function close(result){
        if(closed) return;
        closed = true;
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden','true');
        document.removeEventListener('keydown', onKey, true);
        setTimeout(function(){overlay.remove(); if(previousFocus && previousFocus.focus) previousFocus.focus(); resolve(result);},180);
      }
      function onKey(event){
        if(event.key === 'Escape'){event.preventDefault(); close(false);}
        if(event.key === 'Enter' && !event.shiftKey){event.preventDefault(); if(promptMode) confirm.click(); else close(true);}
      }
      cancel.addEventListener('click',function(){close(false)});
      confirm.addEventListener('click',function(){
        if(promptMode){
          input.focus(); input.select();
          var copy = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(input.value) : Promise.reject();
          copy.catch(function(){try{document.execCommand('copy')}catch(e){}}).finally(function(){close(input.value)});
          return;
        }
        close(true);
      });
      overlay.addEventListener('click',function(event){if(event.target === overlay) close(confirmMode ? false : true)});
      card.addEventListener('click',function(event){event.stopPropagation()});
      document.addEventListener('keydown',onKey,true);
      requestAnimationFrame(function(){overlay.classList.add('is-open');overlay.setAttribute('aria-hidden','false');(promptMode ? input : confirm).focus();if(promptMode)input.select();});
      active = {close:close};
    }).finally(function(){active = null;});
  }

  function openChoice(message, choices, options){
    options = options || {};
    choices = Array.isArray(choices) ? choices : [];
    var clean = normalizarMensagem(message);
    var type = tipoDaMensagem(clean, options.type || 'info');
    var overlay = build();
    var card = overlay.querySelector('.mf-dialog-card');
    var title = overlay.querySelector('.mf-dialog-title');
    var text = overlay.querySelector('.mf-dialog-message');
    var icon = overlay.querySelector('.mf-dialog-icon i');
    var actions = overlay.querySelector('.mf-dialog-actions');
    var previousFocus = document.activeElement;

    overlay.dataset.type = type;
    title.textContent = options.title || 'Escolha uma opção';
    text.textContent = clean || 'Como deseja continuar?';
    icon.className = iconFor(type);
    actions.classList.add('is-choice');
    actions.innerHTML = '';

    return new Promise(function(resolve){
      var closed = false;
      function close(result){
        if(closed) return;
        closed = true;
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden','true');
        document.removeEventListener('keydown',onKey,true);
        setTimeout(function(){overlay.remove();if(previousFocus&&previousFocus.focus)previousFocus.focus();resolve(result)},180);
      }
      function onKey(event){if(event.key==='Escape'){event.preventDefault();close(null)}}

      choices.forEach(function(choice,index){
        var data = typeof choice === 'string' ? {label:choice,value:choice} : (choice || {});
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'mf-dialog-btn '+(data.className || (index===0?'mf-dialog-choice-confirm':'mf-dialog-choice-info'));
        button.textContent = data.label || String(data.value || 'Opção');
        button.addEventListener('click',function(){close(data.value == null ? data.label : data.value)});
        actions.appendChild(button);
      });
      var cancel = document.createElement('button');
      cancel.type='button';cancel.className='mf-dialog-btn secondary';cancel.textContent=options.cancelText||'Cancelar';
      cancel.addEventListener('click',function(){close(null)});actions.appendChild(cancel);
      overlay.addEventListener('click',function(event){if(event.target===overlay)close(null)});
      card.addEventListener('click',function(event){event.stopPropagation()});
      document.addEventListener('keydown',onKey,true);
      requestAnimationFrame(function(){overlay.classList.add('is-open');overlay.setAttribute('aria-hidden','false');var first=actions.querySelector('button');if(first)first.focus()});
      active={close:close};
    }).finally(function(){active=null});
  }

  function enqueue(message, options){
    var task = function(){return openDialog(message, options)};
    queue = queue.then(task, task);
    return queue;
  }

  function enqueueChoice(message, choices, options){
    var task = function(){return openChoice(message, choices, options)};
    queue = queue.then(task, task);
    return queue;
  }

  window.mfAlert = function(message, options){return enqueue(message, Object.assign({}, options || {}, {confirm:false}));};
  window.mfConfirm = function(message, options){return enqueue(message, Object.assign({}, options || {}, {confirm:true}));};
  window.mfPrompt = function(message, defaultValue, options){return enqueue(message, Object.assign({title:'Copiar link',confirmText:'Copiar',cancelText:'Fechar',type:'info'}, options || {}, {confirm:true,prompt:true,defaultValue:defaultValue || ''}));};
  window.mfChoice = function(message, choices, options){return enqueueChoice(message, choices, options || {});};
  window.alert = function(message){window.mfAlert(message);};

  document.addEventListener('submit', function(event){
    var form = event.target && event.target.closest ? event.target.closest('form[data-mf-confirm]') : null;
    if(!form || form.dataset.mfConfirmed === '1') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.mfConfirm(form.getAttribute('data-mf-confirm') || 'Deseja continuar?', {
      title:form.getAttribute('data-mf-confirm-title') || 'Confirmar ação',
      type:form.getAttribute('data-mf-confirm-type') || 'warning',
      confirmText:form.getAttribute('data-mf-confirm-button') || 'Confirmar'
    }).then(function(ok){
      if(!ok) return;
      form.dataset.mfConfirmed = '1';
      if(form.requestSubmit) form.requestSubmit(); else form.submit();
    });
  }, true);
})();
