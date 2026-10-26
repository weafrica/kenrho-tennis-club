// Leagues & tournaments. Fun leagues: anyone signed in can start one. Official leagues: need approval from the executive / an admin.
// Ideas copied from the weafrica league builder: round robin (single / double), knockout, open entry with a closing date,
// automatic fixtures, standings with tie-breaks, and a log of what people do.
(function () {
  "use strict";
  var sb = window.sb, $ = function (id) { return document.getElementById(id); };
  var h = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var toast = function (m, t) { if (window.KR && window.KR.toast) window.KR.toast(m, t); else alert(m); };
  var FORMATS = { single_round_robin: "Round robin (everyone plays everyone once)", double_round_robin: "Double round robin (home and away)", knockout: "Knockout (lose and you're out)" };
  var ME = { id: null, name: "", exec: false, admin: false }, TAB = "tour", CACHE = {};
  var fmtD = function (d) { return d ? new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : ""; };

  // ------------------------------------------------------------ standings (points, then head-to-head among tied, then game difference, then games won)
  function standings(L, parts, matches) {
    var S = {}; parts.filter(function (p) { return !p.withdrawn; }).forEach(function (p) { S[p.id] = { p: p, pl: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; });
    var played = matches.filter(function (m) { return m.played && m.b_id; });
    played.forEach(function (m) {
      var A = S[m.a_id], B = S[m.b_id]; if (!A || !B) return; A.pl++; B.pl++; A.gf += m.a_score; A.ga += m.b_score; B.gf += m.b_score; B.ga += m.a_score;
      if (m.a_score > m.b_score) { A.w++; B.l++; A.pts += L.points_win; } else if (m.b_score > m.a_score) { B.w++; A.l++; B.pts += L.points_win; } else { A.d++; B.d++; A.pts += L.points_draw; B.pts += L.points_draw; }
    });
    var rows = Object.keys(S).map(function (k) { return S[k]; });
    var mini = function (ids) { var M = {}; ids.forEach(function (i) { M[i] = 0; }); played.forEach(function (m) { if (M[m.a_id] == null || M[m.b_id] == null) return; if (m.a_score > m.b_score) M[m.a_id] += L.points_win; else if (m.b_score > m.a_score) M[m.b_id] += L.points_win; else { M[m.a_id] += L.points_draw; M[m.b_id] += L.points_draw; } }); return M; };
    rows.sort(function (a, b) { return b.pts - a.pts; });
    var out = [], i = 0;
    while (i < rows.length) {
      var j = i; while (j < rows.length && rows[j].pts === rows[i].pts) j++;
      var grp = rows.slice(i, j); if (grp.length > 1) { var M = mini(grp.map(function (r) { return r.p.id; })); grp.sort(function (a, b) { return (M[b.p.id] - M[a.p.id]) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf); }); }
      out = out.concat(grp); i = j;
    }
    return out;
  }
  var rd = function (L) { return L.format === "knockout" ? "Round" : "Round"; };

  // ------------------------------------------------------------ list
  async function start() {
    var s = await sb.auth.getSession();
    if (s.data.session) { ME.id = s.data.session.user.id; var pr = await sb.from("profiles").select("full_name,email").eq("id", ME.id).single(); ME.name = (pr.data && (pr.data.full_name || pr.data.email)) || "";
      var e = await sb.rpc("is_executive"), a = await sb.rpc("is_site_admin"); ME.exec = e.data === true; ME.admin = a.data === true; }
    $("new-btn").onclick = function () { location.hash = "new"; };
    window.addEventListener("hashchange", route); route();
  }
  function route() {
    var hsh = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (hsh === "new") return viewNew(); if (hsh.indexOf("l/") === 0) return viewLeague(hsh.slice(2)); viewList();
  }
  async function viewList() {
    var root = $("lg"); root.innerHTML = '<div class="box">Loading…</div>';
    var r = await sb.from("leagues").select("*").order("created_at", { ascending: false });
    if (r.error) { root.innerHTML = '<div class="box">Leagues could not be loaded right now.</div>'; return; }
    var all = r.data || [], ids = all.map(function (l) { return l.id; });
    var pc = ids.length ? (await sb.from("league_participants").select("league_id").in("league_id", ids)).data || [] : [], cnt = {}; pc.forEach(function (x) { cnt[x.league_id] = (cnt[x.league_id] || 0) + 1; });
    var fin = all.filter(function (l) { return l.status === "finished"; }).map(function (l) { return l.id; }), winners = {};
    if (fin.length) { var P = (await sb.from("league_participants").select("*").in("league_id", fin)).data || [], M = (await sb.from("league_matches").select("*").in("league_id", fin)).data || [];
      all.filter(function (l) { return l.status === "finished"; }).forEach(function (l) { var st = standings(l, P.filter(function (p) { return p.league_id === l.id; }), M.filter(function (m) { return m.league_id === l.id; })); if (st[0]) winners[l.id] = st[0].p.name; }); }
    var vis = all.filter(function (l) { return l.approval === "approved" || l.created_by === ME.id || ME.exec || ME.admin; });
    var pending = vis.filter(function (l) { return l.approval === "pending"; });
    var card = function (l) {
      return '<div class="lc" data-open="' + l.id + '"><span class="pill ' + (l.kind === "official" ? "p-off" : "p-fun") + '">' + (l.kind === "official" ? "Official" : "Fun") + '</span> <span class="pill ' + (l.approval === "pending" ? "p-pend" : l.status === "in_progress" ? "p-live" : "p-st") + '">' + (l.approval === "pending" ? "Waiting for approval" : l.status === "open" ? "Open to join" : l.status === "in_progress" ? "In progress" : "Finished") + "</span><h3>" + h(l.name) + "</h3>" +
        '<div class="muted small">' + h(FORMATS[l.format].split(" (")[0]) + " · " + (l.participant_type === "pairs" ? "pairs" : "singles") + " · " + (cnt[l.id] || 0) + " entered</div>" + (winners[l.id] ? '<div style="margin-top:8px;font-weight:800">🏆 ' + h(winners[l.id]) + "</div>" : "") + '<div class="muted small" style="margin-top:6px">' + (l.starts_at ? "Starts " + fmtD(l.starts_at) : "") + (l.venue ? " · " + h(l.venue) : "") + "</div></div>";
    };
    var shown = vis.filter(function (l) { return TAB === "tour" ? l.kind === "official" || l.approval !== "approved" ? l.kind === "official" : false : l.kind === "fun"; });
    // tab 1 = official leagues and tournaments (official), tab 2 = fun leagues
    shown = vis.filter(function (l) { return TAB === "tour" ? l.kind === "official" : l.kind === "fun"; });
    root.innerHTML = '<div class="tabs3"><button data-t="tour" class="' + (TAB === "tour" ? "on" : "") + '">Official leagues &amp; tournaments</button><button data-t="fun" class="' + (TAB === "fun" ? "on" : "") + '">Fun leagues</button></div>' +
      ((ME.exec || ME.admin) && pending.length ? '<div class="box" style="border-color:#f0d28a;background:#fffdf3"><b>Waiting for your approval (' + pending.length + ')</b>' + pending.map(function (l) { return '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap"><span style="flex:1"><b>' + h(l.name) + "</b> · by " + h(l.creator_name || "") + '</span><span class="acts" style="margin:0"><button class="go" data-appr="' + l.id + '">Approve</button><button class="no" data-rej="' + l.id + '">Reject</button><button data-open="' + l.id + '">View</button></span></div>'; }).join("") + "</div>" : "") +
      (shown.length ? '<div class="cards">' + shown.map(card).join("") + "</div>" : '<div class="box"><b>Nothing here yet.</b><div class="muted">' + (TAB === "fun" ? "Be the first — start a fun league for your friends." : "Official leagues are approved by the club executive.") + "</div></div>");
    root.onclick = async function (e) {
      var d = e.target.closest("[data-open],[data-t],[data-appr],[data-rej]"); if (!d) return; var ds = d.dataset;
      if (ds.t) { TAB = ds.t; return viewList(); } if (ds.open) { location.hash = "l/" + ds.open; return; }
      if (ds.appr || ds.rej) { var x = await sb.rpc("approve_league", { p_league: ds.appr || ds.rej, p_ok: !!ds.appr }); if (x.error) return toast(x.error.message, "error"); toast(ds.appr ? "Approved ✓" : "Rejected."); viewList(); }
    };
  }

  // ------------------------------------------------------------ start a league
  function viewNew() {
    var root = $("lg"); if (!ME.id) { root.innerHTML = '<div class="box"><b>Sign in to start a league.</b><p><a class="btn btn-primary" href="auth.html">Sign in</a></p></div>'; return; }
    root.innerHTML = '<div class="box"><div class="acts" style="margin:0 0 8px"><button id="back">← All leagues</button></div><h2 style="margin:0 0 4px">Start a league</h2><p class="muted" style="margin:0 0 6px">Set it up in a minute. Fixtures are created for you.</p>' +
      '<label class="l">League name</label><input id="n-name" placeholder="e.g. Friday Night Doubles" maxlength="120">' +
      '<label class="l">What kind of league?</label><div class="g2"><label class="box" style="margin:0;cursor:pointer"><input type="radio" name="kind" value="fun" checked style="width:auto"> <b>Fun league</b><div class="muted small">Starts straight away. Anyone can run one for friends or a social group.</div></label><label class="box" style="margin:0;cursor:pointer"><input type="radio" name="kind" value="official" style="width:auto"> <b>Official league</b><div class="muted small">Club league. The executive approves it before it goes live.</div></label></div>' +
      '<div class="g2"><div><label class="l">Format</label><select id="n-format">' + Object.keys(FORMATS).map(function (k) { return '<option value="' + k + '">' + FORMATS[k] + "</option>"; }).join("") + '</select></div><div><label class="l">Who plays?</label><select id="n-pt"><option value="singles">Singles (one player each)</option><option value="pairs">Pairs (doubles teams)</option></select></div></div>' +
      '<div class="g2"><div><label class="l">Entries close (optional)</label><input id="n-close" type="datetime-local"></div><div><label class="l">First round starts</label><input id="n-start" type="datetime-local"></div></div>' +
      '<div class="g2"><div><label class="l">Days per round</label><input id="n-days" type="number" min="1" value="7"></div><div><label class="l">Venue (optional)</label><input id="n-venue" placeholder="KenRho Park Tennis Club"></div></div>' +
      '<label class="l">About / rules (optional)</label><textarea id="n-rules" rows="3" placeholder="How points work, match format, tie-breaks…"></textarea>' +
      '<label class="l">Players or pairs already entered (one per line, optional)</label><textarea id="n-names" rows="4" placeholder="Denise &amp; Saul&#10;Karen &amp; Bob"></textarea>' +
      '<label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="n-open" checked style="width:auto"> Let other members enter themselves until it starts</label>' +
      '<button class="btn btn-primary" id="n-go" style="width:100%">Create league</button></div>';
    $("back").onclick = function () { location.hash = ""; };
    $("n-go").onclick = async function () {
      var name = $("n-name").value.trim(); if (!name) return toast("Give the league a name.", "warn");
      var iso = function (v) { return v ? new Date(v).toISOString() : null; };
      this.disabled = true; var kind = root.querySelector('input[name="kind"]:checked').value;
      var r = await sb.rpc("create_league", { p_name: name, p_description: "", p_kind: kind, p_format: $("n-format").value, p_ptype: $("n-pt").value, p_entry_closes: iso($("n-close").value), p_starts: iso($("n-start").value), p_round_hours: Math.max(1, +$("n-days").value || 7) * 24, p_open_reg: $("n-open").checked, p_venue: $("n-venue").value.trim(), p_rules: $("n-rules").value.trim(), p_names: $("n-names").value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean) });
      this.disabled = false; if (r.error) return toast(r.error.message, "error");
      toast(kind === "official" ? "Created — it goes live once the executive approves it." : "League created ✓"); location.hash = "l/" + r.data;
    };
  }

  // ------------------------------------------------------------ one league
  async function viewLeague(id) {
    var root = $("lg"); root.innerHTML = '<div class="box">Loading…</div>';
    var L = (await sb.from("leagues").select("*").eq("id", id).maybeSingle()).data;
    if (!L) { root.innerHTML = '<div class="box"><b>League not found.</b><div class="acts"><button onclick="location.hash=\'\'">← All leagues</button></div></div>'; return; }
    var P = (await sb.from("league_participants").select("*").eq("league_id", id).order("seed")).data || [], M = (await sb.from("league_matches").select("*").eq("league_id", id).order("round").order("created_at")).data || [];
    var can = ME.id && (L.created_by === ME.id || ME.exec || ME.admin), name = {}; P.forEach(function (p) { name[p.id] = p.name; });
    var st = standings(L, P, M), mine = P.some(function (p) { return p.user_id === ME.id && !p.withdrawn; });
    var open = L.status === "open" && L.open_registration && L.approval === "approved" && (!L.entry_closes_at || new Date(L.entry_closes_at) > new Date());
    var html = '<div class="acts" style="margin:0 0 10px"><button id="back">← All leagues</button><button id="share">Share</button><button onclick="window.print()">Print</button></div>';
    html += '<div class="box"><span class="pill ' + (L.kind === "official" ? "p-off" : "p-fun") + '">' + (L.kind === "official" ? "Official" : "Fun") + '</span> <span class="pill ' + (L.approval === "pending" ? "p-pend" : L.status === "in_progress" ? "p-live" : "p-st") + '">' + (L.approval === "pending" ? "Waiting for approval" : L.approval === "rejected" ? "Not approved" : L.status === "open" ? "Open to join" : L.status === "in_progress" ? "In progress" : "Finished") + '</span><h2 style="margin:8px 0 4px">' + h(L.name) + "</h2>" +
      '<div class="muted small">' + h(FORMATS[L.format]) + " · " + (L.participant_type === "pairs" ? "pairs" : "singles") + (L.venue ? " · " + h(L.venue) : "") + (L.starts_at ? " · starts " + fmtD(L.starts_at) : "") + (L.entry_closes_at ? " · entries close " + fmtD(L.entry_closes_at) : "") + (L.creator_name ? " · run by " + h(L.creator_name) : "") + "</div>" +
      (L.description ? '<p style="margin:8px 0 0">' + h(L.description) + "</p>" : "") + (L.rules ? '<p class="muted" style="margin:8px 0 0;white-space:pre-line">' + h(L.rules) + "</p>" : "") + "</div>";
    if (L.approval === "pending" && (ME.exec || ME.admin)) html += '<div class="box" style="border-color:#f0d28a;background:#fffdf3"><b>This official league is waiting for approval.</b><div class="acts"><button class="go" id="appr">Approve</button><button class="no" id="rej">Reject</button></div></div>';
    if (L.status === "finished" && st.length >= 3) html += '<div class="podium"><div class="p2">🥈<br>' + h(st[1].p.name) + '<small>' + st[1].pts + ' pts</small></div><div class="p1">🏆<br>' + h(st[0].p.name) + '<small>' + st[0].pts + ' pts</small></div><div class="p3">🥉<br>' + h(st[2].p.name) + '<small>' + st[2].pts + ' pts</small></div></div>';
    if (open && L.approval === "approved") html += '<div class="box"><b>Join this league</b>' + (ME.id ? (mine ? '<div class="muted">You are entered ✓</div>' : '<div class="g2" style="margin-top:6px"><input id="j-name" value="' + h(L.participant_type === "pairs" ? ME.name + " & " : ME.name) + '" placeholder="' + (L.participant_type === "pairs" ? "You & your partner" : "Your name") + '"><button class="btn btn-primary" id="join">Enter</button></div>') : '<div><a class="btn btn-primary" href="auth.html">Sign in to enter</a></div>') + "</div>";
    if (L.format !== "knockout" || L.status !== "open") html += '<div class="box"><h3 style="margin:0 0 8px">Standings</h3>' + (st.length ? '<div style="overflow:auto"><table class="st"><thead><tr><th>#</th><th>' + (L.participant_type === "pairs" ? "Pair" : "Player") + '</th><th class="n">P</th><th class="n">W</th><th class="n">D</th><th class="n">L</th><th class="n">GF</th><th class="n">GA</th><th class="n">Pts</th></tr></thead><tbody>' + st.map(function (r, i) { return '<tr class="' + (i === 0 && L.status === "finished" ? "top" : "") + '"><td>' + (i + 1) + "</td><td>" + h(r.p.name) + '</td><td class="n">' + r.pl + '</td><td class="n">' + r.w + '</td><td class="n">' + r.d + '</td><td class="n">' + r.l + '</td><td class="n">' + r.gf + '</td><td class="n">' + r.ga + '</td><td class="n"><b>' + r.pts + "</b></td></tr>"; }).join("") + '</tbody></table></div><div class="muted small" style="margin-top:6px">' + L.points_win + " points for a win" + (L.points_draw ? ", " + L.points_draw + " for a draw" : "") + ". Ties are settled by the match between the tied players, then game difference, then games won. GF/GA = games for/against.</div>" : '<div class="muted">Nobody has entered yet.</div>') + "</div>";
    else html += '<div class="box"><h3 style="margin:0 0 8px">Entered (' + P.length + ')</h3>' + (P.map(function (p) { return h(p.name); }).join(" · ") || "Nobody yet.") + "</div>";
    if (L.format !== "knockout" && P.length >= 3 && M.length) {
      var cell = {}; M.forEach(function (m) { if (!m.played || !m.b_id) return; (cell[m.a_id + ">" + m.b_id] = cell[m.a_id + ">" + m.b_id] || []).push(m.a_score); (cell[m.b_id + ">" + m.a_id] = cell[m.b_id + ">" + m.a_id] || []).push(m.b_score); });
      html += '<div class="box"><h3 style="margin:0 0 8px">Results grid</h3><div class="xt"><table><thead><tr><th></th>' + st.map(function (c, i) { return "<th>" + (i + 1) + "</th>"; }).join("") + "<th>Games</th></tr></thead><tbody>" + st.map(function (r, i) { var tot = 0; var cells = st.map(function (c, j) { if (i === j) return '<td class="d"></td>'; var v = cell[r.p.id + ">" + c.p.id]; if (!v) return "<td>·</td>"; var s = v.reduce(function (a, b) { return a + b; }, 0), o = (cell[c.p.id + ">" + r.p.id] || []).reduce(function (a, b) { return a + b; }, 0); tot += s; return '<td class="' + (s > o ? "w" : "") + '">' + v.join("/") + "</td>"; }).join(""); return "<tr><th>" + (i + 1) + " " + h(r.p.name) + "</th>" + cells + '<td class="t">' + tot + "</td></tr>"; }).join("") + '</tbody></table></div><div class="muted small" style="margin-top:6px">Each cell shows the games that row won against that column. Green = won the match. Players are listed in standings order.</div></div>';
    }
    if (M.length) {
      var rounds = {}; M.forEach(function (m) { (rounds[m.round] = rounds[m.round] || []).push(m); });
      html += '<div class="box"><h3 style="margin:0 0 4px">Fixtures &amp; results</h3>' + Object.keys(rounds).sort(function (a, b) { return a - b; }).map(function (r) {
        return '<div class="rd">' + (L.format === "knockout" ? "Round " + r : "Round " + r) + (rounds[r][0].due_at ? " · " + fmtD(rounds[r][0].due_at) : "") + "</div>" + rounds[r].map(function (m) {
          var A = h(name[m.a_id] || "?"), B = m.b_id ? h(name[m.b_id] || "?") : "<i>bye</i>", aw = m.played && m.a_score > m.b_score, bw = m.played && m.b_score > m.a_score;
          return '<div class="mt" data-m="' + m.id + '"><div class="t ' + (aw ? "" : "") + '">' + (aw ? "<b class=\"w\">" + A + "</b>" : A) + "</div>" + (can && m.b_id ? '<input type="number" min="0" value="' + (m.a_score == null ? "" : m.a_score) + '" data-a> – <input type="number" min="0" value="' + (m.b_score == null ? "" : m.b_score) + '" data-b><button class="btn btn-sm btn-primary" data-save>Save</button>' : '<div class="sc">' + (m.played ? m.a_score + " – " + m.b_score : "v") + "</div>") + '<div class="t r">' + (bw ? "<b class=\"w\">" + B + "</b>" : B) + "</div></div>";
        }).join("");
      }).join("") + "</div>";
    }
    if (can) html += '<div class="box"><h3 style="margin:0 0 6px">Manage this league</h3><div class="g2"><input id="a-name" placeholder="Add a ' + (L.participant_type === "pairs" ? "pair (Name & Name)" : "player") + '"><button class="btn btn-outline" id="a-add">Add</button></div>' +
      (P.length ? '<div class="muted small" style="margin-top:8px">' + P.map(function (p) { return h(p.name) + ' <a href="#" data-rm="' + p.id + '" style="color:#b23b2e">remove</a>'; }).join(" · ") + "</div>" : "") +
      '<div class="acts">' + (!M.length && L.approval === "approved" ? '<button class="go" id="gen">Create the fixtures</button>' : "") + '<button class="no" id="del">Delete this league</button></div>' + (!M.length ? '<div class="muted small" style="margin-top:6px">Add everyone first, then create the fixtures. After that the line-up is locked.</div>' : "") + "</div>";
    root.innerHTML = html;
    var on = function (id2, fn) { var n = $(id2); if (n) n.onclick = fn; };
    on("back", function () { location.hash = ""; });
    on("share", function () { var u = location.origin + location.pathname + "#l/" + id; if (navigator.share) navigator.share({ title: L.name, url: u }).catch(function () {}); else { try { navigator.clipboard.writeText(u); toast("Link copied."); } catch (e) { toast(u); } } });
    on("appr", async function () { var x = await sb.rpc("approve_league", { p_league: id, p_ok: true }); toast(x.error ? x.error.message : "Approved ✓", x.error ? "error" : "info"); viewLeague(id); });
    on("rej", async function () { var x = await sb.rpc("approve_league", { p_league: id, p_ok: false }); toast(x.error ? x.error.message : "Rejected."); viewLeague(id); });
    on("join", async function () { var x = await sb.rpc("join_league", { p_league: id, p_name: $("j-name").value }); toast(x.error ? x.error.message : x.data, x.error ? "error" : "info"); viewLeague(id); });
    on("a-add", async function () { var v = $("a-name").value.trim(); if (!v) return; var x = await sb.from("league_participants").insert({ league_id: id, name: v, seed: P.length + 1 }); if (x.error) return toast(/duplicate|unique/i.test(x.error.message) ? "That name is already entered." : x.error.message, "error"); viewLeague(id); });
    on("gen", async function () { var x = await sb.rpc("generate_league_fixtures", { p_league: id }); toast(x.error ? x.error.message : x.data, x.error ? "error" : "info"); viewLeague(id); });
    on("del", async function () { if (!confirm("Delete this league and all its results? This cannot be undone.")) return; var x = await sb.from("leagues").delete().eq("id", id); if (x.error) return toast(x.error.message, "error"); window.KR_ACT && window.KR_ACT.log("league deleted", L.name, {}); location.hash = ""; });
    root.onclick = async function (e) {
      var rm = e.target.dataset && e.target.dataset.rm; if (rm) { e.preventDefault(); if (M.length && !confirm("Fixtures exist. Removing a player here won't change them. Remove anyway?")) return; var x = await sb.from("league_participants").delete().eq("id", rm); if (x.error) return toast(x.error.message, "error"); return viewLeague(id); }
      if (e.target.hasAttribute("data-save")) { var row = e.target.closest("[data-m]"), a = row.querySelector("[data-a]").value, b = row.querySelector("[data-b]").value; if (a === "" || b === "") return toast("Enter both scores.", "warn"); var x2 = await sb.rpc("record_league_result", { p_match: row.dataset.m, p_a: +a, p_b: +b }); if (x2.error) return toast(x2.error.message, "error"); toast("Saved ✓"); viewLeague(id); }
    };
  }
  document.addEventListener("DOMContentLoaded", start);
})();
