/* MenuFacile V929 — date picker próprio, sem abrir o calendário nativo do navegador. */
(function(){
  if(window.__MF_CALENDAR_V929__) return;
  window.__MF_CALENDAR_V929__=true;
  const pad=n=>String(n).padStart(2,'0');
  const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const parse=v=>{const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3]);return Number.isNaN(d.getTime())?null:d};
  const lang=()=>String(document.documentElement.lang||'pt-BR').toLowerCase();
  const texts=()=>lang().startsWith('it')?{cancel:'Annulla',ok:'Conferma',week:['D','L','M','M','G','V','S']}:lang().startsWith('en')?{cancel:'Cancel',ok:'Confirm',week:['S','M','T','W','T','F','S']}:{cancel:'Cancelar',ok:'Confirmar',week:['D','S','T','Q','Q','S','S']};
  let input=null, view=new Date(), pending=null, min=null, max=null;
  let root,monthEl,grid,cancelBtn,confirmBtn;
  function build(){
    if(root)return;
    root=document.createElement('div');root.className='mf-calendar-backdrop-v929';root.setAttribute('aria-hidden','true');
    root.innerHTML='<div class="mf-calendar-v929" role="dialog" aria-modal="true" aria-label="Calendário"><div class="mf-calendar-head-v929"><button class="mf-calendar-nav-v929" type="button" data-prev aria-label="Mês anterior">‹</button><div class="mf-calendar-month-v929"></div><button class="mf-calendar-nav-v929" type="button" data-next aria-label="Próximo mês">›</button></div><div class="mf-calendar-week-v929"></div><div class="mf-calendar-grid-v929"></div><div class="mf-calendar-actions-v929"><button type="button" class="mf-calendar-cancel-v929"></button><button type="button" class="mf-calendar-confirm-v929"></button></div></div>';
    document.body.appendChild(root);monthEl=root.querySelector('.mf-calendar-month-v929');grid=root.querySelector('.mf-calendar-grid-v929');cancelBtn=root.querySelector('.mf-calendar-cancel-v929');confirmBtn=root.querySelector('.mf-calendar-confirm-v929');
    root.querySelector('[data-prev]').onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()-1,1);render()};
    root.querySelector('[data-next]').onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()+1,1);render()};
    cancelBtn.onclick=close;confirmBtn.onclick=commit;
    root.addEventListener('click',e=>{if(e.target===root)close()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&root.classList.contains('is-open'))close()});
  }
  function dayAllowed(d){const val=iso(d);return (!min||val>=min)&&(!max||val<=max)}
  function render(){
    const t=texts();cancelBtn.textContent=t.cancel;confirmBtn.textContent=t.ok;
    root.querySelector('.mf-calendar-week-v929').innerHTML=t.week.map(x=>`<span>${x}</span>`).join('');
    monthEl.textContent=new Intl.DateTimeFormat(lang(),{month:'long',year:'numeric'}).format(view);
    grid.replaceChildren();
    const first=new Date(view.getFullYear(),view.getMonth(),1), start=new Date(view.getFullYear(),view.getMonth(),1-first.getDay());
    const today=iso(new Date()), selected=pending?iso(pending):'';
    for(let i=0;i<42;i++){
      const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i), b=document.createElement('button');
      b.type='button';b.className='mf-calendar-day-v929';b.textContent=d.getDate();b.dataset.date=iso(d);
      if(d.getMonth()!==view.getMonth())b.classList.add('is-outside');
      if(b.dataset.date===today)b.classList.add('is-today');
      if(b.dataset.date===selected)b.classList.add('is-selected');
      if(!dayAllowed(d))b.disabled=true;
      b.onclick=()=>{pending=d;view=new Date(d.getFullYear(),d.getMonth(),1);render()};
      grid.appendChild(b);
    }
  }
  function open(el){
    build();input=el;min=String(el.getAttribute('min')||'').trim()||null;max=String(el.getAttribute('max')||'').trim()||null;
    pending=parse(el.value)||parse(min)||new Date();view=new Date(pending.getFullYear(),pending.getMonth(),1);render();
    root.classList.add('is-open');root.setAttribute('aria-hidden','false');document.body.dataset.mfCalendarOpen='1';
  }
  function close(){if(!root)return;root.classList.remove('is-open');root.setAttribute('aria-hidden','true');delete document.body.dataset.mfCalendarOpen;input=null}
  function commit(){if(!input||!pending||!dayAllowed(pending))return;const val=iso(pending);if(input.value!==val){input.value=val;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))}close()}
  function enhance(scope){
    (scope||document).querySelectorAll('input[data-mf-calendar-v929]').forEach(el=>{
      if(el.dataset.mfCalendarReady)return;el.dataset.mfCalendarReady='1';el.type='text';el.readOnly=true;el.inputMode='none';el.autocomplete='off';el.classList.add('mf-calendar-input-v929');
      el.addEventListener('click',()=>open(el));el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(el)}});
    });
  }
  window.mfCalendarEnhanceV929=enhance;
  document.addEventListener('DOMContentLoaded',()=>enhance(document));
  new MutationObserver(m=>{for(const x of m)for(const n of x.addedNodes)if(n&&n.querySelectorAll)enhance(n)}).observe(document.documentElement,{childList:true,subtree:true});
})();
