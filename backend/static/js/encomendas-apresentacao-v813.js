/* MenuFacile v813 — apresentação institucional pode ser reaberta pelo rodapé */
(function(){
  const intro=document.getElementById('encIntroV812');
  if(!intro)return;
  const button=document.getElementById('encIntroOpenCatalogV812');
  const storyButtons=Array.from(document.querySelectorAll('[data-enc-open-story-v813]'));
  let closing=false;

  function openIntro(){
    closing=false;
    intro.hidden=false;
    intro.classList.remove('is-leaving-v812');
    document.body.classList.add('enc-intro-open-v812');
    window.requestAnimationFrame(function(){try{button?.focus({preventScroll:true});}catch(_){button?.focus();}});
  }
  function closeIntro(){
    if(closing)return;
    closing=true;
    intro.classList.add('is-leaving-v812');
    document.body.classList.remove('enc-intro-open-v812');
    window.setTimeout(function(){
      intro.hidden=true;
      closing=false;
      const target=document.querySelector('.enc-public-header,.enc-public-content');
      if(target){if(!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');try{target.focus({preventScroll:true});}catch(_){target.focus();}}
    },280);
  }

  document.body.classList.add('enc-intro-open-v812');
  if(button)button.addEventListener('click',closeIntro);
  storyButtons.forEach(btn=>btn.addEventListener('click',openIntro));
  intro.addEventListener('keydown',function(event){if(event.key==='Escape')closeIntro();});
  window.requestAnimationFrame(function(){try{button?.focus({preventScroll:true});}catch(_){button?.focus();}});
})();
