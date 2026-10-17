// Stay signed in, "My membership" button on the home page, and no more "Join the club" for signed-in members.
(function () {
  "use strict";
  if (!window.sb) return;
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  var onHome = /(^|\/)(index\.html)?$/.test(location.pathname);
  function heroButton(signedIn, name) {
    var cta = document.querySelector(".hero .hero-cta"); if (!cta || document.getElementById("kr-my-membership")) return;
    if (signedIn && name) {
      var hi = document.createElement("p"); hi.id = "kr-welcome-back"; hi.style.cssText = "margin:0 0 10px;font-weight:700"; hi.textContent = "Welcome back, " + name.split(" ")[0] + " 👋";
      cta.parentNode.insertBefore(hi, cta);
    }
    var a = document.createElement("a"); a.id = "kr-my-membership"; a.className = "btn btn-primary"; a.href = signedIn ? "dashboard.html" : "auth.html"; a.textContent = signedIn ? "My membership" : "Member login";
    cta.insertBefore(a, cta.firstChild);
  }
  window.sb.auth.getSession().then(function (r) {
    var session = r && r.data && r.data.session;
    if (!session) { if (onHome) heroButton(false); return; }
    document.documentElement.classList.add("kr-signed-in");
    var path = location.pathname.split("/").pop();
    if (path === "auth.html" && !/status=/.test(location.search)) { location.replace("dashboard.html"); return; }
    window.sb.from("profiles").select("full_name").eq("id", session.user.id).single().then(function (p) { if (onHome) heroButton(true, p.data && p.data.full_name); }, function () { if (onHome) heroButton(true); });
    document.querySelectorAll('a[href*="auth.html"]').forEach(function (a) {
      var t = (a.textContent || "").trim().toLowerCase();
      if (/join/.test(t)) { a.style.display = "none"; return; }
      if (a.id !== "kr-my-membership") { a.textContent = "My membership"; a.setAttribute("href", "dashboard.html"); }
    });
    document.querySelectorAll("h2,h3,p").forEach(function (h) { if (/^ready to join\??$/i.test((h.textContent || "").trim())) { var box = h.closest(".flex-between, .card"); if (box) box.style.display = "none"; } });
    var b = document.getElementById("join-blurb"); if (b) { var c = b.closest(".card"); if (c) c.style.display = "none"; }
  }).catch(function () {});
})();
