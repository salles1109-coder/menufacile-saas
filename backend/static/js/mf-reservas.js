(function(){
  'use strict';

  function ready(callback){
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',callback,{once:true});
    else callback();
  }
  function isReservationPage(){return !!document.getElementById('reservasGrid')}
  function companyId(){
    var match=location.pathname.match(/\/(?:admin|funcionario)\/(\d+)\/reservas/);
    return match ? Number(match[1]) : 0;
  }
  function cleanPhone(value){var phone=String(value||'').replace(/\D/g,'');if((phone.length===10||phone.length===11)&&!phone.startsWith('55')) phone='55'+phone;return phone}
  function brDate(value){return String(value||'').replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,'$3-$2-$1')}
  function cleanValue(value){
    return String(value||'')
      .replace(/[\u0000-\u001f\u007f\ufffd]+/g,' ')
      .replace(/\s+/g,' ')
      .replace(/\b(?:Confirmar|Avisar|Recusar|Cancelar|Concluir|Pago|Paga)\b.*$/i,'')
      .trim();
  }
  function moneyFromText(value){
    var text=String(value||'');
    var matches=Array.from(text.matchAll(/R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)/gi));
    if(!matches.length) return '';
    var last=matches[matches.length-1][1].replace(/\./g,'').replace(',','.');
    var number=Number(last);
    return Number.isFinite(number)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(number):'';
  }
  function reservationData(card){
    var service=cleanValue(card.dataset.servico||'');
    var observation=cleanValue(card.dataset.observacao||'');
    return {
      id:String(card.dataset.id||''),
      token:String(card.dataset.token||''),
      status:cleanValue(card.dataset.status||''),
      cliente:cleanValue(card.dataset.cliente||'Cliente')||'Cliente',
      telefone:cleanValue(card.dataset.telefone||''),
      data:brDate(card.dataset.date||''),
      hora:cleanValue(String(card.dataset.hour||'').split(' - ')[0]).slice(0,5),
      profissional:cleanValue(card.dataset.prof||''),
      servico:service.replace(/FINANCEIRO_SERVICO.*$/i,'').trim(),
      valor:moneyFromText(service),
      pessoas:cleanValue(card.dataset.pessoas||'1')||'1',
      mesa:cleanValue(card.dataset.mesa||card.dataset.prof||''),
      observacao:observation,
      empresa:cleanValue(document.body.dataset.empresaNome||(typeof window.EMPRESA_NOME==='string'?window.EMPRESA_NOME:'')||document.title.split('-')[0])
    };
  }
  function serviceBusiness(){
    if(document.body.dataset.negocioServico!==undefined) return document.body.dataset.negocioServico==='1';
    return typeof window.NEGOCIO_SERVICO==='boolean'?window.NEGOCIO_SERVICO:/servi|agenda/i.test(document.body.className);
  }
  function serviceName(value){
    var text=cleanValue(value)
      .replace(/FINANCEIRO_SERVICO.*$/i,'')
      .replace(/(?:Total|Valor)\s*:\s*R\$.*$/i,'')
      .replace(/\s*(?:—|-|\|)?\s*R\$\s*[0-9]+(?:[.,][0-9]{1,2})?\s*$/i,'')
      .trim();
    return text||'Serviço';
  }
  function responseLinks(d,isService){
    if(!d.id||!d.token) return [];
    var base=location.origin+'/reserva/'+encodeURIComponent(d.id)+'/responder?token='+encodeURIComponent(d.token);
    return [
      '',
      isService?'Confirme ou cancele seu agendamento:':'Confirme ou cancele sua reserva:',
      'Confirmar: '+base+'&acao=confirmar',
      'Cancelar: '+base+'&acao=cancelar'
    ];
  }
  function messageFor(card,type){
    var d=reservationData(card);
    var isService=serviceBusiness();
    if(isService){
      var servico=serviceName(d.servico);
      var lines=type==='confirm'?
        ['Olá, '+d.cliente+'!','','Seu agendamento está reservado. Confira os dados abaixo:']:
        ['Olá, '+d.cliente+'!','','Passando para lembrar do seu agendamento.'];
      lines.push('', 'Data: '+d.data, 'Horário: '+d.hora);
      if(d.profissional) lines.push('Profissional: '+d.profissional);
      lines.push('Serviço: '+servico+(d.valor?' — '+d.valor:''));
      if(d.observacao&&d.observacao!==d.servico) lines.push('Observação: '+d.observacao);
      lines=lines.concat(responseLinks(d,true));
      lines.push('',d.empresa);
      return lines.filter(function(value,index,array){return value!==undefined&&value!==null&&(value!==''||array[index-1]!=='')}).join('\n').trim();
    }
    var restaurantLines=type==='confirm'?
      ['Olá, '+d.cliente+'!','','Sua reserva está registrada. Confira os dados abaixo:']:
      ['Olá, '+d.cliente+'!','','Passando para lembrar da sua reserva.'];
    restaurantLines.push('', 'Data: '+d.data, 'Horário: '+d.hora, 'Pessoas: '+d.pessoas);
    if(d.mesa) restaurantLines.push('Mesa / área: '+d.mesa);
    if(d.observacao) restaurantLines.push('Observação: '+d.observacao);
    restaurantLines=restaurantLines.concat(responseLinks(d,false));
    restaurantLines.push('',d.empresa);
    return restaurantLines.filter(function(value,index,array){return value!==undefined&&value!==null&&(value!==''||array[index-1]!=='')}).join('\n').trim();
  }
  async function sendWhatsapp(card){
    var phone=cleanPhone(card&&card.dataset.telefone);
    if(!phone){await window.mfAlert('O telefone do cliente não foi informado.',{title:'Telefone ausente',type:'warning'});return}
    var isService=serviceBusiness();
    var choice=await window.mfChoice('Escolha a mensagem que deseja preparar para o cliente.',[
      {label:'Enviar',value:'confirm'},
      {label:'Lembrete',value:'remind'},
      {label:'Chat',value:'chat'}
    ],{title:'Enviar mensagem pelo WhatsApp',type:'info'});
    if(!choice) return;
    if(choice==='chat'){window.open('https://wa.me/'+phone,'_blank','noopener');return}
    window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(messageFor(card,choice)),'_blank','noopener');
  }

  function selectedHours(){
    return Array.from(document.querySelectorAll('#previewHorarios .preview-chip.selected')).map(function(chip){return chip.textContent.trim().slice(0,5)}).filter(Boolean);
  }
  async function saveSchedule(){
    var date=document.getElementById('dataAgendaSetup');
    var professional=document.getElementById('profissionalAgenda');
    var selected=selectedHours();
    if(!date || !date.value){await mfAlert('Escolha a data da agenda.',{title:'Data obrigatória',type:'warning'});return}
    if(!professional || !professional.value){await mfAlert('Selecione um profissional.',{title:'Profissional obrigatório',type:'warning'});return}
    if(!selected.length){await mfAlert('Gere os horários e mantenha selecionados os que deseja salvar.',{title:'Nenhum horário selecionado',type:'warning'});return}
    var button=document.querySelector('button[onclick="salvarHorarios()"]');
    if(button){button.disabled=true;button.dataset.originalText=button.textContent;button.textContent='Salvando...'}
    try{
      var response=await fetch('/horarios-reserva/salvar-lote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        empresa_id:companyId(),data:date.value,profissional_id:Number(professional.value),horarios:selected,capacidade_maxima:serviceBusiness()?1:Math.max(1,Number((document.getElementById('capacidadeHorario')||{}).value||1))
      })});
      var result=await response.json().catch(function(){return {}});
      if(!response.ok || result.error) throw new Error(result.error||'Não foi possível salvar os horários.');
      await mfAlert('Agenda salva com '+String(result.horarios_salvos||selected.length)+' horário(s). Horários já reservados foram preservados.',{title:'Horários salvos',type:'success'});
      var url=new URL(location.href);url.searchParams.set('data',date.value);url.searchParams.set('_r',Date.now());location.href=url.toString();
    }catch(error){
      await mfAlert(error.message||'Não foi possível salvar os horários.',{title:'Erro ao salvar',type:'error'});
      if(button){button.disabled=false;button.textContent=button.dataset.originalText||'Salvar marcados'}
    }
  }
  async function addProfessional(){
    var input=document.getElementById('novoProfissionalNome');
    var name=String(input&&input.value||'').trim();
    if(!name){await mfAlert('Digite o nome do profissional.',{title:'Nome obrigatório',type:'warning'});return}
    var button=document.querySelector('button[onclick="adicionarProfissional()"]');
    if(button){button.disabled=true;button.dataset.originalText=button.textContent;button.textContent='Cadastrando...'}
    try{
      var response=await fetch('/profissionais',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({empresa_id:companyId(),nome:name,ativo:true})});
      var result=await response.json().catch(function(){return {}});
      if(!response.ok||result.error) throw new Error(result.error||'Não foi possível cadastrar o profissional.');
      var select=document.getElementById('profissionalAgenda');
      if(select){
        var option=Array.from(select.options).find(function(item){return String(item.value)===String(result.id)});
        if(!option){option=new Option(result.nome||name,String(result.id));select.add(option)}
        option.textContent=(result.nome||name)+(result.horarios_salvos?' ('+result.horarios_salvos+' horários)':'');
        select.value=String(result.id);
      }
      if(input) input.value='';
      await mfAlert('Profissional salvo. Agora gere e selecione os horários da agenda.',{title:result.existente?'Profissional reativado':'Profissional cadastrado',type:'success'});
    }catch(error){
      await mfAlert(error.message||'Não foi possível cadastrar o profissional.',{title:'Erro ao cadastrar',type:'error'});
    }finally{
      if(button){button.disabled=false;button.textContent=button.dataset.originalText||'Adicionar'}
    }
  }
  /* v284 — o círculo do profissional conta apenas agendamentos ativos.
     Horários livres/cadastrados nunca entram nessa quantidade. */
  function normalizeAgendaDate(value){
    value=String(value||'').trim();
    var match=value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(match)return match[1]+'-'+match[2]+'-'+match[3];
    match=value.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
    return match?match[3]+'-'+match[2]+'-'+match[1]:value;
  }
  function activeAgendaStatus(value){
    var status=String(value||'pendente').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_');
    return !['concluida','concluido','paga','pago','finalizada','finalizado','cancelada','cancelado','recusada','recusado','expirada','expirado'].includes(status);
  }
  function countAgenda(){
    var date=normalizeAgendaDate((document.getElementById('dataAgendaDia')||{}).value||'');
    var counts={};
    document.querySelectorAll('#reservasGrid .reserva-card').forEach(function(card){
      if(!activeAgendaStatus(card.dataset.status))return;
      if(date&&normalizeAgendaDate(card.dataset.date)!==date)return;
      var professional=String(card.dataset.prof||'').trim();
      if(!professional)return;
      counts[professional]=(counts[professional]||0)+1;
    });
    document.querySelectorAll('#profTabsAgenda .prof-tab').forEach(function(button){
      var professional=String(button.dataset.prof||'').trim();
      var count=counts[professional]||0;
      var badge=button.querySelector('.count');
      if(badge)badge.textContent=String(count);
      button.title=count+' agendamento'+(count===1?'':'s')+' ativo'+(count===1?'':'s')+' neste dia';
    });
    document.querySelectorAll('[data-mf-stage1-fixed-professionals] .mf-stage1-fixed-prof').forEach(function(button){
      var professional=String(button.dataset.prof||'').trim();
      var count=counts[professional]||0;
      var badge=button.querySelector('b');
      if(badge)badge.textContent=String(count);
      button.title=count+' agendamento'+(count===1?'':'s')+' ativo'+(count===1?'':'s')+' neste dia';
    });
  }
  function formatVisibleDates(root){
    var walker=document.createTreeWalker(root||document.body,NodeFilter.SHOW_TEXT,{acceptNode:function(node){
      if(!/\d{4}-\d{2}-\d{2}/.test(node.nodeValue||'')) return NodeFilter.FILTER_REJECT;
      var parent=node.parentElement;
      if(!parent || /^(SCRIPT|STYLE|TEXTAREA|OPTION)$/.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    var nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(function(node){node.nodeValue=brDate(node.nodeValue)});
  }
  function forcePortugueseLabels(){
    document.querySelectorAll('#statusTabs .tab').forEach(function(button){
      var status=button.dataset.status;var count=button.querySelector('.count');var labels={todas:'Todas',pendente:'Pendentes',confirmada:'Confirmadas',paga:'Pagas',cancelada:'Canceladas',recusada:'Recusadas'};
      if(labels[status]) button.childNodes.forEach(function(node){if(node.nodeType===Node.TEXT_NODE && node.nodeValue.trim()) node.nodeValue=labels[status]+' '});
      if(count && !count.textContent.trim()) count.textContent='0';
    });
  }
  function bindSetupToggle(){
    document.querySelectorAll('[data-card-target]').forEach(function(button){
      if(button.dataset.mfToggleBound==='1') return;button.dataset.mfToggleBound='1';
      button.addEventListener('click',function(){
        var target=document.getElementById(button.dataset.cardTarget);if(!target)return;
        target.classList.toggle('collapsed');button.setAttribute('aria-expanded',target.classList.contains('collapsed')?'false':'true');
      });
    });
  }

  ready(function(){
    if(!isReservationPage()) return;
    window.salvarHorarios=saveSchedule;
    window.adicionarProfissional=addProfessional;
    window.contarAgenda=countAgenda;
    window.mfRefreshAgendaProfessionalCounts=countAgenda;
    window.avisarWhatsappReserva=function(card){return sendWhatsapp(card)};
    document.addEventListener('mf:agenda-updated',countAgenda);
    var reservationsGrid=document.getElementById('reservasGrid');
    if(reservationsGrid&&window.MutationObserver){
      var countTimer=null;
      new MutationObserver(function(){
        clearTimeout(countTimer);
        countTimer=setTimeout(countAgenda,25);
      }).observe(reservationsGrid,{subtree:true,childList:true,attributes:true,attributeFilter:['data-status','data-date','data-prof']});
    }
    document.addEventListener('click',function(event){
      if(event.target.closest('#profTabsAgenda .prof-tab, [data-mf-stage1-fixed-professionals] .mf-stage1-fixed-prof')){
        requestAnimationFrame(countAgenda);
        setTimeout(countAgenda,40);
      }
    },true);
    formatVisibleDates(document.querySelector('main')||document.body);
    forcePortugueseLabels();bindSetupToggle();countAgenda();
  });
})();
