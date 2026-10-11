// Service worker registration (only on http(s), not file://) -----------------
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW registration failed:", err));
  });
}

// Environment detection --------------------------------------------------
const UA = navigator.userAgent || "";
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIOS = /iPhone|iPad|iPod/i.test(UA);
// Facebook / Instagram / WhatsApp / TikTok / Line / WeChat in-app browsers and Android WebViews can't install the app.
const isInAppBrowser = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|TikTok|musical_ly|Line\/|MicroMessenger|Snapchat|; wv\)/i.test(UA);
const isAndroid = /Android/i.test(UA);

function krBanner(html, id) {
  if (document.getElementById(id) || localStorage.getItem("kr-pwa-dismiss-" + id)) return;
  const d = document.createElement("div");
  d.id = id;
  d.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:90;background:#1f3d1a;color:#fff;padding:12px 14px;border-radius:12px;box-shadow:0 8px 20px rgba(0,0,0,.3);font-size:.9rem;line-height:1.4;display:flex;gap:10px;align-items:center;";
  d.innerHTML = `<div style="flex:1">${html}</div><button aria-label="Dismiss" style="background:none;border:0;color:#fff;font-size:1.3rem;cursor:pointer">×</button>`;
  d.querySelector("button").addEventListener("click", () => { try { localStorage.setItem("kr-pwa-dismiss-" + id, "1"); } catch (e) {} d.remove(); });
  document.body.appendChild(d);
  return d;
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
  if (isStandalone) return;
  deferredInstallPrompt = e;
  if (!document.getElementById("pwa-install-btn")) buildInstallButton();
});

window.addEventListener("appinstalled", () => {
  const btn = document.getElementById("pwa-install-btn");
  if (btn) btn.remove();
  const b = document.getElementById("kr-open-chrome"); if (b) b.remove();
  deferredInstallPrompt = null;
});

// Friendly help when the app can't be installed from where the page was opened -------
window.addEventListener("load", () => {
  if (isStandalone) return; // already running as the installed app
  if (isInAppBrowser) {
    const intent = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
    const d = krBanner(
      isAndroid
        ? `This link opened inside another app, which can't install KenRho. <a href="${intent}" style="color:#d6f08a;font-weight:700">Open in Chrome</a>, or tap ⋮ and choose “Open in browser”.`
        : `This link opened inside another app. Tap “Open in Safari / Browser” from the menu to install KenRho.`,
      "kr-open-chrome");
    return d;
  }
  if (isIOS) {
    krBanner(`To install KenRho on iPhone: tap <b>Share</b> <span aria-hidden="true">⎙</span>, then <b>Add to Home Screen</b>.`, "kr-ios-install");
  }
});
