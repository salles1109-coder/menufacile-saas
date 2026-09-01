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

  var intervalMs = 1450;
  var autoSlotIndex = 0;
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
    return {
      index: index,
      card: card,
      name: text(card, '.enc-product-body h3') || 'Encomenda',
      desc: text(card, '.enc-product-body p'),
      badge: text(card, '.enc-product-tag') || 'Destaque',
      photo: String(card.dataset.encItemPhoto || '').trim(),
      photoOK: false
    };
  }

  // V967 — a vitrine trabalha com FOTOS únicas.
  // Dois produtos podem apontar para a mesma imagem; nesse caso a foto
  // aparece apenas uma vez na vitrine (os cards do catálogo não mudam).
  function photoKey(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    try {
      var u = new URL(raw, window.location.href);
      // Query/hash não devem fazer a mesma imagem contar como diferente.
      return (u.origin + u.pathname).toLowerCase();
    } catch (_) {
      return raw.split('#')[0].split('?')[0].toLowerCase();
    }
  }

  var seenPhotos = new Set();
  var allProducts = cards.map(productFromCard).filter(function(product){
    var key = photoKey(product.photo);
    if (!key) return true;
    if (seenPhotos.has(key)) return false;
    seenPhotos.add(key);
    product.photoKey = key;
    return true;
  });

  function markCardPhoto(product, ok) {
    var photo = product.card.querySelector('.enc-product-photo');
    if (!photo) return;
    photo.classList.toggle('enc-photo-ok-v767', !!ok);
    photo.classList.toggle('enc-photo-fallback-v767', !ok);
  }

  function refreshValidProducts() {
    validProducts = allProducts.filter(function(product){ return product.photoOK === true; });
    if (offset >= validProducts.length) offset = 0;
  }

  function invalidateProduct(product) {
    if (!product || product.photoOK !== true) return;
    product.photoOK = false;
    markCardPhoto(product, false);
    refreshValidProducts();
    if (!validProducts.length) {
      stop();
      showcase.hidden = true;
      return;
    }
    render(true);
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
      img.onload = function(){
        finish((img.naturalWidth || 0) > 80 && (img.naturalHeight || 0) > 80);
      };
      img.onerror = function(){ finish(false); };
      img.referrerPolicy = 'no-referrer';
      img.src = product.photo;
      window.setTimeout(function(){ finish(false); }, 5000);
    });
  }

  function setSlot(slot, product) {
    slot.dataset.encProductIndex = String(product.index);
    slot.tabIndex = 0;
    slot.setAttribute('role', 'button');
    slot.setAttribute('aria-label', 'Ver ' + product.name);

    var image = slot.querySelector('[data-enc-showcase-image]');
    var name = slot.querySelector('[data-enc-showcase-name]');
    if (name) name.textContent = product.name;

    // v775: a imagem real fica dentro do card. Se ela falhar aqui, o produto
    // sai imediatamente da rotação e o próximo item válido ocupa o espaço.
    if (image) {
      image.onload = function(){
        if ((image.naturalWidth || 0) <= 80 || (image.naturalHeight || 0) <= 80) {
          invalidateProduct(product);
        }
      };
      image.onerror = function(){ invalidateProduct(product); };
      image.alt = product.name;
      image.referrerPolicy = 'no-referrer';
      if (image.getAttribute('src') !== product.photo) image.src = product.photo;
    }
  }

  function render(immediate) {
    if (!ready || !validProducts.length) return;
    var update = function(){
      var visibleCount = Math.min(slots.length, validProducts.length);
      showcase.dataset.encVisibleCount = String(visibleCount);
      slots.forEach(function(slot, i){
        if (i >= visibleCount) {
          slot.hidden = true;
          slot.removeAttribute('data-enc-product-index');
          return;
        }
        slot.hidden = false;
        var product = validProducts[(offset + i) % validProducts.length];
        setSlot(slot, product);
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
    autoSlotIndex = 0;
    render(false);
  }

  // V967: muda um card por vez SEM repetir uma foto que já esteja visível.
  // Se não houver foto extra disponível, mantém a vitrine estável em vez
  // de criar uma duplicata temporária durante a rotação.
  function stepOneSlot() {
    if (!ready || !validProducts.length || switching || !slots.length) return;

    var visibleSlots = slots.filter(function(slot){ return !slot.hidden; });
    if (!visibleSlots.length) return;

    // Para trocar só um card e continuar sem duplicatas é necessário existir
    // ao menos uma foto válida fora do conjunto atualmente visível.
    if (validProducts.length <= visibleSlots.length) return;

    var slotIndex = autoSlotIndex % visibleSlots.length;
    var slot = visibleSlots[slotIndex];
    var currentIndex = Number(slot.dataset.encProductIndex);
    var used = new Set();

    visibleSlots.forEach(function(other){
      if (other === slot) return;
      var idx = Number(other.dataset.encProductIndex);
      if (Number.isFinite(idx)) used.add(idx);
    });

    var startIndex = validProducts.findIndex(function(p){ return p.index === currentIndex; });
    if (startIndex < 0) startIndex = 0;

    var product = null;
    for (var jump = 1; jump <= validProducts.length; jump++) {
      var candidate = validProducts[(startIndex + jump) % validProducts.length];
      if (!used.has(candidate.index) && candidate.index !== currentIndex) {
        product = candidate;
        break;
      }
    }
    if (!product) return;

    switching = true;
    slot.classList.add('is-switching');

    window.setTimeout(function(){
      setSlot(slot, product);
      requestAnimationFrame(function(){
        slot.classList.remove('is-switching');
        switching = false;
      });

      autoSlotIndex = (autoSlotIndex + 1) % visibleSlots.length;
    }, 180);
  }

  function stop() {
    if (timer) window.clearInterval(timer);
    timer = null;
  }

  function start() {
    stop();
    var visibleCount = Math.min(slots.length, validProducts.length);
    // Autoplay de um card por vez somente quando há uma foto "reserva".
    // Caso contrário, mantém todas diferentes e permite navegação manual.
    if (ready && validProducts.length > visibleCount) {
      timer = window.setInterval(stepOneSlot, intervalMs);
    }
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

  function tryBootstrap(force) {
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
  window.setTimeout(function(){ tryBootstrap(true); }, 1500);
  Promise.all(probes).then(function(){
    refreshValidProducts();
    if (!ready) tryBootstrap(true);
    if (!validProducts.length) showcase.hidden = true;
  });
})();
