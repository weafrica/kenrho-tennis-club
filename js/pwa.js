// Service worker + "Install the app" pop-up + install button + help for in-app browsers.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function (err) { console.warn("SW registration failed:", err); });
  });
}
(function () {
  "use strict";
  var UA = navigator.userAgent || "";
  var isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  var isIOS = /iPhone|iPad|iPod/i.test(UA);
  var isAndroid = /Android/i.test(UA);
  var isInApp = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|TikTok|musical_ly|Line\/|MicroMessenger|Snapchat|; wv\)/i.test(UA);
  var deferred = null;
  var NOW = Date.now(), DAY = 864e5;
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  if (isStandalone) store.set("kr_installed", "1");

  function startVoiceDownload() {
    // The app is installed: fetch the natural voice in the background (runs in a worker, never freezes the page).
    store.set("kr_installed", "1");
    var tryStart = function () { if (window.KR_VOICE) window.KR_VOICE.preload(); else setTimeout(tryStart, 1500); };
    setTimeout(tryStart, 2500);
  }

  function modal(html) {
    var d = document.createElement("div"); d.id = "kr-install-pop";
    d.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;padding:12px;";
    d.innerHTML = '<div role="dialog" aria-label="Install the KenRho app" style="background:#fff;color:#1b2a17;border-radius:18px;max-width:380px;width:100%;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.35);font:15px/1.45 system-ui,sans-serif;margin-bottom:env(safe-area-inset-bottom,0px)">' + html + "</div>";
    d.addEventListener("click", function (e) { if (e.target === d) closePop(true); });
    document.body.appendChild(d); return d;
  }
  function closePop(remember) { var d = document.getElementById("kr-install-pop"); if (d) d.remove(); if (remember) store.set("kr_install_dismissed", String(NOW)); }

  function offer() {
    if (isStandalone || document.getElementById("kr-install-pop")) return;
    var dis = +store.get("kr_install_dismissed") || 0; if (NOW - dis < 7 * DAY) return;
    var icon = '<img src="icons/kr-apple-180.png" alt="" style="width:56px;height:56px;border-radius:14px;float:left;margin:0 12px 6px 0">';
    var head = icon + '<div style="font-weight:800;font-size:1.1rem">Install the KenRho app</div><div style="color:#5d6b57;font-size:.88rem;margin-bottom:12px">Faster, works offline, and signs you in automatically.</div><div style="clear:both"></div>';
    var d;
    if (isInApp) {
      var intent = "intent://" + location.host + location.pathname + location.search + "#Intent;scheme=https;package=com.android.chrome;end";
      d = modal(head + '<p style="margin:0 0 12px">This link opened inside another app, which can\'t install KenRho.</p>' + (isAndroid ? '<a href="' + intent + '" style="display:block;text-align:center;background:#3c7a2e;color:#fff;border-radius:99px;padding:12px;font-weight:700;text-decoration:none">Open in Chrome</a>' : '<p>Tap “Open in Safari” from the menu, then install.</p>') + '<button data-x style="display:block;margin:10px auto 0;background:none;border:0;color:#5d6b57;cursor:pointer">Not now</button>');
    } else if (deferred) {
      d = modal(head + '<button data-ok style="width:100%;background:#3c7a2e;color:#fff;border:0;border-radius:99px;padding:13px;font:inherit;font-weight:700;cursor:pointer">Install app</button><button data-x style="display:block;margin:10px auto 0;background:none;border:0;color:#5d6b57;cursor:pointer">Not now</button>');
      d.querySelector("[data-ok]").onclick = function () { closePop(false); deferred.prompt(); deferred.userChoice.then(function () { deferred = null; }); };
    } else if (isIOS) {
      d = modal(head + '<ol style="margin:0 0 12px;padding-left:20px"><li>Tap the <b>Share</b> button <span aria-hidden="true">⎙</span></li><li>Choose <b>Add to Home Screen</b></li><li>Tap <b>Add</b></li></ol><button data-x style="width:100%;background:#3c7a2e;color:#fff;border:0;border-radius:99px;padding:12px;font:inherit;font-weight:700;cursor:pointer">Got it</button>');
    } else { return; }
    var x = d.querySelector("[data-x]"); if (x) x.onclick = function () { closePop(true); };
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); if (isStandalone) return; deferred = e;
    if (!document.getElementById("pwa-install-btn")) {
      var b = document.createElement("button"); b.id = "pwa-install-btn"; b.textContent = "Install app";
      b.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:80;background:#1f3d1a;color:#fff;border:0;border-radius:99px;padding:10px 16px;font:600 .85rem system-ui;box-shadow:0 8px 20px rgba(0,0,0,.25);cursor:pointer";
      b.onclick = function () { if (!deferred) return; b.remove(); deferred.prompt(); deferred.userChoice.then(function () { deferred = null; }); };
      document.body.appendChild(b);
    }
    setTimeout(offer, 3500);
  });
  window.addEventListener("appinstalled", function () {
    var b = document.getElementById("pwa-install-btn"); if (b) b.remove(); closePop(false); deferred = null; startVoiceDownload();
  });
  window.addEventListener("load", function () {
    if (isStandalone) { if (store.get("kr_voice_auto") !== "off") startVoiceDownload(); return; }
    if (isInApp || isIOS) setTimeout(offer, 4000);
  });
})();
