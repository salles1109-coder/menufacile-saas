/* MenuFacile Gestor PWA v720
   Política segura: HTML administrativo, APIs, pedidos, agenda e uploads nunca
   são armazenados. O service worker recebe Web Push diretamente do servidor. */
const MF_VERSION = "mf-gestor-v720";
const MF_STATIC_CACHE = `${MF_VERSION}-static`;
const MF_OFFLINE_URL = "/static/pwa/offline.html";
const MF_CORE = [
  MF_OFFLINE_URL,
  "/static/pwa/icons/icon-192.png?v=717",
  "/static/pwa/icons/icon-512.png?v=717",
  "/static/pwa/icons/icon-maskable-512.png?v=717",
  "/static/pwa/icons/apple-touch-icon-180.png?v=717",
  "/static/pwa/icons/whatsapp-action-96.png?v=720"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(MF_STATIC_CACHE)
      .then((cache) => cache.addAll(MF_CORE))
      .then(() => self.skipWaiting())
  );
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

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { body: event.data ? event.data.text() : "Nova atualização no MenuFacile." };
  }

  const title = String(payload.title || "MenuFacile Gestor");
  const whatsappUrl = String(payload.whatsapp_url || "");
  const actions = [];
  if (whatsappUrl) {
    actions.push({
      action: "whatsapp",
      title: String(payload.whatsapp_label || "Lembrar pelo WhatsApp"),
      icon: "/static/pwa/icons/whatsapp-action-96.png?v=720"
    });
  }
  actions.push({ action: "open", title: "Abrir agenda" });

  const options = {
    body: String(payload.body || "Você recebeu uma nova atualização."),
    icon: "/static/pwa/icons/icon-192.png?v=717",
    badge: "/static/pwa/icons/favicon-32.png?v=717",
    tag: String(payload.tag || `mf-${Date.now()}`),
    renotify: false,
    silent: false,
    vibrate: [180, 90, 180],
    data: {
      url: String(payload.url || "/login?pwa=1"),
      whatsapp_url: whatsappUrl,
      event: String(payload.event || ""),
      entity_id: payload.entity_id || null
    },
    actions
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(async () => {
      if (typeof self.registration.setAppBadge === "function") {
        try { await self.registration.setAppBadge(); } catch (error) {}
      }
    })
  );
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
  })());
});
