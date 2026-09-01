(function(){
  'use strict';
  if(window.__MF_PTBR_ONLY__) return;
  window.__MF_PTBR_ONLY__=true;

  var storageKeys=['mf_funcionario_lang','idioma_funcionario','idioma_empresa','lang','idioma','menu_lang','painel_lang','mf_lang'];
  storageKeys.forEach(function(key){
    try{localStorage.setItem(key,'pt')}catch(error){}
  });
  document.documentElement.lang='pt-BR';

  var exact={
    'Tutti':'Todos','Tutte':'Todas','All':'Todos','Pending':'Pendentes','Confirmed':'Confirmadas',
    'Cancelled':'Canceladas','Canceled':'Cancelados','Declined':'Recusadas','Paid':'Pagas',
    'Avvisa':'Avisar','Notify':'Avisar','Confermare':'Confirmar','Confirm':'Confirmar',
    'Annullare':'Cancelar','Cancel':'Cancelar','Rifiutare':'Recusar','Decline':'Recusar',
    'Salva':'Salvar','Save':'Salvar','Elimina':'Excluir','Delete':'Excluir','Modifica':'Editar','Edit':'Editar',
    'Tocca fuori per chiudere':'Toque fora para fechar','Touch outside to close':'Toque fora para fechar',
    'Nessun professionista disponibile per questa data.':'Nenhum profissional disponível nesta data.',
    'No professional available for this date.':'Nenhum profissional disponível nesta data.',
    'Nessun orario disponibile per questa data.':'Nenhum horário disponível para esta data.',
    'No time available for this date.':'Nenhum horário disponível nesta data.',
    'Ordini':'Pedidos','Nuovi':'Novos','Nuovo':'Novo','Cucina':'Em preparo',
    'Consegna / Ritiro':'Entrega / Retirada','Consegna/Ritiro':'Entrega / Retirada','Consegna':'Entrega','Ritiro':'Retirada',
    'Completati':'Concluídos','Completato':'Concluído','Annullati':'Cancelados','Annullato':'Cancelado',
    'Articoli':'Itens','Articoli non caricati':'Itens não carregados','Totale':'Total','Ricevuto alle':'Recebido às',
    'Professionista':'Profissional','Nuovo professionista':'Novo profissional','Prenotazioni':'Reservas',
    'Persone':'Pessoas','Orario':'Horário','CAP/CEP':'CEP','Città/CAP':'Cidade/CEP'
  };

  function translateTextNode(node){
    var original=String(node.nodeValue||'');
    var trimmed=original.trim();
    if(!trimmed) return;
    var translated=exact[trimmed] ? original.replace(trimmed,exact[trimmed]) : original;
    translated=translated.replace(/€\s*/g,'R$ ');
    if(translated!==original) node.nodeValue=translated;
  }
  function translate(root){
    if(!root) return;
    if(root.nodeType===Node.TEXT_NODE){translateTextNode(root);return}
    if(root.nodeType!==Node.ELEMENT_NODE && root.nodeType!==Node.DOCUMENT_NODE) return;
    var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:function(node){
      var parent=node.parentElement;
      if(!parent || /^(SCRIPT|STYLE|TEXTAREA)$/.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
      var value=String(node.nodeValue||'');
      return exact[value.trim()] || /€/.test(value) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }});
    var nodes=[];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(translateTextNode);
  }
  function hideLanguageControls(root){
    var scope=root&&root.querySelectorAll?root:document;
    scope.querySelectorAll('.public-lang-switch,.mf-lang-switch,.mf-mobile-lang-switch,.mf-employee-lang,.lang-switch,.language-switcher,[data-language-switcher],.policy-language-tabs,.language-tabs,.idioma-selector,.seletor-idioma').forEach(function(element){
      element.hidden=true;
      element.setAttribute('aria-hidden','true');
    });
  }
  function normalizeUrl(){
    try{
      var url=new URL(location.href);
      if(url.searchParams.has('lang')){
        url.searchParams.delete('lang');
        history.replaceState(history.state,'',url.pathname+(url.searchParams.toString()?'?'+url.searchParams.toString():'')+url.hash);
      }
    }catch(error){}
  }
  function apply(root){translate(root||document.body);hideLanguageControls(root||document);}

  function init(){
    normalizeUrl();
    apply(document.body);
    new MutationObserver(function(records){
      records.forEach(function(record){record.addedNodes.forEach(apply)});
    }).observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
