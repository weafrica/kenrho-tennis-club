// A slim banner for the home page and the login page: open leagues + the next event.
(function () {
  "use strict";
  var sb = window.sb; if (!sb || document.getElementById("kr-league-banner")) return;
  var path = location.pathname.split("/").pop() || "index.html"; if (path !== "index.html" && path !== "auth.html" && path !== "") return;
  var h = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var css = document.createElement("style");
  css.textContent = "#kr-league-banner{background:linear-gradient(120deg,#1f3d1a,#2f6a22);color:#fff;border-radius:16px;padding:14px 16px;margin:14px auto;max-width:1100px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;box-shadow:0 8px 22px rgba(31,61,26,.25);font:15px/1.4 system-ui,sans-serif}#kr-league-banner .ic{font-size:2rem}#kr-league-banner .tx{flex:1;min-width:220px}#kr-league-banner b{font-size:1.02rem}#kr-league-banner .ls{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}#kr-league-banner .ls a{background:rgba(255,255,255,.14);color:#fff;text-decoration:none;border-radius:99px;padding:4px 11px;font-size:.78rem;font-weight:700}#kr-league-banner .ls a small{opacity:.8;font-weight:500}#kr-league-banner .nx{font-size:.82rem;opacity:.9;margin-top:6px}#kr-league-banner .bt{display:flex;gap:8px;flex-wrap:wrap}#kr-league-banner .bt a{border-radius:99px;padding:9px 16px;font-weight:800;font-size:.85rem;text-decoration:none}#kr-league-banner .b1{background:#D4A017;color:#1a1200}#kr-league-banner .b2{background:rgba(255,255,255,.16);color:#fff}";
  document.head.appendChild(css);
  var today = new Date().toISOString().slice(0, 10);
  Promise.all([
    sb.from("leagues").select("id,name,kind,status").eq("approval", "approved").in("status", ["open", "in_progress"]).order("created_at", { ascending: false }).limit(4),
    sb.from("club_events").select("title,starts_at").eq("is_public", true).gte("starts_at", new Date().toISOString()).order("starts_at").limit(1),
    sb.from("fundraisers").select("title,event_date").eq("is_active", true).eq("kind", "one_day").gte("event_date", today).order("event_date").limit(1),
  ]).then(function (r) {
    var leagues = (r[0].data || []), ev = (r[1].data || [])[0], fu = (r[2].data || [])[0], next = null;
    if (ev) next = { t: ev.title, d: new Date(ev.starts_at) }; if (fu && (!next || new Date(fu.event_date + "T09:00:00") < next.d)) next = { t: fu.title, d: new Date(fu.event_date + "T09:00:00") };
    var open = leagues.filter(function (l) { return l.status === "open"; }).length;
    var b = document.createElement("div"); b.id = "kr-league-banner";
    b.innerHTML = '<div class="ic">🏆</div><div class="tx"><b>Leagues &amp; tournaments</b> — ' + (leagues.length ? (open ? open + " open to join" : leagues.length + " running now") : "start one with your friends") + '<div class="ls">' + leagues.slice(0, 3).map(function (l) { return '<a href="leagues.html#l/' + l.id + '">' + h(l.name) + " <small>" + (l.status === "open" ? "open" : "live") + "</small></a>"; }).join("") + "</div>" +
      (next ? '<div class="nx">📅 Next: <a href="calendar.html" style="color:#d6f08a">' + h(next.t) + "</a> · " + next.d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" }) + "</div>" : "") + '</div><div class="bt"><a class="b1" href="leagues.html">See the leagues</a><a class="b2" href="leagues.html#new">Start a league</a><a class="b2" href="calendar.html">Calendar</a></div>';
    var anchor = null;
    if (path === "auth.html") { var f = document.querySelector("form"); anchor = f ? (f.closest(".card") || f) : document.querySelector("main") || document.body; anchor.parentNode.insertBefore(b, anchor); }
    else { var hero = document.querySelector(".hero"); if (hero) { var seam = hero.nextElementSibling && hero.nextElementSibling.classList.contains("seam") ? hero.nextElementSibling : hero; var wrap = document.createElement("div"); wrap.className = "wrap"; wrap.style.cssText = "padding-top:6px"; wrap.appendChild(b); seam.insertAdjacentElement("afterend", wrap); } else document.body.insertBefore(b, document.body.firstChild); }
  }).catch(function () {});
})();
