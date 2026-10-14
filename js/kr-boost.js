// One tag per page: <script src="js/kr-boost.js" defer></script>
// Loads the shared helpers (Help me, read-aloud everywhere, sign-in awareness, fees, website editing).
(function () {
  "use strict";
  var me = document.currentScript || document.querySelector('script[src$="kr-boost.js"]');
  var base = me && me.src ? me.src.replace(/kr-boost\.js.*$/, "") : "js/";
  var appShell = document.body && document.body.classList.contains("app-shell");
  function load(name, then) {
    var s = document.createElement("script"); s.src = base + name; s.defer = true;
    if (then) s.onload = then; document.head.appendChild(s);
  }
  function needClient(cb) {
    if (window.sb) return cb();
    var s1 = document.createElement("script"); s1.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s1.onload = function () { load("config.js", function () { load("supabaseClient.js", cb); }); };
    document.head.appendChild(s1);
  }
  function go() {
    needClient(function () {
      load("auth-ui.js");
      if (document.getElementById("fees-table")) load("fees.js");
      if (!appShell) load("cms.js");
      load("help-me.js");
    });
    if (!window.__krReadAloud) load("read-aloud.js", function () { load("listen-everywhere.js"); }); else load("listen-everywhere.js");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
