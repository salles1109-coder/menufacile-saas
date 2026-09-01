(function(){
  'use strict';

  function isMobile(){ return window.matchMedia('(max-width: 768px)').matches; }
  function qs(selector, root){ return (root || document).querySelector(selector); }
  function qsa(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function clean(text){ return String(text || '').replace(/\s+/g, ' ').trim(); }
  function normalize(text){
    return clean(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  function escapeHtml(text){
    return clean(text).replace(/[&<>"']/g, function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function formatDate(value){
    if(!value) return '';
    var parts = value.split('-');
    if(parts.length !== 3) return value;
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }
  function iconForItem(type, category){
    var value = normalize(type + ' ' + category);
    if(value.indexOf('barba') > -1) return 'fa-solid fa-user-tie';
    if(value.indexOf('corte') > -1 || value.indexOf('cabelo') > -1) return 'fa-solid fa-scissors';
    if(value.indexOf('servico') > -1) return 'fa-solid fa-wand-magic-sparkles';
    return 'fa-solid fa-box-open';
  }

  function fixBottomNav(){
    qsa('.mf-global-bottom-nav a span, .mf-global-bottom-nav button span').forEach(function(span){
      span.setAttribute('title', clean(span.textContent));
    });
  }

  function initDashboard(){
    if(!document.body.classList.contains('mf-page-inicio')) return;
    document.body.classList.add('mf-v48-dashboard');
  }

  function createCatalogCards(table, type){
    if(!table || table.dataset.mfV48Ready === '1') return null;
    table.dataset.mfV48Ready = '1';
    var cards = document.createElement('div');
    cards.className = 'mf-v48-catalog-cards mf-v48-' + type + '-cards';

    qsa('tbody tr', table).forEach(function(row){
      var cells = qsa('td', row);
      if(!cells.length) return;

      if(type === 'items'){
        var first = cells[0];
        var category = clean((qs('.categoria-badge', first) || {}).textContent) || 'Sem categoria';
        var name = clean((qs('strong', first) || {}).textContent) || 'Item';
        var smalls = qsa('small', first);
        var description = smalls.length ? clean(smalls[0].textContent) : '';
        var code = cells[1] ? clean(cells[1].textContent) : '-';
        var price = cells[2] ? clean(cells[2].textContent) : '';
        var itemType = cells[3] ? clean((qs('.badge', cells[3]) || {}).textContent) : '';
        var detail = cells[3] ? clean((qs('small', cells[3]) || {}).textContent) : '';

        var card = document.createElement('article');
        card.className = 'mf-v48-service-card';
        card.dataset.category = normalize(category);
        card.dataset.search = normalize([category, name, description, code, price, itemType, detail].join(' '));

        var visual = document.createElement('div');
        visual.className = 'mf-v48-service-icon';
        visual.innerHTML = '<i class="' + iconForItem(itemType, category) + '"></i>';

        var content = document.createElement('div');
        content.className = 'mf-v48-service-content';
        content.innerHTML =
          '<span class="mf-v48-category-badge">' + escapeHtml(category) + '</span>' +
          '<h3>' + escapeHtml(name) + '</h3>' +
          (description ? '<p>' + escapeHtml(description) + '</p>' : '') +
          '<div class="mf-v48-service-meta">' +
            (detail ? '<span><i class="fa-regular fa-clock"></i>' + escapeHtml(detail) + '</span>' : '') +
            (price ? '<strong>' + escapeHtml(price) + '</strong>' : '') +
            (code && code !== '-' ? '<small>Código: ' + escapeHtml(code) + '</small>' : '') +
          '</div>';

        var actions = document.createElement('div');
        actions.className = 'mf-v48-service-actions';
        if(cells[4]){
          qsa('button, a', cells[4]).forEach(function(action){
            var clone = action.cloneNode(true);
            clone.removeAttribute('style');
            if(normalize(clone.textContent).indexOf('editar') > -1){
              clone.classList.add('mf-v48-edit');
              clone.innerHTML = '<i class="fa-solid fa-pen"></i><span>Editar</span>';
            }else if(normalize(clone.textContent).indexOf('excluir') > -1){
              clone.classList.add('mf-v48-delete');
              clone.innerHTML = '<i class="fa-regular fa-trash-can"></i><span>Excluir</span>';
            }
            actions.appendChild(clone);
          });
        }

        card.appendChild(visual);
        card.appendChild(content);
        card.appendChild(actions);
        cards.appendChild(card);
      }else{
        var categoryName = cells[0] ? clean(cells[0].textContent) : 'Categoria';
        var status = cells[1] ? clean(cells[1].textContent) : '';
        var catCard = document.createElement('article');
        catCard.className = 'mf-v48-category-card';
        catCard.dataset.search = normalize(categoryName + ' ' + status);
        catCard.innerHTML = '<div><span>Categoria</span><h3>' + escapeHtml(categoryName) + '</h3><small>' + escapeHtml(status) + '</small></div>';
        var catActions = document.createElement('div');
        catActions.className = 'mf-v48-category-actions';
        if(cells[2]){
          qsa('button, a', cells[2]).forEach(function(action){
            var clone = action.cloneNode(true);
            clone.removeAttribute('style');
            catActions.appendChild(clone);
          });
        }
        catCard.appendChild(catActions);
        cards.appendChild(catCard);
      }
    });

    table.parentNode.insertBefore(cards, table);
    return cards;
  }

  function initCatalog(){
    if(!document.body.classList.contains('mf-page-cardapio')) return;
    document.body.classList.add('mf-v48-catalog');

    var itemPanel = qs('#listaItensV2');
    var categoryPanel = qs('#listaCategoriasV2');
    if(!itemPanel) return;

    var itemTable = qs('table.table', itemPanel);
    var categoryTable = categoryPanel ? qs('table.table', categoryPanel) : null;
    var itemCards = createCatalogCards(itemTable, 'items');
    createCatalogCards(categoryTable, 'categories');

    var hasProduct = itemTable && qsa('tbody tr', itemTable).some(function(row){
      return normalize(row.textContent).indexOf('produto') > -1;
    });
    var pageTitle = qs('.premium-page-title strong');
    if(pageTitle && !hasProduct) pageTitle.textContent = 'Serviços';

    var filterSelect = qs('#filtroCategoriaItens');
    var searchInput = qs('#buscaItensCardapio');
    var filterForm = qs('.filtro-itens-cardapio', itemPanel);

    if(filterSelect && filterForm && !qs('.mf-v48-category-chips', itemPanel)){
      var chips = document.createElement('div');
      chips.className = 'mf-v48-category-chips';
      qsa('option', filterSelect).forEach(function(option, index){
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'mf-v48-category-chip' + (index === 0 ? ' is-active' : '');
        chip.dataset.value = option.value;
        chip.textContent = index === 0 ? 'Todas' : clean(option.textContent);
        chip.addEventListener('click', function(){
          filterSelect.value = chip.dataset.value;
          qsa('.mf-v48-category-chip', chips).forEach(function(c){ c.classList.toggle('is-active', c === chip); });
          filterSelect.dispatchEvent(new Event('change', {bubbles:true}));
          applyCatalogFilter();
        });
        chips.appendChild(chip);
      });
      filterForm.parentNode.insertBefore(chips, filterForm.nextSibling);
    }

    function applyCatalogFilter(){
      if(!itemCards) return;
      var category = normalize(filterSelect ? filterSelect.value : '');
      var term = normalize(searchInput ? searchInput.value : '');
      qsa('.mf-v48-service-card', itemCards).forEach(function(card){
        var categoryOk = !category || card.dataset.category === category;
        var searchOk = !term || card.dataset.search.indexOf(term) > -1;
        card.hidden = !(categoryOk && searchOk);
      });
    }
    if(filterSelect) filterSelect.addEventListener('change', applyCatalogFilter);
    if(searchInput) searchInput.addEventListener('input', applyCatalogFilter);
    applyCatalogFilter();

    var navItems = qs('[data-view-tab="lista"]');
    var navCategories = qs('[data-view-tab="categorias"]');
    var createCategory = qs('#categoriasV2');
    var createItem = qs('#cadastroItemV2');

    function showList(mode){
      if(mode === 'categories'){
        if(itemPanel) itemPanel.classList.add('mf-v48-mobile-hidden');
        if(categoryPanel) categoryPanel.classList.remove('mf-v48-mobile-hidden');
        if(navItems) navItems.classList.remove('active');
        if(navCategories) navCategories.classList.add('active');
      }else{
        if(categoryPanel) categoryPanel.classList.add('mf-v48-mobile-hidden');
        if(itemPanel) itemPanel.classList.remove('mf-v48-mobile-hidden');
        if(navCategories) navCategories.classList.remove('active');
        if(navItems) navItems.classList.add('active');
      }
    }

    if(categoryPanel) categoryPanel.classList.add('mf-v48-mobile-hidden');
    if(createCategory) createCategory.classList.add('mf-v48-create-panel');
    if(createItem) createItem.classList.add('mf-v48-create-panel');

    if(navItems) navItems.addEventListener('click', function(event){ event.preventDefault(); showList('items'); itemPanel.scrollIntoView({behavior:'smooth',block:'start'}); }, true);
    if(navCategories) navCategories.addEventListener('click', function(event){ event.preventDefault(); showList('categories'); categoryPanel.scrollIntoView({behavior:'smooth',block:'start'}); }, true);

    var itemAction = qs('.mf-action-item');
    var categoryAction = qs('.mf-action-category');
    if(itemAction && createItem){
      itemAction.addEventListener('click', function(){
        createItem.classList.add('mf-v48-create-open');
        createItem.scrollIntoView({behavior:'smooth',block:'start'});
      }, true);
    }
    if(categoryAction && createCategory){
      categoryAction.addEventListener('click', function(){
        createCategory.classList.add('mf-v48-create-open');
        createCategory.scrollIntoView({behavior:'smooth',block:'start'});
      }, true);
    }
  }

  function addFinanceList(table, index){
    if(!table || table.dataset.mfV48Ready === '1') return;
    table.dataset.mfV48Ready = '1';
    var headers = qsa('thead th', table).map(function(th){ return clean(th.textContent); });
    var rows = qsa('tbody tr', table);
    var card = table.closest('.card');
    var title = normalize(clean((qs('h2', card) || {}).textContent));
    var list = document.createElement('div');
    list.className = 'mf-v48-finance-list';

    rows.forEach(function(row){
      var cells = qsa('td', row);
      if(!cells.length) return;
      if(cells.length === 1 && cells[0].hasAttribute('colspan')){
        var empty = document.createElement('div');
        empty.className = 'mf-v48-finance-empty';
        empty.textContent = clean(cells[0].textContent);
        list.appendChild(empty);
        return;
      }

      if(title.indexOf('origem dos pedidos') > -1 || title === 'pagamentos'){
        var compact = document.createElement('article');
        compact.className = 'mf-v48-finance-row';
        var first = clean(cells[0] && cells[0].textContent);
        var count = clean(cells[1] && cells[1].textContent);
        var total = clean(cells[2] && cells[2].textContent);
        compact.innerHTML = '<strong>' + escapeHtml(first) + '</strong><span>' + escapeHtml(count) + ' pedido' + (count === '1' ? '' : 's') + '</span><b>' + escapeHtml(total) + '</b>';
        list.appendChild(compact);
      }else{
        var entry = document.createElement('article');
        entry.className = title.indexOf('pedidos finalizados') > -1 ? 'mf-v48-order-card' : 'mf-v48-generic-card';
        cells.forEach(function(cell, cellIndex){
          var field = document.createElement('div');
          field.className = 'mf-v48-finance-field';
          var label = headers[cellIndex] || ('Campo ' + (cellIndex + 1));
          var labelEl = document.createElement('span');
          labelEl.textContent = label;
          var valueEl = document.createElement('div');
          qsa('a, span, strong, i', cell).length ? Array.prototype.slice.call(cell.childNodes).forEach(function(node){ valueEl.appendChild(node.cloneNode(true)); }) : valueEl.appendChild(document.createTextNode(clean(cell.textContent)));
          field.appendChild(labelEl);
          field.appendChild(valueEl);
          entry.appendChild(field);
        });
        list.appendChild(entry);
      }
    });
    table.parentNode.insertBefore(list, table);
  }

  function initFinance(){
    if(!document.body.classList.contains('mf-page-financeiro')) return;
    document.body.classList.add('mf-v48-finance');

    var filter = qs('.v151-filter-card');
    if(filter && !qs('.mf-v48-period-card')){
      var start = qs('input[name="data_inicio"]', filter);
      var end = qs('input[name="data_fim"]', filter);
      var period = document.createElement('div');
      period.className = 'mf-v48-period-card';
      period.innerHTML =
        '<div class="mf-v48-period-icon"><i class="fa-regular fa-calendar"></i></div>' +
        '<div><span>Período selecionado</span><strong>' + escapeHtml(formatDate(start && start.value) || 'Início') + ' → ' + escapeHtml(formatDate(end && end.value) || 'Fim') + '</strong></div>' +
        '<button type="button"><i class="fa-solid fa-sliders"></i><span>Filtros</span></button>';
      filter.parentNode.insertBefore(period, filter);
      qs('button', period).addEventListener('click', function(){
        filter.classList.toggle('mf-v48-filter-open');
        if(filter.classList.contains('mf-v48-filter-open')) filter.scrollIntoView({behavior:'smooth',block:'start'});
      });
    }

    var iconClasses = ['fa-sack-dollar','fa-bag-shopping','fa-chart-column','fa-calculator','fa-cart-shopping','fa-truck','fa-receipt','fa-calendar-days'];
    qsa('.v151-kpi').forEach(function(kpi, index){
      if(qs('.mf-v48-kpi-icon', kpi)) return;
      var icon = document.createElement('span');
      icon.className = 'mf-v48-kpi-icon';
      icon.innerHTML = '<i class="fa-solid ' + iconClasses[index % iconClasses.length] + '"></i>';
      kpi.insertBefore(icon, kpi.firstChild);
    });

    qsa('table.v151-table').forEach(addFinanceList);
  }

  function init(){
    if(!isMobile() || !location.pathname.startsWith('/admin/')) return;
    if(location.pathname.toLowerCase().indexOf('/reservas') > -1){
      document.body.classList.remove('mf-global-mobile-admin');
      return;
    }
    fixBottomNav();
    initDashboard();
    initCatalog();
    initFinance();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* v49 — acabamento final aprovado */
(function(){
  'use strict';
  function mobile(){ return window.matchMedia('(max-width:768px)').matches; }
  function qs(selector, root){ return (root || document).querySelector(selector); }
  function qsa(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function text(node){ return String(node && node.textContent || '').replace(/\s+/g,' ').trim(); }

  function normalizeTrial(parts){
    var datePart = '';
    var statusPart = '';
    parts.forEach(function(part){
      var value = String(part || '').replace(/\s+/g,' ').trim();
      if(!value) return;
      if(/teste\s+at[eé]|vencimento/i.test(value)) datePart = value;
      else statusPart = value;
    });
    statusPart = statusPart.replace(/dia\(s\)/gi,'dias').replace(/\b1 dias\b/gi,'1 dia');
    datePart = datePart.replace(/^teste\s+at[eé]\s*:\s*/i,'até ').replace(/^vencimento\s*:\s*/i,'vence em ');
    return [statusPart,datePart].filter(Boolean).join(' · ');
  }

  function initDashboard(){
    if(!document.body.classList.contains('mf-page-inicio')) return;
    document.body.classList.add('mf-v49-dashboard','mf-v51-dashboard');
    var topbar = qs('.topbar');
    var content = qs('.content');
    if(!topbar || !content) return;

    var title = qs('.top-title strong', topbar);
    if(title) title.textContent = 'Painel';

    var originalActions = qs('.top-actions', topbar);
    var userMenu = originalActions && qs('.dashboard-user-menu', originalActions);
    var userSummary = userMenu && qs('summary', userMenu);
    var avatar = userSummary && qs('.avatar', userSummary);
    var companyName = userSummary && qs('strong', userSummary);
    var role = userSummary && qs('span', userSummary);

    var existingCompany = qs('.mf-v51-header-company', topbar);
    if(existingCompany) existingCompany.remove();
    var existingLogout = qs('.mf-v49-logout', topbar);
    if(existingLogout) existingLogout.remove();
    var existingHeaderMenu = qs('.mf-v53-header-user', topbar);
    if(existingHeaderMenu && existingHeaderMenu !== userMenu) existingHeaderMenu.remove();

    if(userMenu){
      userMenu.classList.add('mf-v53-header-user');
      topbar.appendChild(userMenu);
    }

    if(qs('.mf-v51-dashboard-control-card', content)) return;
    var planTexts = originalActions ? qsa('.plan-pill', originalActions).map(text) : [];
    var trialText = normalizeTrial(planTexts) || 'Plano ativo';

    var control = document.createElement('section');
    control.className = 'mf-v51-dashboard-control-card';

    var topRow = document.createElement('div');
    topRow.className = 'mf-v51-control-top';
    var plan = document.createElement('div');
    plan.className = 'mf-v51-plan-summary';
    plan.innerHTML = '<i class="fa-regular fa-clock"></i><span></span>';
    qs('span', plan).textContent = trialText;
    topRow.appendChild(plan);
    control.appendChild(topRow);

    var actions = document.createElement('div');
    actions.className = 'mf-v51-dashboard-actions';
    var payment = originalActions && qs('.payment-btn', originalActions);
    var support = originalActions && qs('.support-btn', originalActions);
    var copy = originalActions && qs('.copy-menu-btn', originalActions);

    if(payment){
      payment.classList.add('mf-v51-payment-btn');
      payment.innerHTML = '<i class="fa-regular fa-credit-card"></i><span>Plano</span>';
      actions.appendChild(payment);
    }
    if(support) actions.appendChild(support);
    if(copy){
      copy.innerHTML = '<i class="fa-regular fa-copy"></i><span>Link Menu</span>';
      actions.appendChild(copy);
    }
    if(actions.children.length) control.appendChild(actions);
    content.insertBefore(control, content.firstChild);
  }

  function initCatalog(){
    if(!document.body.classList.contains('mf-page-cardapio')) return;
    qsa('.mf-v48-category-chips').forEach(function(chips){ chips.remove(); });
    var modal = qs('#modalEditarItem');
    var card = modal && qs('.modal-editar-card', modal);
    if(card && !qs('.mf-v51-modal-close', card)){
      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'mf-v51-modal-close';
      close.setAttribute('aria-label','Fechar');
      close.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      close.addEventListener('click', function(){
        if(typeof window.fecharEditarItem === 'function') window.fecharEditarItem();
        else modal.classList.remove('ativo');
      });
      card.insertBefore(close, card.firstChild);
    }
  }

  function initFinance(){
    if(!document.body.classList.contains('mf-page-financeiro')) return;
    var title = qs('.premium-page-title strong');
    if(title) title.textContent = 'Financeiro / Caixa';
    var period = qs('.mf-v48-period-card strong');
    if(period && /^in[ií]cio\s*→\s*fim$/i.test(text(period))) period.textContent = 'Todo o período';
  }

  function init(){
    if(!mobile() || !location.pathname.startsWith('/admin/')) return;
    initDashboard();
    initCatalog();
    initFinance();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();


/* v50 — remove botão de menu (três riscos) dos cabeçalhos mobile */
(function(){
  'use strict';
  function mobile(){ return window.matchMedia('(max-width:768px)').matches; }
  function qs(selector, root){ return (root || document).querySelector(selector); }
  function qsa(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  function removeHeaderMenuButtons(){
    qsa('.topbar, .premium-topbar').forEach(function(bar){
      var title = qs('.top-title, .premium-page-title', bar);
      if(!title) return;

      Array.prototype.slice.call(bar.children).forEach(function(child){
        if(child === title) return;
        if(child.classList && (child.classList.contains('top-actions') || child.classList.contains('mf-v49-logout'))) return;
        // remove somente controles avulsos antes do título (botão hamburger / 3 riscos)
        var isBeforeTitle = !!(child.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING);
        if(isBeforeTitle){ child.style.display = 'none'; }
      });

      var directMenu = bar.firstElementChild;
      if(directMenu && directMenu !== title && !(directMenu.classList && (directMenu.classList.contains('top-actions') || directMenu.classList.contains('mf-v49-logout')))){
        directMenu.style.display = 'none';
      }
    });
  }

  function init(){
    if(!mobile() || !location.pathname.startsWith('/admin/')) return;
    removeHeaderMenuButtons();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();


/* v55 — cards do painel como acesso rápido + Agenda no lugar de Ticket médio */
(function(){
  'use strict';
  function mobile(){ return window.matchMedia('(max-width:768px)').matches; }
  function qs(selector, root){ return (root || document).querySelector(selector); }
  function qsa(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  function fallbackHref(suffix){
    var parts = location.pathname.split('/').filter(Boolean);
    var empresaId = parts.length > 1 ? parts[1] : '';
    return empresaId ? ('/admin/' + empresaId + '/' + suffix) : '/admin/';
  }

  function resolveHref(selector, fallback){
    var link = qs(selector);
    return link ? (link.getAttribute('href') || fallback) : fallback;
  }

  function makeQuickAccess(card, href){
    if(!card || !href) return;
    card.dataset.mfV55Quick = '1';
    card.style.cursor = 'pointer';
    card.style.position = 'relative';
    card.setAttribute('role','link');
    if(!card.hasAttribute('tabindex')) card.tabIndex = 0;

    var content = qs('div:last-child', card);
    if(content && !qs('.mf-v55-open-badge', content)){
      var badge = document.createElement('span');
      badge.className = 'mf-v55-open-badge';
      badge.innerHTML = 'Abrir <i class="fa-solid fa-arrow-right"></i>';
      badge.style.display = 'inline-flex';
      badge.style.alignItems = 'center';
      badge.style.gap = '6px';
      badge.style.marginTop = '6px';
      badge.style.fontSize = '11px';
      badge.style.fontWeight = '900';
      badge.style.color = '#667085';
      content.appendChild(badge);
    }

    if(card.dataset.mfV55Bound === '1') return;
    card.dataset.mfV55Bound = '1';
    card.addEventListener('click', function(event){
      if(event.target.closest('a, button, input, select, textarea, label')) return;
      window.location.href = href;
    });
    card.addEventListener('keydown', function(event){
      if(event.key === 'Enter' || event.key === ' '){
        event.preventDefault();
        window.location.href = href;
      }
    });
  }

  function transformAgendaCard(card, href){
    if(!card) return;
    var title = qs('span', card);
    var value = qs('strong', card);
    var detail = qs('small', card);
    var iconWrap = qs('.kpi-icon', card);
    if(title) title.textContent = 'Agenda';
    if(value){
      value.textContent = '';
      value.style.display = 'none';
    }
    if(detail) detail.textContent = 'Ver agenda';
    if(iconWrap){
      iconWrap.classList.remove('purple','green','orange','blue');
      iconWrap.classList.add('blue');
      iconWrap.innerHTML = '<i class="fa-regular fa-calendar-days"></i>';
    }
    makeQuickAccess(card, href);
  }

  function init(){
    if(!mobile() || !location.pathname.startsWith('/admin/')) return;
    if(!document.body.classList.contains('mf-page-inicio')) return;

    var cards = qsa('.kpis .kpi');
    if(cards.length < 4) return;

    var pedidosHref = resolveHref('.quick-grid a[href*="/pedidos"]', fallbackHref('pedidos'));
    var financeiroHref = resolveHref('.quick-grid a[href*="/financeiro"]', fallbackHref('financeiro'));
    var reservasHref = resolveHref('.quick-grid a[href*="/reservas"]', fallbackHref('reservas'));

    makeQuickAccess(cards[0], pedidosHref);
    makeQuickAccess(cards[1], financeiroHref);
    makeQuickAccess(cards[2], reservasHref);
    transformAgendaCard(cards[3], reservasHref);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
