/* MenuFacile Gestor PWA v717 */
(function () {
  "use strict";

  const path = window.location.pathname || "";
  const enabled = path === "/login" || path.startsWith("/admin/") || path.startsWith("/funcionario/");
  if (!enabled) return;

  const state = {
    installPrompt: null,
    registration: null,
    installed: window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true
  };

  window.MenuFacilePWA = {
    isInstalled: function () { return state.installed; },
    canInstall: function () { return Boolean(state.installPrompt); },
    install: async function () {
      if (!state.installPrompt) return { available: false, accepted: false };
      const prompt = state.installPrompt;
      state.installPrompt = null;
      prompt.prompt();
      const choice = await prompt.userChoice;
      const accepted = choice && choice.outcome === "accepted";
      window.dispatchEvent(new CustomEvent("mf:pwa-install-result", { detail: { accepted: accepted } }));
      return { available: true, accepted: accepted };
    },
    update: async function () {
      if (!state.registration) return false;
      await state.registration.update();
      return true;
    }
  };

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    state.installPrompt = event;
    window.dispatchEvent(new CustomEvent("mf:pwa-install-available"));
  });

  window.addEventListener("appinstalled", function () {
    state.installed = true;
    state.installPrompt = null;
    window.dispatchEvent(new CustomEvent("mf:pwa-installed"));
  });

  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/service-worker.js", {
      scope: "/",
      updateViaCache: "none"
    }).then(function (registration) {
      state.registration = registration;
      registration.update().catch(function () {});

      function announceUpdate(worker) {
        if (!worker) return;
        window.dispatchEvent(new CustomEvent("mf:pwa-update-available", { detail: { registration: registration } }));
      }
      if (registration.waiting && navigator.serviceWorker.controller) announceUpdate(registration.waiting);
      registration.addEventListener("updatefound", function () {
        var worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", function () {
          if (worker.state === "installed" && navigator.serviceWorker.controller) announceUpdate(worker);
        });
      });

      window.dispatchEvent(new CustomEvent("mf:pwa-ready", { detail: { registration: registration } }));
    }).catch(function (error) {
      console.warn("MenuFacile PWA: não foi possível registrar o service worker.", error);
    });
  }, { once: true });
})();
