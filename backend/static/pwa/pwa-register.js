/* MenuFacile Gestor PWA v932 */
(function () {
  "use strict";

  const path = window.location.pathname || "";
  const enabled = path === "/" || path === "/login" || path.startsWith("/admin/") || path.startsWith("/funcionario/");
  if (!enabled) return;

  function standaloneMode() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  const state = {
    installPrompt: null,
    registration: null,
    installed: standaloneMode()
  };

  async function refreshInstalledState() {
    let installed = standaloneMode();
    if (!installed && typeof navigator.getInstalledRelatedApps === "function") {
      try {
        const related = await navigator.getInstalledRelatedApps();
        installed = Array.isArray(related) && related.length > 0;
      } catch (error) {}
    }
    state.installed = installed;
    return installed;
  }

  window.MenuFacilePWA = {
    isInstalled: function () { return Boolean(state.installed || standaloneMode()); },
    refreshInstalledState: refreshInstalledState,
    canInstall: function () { return Boolean(state.installPrompt && !state.installed); },
    install: async function () {
      if (!state.installPrompt || state.installed) return { available: false, accepted: false, installed: state.installed };
      const prompt = state.installPrompt;
      state.installPrompt = null;
      prompt.prompt();
      const choice = await prompt.userChoice;
      const accepted = Boolean(choice && choice.outcome === "accepted");
      if (accepted) state.installed = true;
      window.dispatchEvent(new CustomEvent("mf:pwa-install-result", { detail: { accepted: accepted } }));
      return { available: true, accepted: accepted, installed: state.installed };
    },
    update: async function () {
      if (!state.registration) return false;
      await state.registration.update();
      return true;
    },
    getRegistration: function () { return state.registration; }
  };

  refreshInstalledState().then(function () {
    window.dispatchEvent(new CustomEvent("mf:pwa-install-state", { detail: { installed: state.installed } }));
  });

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    state.installed = false;
    state.installPrompt = event;
    window.dispatchEvent(new CustomEvent("mf:pwa-install-available"));
  });

  window.addEventListener("appinstalled", function () {
    state.installed = true;
    state.installPrompt = null;
    window.dispatchEvent(new CustomEvent("mf:pwa-installed"));
  });

  window.matchMedia("(display-mode: standalone)").addEventListener?.("change", function () {
    refreshInstalledState().then(function () {
      window.dispatchEvent(new CustomEvent("mf:pwa-install-state", { detail: { installed: state.installed } }));
    });
  });

  if (!("serviceWorker" in navigator)) return;
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (!hadController) {
      hadController = true;
      return;
    }
    const key = "mf-pwa-controller-v932";
    if (sessionStorage.getItem(key) === "1") return;
    sessionStorage.setItem(key, "1");
    window.location.reload();
  });

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
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", function () {
          if (worker.state === "installed" && navigator.serviceWorker.controller) announceUpdate(worker);
        });
      });

      refreshInstalledState().finally(function () {
        window.dispatchEvent(new CustomEvent("mf:pwa-ready", { detail: { registration: registration } }));
      });
    }).catch(function (error) {
      console.warn("MenuFacile PWA: não foi possível registrar o service worker.", error);
    });
  }, { once: true });
})();
