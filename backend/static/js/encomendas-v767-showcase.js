(function(){
  'use strict';

  var showcase = document.getElementById('encShowcaseV765');
  if (!showcase) return;

  var slots = Array.from(showcase.querySelectorAll('[data-enc-showcase-slot]'));
  var cards = Array.from(document.querySelectorAll('.enc-product-grid [data-enc-product-card]'));
  if (!slots.length || !cards.length) {
    showcase.hidden = true;
    return;
  }

  var intervalMs = 5600;
  var timer = null;
  var switching = false;
  var offset = 0;
  var ready = false;
  var validProducts = [];

  function text(root, selector) {
    var el = root.querySelector(selector);
    return el ? String(el.textContent || '').trim() : '';
  }

  function productFromCard(card, index) {
    var small = text(card, '.enc-product-price small');
    var strong = text(card, '.enc-product-price strong');
    return {
      index: index,
      card: card,
      name: text(card, '.enc-product-body h3') || 'Encomenda',
      desc: text(card, '.enc-product-body p'),
      badge: text(card, '.enc-product-tag') || 'Destaque',
      price: [small, strong].filter(Boolean).join(' '),
      photo: String(card.dataset.encItemPhoto || '').trim()
    };
  }

  var allProducts = cards.map(productFromCard);

  function markCardPhoto(product, ok) {
    var photo = product.card.querySelector('.enc-product-photo');
    if (!photo) return;
    photo.classList.toggle('enc-photo-ok-v767', ok);
    photo.classList.toggle('enc-photo-fallback-v767', !ok);
  }

  function probe(product) {
    return new Promise(function(resolve){
      if (!product.photo) {
        markCardPhoto(product, false);
        resolve(null);
        return;
      }
      var img = new Image();
      var done = false;
      var finish = function(ok){
        if (done) return;
        done = true;
        product.photoOK = !!ok;
        markCardPhoto(product, ok);
        refreshValidProducts();
        tryBootstrap();
        resolve(ok ? product : null);
      };
      img.onload = function(){ finish((img.naturalWidth || 0) > 80 && (img.naturalHeight || 0) > 80); };
      img.onerror = function(){ finish(false); };
      img.src = product.photo;
      window.setTimeout(function(){ finish(false); }, 4500);
    });
  }

  function setSlot(slot, product, position) {
    slot.style.backgroundImage = 'url("' + product.photo.replace(/"/g, '') + '")';
    slot.dataset.encProductIndex = String(product.index);
    slot.tabIndex = 0;
    slot.setAttribute('role', 'button');
    slot.setAttribute('aria-label', 'Ver ' + product.name);

    var badge = slot.querySelector('[data-enc-showcase-badge]');
    var name = slot.querySelector('[data-enc-showcase-name]');
    var desc = slot.querySelector('[data-enc-showcase-desc]');
    var price = slot.querySelector('[data-enc-showcase-price]');
    if (badge) badge.textContent = product.badge || (position === 0 ? 'Destaque' : 'Encomenda');
    if (name) name.textContent = product.name;
    if (desc) desc.textContent = product.desc;
    if (price) price.textContent = product.price;
  }

  function render(immediate) {
    if (!ready || !validProducts.length) return;
    var update = function(){
      slots.forEach(function(slot, i){
        var product = validProducts[(offset + i) % validProducts.length];
        setSlot(slot, product, i);
      });
      showcase.classList.remove('enc-showcase-loading-v767');
      requestAnimationFrame(function(){
        slots.forEach(function(slot){ slot.classList.remove('is-switching'); });
        switching = false;
      });
    };

    if (immediate) {
      update();
      return;
    }
    if (switching) return;
    switching = true;
    slots.forEach(function(slot){ slot.classList.add('is-switching'); });
    window.setTimeout(update, 180);
  }

  function step(direction) {
    if (!validProducts.length) return;
    offset = (offset + direction + validProducts.length) % validProducts.length;
    render(false);
  }

  function stop() {
    if (timer) window.clearInterval(timer);
    timer = null;
  }

  function start() {
    stop();
    if (ready && validProducts.length > 1) timer = window.setInterval(function(){ step(1); }, intervalMs);
  }

  function openFromSlot(slot) {
    var originalIndex = Number(slot.dataset.encProductIndex);
    var product = allProducts.find(function(p){ return p.index === originalIndex; });
    if (!product) return;
    var trigger = product.card.querySelector('[data-enc-open-product]');
    if (trigger) trigger.click();
  }

  showcase.addEventListener('click', function(event){
    var slot = event.target.closest('[data-enc-showcase-slot]');
    if (slot) openFromSlot(slot);
  });

  showcase.addEventListener('keydown', function(event){
    var slot = event.target.closest('[data-enc-showcase-slot]');
    if (!slot) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openFromSlot(slot);
    }
  });

  showcase.addEventListener('mouseenter', stop);
  showcase.addEventListener('mouseleave', start);
  showcase.addEventListener('focusin', stop);
  showcase.addEventListener('focusout', function(event){
    if (!showcase.contains(event.relatedTarget)) start();
  });

  var touchX = null;
  showcase.addEventListener('touchstart', function(event){
    if (event.touches && event.touches.length === 1) touchX = event.touches[0].clientX;
  }, {passive:true});
  showcase.addEventListener('touchend', function(event){
    if (touchX === null || !event.changedTouches || !event.changedTouches.length) return;
    var dx = event.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) < 42) return;
    step(dx < 0 ? 1 : -1);
    start();
  }, {passive:true});

  document.addEventListener('visibilitychange', function(){
    if (document.hidden) stop();
    else start();
  });

  function refreshValidProducts(){
    // Mantém a mesma ordem do cadastro, independentemente da velocidade de cada foto.
    validProducts = allProducts.filter(function(product){ return product.photoOK === true; });
  }

  function tryBootstrap(force){
    if (ready) return;
    var desired = Math.min(slots.length, allProducts.length);
    if (!force && validProducts.length < desired) return;
    if (!validProducts.length) return;
    ready = true;
    render(true);
    start();
  }

  showcase.classList.add('enc-showcase-loading-v767');
  var probes = allProducts.map(probe);
  // Não segura a vitrine esperando uma única URL lenta/quebrada.
  window.setTimeout(function(){ tryBootstrap(true); }, 1400);
  Promise.all(probes).then(function(){
    refreshValidProducts();
    if (!ready) tryBootstrap(true);
    if (!validProducts.length) showcase.hidden = true;
  });
})();
