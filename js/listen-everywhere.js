// Adds a "Listen" button under every block of text longer than 10 words, on every page.
(function () {
  "use strict";
  var n = 0, timer = null;
  var SKIP = "script,style,noscript,nav,button,a,input,textarea,select,code,pre,svg,[contenteditable],[data-no-listen],.kr-listen,.toast,#kr-help-root,#kr-install-pop,header .hd,.app-nav";
  var BLOCKS = "p,li,blockquote,figcaption,dd,.lede,.muted,div";
  var BLOCK_CHILD = "p,div,ul,ol,table,h1,h2,h3,h4,h5,h6,section,article,li,blockquote,form";
  function words(t) { var m = (t || "").trim().match(/\S+/g); return m ? m.length : 0; }
  function ownReadable(el) {
    if (el.matches(SKIP) || el.closest(SKIP.replace(/,a,/, ",")) && el.closest("nav,[contenteditable],[data-no-listen],.app-nav,#kr-help-root,#kr-install-pop,.kr-listen")) return false;
    if (el.querySelector(BLOCK_CHILD)) return false;                 // only leaf text blocks
    if (el.querySelector("button,input,textarea,select")) return false;
    if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return false; // hidden
    return words(el.innerText || el.textContent) > 10;
  }
  function hasButton(el) {
    if (el.id && document.querySelector('[data-read-aloud="' + el.id.replace(/"/g, "") + '"]')) return true;
    var nx = el.nextElementSibling; return !!(nx && nx.classList.contains("kr-listen"));
  }
  function scan(root) {
    (root || document).querySelectorAll(BLOCKS).forEach(function (el) {
      if (el.dataset.krListen) return;
      if (!ownReadable(el)) return;
      el.dataset.krListen = "1";
      if (hasButton(el)) return;
      if (!el.id) el.id = "kr-t-" + (++n);
      var b = document.createElement("button");
      b.type = "button"; b.className = "kr-listen"; b.setAttribute("data-read-aloud", el.id); b.setAttribute("data-label", "Listen");
      b.style.cssText = "display:inline-flex;align-items:center;gap:4px;margin:4px 0 8px;padding:3px 10px;border-radius:99px;border:1px solid rgba(60,122,46,.45);background:rgba(60,122,46,.08);color:inherit;font:600 .72rem system-ui,sans-serif;cursor:pointer;opacity:.85";
      el.insertAdjacentElement("afterend", b);
      if (window.KR_READ) window.KR_READ.init(b); else b.textContent = "🔊 Listen";
    });
  }
  function later() { clearTimeout(timer); timer = setTimeout(function () { (window.requestIdleCallback || setTimeout)(function () { scan(document); }, 200); }, 500); }
  scan(document);
  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) { var t = muts[i].target; if (t && t.closest && t.closest(".kr-listen")) continue; later(); break; }
  }).observe(document.body, { childList: true, subtree: true });
})();
