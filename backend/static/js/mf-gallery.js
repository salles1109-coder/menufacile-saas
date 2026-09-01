(function(){
  'use strict';
  if(window.__MF_GALLERY_ACTIVE__) return;
  window.__MF_GALLERY_ACTIVE__ = true;

  var lastSwipeAt=0;

  function parsePhotos(raw,fallback){
    var photos=[];
    try{photos=JSON.parse(raw||'[]')}catch(_error){photos=[]}
    if(!Array.isArray(photos)) photos=[];
    photos=photos.map(function(value){return String(value||'').trim()}).filter(Boolean);
    fallback=String(fallback||'').trim();
    if(fallback && photos.indexOf(fallback)===-1) photos.unshift(fallback);
    var seen={};
    return photos.filter(function(value){if(seen[value])return false;seen[value]=true;return true}).slice(0,5);
  }

  function imageSource(image){
    if(!image) return [];
    var card=image.closest('[data-fotos],.produto-card,.item,.servico-card');
    var raw=image.getAttribute('data-mf-fotos') || (card&&card.getAttribute('data-fotos')) || '[]';
    var fallback=(card&&card.getAttribute('data-foto')) || image.getAttribute('src') || image.currentSrc || image.src || '';
    return parsePhotos(raw,fallback);
  }

  function sourceFromTarget(target){
    var card=target&&target.closest?target.closest('[data-fotos],.produto-card,.item,.servico-card'):null;
    var image=card?card.querySelector('img[data-mf-fotos],img'):(target&&target.closest?target.closest('img[data-mf-fotos]'):null);
    if(!image) return null;
    return imageSource(image);
  }

  function clearModal(host){
    if(!host) return;
    host.querySelectorAll('.mf-gallery-controls,.mf-gallery-arrow,.mf-gallery-tip').forEach(function(node){node.remove()});
    host.classList.remove('mf-gallery-host');
  }

  function setupModal(host,image,photos){
    if(!host||!image) return;
    clearModal(host);
    if(!photos.length) return;
    image.src=photos[0];
    if(photos.length<2) return;

    host.classList.add('mf-gallery-host');
    var index=0;
    var dots=document.createElement('div');
    dots.className='mf-gallery-controls';
    photos.forEach(function(_photo,i){
      var dot=document.createElement('span');
      dot.className='mf-gallery-dot'+(i===0?' is-active':'');
      dots.appendChild(dot);
    });

    function show(next){
      index=(next+photos.length)%photos.length;
      image.src=photos[index];
      Array.prototype.forEach.call(dots.children,function(dot,i){dot.classList.toggle('is-active',i===index)});
    }
    function arrow(className,label,delta){
      var button=document.createElement('button');
      button.type='button';button.className='mf-gallery-arrow '+className;button.setAttribute('aria-label',label);
      button.textContent=delta<0?'‹':'›';
      button.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();show(index+delta)});
      return button;
    }

    var tip=document.createElement('span');
    var prevButton=arrow('mf-gallery-prev','Foto anterior',-1);
    var nextButton=arrow('mf-gallery-next','Próxima foto',1);
    tip.className='mf-gallery-tip';tip.textContent='Deslize para ver mais fotos';
    host.appendChild(prevButton);
    host.appendChild(nextButton);
    host.appendChild(tip);host.appendChild(dots);

    function positionModalUi(){
      if(!image.offsetWidth||!image.offsetHeight) return;
      var imageTop=image.offsetTop;
      var imageLeft=image.offsetLeft;
      var imageWidth=image.offsetWidth;
      var imageHeight=image.offsetHeight;
      var centerX=imageLeft+(imageWidth/2);
      var imageBottom=imageTop+imageHeight;
      var arrowTop=imageTop+(imageHeight/2);
      var hideArrows=window.innerWidth<=768;
      try{hideArrows=hideArrows||(window.matchMedia&&window.matchMedia('(hover: none) and (pointer: coarse)').matches)}catch(_error){/* mantém a decisão pela largura */}

      dots.style.left=centerX+'px';
      dots.style.top=Math.max(imageTop+10,imageBottom-18)+'px';
      dots.style.bottom='auto';

      tip.style.left=centerX+'px';
      tip.style.top=Math.max(imageTop+10,imageBottom-46)+'px';
      tip.style.bottom='auto';
      tip.style.display=hideArrows?'block':'none';

      prevButton.style.top=arrowTop+'px';
      prevButton.style.left=(imageLeft+10)+'px';
      prevButton.style.right='auto';
      prevButton.style.display=hideArrows?'none':'grid';

      nextButton.style.top=arrowTop+'px';
      nextButton.style.left='auto';
      nextButton.style.right=Math.max(10,host.clientWidth-(imageLeft+imageWidth)+10)+'px';
      nextButton.style.display=hideArrows?'none':'grid';
    }

    var schedulePosition=(function(){
      var queued=false;
      return function(){
        if(queued) return;
        queued=true;
        requestAnimationFrame(function(){queued=false;positionModalUi()});
      };
    })();

    if(image.complete) schedulePosition(); else image.addEventListener('load',schedulePosition,{once:true});
    window.addEventListener('resize',schedulePosition,{passive:true});
    if('ResizeObserver' in window){new ResizeObserver(schedulePosition).observe(host);new ResizeObserver(schedulePosition).observe(image)}

    var touchStart=0;
    image.addEventListener('touchstart',function(event){touchStart=event.touches&&event.touches[0]?event.touches[0].clientX:0},{passive:true});
    image.addEventListener('touchend',function(event){
      var end=event.changedTouches&&event.changedTouches[0]?event.changedTouches[0].clientX:touchStart;
      var distance=end-touchStart;
      if(Math.abs(distance)>38){lastSwipeAt=Date.now();show(index+(distance<0?1:-1));schedulePosition();}
    },{passive:true});
  }

  function positionCardDots(card,image,dots){
    if(!card||!image||!dots||!image.offsetWidth||!image.offsetHeight) return;
    card.classList.add('mf-gallery-card-host');
    dots.style.left=(image.offsetLeft+(image.offsetWidth/2))+'px';
    dots.style.top=Math.max(8,image.offsetTop+image.offsetHeight-22)+'px';
  }

  function setupCard(image){
    if(!image||image.dataset.mfCardGalleryReady==='1') return;
    var photos=imageSource(image);
    if(photos.length<2) return;
    var card=image.closest('[data-fotos],.produto-card,.item,.servico-card');
    if(!card) return;

    image.dataset.mfCardGalleryReady='1';
    var dots=document.createElement('div');
    dots.className='mf-gallery-card-controls';
    photos.forEach(function(_photo,i){
      var dot=document.createElement('span');
      dot.className='mf-gallery-card-dot'+(i===0?' is-active':'');
      dots.appendChild(dot);
    });
    card.appendChild(dots);

    var index=0;
    function show(next){
      index=(next+photos.length)%photos.length;
      image.src=photos[index];
      image.dataset.mfGalleryIndex=String(index);
      Array.prototype.forEach.call(dots.children,function(dot,i){dot.classList.toggle('is-active',i===index)});
    }
    function reposition(){positionCardDots(card,image,dots)}
    if(image.complete) requestAnimationFrame(reposition); else image.addEventListener('load',reposition,{once:true});
    window.addEventListener('resize',reposition,{passive:true});
    if('ResizeObserver' in window){new ResizeObserver(reposition).observe(image)}

    var touchStart=0;
    image.addEventListener('touchstart',function(event){touchStart=event.touches&&event.touches[0]?event.touches[0].clientX:0},{passive:true});
    image.addEventListener('touchend',function(event){
      var end=event.changedTouches&&event.changedTouches[0]?event.changedTouches[0].clientX:touchStart;
      var distance=end-touchStart;
      if(Math.abs(distance)>38){lastSwipeAt=Date.now();show(index+(distance<0?1:-1))}
    },{passive:true});
  }

  function initCards(root){
    var scope=root&&root.querySelectorAll?root:document;
    scope.querySelectorAll('img[data-mf-fotos],[data-fotos] img').forEach(setupCard);
  }

  function applyToOpenModal(photos){
    var targets=[
      ['#mfProdutoModalFinal.aberto .mf-produto-card','#mfProdutoModalFinal.aberto .mf-produto-img'],
      ['.mf-store-product-modal.open .mf-store-product-image-wrap','.mf-store-product-modal.open .mf-store-product-image'],
      ['.mf-produto-modal.aberto .mf-produto-card','.mf-produto-modal.aberto .mf-produto-img']
    ];
    targets.some(function(selectors){
      var host=document.querySelector(selectors[0]);
      var image=document.querySelector(selectors[1]);
      if(!host||!image) return false;
      setupModal(host,image,photos);
      var hint=host.querySelector('.mf-produto-hint');
      if(hint) hint.textContent='Toque fora para fechar';
      return true;
    });
  }

  document.addEventListener('click',function(event){
    if(Date.now()-lastSwipeAt<450){
      var card=event.target&&event.target.closest?event.target.closest('[data-fotos],.produto-card,.item,.servico-card'):null;
      if(card){event.preventDefault();event.stopPropagation();return}
    }
    var photos=sourceFromTarget(event.target);
    if(!photos||!photos.length) return;
    window.setTimeout(function(){applyToOpenModal(photos)},40);
  },true);

  function init(){initCards(document)}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();

  if('MutationObserver' in window){
    new MutationObserver(function(records){
      records.forEach(function(record){record.addedNodes.forEach(function(node){if(node.nodeType===1){if(node.matches&&node.matches('img[data-mf-fotos],[data-fotos] img'))setupCard(node);initCards(node)}})})
    }).observe(document.documentElement,{childList:true,subtree:true});
  }
})();
