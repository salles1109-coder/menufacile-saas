/* MenuFacile Gestor — diagnóstico comparativo de aparelhos v750 */
(function () {
  "use strict";

  const path = window.location.pathname || "";
  const match = path.match(/^\/admin\/(\d+)(?:\/|$)/);
  if (!match) return;
  const companyId = Number(match[1]);
  const apiBase = `/admin/${companyId}/push`;
  let latestReports = [];

  function waitForPanel() {
    return new Promise((resolve) => {
      const existing = document.querySelector("#mf-push-panel");
      if (existing) return resolve(existing);
      const observer = new MutationObserver(() => {
        const panel = document.querySelector("#mf-push-panel");
        if (panel) {
          observer.disconnect();
          resolve(panel);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      window.setTimeout(() => { observer.disconnect(); resolve(null); }, 12000);
    });
  }

  function base64ToBytes(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(Array.from(raw).map((char) => char.charCodeAt(0)));
  }

  async function jsonFetch(url, options) {
    const response = await fetch(url, Object.assign({ cache: "no-store", credentials: "same-origin" }, options || {}));
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.detail || `Falha HTTP ${response.status}`);
    return data;
  }

  async function safe(call, fallback) {
    try { return await call(); } catch (error) { return fallback; }
  }

  function displayMode() {
    const modes = ["standalone", "fullscreen", "minimal-ui", "browser"];
    return modes.find((mode) => window.matchMedia(`(display-mode: ${mode})`).matches) || "desconhecido";
  }

  async function collectReport(registration, subscription, subscriptionId) {
    const uaData = navigator.userAgentData || null;
    const highEntropy = uaData && typeof uaData.getHighEntropyValues === "function"
      ? await safe(() => uaData.getHighEntropyValues([
          "architecture", "bitness", "formFactors", "fullVersionList", "model",
          "platformVersion", "uaFullVersion", "wow64"
        ]), {})
      : {};
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    const battery = typeof navigator.getBattery === "function" ? await safe(() => navigator.getBattery(), null) : null;
    const storageEstimate = navigator.storage && navigator.storage.estimate ? await safe(() => navigator.storage.estimate(), {}) : {};
    const storagePersisted = navigator.storage && navigator.storage.persisted ? await safe(() => navigator.storage.persisted(), null) : null;
    const relatedApps = typeof navigator.getInstalledRelatedApps === "function" ? await safe(() => navigator.getInstalledRelatedApps(), []) : [];
    const notificationPermissionApi = navigator.permissions && navigator.permissions.query
      ? await safe(async () => (await navigator.permissions.query({ name: "notifications" })).state, "indisponível")
      : "indisponível";
    const visibleNotifications = registration && registration.getNotifications
      ? await safe(() => registration.getNotifications(), []) : [];
    let pushPermission = "indisponível";
    if (registration && registration.pushManager && registration.pushManager.permissionState) {
      const config = await safe(() => jsonFetch(`${apiBase}/config`), {});
      if (config.public_key) {
        pushPermission = await safe(() => registration.pushManager.permissionState({
          userVisibleOnly: true,
          applicationServerKey: base64ToBytes(String(config.public_key))
        }), "erro");
      }
    }
    const active = registration && registration.active;
    const controller = navigator.serviceWorker && navigator.serviceWorker.controller;
    const endpointHost = subscription && subscription.endpoint ? await safe(() => new URL(subscription.endpoint).host, "inválido") : "";
    const brands = uaData && Array.isArray(uaData.brands) ? uaData.brands : [];
    const fullVersions = Array.isArray(highEntropy.fullVersionList) ? highEntropy.fullVersionList : [];
    const chromeEntry = fullVersions.find((item) => /Google Chrome|Chromium/i.test(String(item.brand || ""))) || {};

    return {
      schema: "menufacile-device-diagnostic-v750",
      collected_at: new Date().toISOString(),
      subscription_id: Number(subscriptionId || 0),
      browser: {
        user_agent: String(navigator.userAgent || ""),
        brands: brands,
        full_version_list: fullVersions,
        full_version: String(chromeEntry.version || highEntropy.uaFullVersion || ""),
        vendor: String(navigator.vendor || ""),
        language: String(navigator.language || ""),
        languages: Array.from(navigator.languages || []),
        cookies_enabled: Boolean(navigator.cookieEnabled),
        online: Boolean(navigator.onLine)
      },
      device: {
        android: /android/i.test(String(navigator.userAgent || "")),
        mobile: Boolean(uaData ? uaData.mobile : /mobile/i.test(String(navigator.userAgent || ""))),
        platform: String((uaData && uaData.platform) || navigator.platform || ""),
        platform_version: String(highEntropy.platformVersion || ""),
        model: String(highEntropy.model || ""),
        form_factors: Array.isArray(highEntropy.formFactors) ? highEntropy.formFactors : [],
        architecture: String(highEntropy.architecture || ""),
        bitness: String(highEntropy.bitness || ""),
        wow64: Boolean(highEntropy.wow64),
        hardware_concurrency: Number(navigator.hardwareConcurrency || 0),
        device_memory_gb: Number(navigator.deviceMemory || 0),
        max_touch_points: Number(navigator.maxTouchPoints || 0)
      },
      pwa: {
        display_mode: displayMode(),
        standalone: window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
        related_apps: Array.isArray(relatedApps) ? relatedApps : [],
        related_apps_count: Array.isArray(relatedApps) ? relatedApps.length : 0,
        document_visibility: String(document.visibilityState || ""),
        document_was_discarded: Boolean(document.wasDiscarded)
      },
      service_worker: {
        supported: "serviceWorker" in navigator,
        scope: String(registration && registration.scope || ""),
        update_via_cache: String(registration && registration.updateViaCache || ""),
        active_state: String(active && active.state || ""),
        active_script: String(active && active.scriptURL || ""),
        controller_state: String(controller && controller.state || ""),
        controller_script: String(controller && controller.scriptURL || "")
      },
      push: {
        notification_permission: typeof Notification !== "undefined" ? String(Notification.permission || "") : "indisponível",
        permissions_api: String(notificationPermissionApi || ""),
        push_permission_state: String(pushPermission || ""),
        has_subscription: Boolean(subscription),
        endpoint_host: endpointHost,
        expiration_time: subscription ? subscription.expirationTime : null,
        visible_notifications: Array.isArray(visibleNotifications) ? visibleNotifications.length : null,
        visible_tags: Array.isArray(visibleNotifications) ? visibleNotifications.map((item) => String(item.tag || "")).slice(0, 15) : []
      },
      network: connection ? {
        effective_type: String(connection.effectiveType || ""),
        type: String(connection.type || ""),
        downlink_mbps: Number(connection.downlink || 0),
        rtt_ms: Number(connection.rtt || 0),
        save_data: Boolean(connection.saveData)
      } : null,
      battery: battery ? {
        charging: Boolean(battery.charging),
        level_percent: Math.round(Number(battery.level || 0) * 100),
        charging_time: Number(battery.chargingTime),
        discharging_time: Number(battery.dischargingTime)
      } : null,
      storage: {
        persisted: storagePersisted,
        usage_mb: storageEstimate.usage ? Math.round(storageEstimate.usage / 1048576) : null,
        quota_mb: storageEstimate.quota ? Math.round(storageEstimate.quota / 1048576) : null
      },
      screen: {
        width: Number(screen.width || 0),
        height: Number(screen.height || 0),
        avail_width: Number(screen.availWidth || 0),
        avail_height: Number(screen.availHeight || 0),
        pixel_ratio: Number(window.devicePixelRatio || 1),
        color_depth: Number(screen.colorDepth || 0),
        orientation: String(screen.orientation && screen.orientation.type || "")
      },
      capabilities: {
        notification: typeof Notification !== "undefined",
        push_manager: "PushManager" in window,
        background_sync: Boolean(registration && registration.sync),
        periodic_sync: Boolean(registration && registration.periodicSync),
        badging: typeof navigator.setAppBadge === "function",
        wake_lock: Boolean(navigator.wakeLock),
        share: typeof navigator.share === "function",
        installed_related_apps: typeof navigator.getInstalledRelatedApps === "function"
      },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ""
    };
  }

  function flatten(value, prefix, output) {
    output = output || {};
    prefix = prefix || "";
    if (value === null || typeof value !== "object") {
      output[prefix] = value;
      return output;
    }
    if (Array.isArray(value)) {
      output[prefix] = JSON.stringify(value);
      return output;
    }
    Object.keys(value).sort().forEach((key) => {
      const next = prefix ? `${prefix}.${key}` : key;
      flatten(value[key], next, output);
    });
    return output;
  }

  const ignoredPaths = new Set([
    "collected_at", "subscription_id", "browser.online", "pwa.document_visibility",
    "push.visible_notifications", "push.visible_tags", "battery.level_percent",
    "battery.charging_time", "battery.discharging_time", "storage.usage_mb",
    "screen.orientation"
  ]);

  function compareReports(left, right) {
    const a = flatten(left.report || {});
    const b = flatten(right.report || {});
    const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).sort();
    return keys.filter((key) => !ignoredPaths.has(key) && JSON.stringify(a[key]) !== JSON.stringify(b[key]))
      .map((key) => ({ key: key, left: a[key], right: b[key] }));
  }

  function textValue(value) {
    if (value === undefined) return "—";
    if (typeof value === "string") return value || "—";
    return JSON.stringify(value);
  }

  function renderReports(container, reports, notice) {
    latestReports = Array.isArray(reports) ? reports : [];
    container.textContent = "";
    const info = document.createElement("p");
    info.style.cssText = "margin:0 0 10px;font-size:12px;line-height:1.4;opacity:.78";
    info.textContent = notice || "Compare os relatórios gerados nos dois celulares.";
    container.append(info);

    const available = latestReports.filter((item) => item && item.report);
    if (!available.length) {
      const empty = document.createElement("p");
      empty.textContent = "Ainda não há diagnóstico. Abra o painel em cada celular e toque em Diagnosticar este aparelho.";
      empty.style.cssText = "margin:0;font-size:13px";
      container.append(empty);
      return;
    }

    available.forEach((item) => {
      const report = item.report || {};
      const card = document.createElement("div");
      card.style.cssText = "margin:7px 0;padding:9px;border:1px solid rgba(75,36,139,.18);border-radius:10px;background:#fff";
      const device = report.device || {};
      const browser = report.browser || {};
      const pwa = report.pwa || {};
      const push = report.push || {};
      card.innerHTML = `<strong>${String(item.label || `ID ${item.subscription_id}`)}</strong><br>` +
        `<small>Coletado: ${String(item.collected_at || "—")}<br>` +
        `Modelo: ${String(device.model || "não exposto pelo navegador")} • Android: ${String(device.platform_version || "—")}<br>` +
        `Chrome: ${String(browser.full_version || "—")} • Modo: ${String(pwa.display_mode || "—")}<br>` +
        `Push: ${String(push.notification_permission || "—")} / ${String(push.push_permission_state || "—")} • SW: ${String((report.service_worker || {}).active_state || "—")}</small>`;
      container.append(card);
    });

    const androidReports = available.filter((item) => item.report && item.report.device && item.report.device.android);
    const pair = androidReports.length >= 2 ? androidReports.slice(0, 2) : available.slice(0, 2);
    if (pair.length === 2) {
      const differences = compareReports(pair[0], pair[1]);
      const title = document.createElement("strong");
      title.style.cssText = "display:block;margin:12px 0 6px";
      title.textContent = `Diferenças: ID ${pair[0].subscription_id} × ID ${pair[1].subscription_id}`;
      container.append(title);
      if (!differences.length) {
        const same = document.createElement("p");
        same.style.cssText = "margin:0;font-size:13px";
        same.textContent = "Nenhuma diferença relevante foi exposta pela Web. Nesse caso, a diferença provavelmente está em uma configuração interna do Android/Samsung que o navegador não permite ler.";
        container.append(same);
      } else {
        const list = document.createElement("div");
        list.style.cssText = "display:grid;gap:5px";
        differences.slice(0, 30).forEach((diff) => {
          const row = document.createElement("div");
          row.style.cssText = "padding:6px;border-radius:8px;background:rgba(75,36,139,.05);font-size:11px;overflow-wrap:anywhere";
          row.innerHTML = `<strong>${diff.key}</strong><br>ID ${pair[0].subscription_id}: ${textValue(diff.left)}<br>ID ${pair[1].subscription_id}: ${textValue(diff.right)}`;
          list.append(row);
        });
        container.append(list);
      }
    }
  }

  async function syncAndGetCurrentDevice() {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) throw new Error("Este aparelho não possui assinatura Push ativa.");
    const result = await jsonFetch(`${apiBase}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON())
    });
    return { registration: registration, subscription: subscription, subscriptionId: Number(result.subscription_id || 0) };
  }

  async function init() {
    const panel = await waitForPanel();
    if (!panel || panel.dataset.mfDiagnosticV750 === "1") return;
    panel.dataset.mfDiagnosticV750 = "1";
    const actions = panel.querySelector(".mf-push-actions");
    const diagnostics = panel.querySelector(".mf-push-diagnostics");
    if (!actions || !diagnostics) return;

    const diagnoseButton = document.createElement("button");
    diagnoseButton.type = "button";
    diagnoseButton.textContent = "Diagnosticar este aparelho";
    diagnoseButton.dataset.mfDeviceDiagnostic = "collect";
    actions.append(diagnoseButton);

    const block = document.createElement("div");
    block.className = "mf-push-diag-wide";
    block.style.display = "block";
    block.innerHTML = `
      <span style="display:block;margin-bottom:8px">Comparação técnica dos celulares</span>
      <div data-mf-device-report style="display:block"></div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px">
        <button type="button" data-mf-device-diagnostic="refresh">Atualizar comparação</button>
        <button type="button" data-mf-device-diagnostic="copy">Copiar relatório</button>
      </div>`;
    diagnostics.append(block);
    const reportNode = block.querySelector("[data-mf-device-report]");

    async function refresh() {
      reportNode.textContent = "Carregando diagnósticos…";
      try {
        const result = await jsonFetch(`${apiBase}/diagnostics`);
        renderReports(reportNode, result.reports, result.notice);
      } catch (error) {
        reportNode.textContent = `Não foi possível carregar: ${error.message || error}`;
      }
    }

    diagnoseButton.addEventListener("click", async () => {
      diagnoseButton.disabled = true;
      diagnoseButton.textContent = "Analisando este aparelho…";
      try {
        const current = await syncAndGetCurrentDevice();
        const report = await collectReport(current.registration, current.subscription, current.subscriptionId);
        const result = await jsonFetch(`${apiBase}/diagnostic`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription_id: current.subscriptionId, report: report })
        });
        renderReports(reportNode, result.reports, result.notice);
        diagnoseButton.textContent = `Diagnóstico salvo — ID ${current.subscriptionId}`;
      } catch (error) {
        diagnoseButton.textContent = "Falha no diagnóstico — tentar novamente";
        reportNode.textContent = String(error && error.message ? error.message : error);
      } finally {
        diagnoseButton.disabled = false;
      }
    });

    block.querySelector('[data-mf-device-diagnostic="refresh"]').addEventListener("click", refresh);
    block.querySelector('[data-mf-device-diagnostic="copy"]').addEventListener("click", async () => {
      const text = JSON.stringify(latestReports, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        reportNode.insertAdjacentHTML("afterbegin", '<p style="margin:0 0 6px;color:#087b44"><strong>Relatório copiado.</strong></p>');
      } catch (error) {
        window.prompt("Copie o relatório abaixo:", text);
      }
    });

    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
