/* MenuFacile Gestor — cliente Web Push v719 */
(function () {
  "use strict";

  const currentPath = window.location.pathname || "";
  if (currentPath.startsWith("/menu/")) return;
  const match = currentPath.match(/^\/admin\/(\d+)(?:\/|$)/);
  if (!match) return;
  const companyId = Number(match[1]);
  const apiBase = `/admin/${companyId}/push`;
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent || "");
  const supported = window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  const state = {
    config: null,
    registration: null,
    subscription: null,
    busy: false,
    open: false
  };

  function base64ToBytes(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(Array.from(raw).map((char) => char.charCodeAt(0)));
  }

  function element(tag, attrs, text) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (key === "class") node.className = value;
      else if (key === "hidden") node.hidden = Boolean(value);
      else node.setAttribute(key, value);
    });
    if (text != null) node.textContent = text;
    return node;
  }

  const fab = element("button", { id: "mf-push-fab", type: "button", "aria-label": "Aplicativo e notificações", "aria-expanded": "false", "data-state": "off" });
  fab.innerHTML = '<img src="/static/pwa/icons/icon-192.png?v=719" alt="" aria-hidden="true"><span>App e alertas</span><i class="fa-solid fa-bell" aria-hidden="true"></i>';
  const panel = element("section", { id: "mf-push-panel", hidden: true, "aria-label": "Configurar notificações" });
  panel.innerHTML = `
    <div class="mf-push-head">
      <div>
        <h2 class="mf-push-title">MenuFacile Gestor</h2>
        <p class="mf-push-subtitle">Receba alertas de novos pedidos e agendamentos neste aparelho.</p>
      </div>
      <button class="mf-push-close" type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="mf-push-status" data-kind="warning">Verificando notificações…</div>
    <div class="mf-push-actions">
      <button type="button" data-action="install" hidden>Instalar aplicativo</button>
      <button type="button" data-action="enable" data-primary="true">Ativar notificações</button>
      <button type="button" data-action="test" hidden>Enviar notificação de teste</button>
      <button type="button" data-action="disable" data-danger="true" hidden>Desativar neste aparelho</button>
    </div>
    <p class="mf-push-help"></p>`;
  document.body.append(fab, panel);

  function openPanel() {
    state.open = true;
    panel.hidden = false;
    fab.setAttribute("aria-expanded", "true");
    loadState();
  }

  function installMoreEntry() {
    const grid = document.querySelector(".mf-global-more-grid");
    if (!grid || grid.querySelector("[data-mf-push-more]")) return Boolean(grid);
    const entry = document.createElement("a");
    entry.href = "#";
    entry.setAttribute("data-mf-push-more", "1");
    entry.className = "mf-push-more-entry";
    entry.innerHTML = '<img src="/static/pwa/icons/icon-192.png?v=719" alt=""><span>Aplicativo e alertas</span>';
    entry.addEventListener("click", function (event) {
      event.preventDefault();
      document.querySelector(".mf-global-more-sheet")?.classList.remove("is-open");
      document.body.style.overflow = "";
      openPanel();
    });
    grid.prepend(entry);
    return true;
  }
  if (!installMoreEntry()) {
    const moreObserver = new MutationObserver(function () {
      if (installMoreEntry()) moreObserver.disconnect();
    });
    moreObserver.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { moreObserver.disconnect(); }, 8000);
  }

  const statusNode = panel.querySelector(".mf-push-status");
  const helpNode = panel.querySelector(".mf-push-help");
  const enableButton = panel.querySelector('[data-action="enable"]');
  const disableButton = panel.querySelector('[data-action="disable"]');
  const testButton = panel.querySelector('[data-action="test"]');
  const installButton = panel.querySelector('[data-action="install"]');

  function setStatus(text, kind) {
    statusNode.textContent = text;
    statusNode.dataset.kind = kind || "warning";
  }

  function setBusy(busy) {
    state.busy = busy;
    panel.querySelectorAll("button[data-action]").forEach((button) => { button.disabled = busy; });
  }

  function updateInstallButton() {
    const api = window.MenuFacilePWA;
    installButton.hidden = Boolean(isStandalone || !api || !api.canInstall());
  }

  function render() {
    updateInstallButton();
    if (!supported) {
      setStatus("Este navegador não oferece notificações PWA.", "error");
      enableButton.hidden = true;
      testButton.hidden = true;
      disableButton.hidden = true;
      helpNode.textContent = "Use o app instalado no Android, iPhone ou um navegador moderno no computador.";
      fab.dataset.state = "off";
      return;
    }
    if (isIOS && !isStandalone) {
      setStatus("Instale o app para ativar no iPhone.", "warning");
      enableButton.hidden = true;
      testButton.hidden = true;
      disableButton.hidden = true;
      helpNode.textContent = "No Safari, toque em Compartilhar → Adicionar à Tela de Início. Depois abra pelo ícone do MenuFacile.";
      fab.dataset.state = "off";
      return;
    }
    if (!state.config || !state.config.ready) {
      setStatus("O servidor ainda não terminou a configuração das notificações.", "error");
      enableButton.hidden = true;
      testButton.hidden = true;
      disableButton.hidden = true;
      helpNode.textContent = "Confirme a instalação da dependência Web Push no servidor e reinicie o serviço.";
      fab.dataset.state = "off";
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("Notificações bloqueadas neste aparelho.", "error");
      enableButton.hidden = true;
      testButton.hidden = true;
      disableButton.hidden = true;
      helpNode.textContent = "Abra as configurações do navegador ou do aplicativo e permita notificações para o MenuFacile.";
      fab.dataset.state = "off";
      return;
    }
    if (state.subscription && Notification.permission === "granted") {
      setStatus("Notificações ativas neste aparelho.", "success");
      enableButton.hidden = true;
      testButton.hidden = false;
      disableButton.hidden = false;
      helpNode.textContent = "Novos pedidos e agendamentos ficam em uma fila segura e são reenviados automaticamente se a conexão falhar.";
      fab.dataset.state = "on";
      return;
    }
    setStatus("Notificações desativadas neste aparelho.", "warning");
    enableButton.hidden = false;
    testButton.hidden = true;
    disableButton.hidden = true;
    helpNode.textContent = "A ativação precisa ser feita uma vez em cada celular ou computador.";
    fab.dataset.state = "off";
  }

  async function loadState() {
    try {
      const response = await fetch(`${apiBase}/config`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("config");
      state.config = await response.json();
      state.registration = await navigator.serviceWorker.ready;
      state.subscription = await state.registration.pushManager.getSubscription();
      render();
    } catch (error) {
      console.warn("MenuFacile Push: falha ao carregar configuração.", error);
      state.config = { ready: false };
      render();
    }
  }

  async function enablePush() {
    if (state.busy || !state.config || !state.config.public_key) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        render();
        return;
      }
      state.registration = state.registration || await navigator.serviceWorker.ready;
      state.subscription = await state.registration.pushManager.getSubscription();
      if (!state.subscription) {
        state.subscription = await state.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToBytes(state.config.public_key)
        });
      }
      const response = await fetch(`${apiBase}/subscribe`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.subscription.toJSON())
      });
      if (!response.ok) throw new Error("Não foi possível registrar este aparelho.");
      render();
    } catch (error) {
      console.error("MenuFacile Push: ativação falhou.", error);
      setStatus("Não foi possível ativar as notificações.", "error");
      helpNode.textContent = "Atualize a página e tente novamente. Verifique também se o site está em HTTPS.";
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    if (state.busy || !state.subscription) return;
    setBusy(true);
    try {
      const endpoint = state.subscription.endpoint;
      await fetch(`${apiBase}/unsubscribe`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint })
      });
      await state.subscription.unsubscribe();
      state.subscription = null;
      render();
    } catch (error) {
      setStatus("Não foi possível desativar neste momento.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function testPush() {
    if (state.busy) return;
    setBusy(true);
    try {
      setStatus("Enviando teste…", "warning");
      const response = await fetch(`${apiBase}/test`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.detail || "teste");
      setStatus("Teste enviado. A notificação deve chegar em instantes.", "success");
    } catch (error) {
      setStatus("O teste não pôde ser enviado.", "error");
      helpNode.textContent = "Confirme a dependência Web Push e a conexão do servidor.";
    } finally {
      setBusy(false);
    }
  }

  async function installApp() {
    const api = window.MenuFacilePWA;
    if (!api) return;
    setBusy(true);
    try { await api.install(); } finally { setBusy(false); updateInstallButton(); }
  }

  fab.addEventListener("click", function () {
    if (state.open) {
      state.open = false;
      panel.hidden = true;
      fab.setAttribute("aria-expanded", "false");
    } else {
      openPanel();
    }
  });
  panel.querySelector(".mf-push-close").addEventListener("click", function () {
    state.open = false;
    panel.hidden = true;
    fab.setAttribute("aria-expanded", "false");
  });
  enableButton.addEventListener("click", enablePush);
  disableButton.addEventListener("click", disablePush);
  testButton.addEventListener("click", testPush);
  installButton.addEventListener("click", installApp);
  window.addEventListener("mf:pwa-install-available", updateInstallButton);
  window.addEventListener("mf:pwa-installed", updateInstallButton);
  window.addEventListener("mf:pwa-ready", loadState, { once: true });

  if (navigator.serviceWorker && navigator.serviceWorker.controller) loadState();
  else window.addEventListener("load", function () { setTimeout(loadState, 700); }, { once: true });
})();
