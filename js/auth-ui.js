// Stay signed in + stop asking signed-in members to "join".
(function () {
  "use strict";
  if (!window.sb) return;
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  window.sb.auth.getSession().then(function (r) {
    var session = r && r.data && r.data.session;
    if (!session) return;
    document.documentElement.classList.add("kr-signed-in");
    var path = location.pathname.split("/").pop();
    if (path === "auth.html" && !/status=/.test(location.search)) { location.replace("dashboard.html"); return; }
    // relabel / hide sign-in and join calls to action
    document.querySelectorAll('a[href*="auth.html"]').forEach(function (a) {
      var t = (a.textContent || "").trim().toLowerCase();
      if (/join/.test(t)) { a.style.display = "none"; return; }
      a.textContent = "My membership"; a.setAttribute("href", "dashboard.html");
    });
    document.querySelectorAll("h2,h3,p").forEach(function (h) {
      if (/^ready to join\??$/i.test((h.textContent || "").trim())) {
        var box = h.closest(".flex-between, .card"); if (box) box.style.display = "none";
      }
    });
    var b = document.getElementById("join-blurb"); if (b) { var c = b.closest(".card"); if (c) c.style.display = "none"; }
    var nav = document.getElementById("nav-links");
    if (nav && !nav.querySelector('a[href="dashboard.html"]')) {
      var a = document.createElement("a"); a.href = "dashboard.html"; a.className = "btn btn-primary btn-sm"; a.textContent = "My membership"; nav.appendChild(a);
    }
  }).catch(function () {});
})();
