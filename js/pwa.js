// Service worker registration (only on http(s), not file://) -----------------
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW registration failed:", err));
  });
}

// "Install app" button ---------------------------------------------------
let deferredInstallPrompt = null;

function buildInstallButton() {
  const btn = document.createElement("button");
  btn.id = "pwa-install-btn";
  btn.className = "btn btn-outline-light btn-sm";
  btn.textContent = "Install app";
  btn.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:80;box-shadow:0 8px 20px rgba(0,0,0,.25);background:#1f3d1a;";
  btn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    btn.remove();
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  });
  document.body.appendChild(btn);
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (!document.getElementById("pwa-install-btn")) buildInstallButton();
});

window.addEventListener("appinstalled", () => {
  const btn = document.getElementById("pwa-install-btn");
  if (btn) btn.remove();
  deferredInstallPrompt = null;
});
