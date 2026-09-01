(function(){
  'use strict';

  const monthNames=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const weekNames=['D','S','T','Q','Q','S','S'];
  let active=null;

  function pad(n){return String(n).padStart(2,'0')}
  function ymd(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
  function parse(v){
    const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12,0,0,0) : null;
  }
  function label(v){const d=parse(v);return d?pad(d.getDate())+'/'+pad(d.getMonth()+1)+'/'+d.getFullYear():'Escolher data'}
  function close(ctrl){
    if(!ctrl)return;
    ctrl.pop.classList.remove('open');
    ctrl.button.setAttribute('aria-expanded','false');
    if(active===ctrl)active=null;
  }
  function position(ctrl){
    if(!ctrl||!ctrl.pop.classList.contains('open'))return;
    const pop=ctrl.pop, btn=ctrl.button;
    pop.style.position='fixed';
    pop.style.zIndex='2147483000';
    if(window.innerWidth<=720){
      pop.style.left='50%';
      pop.style.top='50%';
      return;
    }
    const r=btn.getBoundingClientRect();
    const w=pop.offsetWidth||286, h=pop.offsetHeight||275;
    let left=Math.max(12,Math.min(r.left,window.innerWidth-w-12));
    let top=r.bottom+7;
    if(top+h>window.innerHeight-12)top=Math.max(12,r.top-h-7);
    pop.style.left=Math.round(left)+'px';
    pop.style.top=Math.round(top)+'px';
  }

  function setup(inputId,buttonId,popId){
    const input=document.getElementById(inputId);
    const button=document.getElementById(buttonId);
    const pop=document.getElementById(popId);
    if(!input||!button||!pop)return null;

    if(pop.parentNode!==document.body)document.body.appendChild(pop);
    const value=button.querySelector('.mf-picker-value');
    let view=parse(input.value)||new Date();
    view=new Date(view.getFullYear(),view.getMonth(),1,12);
    const ctrl={input,button,pop};

    function sync(){if(value)value.textContent=label(input.value)}
    function render(){
      const selected=parse(input.value);
      if(selected)view=new Date(selected.getFullYear(),selected.getMonth(),1,12);
      const year=view.getFullYear(), month=view.getMonth();
      const first=new Date(year,month,1,12), count=new Date(year,month+1,0,12).getDate();
      let html='<div class="mf-picker-calendar-head">'+
        '<button type="button" class="mf-picker-nav" data-v872-prev aria-label="Mês anterior"><i class="fa-solid fa-chevron-left"></i></button>'+
        '<div class="mf-picker-month">'+monthNames[month]+' de '+year+'</div>'+
        '<button type="button" class="mf-picker-nav" data-v872-next aria-label="Próximo mês"><i class="fa-solid fa-chevron-right"></i></button>'+
        '</div>';
      html+='<div class="mf-picker-week">'+weekNames.map(w=>'<span>'+w+'</span>').join('')+'</div>';
      html+='<div class="mf-picker-days">';
      for(let i=0;i<first.getDay();i++)html+='<span class="mf-picker-blank" aria-hidden="true"></span>';
      const today=ymd(new Date());
      for(let day=1;day<=count;day++){
        const d=new Date(year,month,day,12), v=ymd(d);
        let cls='mf-picker-day';
        if(v===today)cls+=' today';
        if(selected&&v===ymd(selected))cls+=' selected';
        html+='<button type="button" class="'+cls+'" data-v872-day="'+v+'">'+day+'</button>';
      }
      html+='</div><div class="mf-picker-calendar-foot">'+
        '<button type="button" class="mf-picker-link" data-v872-clear>Limpar</button>'+
        '<button type="button" class="mf-picker-link" data-v872-today>Hoje</button></div>';
      pop.innerHTML=html;
    }
    function open(){
      if(active&&active!==ctrl)close(active);
      render();
      pop.classList.add('open');
      button.setAttribute('aria-expanded','true');
      active=ctrl;
      requestAnimationFrame(()=>position(ctrl));
    }

    button.addEventListener('click',function(e){
      e.preventDefault();
      e.stopPropagation();
      pop.classList.contains('open')?close(ctrl):open();
    });
    pop.addEventListener('click',function(e){
      e.stopPropagation();
      const prev=e.target.closest('[data-v872-prev]');
      const next=e.target.closest('[data-v872-next]');
      const day=e.target.closest('[data-v872-day]');
      const today=e.target.closest('[data-v872-today]');
      const clear=e.target.closest('[data-v872-clear]');
      if(prev){view=new Date(view.getFullYear(),view.getMonth()-1,1,12);render();position(ctrl);return}
      if(next){view=new Date(view.getFullYear(),view.getMonth()+1,1,12);render();position(ctrl);return}
      if(day){input.value=day.dataset.v872Day||'';input.dispatchEvent(new Event('change',{bubbles:true}));sync();close(ctrl);return}
      if(today){input.value=ymd(new Date());input.dispatchEvent(new Event('change',{bubbles:true}));sync();close(ctrl);return}
      if(clear){input.value='';input.dispatchEvent(new Event('change',{bubbles:true}));sync();close(ctrl)}
    });
    input.addEventListener('change',sync);
    input.addEventListener('input',sync);
    sync();
    return ctrl;
  }

  function init(){
    const from=setup('encDateFrom','encDateFromButton','encDateFromCalendar');
    const to=setup('encDateTo','encDateToButton','encDateToCalendar');
    const ctrls=[from,to].filter(Boolean);
    if(!ctrls.length)return;

    document.addEventListener('click',function(e){
      if(active&&!active.pop.contains(e.target)&&!active.button.contains(e.target))close(active);
      if(e.target.closest('[data-enc-period]'))setTimeout(()=>ctrls.forEach(c=>{
        const v=c.button.querySelector('.mf-picker-value');if(v)v.textContent=label(c.input.value);
      }),30);
    });
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&active)close(active)});
    window.addEventListener('resize',function(){if(active)position(active)});
    window.addEventListener('orientationchange',function(){setTimeout(()=>{if(active)position(active)},120)});
    window.addEventListener('scroll',function(){if(active&&window.innerWidth>720)position(active)},{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
