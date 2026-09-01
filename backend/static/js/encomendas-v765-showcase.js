(function(){
  'use strict';

  var showcase = document.getElementById('encShowcaseV765');
  if (!showcase) return;

  var slots = Array.from(showcase.querySelectorAll('[data-enc-showcase-slot]'));
  var cards = Array.from(document.querySelectorAll('.enc-product-grid .enc-product-card'));

  if (!slots.length || !cards.length) {
    showcase.hidden = true;
    return;
  }

  function text(root, selector) {
    var el = root.querySelector(selector);
    return el ? String(el.textContent || '').trim() : '';
  }

  function backgroundUrl(root) {
    var photo = root.querySelector('.enc-product-photo');
    if (!photo) return '';
    var inlineValue = photo.style.backgroundImage || '';
    if (inlineValue && inlineValue !== 'none') return inlineValue;
    var computedValue = window.getComputedStyle(photo).backgroundImage || '';
    return computedValue === 'none' ? '' : computedValue;
  }

  var products = cards.map(function(card, index){
    var small = text(card, '.enc-product-price small');
    var strong = text(card, '.enc-product-price strong');
    return {
      index: index,
      card: card,
      name: text(card, '.enc-product-body h3') || 'Encomenda',
      desc: text(card, '.enc-product-body p'),
      badge: text(card, '.enc-product-tag') || 'Destaque',
      price: [small, strong].filter(Boolean).join(' '),
      background: backgroundUrl(card)
    };
  });

  var offset = 0;
  var timer = null;
  var switching = false;
  var intervalMs = 5600;

  function populateSlot(slot, product, position) {
    if (product.background) slot.style.backgroundImage = product.background;
    else slot.style.backgroundImage = '';

    slot.dataset.encProductIndex = String(product.index);
    slot.tabIndex = 0;
    slot.setAttribute('role', 'button');
    slot.setAttribute('aria-label', 'Ver ' + product.name);

    var badge = slot.querySelector('[data-enc-showcase-badge]');
    var name = slot.querySelector('[data-enc-showcase-name]');
    var desc = slot.querySelector('[data-enc-showcase-desc]');
    var price = slot.querySelector('[data-enc-showcase-price]');

    if (badge) badge.textContent = position === 0 && product.badge ? product.badge : product.badge;
    if (name) name.textContent = product.name;
    if (desc) desc.textContent = product.desc;
    if (price) price.textContent = product.price;
  }

  function render(immediate) {
    var update = function(){
      slots.forEach(function(slot, i){
        var product = products[(offset + i) % products.length];
        populateSlot(slot, product, i);
      });
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
    if (!products.length) return;
    offset = (offset + direction + products.length) % products.length;
    render(false);
  }

  function start() {
    stop();
    if (products.length > 1) timer = window.setInterval(function(){ step(1); }, intervalMs);
  }

  function stop() {
    if (timer) window.clearInterval(timer);
    timer = null;
  }

  function openFromSlot(slot) {
    var index = Number(slot.dataset.encProductIndex);
    var product = products[index];
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

  render(true);
  start();
})();
