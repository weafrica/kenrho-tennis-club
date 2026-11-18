// Keeps the top menu tidy: when the links no longer fit next to the club name, fold them into the ☰ menu automatically.
(function () {
  "use strict";
  var nav = document.querySelector("nav.nav, .nav"); if (!nav || (document.body && document.body.classList.contains("app-shell"))) return;
  var links = nav.querySelector(".nav-links"), toggle = nav.querySelector(".nav-toggle"), wrap = nav.querySelector(".wrap") || nav, brand = nav.querySelector(".nav-brand"); if (!links || !toggle) return;
  var st = document.createElement("style");
  st.textContent = ".nav .nav-brand{flex:none}" +
    ".nav.kr-compact .nav-toggle{display:inline-flex!important;align-items:center;justify-content:center}" +
    ".nav.kr-compact .nav-links{display:none!important;position:absolute;left:0;right:0;top:100%;flex-direction:column;align-items:stretch;flex-wrap:nowrap;gap:2px;padding:10px 16px 18px;background:rgba(15,31,13,.98);box-shadow:0 14px 30px rgba(0,0,0,.35);max-height:calc(100vh - 80px);overflow:auto;z-index:60}" +
    ".nav.kr-compact .nav-links.open{display:flex!important}" +
    ".nav.kr-compact .nav-links a{padding:12px 8px;border-bottom:1px solid rgba(255,255,255,.08)}.nav.kr-compact .nav-links a.btn{margin-top:10px;text-align:center;border-bottom:0}";
  document.head.appendChild(st);
  function naturalWidth() {
    var s = links.style, old = s.cssText;
    s.cssText += ";position:absolute;visibility:hidden;width:max-content;flex:none;flex-wrap:nowrap;white-space:nowrap;left:0;top:0;display:flex";
    var w = links.getBoundingClientRect().width; s.cssText = old; return w;
  }
  function fit() {
    var wasOpen = links.classList.contains("open"); nav.classList.remove("kr-compact");
    var cs = getComputedStyle(wrap), room = wrap.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - (brand ? brand.getBoundingClientRect().width : 0) - 32;
    var compact = naturalWidth() > room; nav.classList.toggle("kr-compact", compact);
    if (!compact) links.classList.remove("open"); else if (!wasOpen) links.classList.remove("open");
  }
  var t = null, later = function () { clearTimeout(t); t = setTimeout(fit, 80); };
  window.addEventListener("resize", later); window.addEventListener("load", fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  try { new MutationObserver(later).observe(links, { childList: true, subtree: true, characterData: true }); } catch (e) {}
  fit();
})();
