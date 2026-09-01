document.addEventListener('DOMContentLoaded', function(){
  var body = document.body;
  var sidebar = document.querySelector('[data-mf-admin-sidebar]');
  if (!sidebar) return;

  var overlay = document.querySelector('[data-mf-sidebar-overlay]');
  var closeButton = sidebar.querySelector('[data-mf-sidebar-close]');
  var collapseButton = sidebar.querySelector('[data-mf-sidebar-collapse]');
  var toggles = Array.from(document.querySelectorAll('.mf-menu-toggle, .mf-sidebar-toggle, [data-mobile-nav-toggle]'));

  function ensureMobileToggle(){
    if (toggles.length) return;
    var topbar = document.querySelector('.topbar, .premium-topbar, .pp-topbar, .delivery-topbar');
    if (!topbar) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'mf-sidebar-toggle';
    button.setAttribute('aria-label', 'Abrir menu');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<i class="fa-solid fa-bars"></i>';
    topbar.insertBefore(button, topbar.firstChild);
    toggles.push(button);
  }

  function setMobileNavOpen(open){
    body.classList.toggle('admin-mobile-nav-open', open);
    toggles.forEach(function(button){
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    if (overlay) overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  var companyMatch = String(window.location.pathname || '').match(/^\/admin\/(\d+)/);
  var collapseStorageKey = 'mf-admin-sidebar-collapsed:' + (companyMatch ? companyMatch[1] : 'global');

  function syncCollapsedLabels(collapsed){
    sidebar.querySelectorAll('.mf-admin-nav-link').forEach(function(link){
      var span = link.querySelector('span');
      var label = span ? String(span.textContent || '').trim() : '';
      if (!label) return;
      if (collapsed) {
        link.setAttribute('title', label);
        if (!link.getAttribute('aria-label')) link.setAttribute('aria-label', label);
      } else {
        link.removeAttribute('title');
        if (link.getAttribute('aria-label') === label) link.removeAttribute('aria-label');
      }
    });
    if (collapseButton) {
      collapseButton.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
      collapseButton.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Recolher menu');
      collapseButton.setAttribute('title', collapsed ? 'Expandir menu' : 'Recolher menu');
    }
  }

  function setCollapsed(collapsed, persist){
    body.classList.toggle('mf-sidebar-collapsed', !!collapsed);
    syncCollapsedLabels(!!collapsed);
    if (persist !== false) {
      try { localStorage.setItem(collapseStorageKey, collapsed ? '1' : '0'); } catch (error) {}
    }
  }

  try { setCollapsed(localStorage.getItem(collapseStorageKey) === '1', false); } catch (error) { setCollapsed(false, false); }

  ensureMobileToggle();

  toggles.forEach(function(button){
    button.addEventListener('click', function(){
      if (window.innerWidth <= 900) {
        setMobileNavOpen(!body.classList.contains('admin-mobile-nav-open'));
      } else {
        setCollapsed(!body.classList.contains('mf-sidebar-collapsed'));
      }
    });
  });

  if (collapseButton) collapseButton.addEventListener('click', function(){ if (window.innerWidth > 900) setCollapsed(!body.classList.contains('mf-sidebar-collapsed')); });

  if (closeButton) closeButton.addEventListener('click', function(){ setMobileNavOpen(false); });
  if (overlay) overlay.addEventListener('click', function(){ setMobileNavOpen(false); });

  var storageKey = 'mf-admin-sidebar-scroll';
  try {
    var savedScroll = Number(sessionStorage.getItem(storageKey) || 0);
    if (savedScroll > 0) sidebar.scrollTop = savedScroll;
  } catch (error) {}

  sidebar.querySelectorAll('a').forEach(function(link){
    link.addEventListener('click', function(){
      try { sessionStorage.setItem(storageKey, String(sidebar.scrollTop || 0)); } catch (error) {}
      if (window.innerWidth <= 900) setMobileNavOpen(false);
    });
  });

  sidebar.addEventListener('scroll', function(){
    try { sessionStorage.setItem(storageKey, String(sidebar.scrollTop || 0)); } catch (error) {}
  }, { passive: true });

  document.addEventListener('keydown', function(event){
    if (event.key === 'Escape' && body.classList.contains('admin-mobile-nav-open')) setMobileNavOpen(false);
  });

  window.addEventListener('resize', function(){
    if (window.innerWidth > 900) setMobileNavOpen(false);
  });
});
