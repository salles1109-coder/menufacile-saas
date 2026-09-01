/* MenuFacile v812 — abre o catálogo a partir da apresentação institucional */
(function(){
  const intro = document.getElementById('encIntroV812');
  if(!intro) return;
  const button = document.getElementById('encIntroOpenCatalogV812');
  document.body.classList.add('enc-intro-open-v812');

  let closing = false;
  function closeIntro(){
    if(closing) return;
    closing = true;
    intro.classList.add('is-leaving-v812');
    document.body.classList.remove('enc-intro-open-v812');
    window.setTimeout(function(){
      intro.hidden = true;
      const target = document.querySelector('.enc-public-header, .enc-public-content');
      if(target){
        if(!target.hasAttribute('tabindex')) target.setAttribute('tabindex','-1');
        try{ target.focus({preventScroll:true}); }catch(_){ target.focus(); }
      }
    }, 280);
  }

  if(button) button.addEventListener('click', closeIntro);
  intro.addEventListener('keydown', function(event){
    if(event.key === 'Escape') closeIntro();
  });
  window.requestAnimationFrame(function(){ if(button) button.focus({preventScroll:true}); });
})();
