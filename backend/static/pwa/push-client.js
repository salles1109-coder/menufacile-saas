/* MenuFacile Gestor — cliente Web Push v752 */
(function () {
  "use strict";

  const currentPath = window.location.pathname || "";
  if (currentPath.startsWith("/menu/")) return;
  const match = currentPath.match(/^\/admin\/(\d+)(?:\/|$)/);
  if (!match) return;

  const companyId = Number(match[1]);
  const apiBase = `/admin/${companyId}/push`;
  const userAgent = navigator.userAgent || "";
  const isIOS = /iphone|ipad|ipod/i.test(userAgent);
  const isAndroid = /android/i.test(userAgent);
  const isSamsungInternet = /samsungbrowser/i.test(userAgent);
  const isAndroidChrome = isAndroid && /chrome/i.test(userAgent) && !isSamsungInternet && !/edg|opr/i.test(userAgent);
  const supported = window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const backgroundStorageKey = `mf-push-background-test:${companyId}`;
  const localTestStorageKey = `mf-push-local-test:${companyId}`;

  const state = {
    config: null,
    registration: null,
    subscription: null,
    diagnostics: null,
    installed: false,
    busy: false,
    open: false,
    lastSyncAt: "",
    detailsOpen: false,
    lastServerSyncAt: 0,
    syncPromise: null,
    workerVersion: "",
    currentSubscriptionId: null,
    localTestPassed: localStorage.getItem(localTestStorageKey) === "1" || sessionStorage.getItem(localTestStorageKey) === "1",
    backgroundTest: null,
    backgroundResult: null,
    backgroundPollTimer: null
  };

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function base64ToBytes(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(Array.from(raw).map((char) => char.charCodeAt(0)));
  }

  function postPushContextToWorker() {
    if (!state.registration || !state.config || !state.config.public_key) return;
    const message = {
      type: "MF_PUSH_CONTEXT",
      companyId: companyId,
      publicKey: String(state.config.public_key)
    };
    const workers = [
      state.registration.active,
      state.registration.waiting,
      state.registration.installing,
      navigator.serviceWorker.controller
    ];
    const seen = new Set();
    workers.forEach((worker) => {
      if (!worker || seen.has(worker)) return;
      seen.add(worker);
      try { worker.postMessage(message); } catch (error) {}
    });
  }

  async function readWorkerVersion() {
    const worker = state.registration && state.registration.active;
    if (!worker) return "";
    try {
      const channel = new MessageChannel();
      const result = await new Promise((resolve) => {
        const timer = window.setTimeout(() => resolve(null), 1500);
        channel.port1.onmessage = (event) => {
          window.clearTimeout(timer);
          resolve(event.data || null);
        };
        worker.postMessage({ type: "MF_GET_VERSION" }, [channel.port2]);
      });
      state.workerVersion = String(result && result.version || "");
    } catch (error) {
      state.workerVersion = "";
    }
    return state.workerVersion;
  }

  async function ensureLocalSubscription(createWhenGranted) {
    if (!supported || !state.config || !state.config.public_key) return null;
    state.registration = state.registration || await navigator.serviceWorker.ready;
    postPushContextToWorker();
    let subscription = await state.registration.pushManager.getSubscription();
    if (!subscription && createWhenGranted && Notification.permission === "granted") {
      subscription = await state.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToBytes(state.config.public_key)
      });
    }
    state.subscription = subscription;
    return subscription;
  }

  async function persistCurrentSubscription(options) {
    const settings = Object.assign({ full: false, silent: true }, options || {});
    if (state.syncPromise) return state.syncPromise;
    state.syncPromise = (async function () {
      const subscription = await ensureLocalSubscription(true);
      if (!subscription) return null;
      const route = settings.full ? "sync" : "subscribe";
      const response = await fetch(`${apiBase}/${route}`, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON())
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.detail || "Não foi possível sincronizar este aparelho.");
      }
      state.lastServerSyncAt = Date.now();
      state.lastSyncAt = new Date().toISOString();
      if (state.config && Number.isFinite(Number(result.subscriptions))) {
        state.config.subscriptions = Number(result.subscriptions);
      }
      if (Number.isFinite(Number(result.subscription_id))) {
        state.currentSubscriptionId = Number(result.subscription_id);
      }
      if (settings.full && result.device) state.diagnostics = result;
      postPushContextToWorker();
      return result;
    })();
    try {
      return await state.syncPromise;
    } catch (error) {
      if (!settings.silent) throw error;
      console.warn("MenuFacile Push: sincronização automática falhou.", error);
      return null;
    } finally {
      state.syncPromise = null;
    }
  }

  async function repairCurrentDevice(full) {
    if (!supported || Notification.permission !== "granted" || state.busy) return;
    const minimumInterval = full ? 120000 : 600000;
    if (Date.now() - Number(state.lastServerSyncAt || 0) < minimumInterval) return;
    const result = await persistCurrentSubscription({ full: Boolean(full), silent: true });
    if (result && state.open) {
      await loadDeviceStatus();
      render();
    }
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
  fab.innerHTML = '<img src="/static/pwa/icons/icon-192.png?v=744" alt="" aria-hidden="true"><span>Aplicativo e alertas</span><i class="fa-solid fa-bell" aria-hidden="true"></i>';

  const panel = element("section", { id: "mf-push-panel", hidden: true, "aria-label": "Configurar notificações" });
  panel.innerHTML = `
    <div class="mf-push-head">
      <div>
        <h2 class="mf-push-title">MenuFacile Gestor</h2>
        <p class="mf-push-subtitle">Receba alertas de novos pedidos, agendamentos e lembretes neste aparelho.</p>
      </div>
      <button class="mf-push-close" type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="mf-push-status" data-kind="warning">Verificando aplicativo e notificações…</div>
    <div class="mf-push-guide" aria-label="Etapas de configuração">
      <div class="mf-push-step" data-guide-step="install">
        <span class="mf-push-step-number">1</span><div><strong>Instalar o aplicativo</strong><small>Acesso rápido pelo ícone do celular.</small></div><b data-guide-status="install">Verificando…</b>
      </div>
      <div class="mf-push-step" data-guide-step="permission">
        <span class="mf-push-step-number">2</span><div><strong>Ativar notificações</strong><small>Permissão para pedidos e agendamentos.</small></div><b data-guide-status="permission">Verificando…</b>
      </div>
      <div class="mf-push-step" data-guide-step="open-test">
        <span class="mf-push-step-number">3</span><div><strong>Teste com a página aberta</strong><small>Confirma a exibição neste navegador.</small></div><b data-guide-status="open-test">Pendente</b>
      </div>
      <div class="mf-push-step" data-guide-step="background-test">
        <span class="mf-push-step-number">4</span><div><strong>Teste em segundo plano</strong><small>Confirma o aviso sem abrir o MenuFacile.</small></div><b data-guide-status="background-test">Pendente</b>
      </div>
    </div>
    <div class="mf-push-background-box" data-background-box hidden>
      <strong data-background-title>Teste em segundo plano</strong>
      <p data-background-message>Pressione o botão abaixo e siga as instruções.</p>
      <div class="mf-push-background-progress" data-background-progress hidden><span></span></div>
    </div>
    <div class="mf-push-fallback" data-browser-fallback hidden>
      <div><strong>Este navegador não confirmou os avisos em segundo plano.</strong><p>Para não perder pedidos ou agendamentos, abra o MenuFacile pelo Samsung Internet e repita os testes.</p></div>
      <div class="mf-push-fallback-actions">
        <button type="button" data-action="open-samsung" data-primary="true">Abrir no Samsung Internet</button>
        <button type="button" data-action="copy-link">Copiar endereço</button>
      </div>
    </div>
    <div class="mf-push-actions">
      <button type="button" data-action="install" hidden>Instalar aplicativo</button>
      <button type="button" data-action="enable" data-primary="true">Ativar notificações</button>
      <button type="button" data-action="local-test" hidden>Testar com a página aberta</button>
      <button type="button" data-action="background-test" hidden data-primary="true">Testar em segundo plano</button>
      <button type="button" data-action="background-check" hidden>Confirmar que chegou</button>
      <button type="button" data-action="sync" hidden>Verificar e sincronizar agora</button>
      <button type="button" data-action="test" hidden>Testar todos os aparelhos</button>
      <button type="button" data-action="uninstall-help" hidden>Como desinstalar o aplicativo</button>
      <button type="button" data-action="disable" data-danger="true" hidden>Desativar notificações neste aparelho</button>
    </div>
    <p class="mf-push-sync-summary" hidden>Última sincronização: <strong data-summary="sync">—</strong></p>
    <button class="mf-push-details-toggle" type="button" data-action="details" aria-expanded="false">
      <span>Suporte técnico</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
    </button>
    <div class="mf-push-diagnostics" hidden>
      <div><span>Aplicativo</span><strong data-diag="app">Verificando…</strong></div>
      <div><span>Service worker do aparelho</span><strong data-diag="worker">Verificando…</strong></div>
      <div><span>Worker do servidor</span><strong data-diag="server-worker">Verificando…</strong></div>
      <div><span>Aparelhos ativos</span><strong data-diag="devices">—</strong></div>
      <div class="mf-push-diag-wide" style="display:block">
        <span style="display:block;margin-bottom:8px">Teste individual por aparelho</span>
        <div data-device-list style="display:grid;gap:8px"></div>
      </div>
      <div><span>Fila pendente</span><strong data-diag="pending">—</strong></div>
      <div><span>Última sincronização</span><strong data-diag="sync">—</strong></div>
      <div><span>Último envio ao aparelho</span><strong data-diag="success">—</strong></div>
      <div class="mf-push-diag-wide"><span>Último erro</span><strong data-diag="error">Nenhum</strong></div>
      <p class="mf-push-tech-help">A fila segura tenta novamente quando a conexão falha. Use sincronizar caso um aviso não tenha chegado.</p>
    </div>
    <p class="mf-push-help"></p>`;
  document.body.append(panel);

  function setLauncherExpanded(expanded) {
    document.querySelectorAll("[data-mf-push-open]").forEach((launcher) => {
      launcher.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
  }

  function setLauncherState(value) {
    fab.dataset.state = value;
    document.querySelectorAll("[data-mf-push-open]").forEach((launcher) => {
      launcher.dataset.state = value;
    });
  }

  function closeNavigationLayers() {
    document.querySelector(".mf-global-more-sheet")?.classList.remove("is-open");
    document.querySelector("[data-mf-sidebar-close]")?.click();
    document.body.style.overflow = "";
  }

  function openPanel() {
    closeNavigationLayers();
    state.open = true;
    panel.hidden = false;
    setLauncherExpanded(true);
    loadState();
  }

  function closePanel() {
    state.open = false;
    panel.hidden = true;
    setLauncherExpanded(false);
  }

  function bindLaunchers(root) {
    (root || document).querySelectorAll("[data-mf-push-open]").forEach((launcher) => {
      if (launcher.dataset.mfPushBound === "1") return;
      launcher.dataset.mfPushBound = "1";
      launcher.addEventListener("click", function (event) {
        event.preventDefault();
        if (state.open) closePanel();
        else openPanel();
      });
    });
  }

  bindLaunchers(document);
  const launcherObserver = new MutationObserver(function (changes) {
    changes.forEach(function (change) {
      change.addedNodes.forEach(function (node) {
        if (node && node.nodeType === 1) bindLaunchers(node);
      });
    });
  });
  launcherObserver.observe(document.documentElement, { childList: true, subtree: true });

  const statusNode = panel.querySelector(".mf-push-status");
  const helpNode = panel.querySelector(".mf-push-help");
  const diagnosticsNode = panel.querySelector(".mf-push-diagnostics");
  const syncSummaryNode = panel.querySelector(".mf-push-sync-summary");
  const syncSummaryValue = panel.querySelector('[data-summary="sync"]');
  const detailsButton = panel.querySelector('[data-action="details"]');
  const enableButton = panel.querySelector('[data-action="enable"]');
  const disableButton = panel.querySelector('[data-action="disable"]');
  const localTestButton = panel.querySelector('[data-action="local-test"]');
  const testButton = panel.querySelector('[data-action="test"]');
  const installButton = panel.querySelector('[data-action="install"]');
  const syncButton = panel.querySelector('[data-action="sync"]');
  const uninstallHelpButton = panel.querySelector('[data-action="uninstall-help"]');
  const backgroundTestButton = panel.querySelector('[data-action="background-test"]');
  const backgroundCheckButton = panel.querySelector('[data-action="background-check"]');
  const openSamsungButton = panel.querySelector('[data-action="open-samsung"]');
  const copyLinkButton = panel.querySelector('[data-action="copy-link"]');
  const backgroundBox = panel.querySelector('[data-background-box]');
  const backgroundTitle = panel.querySelector('[data-background-title]');
  const backgroundMessage = panel.querySelector('[data-background-message]');
  const backgroundProgress = panel.querySelector('[data-background-progress]');
  const browserFallback = panel.querySelector('[data-browser-fallback]');
  const deviceListNode = panel.querySelector('[data-device-list]');

  function setStatus(text, kind) {
    statusNode.textContent = text;
    statusNode.dataset.kind = kind || "warning";
  }

  function setBusy(busy) {
    state.busy = busy;
    panel.querySelectorAll("button[data-action]").forEach((button) => { button.disabled = busy; });
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    }).format(date);
  }

  function diagnostic(name, text, kind) {
    const node = panel.querySelector(`[data-diag="${name}"]`);
    if (!node) return;
    node.textContent = text;
    if (kind) node.dataset.kind = kind;
    else delete node.dataset.kind;
  }


  function setGuideStatus(name, text, kind) {
    const row = panel.querySelector(`[data-guide-step="${name}"]`);
    const node = panel.querySelector(`[data-guide-status="${name}"]`);
    if (node) node.textContent = text;
    if (row) {
      if (kind) row.dataset.kind = kind;
      else delete row.dataset.kind;
    }
  }

  function browserLabel() {
    if (isSamsungInternet) return "Samsung Internet";
    if (isAndroidChrome) return "Google Chrome";
    if (isIOS) return "Safari";
    return "este navegador";
  }

  function backgroundVerified() {
    const result = state.backgroundResult || {};
    return result.outcome === "verified" || result.verified === true;
  }

  function updateTestButtonLabels() {
    if (localTestButton) localTestButton.textContent = state.localTestPassed ? "Testar novamente com a página aberta" : "Testar com a página aberta";
    if (backgroundTestButton) backgroundTestButton.textContent = backgroundVerified() ? "Testar novamente em segundo plano" : "Testar em segundo plano";
  }

  function saveBackgroundTest() {
    try {
      if (state.backgroundTest) localStorage.setItem(backgroundStorageKey, JSON.stringify(state.backgroundTest));
      else localStorage.removeItem(backgroundStorageKey);
    } catch (error) {}
  }

  function restoreBackgroundTest() {
    try {
      const raw = localStorage.getItem(backgroundStorageKey);
      if (!raw) return;
      const restored = JSON.parse(raw);
      if (!restored || !restored.testId || Date.now() - Number(restored.startedAt || 0) > 15 * 60 * 1000) {
        localStorage.removeItem(backgroundStorageKey);
        return;
      }
      state.backgroundTest = restored;
      state.backgroundResult = { outcome: "waiting" };
    } catch (error) {
      localStorage.removeItem(backgroundStorageKey);
    }
  }

  function renderGuide() {
    setGuideStatus("install", state.installed ? "Concluído" : "Pendente", state.installed ? "success" : "warning");
    const permissionReady = supported && Notification.permission === "granted" && Boolean(state.subscription);
    setGuideStatus("permission", permissionReady ? "Concluído" : (Notification.permission === "denied" ? "Bloqueado" : "Pendente"), permissionReady ? "success" : (Notification.permission === "denied" ? "error" : "warning"));
    setGuideStatus("open-test", state.localTestPassed ? "Verificado" : "Pendente", state.localTestPassed ? "success" : "warning");

    const result = state.backgroundResult || {};
    if (backgroundVerified()) {
      setGuideStatus("background-test", "Verificado", "success");
      backgroundBox.hidden = false;
      backgroundProgress.hidden = true;
      browserFallback.hidden = true;
      backgroundCheckButton.hidden = true;
      if (state.localTestPassed) {
        backgroundTitle.textContent = "Tudo pronto";
        backgroundMessage.textContent = `Este aparelho foi verificado com a página aberta e em segundo plano pelo ${browserLabel()}.`;
      } else {
        backgroundTitle.textContent = "Notificações verificadas em segundo plano";
        backgroundMessage.textContent = `O ${browserLabel()} exibiu o aviso em segundo plano. Faça também o teste com a página aberta.`;
      }
    } else if (["not_verified", "send_failed", "expired"].includes(String(result.outcome || ""))) {
      setGuideStatus("background-test", "Não confirmado", "error");
      backgroundBox.hidden = false;
      backgroundTitle.textContent = "O teste em segundo plano não foi confirmado";
      backgroundMessage.textContent = result.error || "O aviso não apareceu enquanto o MenuFacile estava fora da tela.";
      backgroundProgress.hidden = true;
      browserFallback.hidden = !(isAndroid && !isSamsungInternet);
      backgroundCheckButton.hidden = true;
    } else if (state.backgroundTest) {
      setGuideStatus("background-test", "Em andamento", "warning");
      backgroundBox.hidden = false;
      backgroundTitle.textContent = "Teste em andamento";
      backgroundMessage.textContent = "Vá para a tela inicial, aguarde o aviso, volte ao MenuFacile e toque em Confirmar que chegou.";
      backgroundProgress.hidden = false;
      browserFallback.hidden = true;
      backgroundCheckButton.hidden = false;
    } else {
      setGuideStatus("background-test", "Pendente", "warning");
      backgroundBox.hidden = true;
      browserFallback.hidden = true;
      backgroundCheckButton.hidden = true;
    }
    updateTestButtonLabels();
  }

  async function detectInstalled() {
    let installed = isStandalone();
    const api = window.MenuFacilePWA;
    if (api && typeof api.refreshInstalledState === "function") {
      try { installed = Boolean(await api.refreshInstalledState()) || installed; } catch (error) {}
    } else if (api && typeof api.isInstalled === "function") {
      installed = Boolean(api.isInstalled()) || installed;
    }
    if (!installed && typeof navigator.getInstalledRelatedApps === "function") {
      try {
        const related = await navigator.getInstalledRelatedApps();
        installed = Array.isArray(related) && related.length > 0;
      } catch (error) {}
    }
    state.installed = installed;
    return installed;
  }

  function canInstall() {
    const api = window.MenuFacilePWA;
    return Boolean(api && typeof api.canInstall === "function" && api.canInstall());
  }

  function updateInstallButtons() {
    installButton.hidden = Boolean(state.installed || !canInstall());
    uninstallHelpButton.hidden = !state.installed;
  }

  function renderDeviceTests() {
    if (!deviceListNode) return;
    deviceListNode.textContent = "";
    const devices = Array.isArray(state.config && state.config.devices) ? state.config.devices : [];
    if (!devices.length) {
      deviceListNode.textContent = "Nenhum aparelho registrado.";
      return;
    }
    devices.forEach((device) => {
      const id = Number(device.id || 0);
      if (!id) return;
      const row = element("div", { style: "display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:9px;border:1px solid rgba(15,159,85,.22);border-radius:10px" });
      const info = element("div", { style: "min-width:0;flex:1" });
      const current = id === Number(state.currentSubscriptionId || 0);
      const title = element("strong", { style: "display:block" }, `${String(device.label || `Aparelho ID ${id}`)}${current ? " • ESTE APARELHO" : ""}`);
      const meta = element("small", { style: "display:block;opacity:.72;margin-top:2px" }, `Último envio: ${formatDateTime(device.last_success_at)} • Atualizado: ${formatDateTime(device.updated_at)}`);
      info.append(title, meta);
      const button = element("button", { type: "button", "data-device-test": String(id), style: "white-space:nowrap" }, "Testar só este");
      row.append(info, button);
      deviceListNode.append(row);
    });
  }

  function renderDiagnostics() {
    diagnostic("app", state.installed ? "Instalado" : (canInstall() ? "Disponível para instalar" : "Aberto no navegador"), state.installed ? "success" : "");
    const workerReady = Boolean(state.registration && state.registration.active);
    const workerLabel = workerReady
      ? `Ativo — ${state.workerVersion || "versão não confirmada"}`
      : "Aguardando ativação";
    diagnostic("worker", workerLabel, workerReady && state.workerVersion === "mf-gestor-v752" ? "success" : "warning");
    const serverWorker = state.config && state.config.external_worker ? state.config.external_worker : {};
    const serverWorkerText = serverWorker.online
      ? "Online — independente do aplicativo"
      : (serverWorker.state === "error" ? "Com erro" : "Aguardando serviço do servidor");
    diagnostic("server-worker", serverWorkerText, serverWorker.online ? "success" : "warning");

    const device = state.diagnostics && state.diagnostics.device ? state.diagnostics.device : {};
    const queue = state.diagnostics && state.diagnostics.queue ? state.diagnostics.queue : (state.config && state.config.queue ? state.config.queue : {});
    diagnostic("devices", String(Number(state.config && state.config.subscriptions || 0)), Number(state.config && state.config.subscriptions || 0) > 0 ? "success" : "warning");
    const pending = Number(device.pending ?? queue.pending ?? 0) + Number(device.processing ?? queue.processing ?? 0);
    diagnostic("pending", String(pending), pending > 0 ? "warning" : "success");
    const syncText = state.lastSyncAt ? formatDateTime(state.lastSyncAt) : formatDateTime(device.updated_at);
    diagnostic("sync", syncText);
    diagnostic("success", formatDateTime(device.last_success_at));
    diagnostic("error", device.last_error || "Nenhum", device.last_error ? "error" : "success");
    if(syncSummaryValue) syncSummaryValue.textContent = syncText;
    if(syncSummaryNode) syncSummaryNode.hidden = !(supported && state.subscription && Notification.permission === "granted");
    if(detailsButton){
      detailsButton.hidden = !supported;
      detailsButton.setAttribute("aria-expanded", state.detailsOpen ? "true" : "false");
      const label = detailsButton.querySelector("span");
      if(label) label.textContent = state.detailsOpen ? "Ocultar suporte técnico" : "Suporte técnico";
      const icon = detailsButton.querySelector("i");
      if(icon){
        icon.classList.toggle("fa-chevron-up", state.detailsOpen);
        icon.classList.toggle("fa-chevron-down", !state.detailsOpen);
      }
    }
    if(diagnosticsNode) diagnosticsNode.hidden = !state.detailsOpen;
  }

  function render() {
    updateInstallButtons();
    renderDeviceTests();
    renderDiagnostics();
    renderGuide();

    if (!supported) {
      setStatus("Este navegador não oferece notificações PWA.", "error");
      enableButton.hidden = true;
      syncButton.hidden = true;
      localTestButton.hidden = true;
      backgroundTestButton.hidden = true;
      backgroundCheckButton.hidden = true;
      testButton.hidden = true;
      disableButton.hidden = true;
      helpNode.textContent = "Use o aplicativo no Android, iPhone ou um navegador moderno no computador.";
      setLauncherState("off");
      return;
    }
    if (isIOS && !isStandalone()) {
      setStatus("Instale o aplicativo para ativar notificações no iPhone.", "warning");
      enableButton.hidden = true;
      syncButton.hidden = true;
      localTestButton.hidden = true;
      backgroundTestButton.hidden = true;
      backgroundCheckButton.hidden = true;
      testButton.hidden = true;
      disableButton.hidden = true;
      helpNode.textContent = "No Safari, toque em Compartilhar → Adicionar à Tela de Início. Depois abra pelo ícone do MenuFacile.";
      setLauncherState("off");
      return;
    }
    if (!state.config || !state.config.ready) {
      setStatus("O servidor ainda não terminou a configuração das notificações.", "error");
      enableButton.hidden = true;
      syncButton.hidden = true;
      localTestButton.hidden = true;
      backgroundTestButton.hidden = true;
      backgroundCheckButton.hidden = true;
      testButton.hidden = true;
      disableButton.hidden = true;
      helpNode.textContent = "Confirme a dependência Web Push no servidor e reinicie o serviço.";
      setLauncherState("off");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("Notificações bloqueadas neste aparelho.", "error");
      enableButton.hidden = true;
      syncButton.hidden = true;
      localTestButton.hidden = true;
      backgroundTestButton.hidden = true;
      backgroundCheckButton.hidden = true;
      testButton.hidden = true;
      disableButton.hidden = true;
      helpNode.textContent = "Abra as configurações do navegador ou do aplicativo e permita notificações para o MenuFacile.";
      setLauncherState("off");
      return;
    }
    if (state.subscription && Notification.permission === "granted") {
      const allTestsPassed = state.localTestPassed && backgroundVerified();
      setStatus(allTestsPassed ? "Tudo pronto: notificações verificadas neste aparelho." : "Notificações ativas neste aparelho.", "success");
      enableButton.hidden = true;
      syncButton.hidden = false;
      localTestButton.hidden = false;
      backgroundTestButton.hidden = false;
      testButton.hidden = false;
      disableButton.hidden = false;
      helpNode.textContent = allTestsPassed ? "Este aparelho está preparado para receber pedidos e agendamentos com o MenuFacile em segundo plano." : "";
      setLauncherState("on");
      updateTestButtonLabels();
      return;
    }
    setStatus("Notificações desativadas neste aparelho.", "warning");
    enableButton.hidden = false;
    syncButton.hidden = true;
    localTestButton.hidden = true;
    backgroundTestButton.hidden = true;
    backgroundCheckButton.hidden = true;
    testButton.hidden = true;
    disableButton.hidden = true;
    helpNode.textContent = "A ativação precisa ser feita uma vez em cada celular ou computador.";
    setLauncherState("off");
  }

  async function loadDeviceStatus() {
    if (!state.subscription) {
      state.diagnostics = { device: null, queue: state.config && state.config.queue ? state.config.queue : {} };
      return;
    }
    try {
      const response = await fetch(`${apiBase}/status`, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: state.subscription.endpoint })
      });
      if (!response.ok) throw new Error("status");
      state.diagnostics = await response.json();
    } catch (error) {
      console.warn("MenuFacile Push: diagnóstico indisponível.", error);
    }
  }

  async function loadState() {
    try {
      await detectInstalled();
      const response = await fetch(`${apiBase}/config`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("config");
      state.config = await response.json();
      state.registration = await navigator.serviceWorker.ready;
      await readWorkerVersion();
      postPushContextToWorker();
      state.subscription = await state.registration.pushManager.getSubscription();

      // Se a permissão já foi concedida, o aparelho se repara e se registra
      // automaticamente. Assim o Push continua funcionando com o app fechado.
      if (Notification.permission === "granted") {
        await persistCurrentSubscription({ full: true, silent: true });
        const refreshed = await fetch(`${apiBase}/config`, { cache: "no-store", credentials: "same-origin" });
        if (refreshed.ok) state.config = await refreshed.json();
      }
      await loadDeviceStatus();
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
      await ensureLocalSubscription(true);
      await persistCurrentSubscription({ full: true, silent: false });
      await loadDeviceStatus();
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
      state.diagnostics = null;
      render();
    } catch (error) {
      setStatus("Não foi possível desativar neste momento.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function syncPush() {
    if (state.busy || Notification.permission !== "granted") return;
    setBusy(true);
    try {
      setStatus("Verificando aplicativo, assinatura e fila…", "warning");
      const api = window.MenuFacilePWA;
      if (api && typeof api.update === "function") await api.update();
      await persistCurrentSubscription({ full: true, silent: false });
      await loadDeviceStatus();
      await detectInstalled();
      setStatus("Aplicativo, notificações e lembretes sincronizados.", "success");
      helpNode.textContent = "Este aparelho foi renovado e os lembretes futuros foram conferidos agora.";
      render();
    } catch (error) {
      console.error("MenuFacile Push: sincronização falhou.", error);
      setStatus("Não foi possível concluir a sincronização.", "error");
      helpNode.textContent = String(error && error.message ? error.message : "Atualize a página e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function testLocalNotification() {
    if (state.busy || Notification.permission !== "granted") return;
    setBusy(true);
    try {
      state.registration = state.registration || await navigator.serviceWorker.ready;
      const code = String(Date.now()).slice(-6);
      const localTag = `mf-local-v752-${Date.now()}`;
      await state.registration.showNotification(`🔔 Teste local MenuFacile v752 • ${code}`, {
        body: "Notificação Android completa: som, vibração, ícone, pop-up e tela bloqueada.",
        icon: "/static/pwa/icons/icon-192.png?v=749",
        badge: "/static/pwa/icons/favicon-32.png?v=749",
        tag: localTag,
        renotify: true,
        silent: false,
        requireInteraction: true,
        vibrate: [300, 120, 300, 120, 500],
        data: { url: `/admin/${companyId}`, event: "teste_local", test_id: code }
      });
      const visible = await state.registration.getNotifications({ tag: localTag }).catch(() => []);
      state.localTestPassed = true;
      localStorage.setItem(localTestStorageKey, "1");
      sessionStorage.setItem(localTestStorageKey, "1");
      setStatus(`Teste com a página aberta verificado (${Array.isArray(visible) ? visible.length : 0} aviso visível).`, "success");
      helpNode.textContent = "Agora faça o teste em segundo plano para confirmar que o navegador acorda sem o MenuFacile aberto.";
      renderGuide();
    } catch (error) {
      console.error("MenuFacile Push: teste local falhou.", error);
      setStatus("O Android não conseguiu exibir o teste local.", "error");
      helpNode.textContent = String(error && error.message ? error.message : "Falha ao chamar showNotification().");
    } finally {
      setBusy(false);
    }
  }

  async function postBackgroundClientStage(stage, useBeacon) {
    if (!state.backgroundTest || !state.backgroundTest.testId) return null;
    const payload = {
      test_id: String(state.backgroundTest.testId),
      stage: String(stage),
      client_at: new Date().toISOString()
    };
    const url = `${apiBase}/background-test/client-stage`;
    if (useBeacon && navigator.sendBeacon) {
      try {
        const sent = navigator.sendBeacon(url, new Blob([JSON.stringify(payload)], { type: "application/json" }));
        if (sent) return null;
      } catch (error) {}
    }
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.detail || "Não foi possível registrar a etapa do teste.");
    return result;
  }

  async function checkBackgroundTest(attempt) {
    if (!state.backgroundTest || !state.backgroundTest.testId) return;
    const tries = Number(attempt || 0);
    try {
      const response = await fetch(`${apiBase}/background-test/status?test_id=${encodeURIComponent(state.backgroundTest.testId)}`, {
        cache: "no-store",
        credentials: "same-origin"
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.detail || "Resultado indisponível.");
      state.backgroundResult = result;
      renderGuide();
      if (result.outcome === "verified") {
        saveBackgroundTest();
        setStatus(state.localTestPassed ? "Tudo pronto: notificações verificadas neste aparelho." : "Notificações verificadas em segundo plano.", "success");
        helpNode.textContent = state.localTestPassed
          ? "Este aparelho está pronto para receber pedidos e agendamentos sem o MenuFacile aberto."
          : "Faça também o teste com a página aberta para concluir a verificação.";
        render();
        return;
      }
      if (["not_verified", "send_failed", "expired"].includes(String(result.outcome || ""))) {
        setStatus("O navegador não confirmou o teste em segundo plano.", "warning");
        helpNode.textContent = isAndroidChrome
          ? "Use o botão Abrir no Samsung Internet para criar uma nova assinatura e repetir os testes."
          : "Teste novamente. Se continuar falhando, use outro navegador compatível neste aparelho.";
        return;
      }
      if (tries < 28 && state.backgroundTest.resumedAt) {
        window.clearTimeout(state.backgroundPollTimer);
        state.backgroundPollTimer = window.setTimeout(() => checkBackgroundTest(tries + 1), 2000);
      }
    } catch (error) {
      if (tries < 5) {
        state.backgroundPollTimer = window.setTimeout(() => checkBackgroundTest(tries + 1), 2500);
      } else {
        setStatus("Ainda não foi possível consultar o resultado do teste.", "warning");
      }
    }
  }

  async function startBackgroundTest() {
    if (state.busy || Notification.permission !== "granted") return;
    setBusy(true);
    try {
      setStatus("Preparando o teste em segundo plano…", "warning");
      await persistCurrentSubscription({ full: true, silent: false });
      const subscriptionId = Number(state.currentSubscriptionId || 0);
      if (!subscriptionId) throw new Error("Não foi possível identificar este aparelho.");
      const response = await fetch(`${apiBase}/background-test/start`, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id: subscriptionId, delay_seconds: 12 })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.detail || "Não foi possível iniciar o teste.");
      state.backgroundTest = {
        testId: String(result.test_id),
        subscriptionId,
        startedAt: Date.now(),
        sendAt: String(result.send_at || ""),
        hiddenAt: 0,
        resumedAt: 0
      };
      state.backgroundResult = { outcome: "waiting" };
      saveBackgroundTest();
      setStatus("Teste agendado. Vá agora para a tela inicial do celular.", "warning");
      helpNode.textContent = "Pressione o botão Home do Android, aguarde a notificação e depois volte ao MenuFacile. Não feche o navegador nos aplicativos recentes.";
      renderGuide();
    } catch (error) {
      setStatus("Não foi possível iniciar o teste em segundo plano.", "error");
      helpNode.textContent = String(error && error.message ? error.message : "Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  function openSamsungInternet() {
    const fallback = "https://play.google.com/store/apps/details?id=com.sec.android.app.sbrowser";
    const target = `${location.host}${location.pathname}${location.search}`;
    const intent = `intent://${target}#Intent;scheme=${location.protocol.replace(":", "")};package=com.sec.android.app.sbrowser;S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
    window.location.href = intent;
  }

  async function copyCurrentAddress() {
    const value = window.location.href;
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Endereço do MenuFacile copiado.", "success");
      helpNode.textContent = "Abra o Samsung Internet, cole o endereço e faça login.";
    } catch (error) {
      window.prompt("Copie este endereço e abra no Samsung Internet:", value);
    }
  }

  async function testPush(subscriptionId, deviceLabel) {
    if (state.busy) return;
    setBusy(true);
    try {
      const targetId = Number(subscriptionId || 0);
      setStatus(targetId ? `Enviando somente para ${deviceLabel || `aparelho ID ${targetId}`}…` : "Sincronizando e enviando para todos os aparelhos…", "warning");
      if (!targetId) await persistCurrentSubscription({ full: true, silent: false });
      const response = await fetch(`${apiBase}/test`, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(targetId ? { subscription_id: targetId } : {})
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.detail || "teste");
      const sent = Number(result.sent || 0);
      const testId = String(result.test_id || "");
      const shortCode = testId ? testId.slice(-6) : "";
      if (targetId) {
        setStatus(`Teste #${shortCode || "—"} enviado somente para o aparelho ID ${targetId}.`, "success");
        helpNode.textContent = "Não abra o aparelho testado. O journal mostrará received e shown com o mesmo ID.";
      } else {
        const eligible = Number(result.eligible || result.targets || sent);
        setStatus(`Teste enviado para ${sent} de ${eligible} aparelhos.`, result.complete ? "success" : "warning");
        helpNode.textContent = "Para descobrir exatamente qual celular respondeu, use Testar só este na lista técnica.";
      }
      window.setTimeout(async function () { await loadDeviceStatus(); renderDiagnostics(); }, 1200);
    } catch (error) {
      setStatus("O teste não pôde ser enviado.", "error");
      helpNode.textContent = String(error && error.message ? error.message : "Falha no teste individual.");
    } finally {
      setBusy(false);
    }
  }

  async function installApp() {
    const api = window.MenuFacilePWA;
    if (!api) return;
    setBusy(true);
    try {
      const result = await api.install();
      if (result && result.accepted) {
        state.installed = true;
        setStatus("Aplicativo instalado neste aparelho.", "success");
      } else if (result && result.available) {
        helpNode.textContent = "A instalação foi cancelada. Você pode tentar novamente quando desejar.";
      }
      await detectInstalled();
      updateInstallButtons();
      renderDiagnostics();
    } finally {
      setBusy(false);
    }
  }

  function showUninstallHelp() {
    if (isIOS) {
      helpNode.textContent = "Para desinstalar: mantenha pressionado o ícone MenuFacile na Tela de Início e toque em Remover App.";
    } else {
      helpNode.textContent = "Para desinstalar: mantenha pressionado o ícone MenuFacile e escolha Desinstalar. Em alguns aparelhos: abra o app → menu ⋮ → Desinstalar aplicativo.";
    }
    setStatus("A desinstalação é feita pelo próprio aparelho.", "warning");
  }

  detailsButton.addEventListener("click", function(){
    state.detailsOpen = !state.detailsOpen;
    renderDiagnostics();
  });
  panel.querySelector(".mf-push-close").addEventListener("click", closePanel);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && state.open) closePanel();
  });
  enableButton.addEventListener("click", enablePush);
  disableButton.addEventListener("click", disablePush);
  syncButton.addEventListener("click", syncPush);
  localTestButton.addEventListener("click", testLocalNotification);
  backgroundTestButton.addEventListener("click", startBackgroundTest);
  backgroundCheckButton.addEventListener("click", async function () {
    if (state.backgroundTest && !state.backgroundTest.hiddenAt) {
      setStatus("Primeiro vá para a tela inicial do celular.", "warning");
      helpNode.textContent = "Pressione Home, aguarde o aviso e só depois volte ao MenuFacile.";
      return;
    }
    if (state.backgroundTest && !state.backgroundTest.resumedAt) {
      state.backgroundTest.resumedAt = Date.now();
      saveBackgroundTest();
      await postBackgroundClientStage("resumed", false).catch(() => null);
    }
    setStatus("Confirmando o aviso recebido…", "warning");
    await postBackgroundClientStage("confirmed", false).catch(() => null);
    await checkBackgroundTest(0);
  });
  openSamsungButton.addEventListener("click", openSamsungInternet);
  copyLinkButton.addEventListener("click", copyCurrentAddress);
  testButton.addEventListener("click", function () { testPush(null, ""); });
  if (deviceListNode) {
    deviceListNode.addEventListener("click", function (event) {
      const button = event.target && event.target.closest ? event.target.closest("[data-device-test]") : null;
      if (!button) return;
      const id = Number(button.getAttribute("data-device-test") || 0);
      const label = button.parentElement && button.parentElement.querySelector("strong") ? button.parentElement.querySelector("strong").textContent : "";
      if (id) testPush(id, label);
    });
  }
  installButton.addEventListener("click", installApp);
  uninstallHelpButton.addEventListener("click", showUninstallHelp);
  window.addEventListener("mf:pwa-install-available", async function () { await detectInstalled(); updateInstallButtons(); renderDiagnostics(); });
  window.addEventListener("mf:pwa-installed", async function () { state.installed = true; updateInstallButtons(); renderDiagnostics(); });
  window.addEventListener("mf:pwa-ready", loadState, { once: true });
  window.addEventListener("online", function () { repairCurrentDevice(true); });
  window.addEventListener("focus", function () { repairCurrentDevice(true); });
  document.addEventListener("visibilitychange", function () {
    if (state.backgroundTest) {
      if (document.visibilityState === "hidden" && !state.backgroundTest.hiddenAt) {
        state.backgroundTest.hiddenAt = Date.now();
        saveBackgroundTest();
        postBackgroundClientStage("background", true).catch(() => null);
      } else if (document.visibilityState === "visible" && state.backgroundTest.hiddenAt && !state.backgroundTest.resumedAt) {
        state.backgroundTest.resumedAt = Date.now();
        saveBackgroundTest();
        postBackgroundClientStage("resumed", false)
          .catch(() => null)
          .finally(() => checkBackgroundTest(0));
      }
    }
    if (document.visibilityState === "visible") repairCurrentDevice(true);
  });
  window.setInterval(function () { repairCurrentDevice(false); }, 10 * 60 * 1000);

  restoreBackgroundTest();
  window.addEventListener("pageshow", function () {
    if (state.backgroundTest && state.backgroundTest.hiddenAt && !state.backgroundTest.resumedAt) {
      state.backgroundTest.resumedAt = Date.now();
      saveBackgroundTest();
      window.setTimeout(function () {
        postBackgroundClientStage("resumed", false).catch(() => null).finally(() => checkBackgroundTest(0));
      }, 500);
    } else if (state.backgroundTest) {
      window.setTimeout(() => checkBackgroundTest(0), 700);
    }
  });

  if (navigator.serviceWorker && navigator.serviceWorker.controller) loadState();
  else window.addEventListener("load", function () { setTimeout(loadState, 700); }, { once: true });
})();
