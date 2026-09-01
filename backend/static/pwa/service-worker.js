/* MenuFacile Gestor PWA v932
   Política segura: HTML administrativo, APIs, pedidos, agenda e uploads nunca
   são armazenados. O service worker recebe Web Push diretamente do servidor. */
const MF_VERSION = "mf-gestor-v932";
const MF_STATIC_CACHE = `${MF_VERSION}-static`;
const MF_OFFLINE_URL = "/static/pwa/offline.html";

const MF_PUSH_CONTEXT_CACHE = "mf-push-context-v1";
const MF_PUSH_CONTEXT_URL = "/__mf_push_context__";

function mfBase64ToBytes(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(Array.from(raw).map((char) => char.charCodeAt(0)));
}

async function mfSavePushContext(context) {
  const companyId = Number(context && context.companyId);
  const publicKey = String(context && context.publicKey || "");
  if (!Number.isInteger(companyId) || companyId <= 0 || !publicKey) return;
  const cache = await caches.open(MF_PUSH_CONTEXT_CACHE);
  const request = new Request(new URL(MF_PUSH_CONTEXT_URL, self.location.origin).href);
  await cache.put(request, new Response(JSON.stringify({ companyId, publicKey }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  }));
}

async function mfLoadPushContext() {
  const cache = await caches.open(MF_PUSH_CONTEXT_CACHE);
  const request = new Request(new URL(MF_PUSH_CONTEXT_URL, self.location.origin).href);
  const response = await cache.match(request);
  if (!response) return null;
  try { return await response.json(); } catch (error) { return null; }
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "MF_PUSH_CONTEXT") {
    event.waitUntil(mfSavePushContext(data));
    return;
  }
  if (data.type === "MF_GET_VERSION" && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: MF_VERSION });
  }
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    const context = await mfLoadPushContext();
    if (!context || !context.companyId || !context.publicKey) return;

    let subscription = event.newSubscription || await self.registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: mfBase64ToBytes(context.publicKey)
      });
    }

    const payload = subscription.toJSON();
    payload.mf_reconcile = true;
    const response = await fetch(`/admin/${Number(context.companyId)}/push/subscribe`, {
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Falha ao renovar assinatura Push: ${response.status}`);
  })());
});

const MF_CORE = [
  MF_OFFLINE_URL,
  "/static/pwa/icons/icon-192.png?v=749",
  "/static/pwa/icons/icon-512.png?v=749",
  "/static/pwa/icons/icon-maskable-512.png?v=749",
  "/static/pwa/icons/apple-touch-icon-180.png?v=749",
  "/static/pwa/icons/whatsapp-action-96.png?v=749"
];

async function mfWarmCoreCache() {
  const cache = await caches.open(MF_STATIC_CACHE);
  await Promise.allSettled(MF_CORE.map(async (url) => {
    try {
      const response = await fetch(url, { cache: "reload" });
      if (response && response.ok) await cache.put(url, response.clone());
    } catch (error) {
      // Um ícone opcional ausente nunca deve impedir a ativação do worker Push.
    }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await mfWarmCoreCache();
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith("mf-gestor-") && key !== MF_STATIC_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function isAdminNavigation(url) {
  return url.pathname === "/login" ||
    url.pathname.startsWith("/admin/") ||
    url.pathname.startsWith("/funcionario/");
}

function canStore(response) {
  if (!response || !response.ok || response.type !== "basic") return false;
  const control = String(response.headers.get("cache-control") || "").toLowerCase();
  return !control.includes("no-store") && !control.includes("private");
}

async function networkFirstStatic(request) {
  const cache = await caches.open(MF_STATIC_CACHE);
  try {
    const response = await fetch(request, { cache: "no-cache" });
    if (canStore(response)) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirstPwa(request) {
  const cache = await caches.open(MF_STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (canStore(response)) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Nunca guardar HTML autenticado. Offline mostra apenas uma tela neutra.
  if (request.mode === "navigate" && isAdminNavigation(url)) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .catch(() => caches.match(MF_OFFLINE_URL))
    );
    return;
  }

  // APIs e endpoints PWA dinâmicos sempre usam a rede e nunca entram no cache.
  if (url.pathname.includes("/push/") || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/static/pwa/")) {
    event.respondWith(cacheFirstPwa(request));
    return;
  }

  // Uploads podem conter dados dos clientes; não entram no cache do PWA.
  if (url.pathname.startsWith("/static/") && !url.pathname.startsWith("/static/uploads/")) {
    event.respondWith(networkFirstStatic(request));
  }
});

async function mfConfirmPushStage(payload, stage, extra) {
  try {
    const context = await mfLoadPushContext();
    if (!context || !context.companyId) return;
    const subscription = await self.registration.pushManager.getSubscription();
    if (!subscription || !subscription.endpoint) return;
    await fetch(`/admin/${Number(context.companyId)}/push/displayed`, {
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({
        endpoint: subscription.endpoint,
        delivery_id: payload.delivery_id || null,
        event: String(payload.event || ""),
        tag: String(payload.tag || ""),
        test_id: String(payload.test_id || ""),
        stage: String(stage || "shown"),
        worker_version: MF_VERSION,
        client_at: new Date().toISOString()
      }, extra || {}))
    });
  } catch (error) {
    // O ACK é diagnóstico e nunca pode impedir a notificação.
  }
}

function mfBuildNotificationOptions(payload) {
  const whatsappUrl = String(payload.whatsapp_url || "");
  const data = {
    url: String(payload.url || "/login?pwa=1"),
    whatsapp_url: whatsappUrl,
    event: String(payload.event || ""),
    entity_id: payload.entity_id || null,
    delivery_id: payload.delivery_id || null,
    test_id: String(payload.test_id || ""),
    sent_at: String(payload.sent_at || "")
  };
  const tag = String(payload.tag || `mf-${Date.now()}`);
  const sentTimestamp = Date.parse(String(payload.sent_at || ""));

  // v752: o teste remoto também confirma se a exibição ocorreu antes do app voltar.
  // v750: o teste remoto usa uma notificação Android completa. A v746/v748
  // comprovou que o Push chegava e showNotification() resolvia, mas o alerta
  // não era apresentado em dois celulares. Ícone, badge, vibração e
  // persistência agora são usados também no teste individual.
  if (payload.diagnostic_full === true || payload.diagnostic_simple === true || data.event === "teste") {
    return {
      body: String(payload.body || "Teste Android completo em segundo plano."),
      icon: "/static/pwa/icons/icon-192.png?v=749",
      badge: "/static/pwa/icons/favicon-32.png?v=932",
      tag,
      renotify: true,
      silent: false,
      requireInteraction: true,
      vibrate: [300, 120, 300, 120, 500],
      data
    };
  }

  const actions = [];
  if (whatsappUrl) {
    actions.push({
      action: "whatsapp",
      title: String(payload.whatsapp_label || "Lembrar pelo WhatsApp"),
      icon: "/static/pwa/icons/whatsapp-action-96.png?v=749"
    });
  }
  const eventName = String(data.event || "");
  const openLabel = String(payload.open_label || "").trim() || (
    eventName.startsWith("encomenda")
      ? "Abrir encomendas"
      : (eventName.startsWith("pedido") ? "Abrir pedidos" : "Abrir agenda")
  );
  actions.push({ action: "open", title: openLabel });

  const companyLogo = String(payload.company_logo || "").trim();
  const eventBody = String(payload.body || "Você recebeu uma nova atualização.").trim();
  return {
    // V933: nome/logo identificam a empresa; o corpo fica somente com o evento.
    // Ignorar company_slogan também limpa notificações já enfileiradas na V932.
    body: eventBody,
    icon: companyLogo || "/static/pwa/icons/icon-192.png?v=932",
    badge: "/static/pwa/icons/favicon-32.png?v=932",
    tag,
    renotify: true,
    silent: false,
    requireInteraction: true,
    timestamp: Number.isFinite(sentTimestamp) ? sentTimestamp : Date.now(),
    vibrate: [220, 90, 220, 90, 300],
    data,
    actions
  };
}

function mfDelay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function mfCheckNotificationStillVisible(payload, tag, delayMs, stage) {
  await mfDelay(delayMs);
  let visibleCount = null;
  try {
    const visible = await self.registration.getNotifications({ tag });
    visibleCount = Array.isArray(visible) ? visible.length : null;
  } catch (error) {}
  await mfConfirmPushStage(payload, stage, { visible_count: visibleCount });
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { body: event.data ? event.data.text() : "Nova atualização no MenuFacile." };
  }

  event.waitUntil((async () => {
    const eventTitle = String(payload.title || "Atualização").trim();
    const companyName = String(payload.company_name || payload.company || "").trim();
    const title = companyName ? `${companyName} • ${eventTitle}` : eventTitle;
    const options = mfBuildNotificationOptions(payload);
    const receivedAck = mfConfirmPushStage(payload, "received");

    await self.registration.showNotification(title, options);

    let visibleCount = null;
    try {
      const visible = await self.registration.getNotifications({ tag: options.tag });
      visibleCount = Array.isArray(visible) ? visible.length : null;
    } catch (error) {}

    if (typeof self.registration.setAppBadge === "function" && String(payload.event || "") !== "teste") {
      try { await self.registration.setAppBadge(); } catch (error) {}
    }

    const checks = [
      receivedAck,
      mfConfirmPushStage(payload, "shown", { visible_count: visibleCount })
    ];
    if (String(payload.event || "") === "teste") {
      checks.push(mfCheckNotificationStillVisible(payload, options.tag, 2500, "visible_2s"));
      checks.push(mfCheckNotificationStillVisible(payload, options.tag, 8000, "visible_8s"));
    }
    await Promise.allSettled(checks);
  })());
});

self.addEventListener("notificationclose", (event) => {
  const data = event.notification && event.notification.data || {};
  event.waitUntil(mfConfirmPushStage({
    delivery_id: data.delivery_id || null,
    event: data.event || "",
    test_id: data.test_id || "",
    tag: event.notification && event.notification.tag || ""
  }, "closed"));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const whatsappTarget = String(data.whatsapp_url || "");
  const localTarget = new URL(data.url || "/login?pwa=1", self.location.origin).href;
  const target = event.action === "whatsapp" && whatsappTarget ? whatsappTarget : localTarget;

  event.waitUntil((async () => {
    if (event.action === "whatsapp" && whatsappTarget) {
      if (clients.openWindow) await clients.openWindow(target);
    } else {
      const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        if ("navigate" in client) await client.navigate(target);
        if ("focus" in client) {
          await client.focus();
          break;
        }
      }
      if (!windows.length && clients.openWindow) await clients.openWindow(target);
    }
    if (typeof self.registration.clearAppBadge === "function") {
      try { await self.registration.clearAppBadge(); } catch (error) {}
    }
    await mfConfirmPushStage({
      delivery_id: data.delivery_id || null,
      event: data.event || "",
      test_id: data.test_id || "",
      tag: event.notification.tag || ""
    }, "clicked");
  })());
});
