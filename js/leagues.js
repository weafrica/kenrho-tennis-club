// Leagues & tournaments — tennis scoring. Fun leagues: anyone signed in can start one. Official leagues: approved by the executive / an admin.
// Scores are games and sets (no football points). Players enter their own scores, the opponent confirms or disputes, the league admin can correct anything.
// Features adapted from the weafrica league builder: open entry with a closing date, automatic fixtures (round robin / double / knockout),
// player-entered results with opponent confirmation and auto-confirm after a deadline, disputes, walkover claims, admin correction, score photo proof.
(function () {
  "use strict";
  var sb = window.sb, $ = function (id) { return document.getElementById(id); };
  var h = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var toast = function (m, t) { if (window.KR && window.KR.toast) window.KR.toast(m, t); else alert(m); };
  var FORMATS = { single_round_robin: "Round robin (everyone plays everyone once)", double_round_robin: "Double round robin (home and away)", knockout: "Knockout (lose and you're out)" };
  var SCORING = { fixed_games: "A set number of games (e.g. 13 games)", one_set: "One set (first to 6, tiebreak at 6–6)", pro_set: "Pro set (first to 8 or 9 games)", best_of_3: "Best of 3 sets" };
  var ME = { id: null, name: "", exec: false, admin: false }, TAB = "tour";
  var fmtD = function (d) { return d ? new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : ""; };
  var fmtDT = function (d) { return d ? new Date(d).toLocaleString("en-ZA", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""; };
  var isTennisSet = function (L) { return L.match_format !== "fixed_games"; };
  var scoringLine = function (L) { return L.match_format === "fixed_games" ? L.games_per_match + " games per match" + (L.games_per_match % 2 === 0 ? ", tiebreak to " + L.tiebreak_to + " if level" : "") : L.match_format === "one_set" ? "One set to " + L.games_to_win + ", tiebreak to " + L.tiebreak_to + " at " + L.games_to_win + "–" + L.games_to_win : L.match_format === "pro_set" ? "Pro set to " + L.games_to_win + " games, tiebreak to " + L.tiebreak_to + " at " + L.games_to_win + "–" + L.games_to_win : "Best of 3 sets to " + L.games_to_win + " games, tiebreak to " + L.tiebreak_to + (L.final_set_match_tiebreak ? ", deciding set is a match tiebreak to 10" : ""); };

  // ------------------------------------------------------------ the tennis score rules (same as the database)
  function tbOk(a, b, to) { var hi = Math.max(a, b), lo = Math.min(a, b); return a >= 0 && b >= 0 && hi >= to && ((hi === to && lo <= to - 2) || (hi > to && hi - lo === 2)); }
  function validate(L, sets) {
    if (!sets.length) return "Enter the score.";
    if (L.match_format === "fixed_games") {
      var s = sets[0], a = s.a, b = s.b; if (a == null || b == null || isNaN(a) || isNaN(b)) return "Enter both scores.";
      if (a + b !== L.games_per_match) return "This league plays " + L.games_per_match + " games, so the two scores must add up to " + L.games_per_match + ".";
      if (a === b && !tbOk(s.tba || 0, s.tbb || 0, L.tiebreak_to)) return "The games are level, so a tiebreak decides it: first to " + L.tiebreak_to + " points, winning by 2.";
      return null;
    }
    var G = L.games_to_win, need = L.match_format === "best_of_3" ? 2 : 1, maxs = L.match_format === "best_of_3" ? 3 : 1, wa = 0, wb = 0;
    for (var i = 0; i < sets.length; i++) {
      var t = sets[i], n = i + 1; if (wa >= need || wb >= need) return "The match was already decided before set " + n + "."; if (n > maxs) return "Too many sets for this format.";
      if (t.a == null || t.b == null || isNaN(t.a) || isNaN(t.b)) return "Enter both scores for set " + n + ".";
      if (t.mt) { if (!(L.match_format === "best_of_3" && L.final_set_match_tiebreak && n === 3 && wa === 1 && wb === 1)) return "A match tiebreak is only played instead of the deciding third set."; if (!tbOk(t.a, t.b, 10)) return "A match tiebreak is first to 10 points, winning by 2."; if (t.a > t.b) wa++; else wb++; continue; }
      var hi = Math.max(t.a, t.b), lo = Math.min(t.a, t.b);
      if ((hi === G && hi - lo >= 2) || (hi === G + 1 && lo === G - 1)) { /* ok */ }
      else if (hi === G + 1 && lo === G) { var w = t.a > t.b ? t.tba || 0 : t.tbb || 0, l2 = t.a > t.b ? t.tbb || 0 : t.tba || 0; if (!tbOk(w, l2, L.tiebreak_to)) return "Set " + n + " went to a tiebreak: first to " + L.tiebreak_to + " points, winning by 2. Enter the tiebreak points."; }
      else return "Set " + n + " is not a valid score (for example " + G + "–4, " + (G + 1) + "–" + (G - 1) + " or " + (G + 1) + "–" + G + " with a tiebreak).";
      if (t.a > t.b) wa++; else wb++;
    }
    if (wa < need && wb < need) return "The match is not finished: someone must win " + need + " set" + (need > 1 ? "s" : "") + ".";
    return null;
  }
  function scoreText(L, m) {
    var S = m.sets || []; if (!S.length) return m.a_games != null ? m.a_games + "–" + m.b_games : "v";
    return S.map(function (s) { if (s.mt) return "[" + s.a + "–" + s.b + "]"; var tb = (s.a === s.b && (s.tba || s.tbb)) ? " (tb " + s.tba + "–" + s.tbb + ")" : ""; if (L.match_format !== "fixed_games" && Math.abs(s.a - s.b) === 1 && Math.max(s.a, s.b) === L.games_to_win + 1 && Math.min(s.a, s.b) === L.games_to_win) tb = "(" + Math.min(s.tba || 0, s.tbb || 0) + ")"; return s.a + "–" + s.b + tb; }).join("  ");
  }

  // ------------------------------------------------------------ standings: games or sets, then tie-breaks. No football points.
  function matchWinner(L, m) { if (!m.b_id) return "a"; if (isTennisSet(L) && m.a_sets !== m.b_sets) return m.a_sets > m.b_sets ? "a" : "b"; var a = m.a_games, b = m.b_games; return a > b ? "a" : b > a ? "b" : null; }
  function standings(L, parts, matches) {
    var S = {}; parts.filter(function (p) { return !p.withdrawn; }).forEach(function (p) { S[p.id] = { p: p, pl: 0, w: 0, l: 0, sw: 0, sl: 0, gw: 0, gl: 0 }; });
    var done = matches.filter(function (m) { return m.b_id && (m.status === "confirmed" || m.status === "walkover") && m.a_games != null; });
    done.forEach(function (m) {
      var A = S[m.a_id], B = S[m.b_id]; if (!A || !B) return; A.pl++; B.pl++; A.gw += m.a_games; A.gl += m.b_games; B.gw += m.b_games; B.gl += m.a_games; A.sw += m.a_sets; A.sl += m.b_sets; B.sw += m.b_sets; B.sl += m.a_sets;
      var w = matchWinner(L, m); if (w === "a") { A.w++; B.l++; } else if (w === "b") { B.w++; A.l++; }
    });
    var rows = Object.keys(S).map(function (k) { return S[k]; }), bySets = L.rank_by === "sets" && isTennisSet(L);
    var primary = function (r) { return bySets ? r.sw : r.gw; };
    rows.sort(function (a, b) { return primary(b) - primary(a); });
    var out = [], i = 0;
    while (i < rows.length) {
      var j = i; while (j < rows.length && primary(rows[j]) === primary(rows[i])) j++;
      var grp = rows.slice(i, j);
      if (grp.length > 1) {
        var ids = grp.map(function (r) { return r.p.id; }), H = {}; ids.forEach(function (x) { H[x] = 0; });
        done.forEach(function (m) { if (H[m.a_id] == null || H[m.b_id] == null) return; var w = matchWinner(L, m); if (w === "a") H[m.a_id]++; else if (w === "b") H[m.b_id]++; });
        grp.sort(function (a, b) { return bySets ? ((b.sw - b.sl) - (a.sw - a.sl)) || ((b.gw - b.gl) - (a.gw - a.gl)) || (b.gw - a.gw) || (H[b.p.id] - H[a.p.id]) : (H[b.p.id] - H[a.p.id]) || ((b.gw - b.gl) - (a.gw - a.gl)) || ((b.sw - b.sl) - (a.sw - a.sl)); });
      }
      out = out.concat(grp); i = j;
    }
    return out;
  }

  // ------------------------------------------------------------ start / routing
  async function start() {
    var s = await sb.auth.getSession();
    if (s.data.session) { ME.id = s.data.session.user.id; var pr = await sb.from("profiles").select("full_name,email").eq("id", ME.id).single(); ME.name = (pr.data && (pr.data.full_name || pr.data.email)) || ""; ME.email = ((pr.data && pr.data.email) || "").toLowerCase();
      var e = await sb.rpc("is_executive"), a = await sb.rpc("is_site_admin"); ME.exec = e.data === true; ME.admin = a.data === true; }
    $("new-btn").onclick = function () { location.hash = "new"; };
    window.addEventListener("hashchange", route); route();
  }
  function route() { var hsh = decodeURIComponent(location.hash.replace(/^#/, "")); if (hsh === "new") return viewNew(); if (hsh.indexOf("l/") === 0) return viewLeague(hsh.slice(2)); viewList(); }

  async function viewList() {
    var root = $("lg"); root.innerHTML = '<div class="box">Loading…</div>';
    var r = await sb.from("leagues").select("*").order("created_at", { ascending: false });
    if (r.error) { root.innerHTML = '<div class="box">Leagues could not be loaded right now.</div>'; return; }
    var all = r.data || [], ids = all.map(function (l) { return l.id; });
    var pc = ids.length ? (await sb.from("league_participants").select("league_id").in("league_id", ids)).data || [] : [], cnt = {}; pc.forEach(function (x) { cnt[x.league_id] = (cnt[x.league_id] || 0) + 1; });
    var fin = all.filter(function (l) { return l.status === "finished"; }), winners = {};
    if (fin.length) { var fids = fin.map(function (l) { return l.id; }), P = (await sb.from("league_participants").select("*").in("league_id", fids)).data || [], M = (await sb.from("league_matches").select("*").in("league_id", fids)).data || [];
      fin.forEach(function (l) { var st = standings(l, P.filter(function (p) { return p.league_id === l.id; }), M.filter(function (m) { return m.league_id === l.id; })); if (st[0]) winners[l.id] = st[0].p.name; }); }
    var vis = all.filter(function (l) { return l.approval === "approved" || l.created_by === ME.id || ME.exec || ME.admin; }), pending = vis.filter(function (l) { return l.approval === "pending"; });
    var card = function (l) {
      return '<div class="lc" data-open="' + l.id + '"><span class="pill ' + (l.kind === "official" ? "p-off" : "p-fun") + '">' + (l.kind === "official" ? "Official" : "Fun") + '</span> <span class="pill ' + (l.approval === "pending" ? "p-pend" : l.status === "in_progress" ? "p-live" : "p-st") + '">' + (l.approval === "pending" ? "Waiting for approval" : l.status === "open" ? "Open to join" : l.status === "in_progress" ? "In progress" : "Finished") + "</span><h3>" + h(l.name) + "</h3>" +
        '<div class="muted small">' + h(FORMATS[l.format].split(" (")[0]) + " · " + (l.participant_type === "pairs" ? "pairs" : "singles") + " · " + (cnt[l.id] || 0) + " entered</div><div class=\"muted small\">" + h(scoringLine(l)) + "</div>" + (winners[l.id] ? '<div style="margin-top:8px;font-weight:800">🏆 ' + h(winners[l.id]) + "</div>" : "") + '<div class="muted small" style="margin-top:6px">' + (l.starts_at ? "Starts " + fmtD(l.starts_at) : "") + (l.venue ? " · " + h(l.venue) : "") + "</div></div>";
    };
    var shown = vis.filter(function (l) { return TAB === "tour" ? l.kind === "official" : l.kind === "fun"; });
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
  function scoringFields(L) {
    L = L || { match_format: "fixed_games", games_per_match: 13, games_to_win: 6, tiebreak_to: 7, final_set_match_tiebreak: false, rank_by: "games", confirm_hours: 48 };
    return '<label class="l">How are matches scored?</label><select id="s-fmt">' + Object.keys(SCORING).map(function (k) { return '<option value="' + k + '"' + (L.match_format === k ? " selected" : "") + ">" + SCORING[k] + "</option>"; }).join("") + "</select>" +
      '<div class="g2"><div id="s-gpm-w"><label class="l">Games per match</label><input id="s-gpm" type="number" min="1" max="99" value="' + L.games_per_match + '"><div class="muted small">e.g. 13 — first to 7 wins. An odd number means no draws.</div></div><div id="s-gtw-w"><label class="l">Games to win a set</label><select id="s-gtw">' + [4, 5, 6, 7, 8, 9, 10].map(function (n) { return "<option" + (L.games_to_win === n ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select></div>" +
      '<div><label class="l">Tiebreak is first to</label><select id="s-tb"><option value="7"' + (L.tiebreak_to === 7 ? " selected" : "") + '>7 points (win by 2)</option><option value="10"' + (L.tiebreak_to === 10 ? " selected" : "") + '>10 points (win by 2)</option></select></div>' +
      '<div id="s-rank-w"><label class="l">Rank players by</label><select id="s-rank"><option value="games"' + (L.rank_by === "games" ? " selected" : "") + '>Games won</option><option value="sets"' + (L.rank_by === "sets" ? " selected" : "") + ">Sets won</option></select></div></div>" +
      '<label id="s-mt-w" style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="s-mt" style="width:auto"' + (L.final_set_match_tiebreak ? " checked" : "") + '> Play a match tiebreak (first to 10) instead of a deciding third set</label>' +
      '<label class="l">Hours for the opponent to confirm a score (it then counts automatically)</label><input id="s-ch" type="number" min="1" max="720" value="' + L.confirm_hours + '">' +
      '<p class="muted small" style="margin:6px 0 0">Tiebreaks: the first to the target wins, but must lead by 2 — so it keeps going past 7 (or 10) until someone is two points clear, e.g. 8–6, 9–7.</p>';
  }
  function wireScoring() {
    var f = $("s-fmt"), upd = function () { var v = f.value; $("s-gpm-w").style.display = v === "fixed_games" ? "" : "none"; $("s-gtw-w").style.display = v === "fixed_games" ? "none" : ""; $("s-rank-w").style.display = v === "fixed_games" ? "none" : ""; $("s-mt-w").style.display = v === "best_of_3" ? "flex" : "none"; if (v === "pro_set" && +$("s-gtw").value === 6) $("s-gtw").value = 8; if (v !== "pro_set" && +$("s-gtw").value > 7) $("s-gtw").value = 6; }; f.onchange = upd; upd();
  }
  var readScoring = function () { return { p_match_format: $("s-fmt").value, p_games_per_match: +$("s-gpm").value || 13, p_games_to_win: +$("s-gtw").value || 6, p_tiebreak_to: +$("s-tb").value, p_final_mt: $("s-mt").checked, p_rank_by: $("s-fmt").value === "fixed_games" ? "games" : $("s-rank").value, p_confirm_hours: +$("s-ch").value || 48 }; };

  function viewNew() {
    var root = $("lg"); if (!ME.id) { root.innerHTML = '<div class="box"><b>Sign in to start a league.</b><p><a class="btn btn-primary" href="auth.html">Sign in</a></p></div>'; return; }
    root.innerHTML = '<div class="box"><div class="acts" style="margin:0 0 8px"><button id="back">← All leagues</button></div><h2 style="margin:0 0 4px">Start a league</h2><p class="muted" style="margin:0 0 6px">Set it up in a minute. Fixtures are created for you, and players enter their own scores.</p>' +
      '<label class="l">League name</label><input id="n-name" placeholder="e.g. Friday Night Doubles" maxlength="120">' +
      '<label class="l">What kind of league?</label><div class="g2"><label class="box" style="margin:0;cursor:pointer"><input type="radio" name="kind" value="fun" checked style="width:auto"> <b>Fun league</b><div class="muted small">Starts straight away. Anyone can run one for friends or a social group.</div></label><label class="box" style="margin:0;cursor:pointer"><input type="radio" name="kind" value="official" style="width:auto"> <b>Official league</b><div class="muted small">Club league. The executive approves it before it goes live.</div></label></div>' +
      '<div class="g2"><div><label class="l">Format</label><select id="n-format">' + Object.keys(FORMATS).map(function (k) { return '<option value="' + k + '">' + FORMATS[k] + "</option>"; }).join("") + '</select></div><div><label class="l">Who plays?</label><select id="n-pt"><option value="singles">Singles (one player each)</option><option value="pairs">Pairs (doubles teams)</option></select></div></div>' +
      scoringFields() +
      '<div class="g2"><div><label class="l">Entries close (optional)</label><input id="n-close" type="datetime-local"></div><div><label class="l">First round starts</label><input id="n-start" type="datetime-local"></div></div>' +
      '<div class="g2"><div><label class="l">Days per round</label><input id="n-days" type="number" min="1" value="7"></div><div><label class="l">Venue (optional)</label><input id="n-venue" placeholder="KenRho Park Tennis Club"></div></div>' +
      '<label class="l">About / rules (optional)</label><textarea id="n-rules" rows="3" placeholder="Anything players should know…"></textarea>' +
      '<label class="l">Players or pairs already entered (one per line, optional)</label><textarea id="n-names" rows="4" placeholder="Denise &amp; Saul&#10;Karen &amp; Bob"></textarea>' +
      '<label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="n-open" checked style="width:auto"> Let other members enter themselves until it starts</label>' +
      '<button class="btn btn-primary" id="n-go" style="width:100%">Create league</button></div>';
    wireScoring(); $("back").onclick = function () { location.hash = ""; };
    $("n-go").onclick = async function () {
      var name = $("n-name").value.trim(); if (!name) return toast("Give the league a name.", "warn");
      var iso = function (v) { return v ? new Date(v).toISOString() : null; }; this.disabled = true; var kind = root.querySelector('input[name="kind"]:checked').value;
      var args = Object.assign({ p_name: name, p_description: "", p_kind: kind, p_format: $("n-format").value, p_ptype: $("n-pt").value, p_entry_closes: iso($("n-close").value), p_starts: iso($("n-start").value), p_round_hours: Math.max(1, +$("n-days").value || 7) * 24, p_open_reg: $("n-open").checked, p_venue: $("n-venue").value.trim(), p_rules: $("n-rules").value.trim(), p_names: $("n-names").value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean) }, readScoring());
      var r = await sb.rpc("create_league", args); this.disabled = false; if (r.error) return toast(r.error.message, "error");
      toast(kind === "official" ? "Created — it goes live once the executive approves it." : "League created ✓"); location.hash = "l/" + r.data;
    };
  }

  // ------------------------------------------------------------ score entry (players and league admins)
  function scoreModal(L, m, name, mgr, onDone) {
    var old = $("sc-modal"); if (old) old.remove();
    var existing = (m.sets && m.sets.length) ? JSON.parse(JSON.stringify(m.sets)) : null, fixed = L.match_format === "fixed_games", maxs = L.match_format === "best_of_3" ? 3 : 1;
    var rowsHtml = "", box = document.createElement("div"); box.id = "sc-modal"; box.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:12px";
    var A = h(name[m.a_id] || "A"), B = h(name[m.b_id] || "B");
    var setRow = function (i, s) {
      s = s || {}; var mt = !!s.mt;
      return '<div class="sr" data-i="' + i + '" style="background:#f6f9ee;border-radius:10px;padding:8px;margin:6px 0"><b>' + (fixed ? "Games" : mt ? "Match tiebreak" : "Set " + (i + 1)) + '</b><div style="display:grid;grid-template-columns:1fr auto 1fr;gap:6px;align-items:center;margin-top:4px"><div class="small">' + A + '<input type="number" min="0" data-f="a" value="' + (s.a == null ? "" : s.a) + '"></div><div style="padding-top:16px">–</div><div class="small">' + B + '<input type="number" min="0" data-f="b" value="' + (s.b == null ? "" : s.b) + '"></div></div>' +
        '<div class="tb" style="display:none;margin-top:6px"><div class="small muted">Tiebreak points (first to ' + L.tiebreak_to + ', win by 2)</div><div style="display:grid;grid-template-columns:1fr auto 1fr;gap:6px;align-items:center"><input type="number" min="0" data-f="tba" value="' + (s.tba == null ? "" : s.tba) + '"><div>–</div><input type="number" min="0" data-f="tbb" value="' + (s.tbb == null ? "" : s.tbb) + '"></div></div></div>';
    };
    var init = existing || [{}]; if (!fixed && L.match_format === "best_of_3" && !existing) init = [{}, {}];
    box.innerHTML = '<div style="background:#fff;border-radius:16px;max-width:460px;width:100%;max-height:92vh;overflow:auto;padding:16px;font:15px/1.45 system-ui,sans-serif"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:1.05rem">' + A + " v " + B + '</b><button class="btn btn-sm" data-x style="border:0;background:#eef6d9;border-radius:99px;padding:6px 12px;cursor:pointer">✕</button></div><div class="muted small">' + h(scoringLine(L)) + '</div><div id="sc-rows">' + init.map(function (s, i) { return setRow(i, s); }).join("") + '</div>' +
      (!fixed && L.match_format === "best_of_3" ? '<button type="button" class="btn btn-sm" id="sc-add" style="border:0;background:#eef6d9;border-radius:99px;padding:7px 13px;cursor:pointer;margin-top:4px">+ Add a set</button>' : "") +
      '<div id="sc-err" style="color:#b23b2e;font-weight:600;margin-top:8px"></div>' + (mgr ? '<label style="display:flex;gap:8px;align-items:center;margin-top:8px;font-size:.85rem"><input type="checkbox" id="sc-force" style="width:auto"> Save it even if the score breaks the format rules (admin override)</label>' : "") +
      '<label style="display:block;margin-top:10px;font-size:.8rem;color:#5d6b57">Photo of the score sheet (optional)</label><input type="file" id="sc-proof" accept="image/*">' +
      '<button class="btn btn-primary" id="sc-save" style="width:100%;margin-top:12px">' + (mgr ? "Save result" : "Submit score") + '</button><div class="muted small" style="margin-top:6px">' + (mgr ? "As league admin your entry counts straight away." : "Your opponent can confirm or dispute it. It counts automatically after " + L.confirm_hours + " hours.") + "</div></div>";
    document.body.appendChild(box);
    var sty = box.querySelectorAll("input"); sty.forEach(function (i) { i.style.cssText = "width:100%;padding:9px;border:1.5px solid #dfe6d3;border-radius:8px;font:inherit"; }); box.querySelector("#sc-proof").style.cssText = "width:100%";
    var read = function () {
      return [].map.call(box.querySelectorAll(".sr"), function (r, i) { var g = function (f) { var v = r.querySelector('[data-f="' + f + '"]').value; return v === "" ? null : +v; }; var s = { a: g("a"), b: g("b") }; var ta = g("tba"), tb = g("tbb"); if (ta != null) s.tba = ta; if (tb != null) s.tbb = tb; if (L.match_format === "best_of_3" && L.final_set_match_tiebreak && i === 2 && r.dataset.mt === "1") s.mt = true; return s; });
    };
    var showTb = function () {
      box.querySelectorAll(".sr").forEach(function (r, i) {
        var a = r.querySelector('[data-f="a"]').value, b = r.querySelector('[data-f="b"]').value, tb = r.querySelector(".tb"), ai = +a, bi = +b, mt = r.dataset.mt === "1";
        var need = a !== "" && b !== "" && !mt && ((fixed && L.games_per_match % 2 === 0 && ai === bi) || (!fixed && Math.max(ai, bi) === L.games_to_win + 1 && Math.min(ai, bi) === L.games_to_win)); tb.style.display = need ? "" : "none";
      });
      if (!fixed && L.match_format === "best_of_3" && L.final_set_match_tiebreak) { var rows = box.querySelectorAll(".sr"); if (rows[2]) { rows[2].dataset.mt = "1"; rows[2].querySelector("b").textContent = "Match tiebreak (first to 10)"; } }
    };
    box.addEventListener("input", function () { showTb(); $("sc-err").textContent = ""; }); showTb();
    box.addEventListener("click", async function (e) {
      if (e.target === box || (e.target.dataset && e.target.dataset.x !== undefined)) return box.remove();
      if (e.target.id === "sc-add") { var n = box.querySelectorAll(".sr").length; if (n >= maxs) return; $("sc-rows").insertAdjacentHTML("beforeend", setRow(n, {})); box.querySelectorAll("#sc-rows input").forEach(function (i) { i.style.cssText = "width:100%;padding:9px;border:1.5px solid #dfe6d3;border-radius:8px;font:inherit"; }); showTb(); }
      if (e.target.id === "sc-save") {
        var sets = read(), err = validate(L, sets), force = $("sc-force") && $("sc-force").checked; if (err && !force) { $("sc-err").textContent = err; return; }
        e.target.disabled = true; var path = null, f = $("sc-proof").files[0];
        try {
          if (f) { var ext = (f.name.split(".").pop() || "jpg").toLowerCase(); path = m.league_id + "/" + m.id + "-" + Date.now() + "." + ext; var up = await sb.storage.from("league-proofs").upload(path, f); if (up.error) throw up.error; }
          var r = await sb.rpc("report_league_result", { p_match: m.id, p_sets: sets, p_proof: path || "", p_force: !!force }); if (r.error) throw r.error; box.remove(); toast(r.data); onDone();
        } catch (er) { e.target.disabled = false; $("sc-err").textContent = er.message || String(er); }
      }
    });
  }

  // ------------------------------------------------------------ one league
  async function viewLeague(id) {
    var root = $("lg"); root.innerHTML = '<div class="box">Loading…</div>';
    var L = (await sb.from("leagues").select("*").eq("id", id).maybeSingle()).data;
    if (!L) { root.innerHTML = '<div class="box"><b>League not found.</b><div class="acts"><button onclick="location.hash=\'\'">← All leagues</button></div></div>'; return; }
    var P = (await sb.from("league_participants").select("*").eq("league_id", id).order("seed")).data || [], M = (await sb.from("league_matches").select("*").eq("league_id", id).order("round").order("due_at", { nullsFirst: false }).order("created_at")).data || [];
    var can = !!ME.id && (L.created_by === ME.id || ME.exec || ME.admin || ME.email === "saulestoo@gmail.com"), name = {}; P.forEach(function (p) { name[p.id] = p.name; });
    var st = standings(L, P, M), myIds = P.filter(function (p) { return p.user_id === ME.id; }).map(function (p) { return p.id; }), mine = P.some(function (p) { return p.user_id === ME.id && !p.withdrawn; });
    var open = L.status === "open" && L.open_registration && L.approval === "approved" && (!L.entry_closes_at || new Date(L.entry_closes_at) > new Date());
    var tennis = isTennisSet(L), bySets = L.rank_by === "sets" && tennis;
    var html = '<div class="acts" style="margin:0 0 10px"><button id="back">← All leagues</button><button id="share">Share</button><button onclick="window.print()">Print</button></div>';
    html += '<div class="box"><span class="pill ' + (L.kind === "official" ? "p-off" : "p-fun") + '">' + (L.kind === "official" ? "Official" : "Fun") + '</span> <span class="pill ' + (L.approval === "pending" ? "p-pend" : L.status === "in_progress" ? "p-live" : "p-st") + '">' + (L.approval === "pending" ? "Waiting for approval" : L.approval === "rejected" ? "Not approved" : L.status === "open" ? "Open to join" : L.status === "in_progress" ? "In progress" : "Finished") + '</span><h2 style="margin:8px 0 4px">' + h(L.name) + "</h2>" +
      '<div class="muted small">' + h(FORMATS[L.format]) + " · " + (L.participant_type === "pairs" ? "pairs" : "singles") + (L.venue ? " · " + h(L.venue) : "") + (L.starts_at ? " · starts " + fmtD(L.starts_at) : "") + (L.entry_closes_at ? " · entries close " + fmtD(L.entry_closes_at) : "") + (L.creator_name ? " · run by " + h(L.creator_name) : "") + "</div>" +
      '<div style="margin-top:6px"><b>Scoring:</b> ' + h(scoringLine(L)) + ". " + (tennis ? "Ranked by " + (bySets ? "sets won, then game difference" : "games won, then head-to-head and game difference") + "." : "Ranked by total games won, then head-to-head and game difference.") + "</div>" +
      (L.description ? '<p style="margin:8px 0 0">' + h(L.description) + "</p>" : "") + (L.rules ? '<p class="muted" style="margin:8px 0 0;white-space:pre-line">' + h(L.rules) + "</p>" : "") + "</div>";
    if (L.approval === "pending" && (ME.exec || ME.admin)) html += '<div class="box" style="border-color:#f0d28a;background:#fffdf3"><b>This official league is waiting for approval.</b><div class="acts"><button class="go" id="appr">Approve</button><button class="no" id="rej">Reject</button></div></div>';
    if (L.status === "finished" && st.length >= 3) html += '<div class="podium"><div class="p2">🥈<br>' + h(st[1].p.name) + "<small>" + (bySets ? st[1].sw + " sets" : st[1].gw + " games") + '</small></div><div class="p1">🏆<br>' + h(st[0].p.name) + "<small>" + (bySets ? st[0].sw + " sets" : st[0].gw + " games") + '</small></div><div class="p3">🥉<br>' + h(st[2].p.name) + "<small>" + (bySets ? st[2].sw + " sets" : st[2].gw + " games") + "</small></div></div>";
    if (open && L.approval === "approved") html += '<div class="box"><b>Join this league</b>' + (ME.id ? (mine ? '<div class="muted">You are entered ✓</div>' : '<div class="g2" style="margin-top:6px"><input id="j-name" value="' + h(L.participant_type === "pairs" ? ME.name + " & " : ME.name) + '" placeholder="' + (L.participant_type === "pairs" ? "You & your partner" : "Your name") + '"><button class="btn btn-primary" id="join">Enter</button></div>') : '<div><a class="btn btn-primary" href="auth.html">Sign in to enter</a></div>') + "</div>";
    if (L.format !== "knockout" || L.status !== "open") {
      html += '<div class="box"><h3 style="margin:0 0 8px">Table</h3>' + (st.length ? '<div style="overflow:auto"><table class="st"><thead><tr><th>#</th><th>' + (L.participant_type === "pairs" ? "Pair" : "Player") + '</th><th class="n">P</th><th class="n">W</th><th class="n">L</th>' + (tennis ? '<th class="n">Sets</th>' : "") + '<th class="n">Games</th><th class="n">+/−</th></tr></thead><tbody>' + st.map(function (r, i) {
        var gd = r.gw - r.gl; return '<tr class="' + (i === 0 && L.status === "finished" ? "top" : "") + '"><td>' + (i + 1) + "</td><td>" + h(r.p.name) + '</td><td class="n">' + r.pl + '</td><td class="n">' + r.w + '</td><td class="n">' + r.l + "</td>" + (tennis ? '<td class="n">' + r.sw + "–" + r.sl + "</td>" : "") + '<td class="n"><b>' + (bySets ? "" : "") + r.gw + "</b>–" + r.gl + '</td><td class="n">' + (gd > 0 ? "+" : "") + gd + "</td></tr>"; }).join("") + '</tbody></table></div><div class="muted small" style="margin-top:6px">P = matches played, W/L = matches won/lost' + (tennis ? ", Sets = sets won–lost" : "") + ", Games = games won–lost, +/− = game difference. Only confirmed scores count. " + (bySets ? "Ranked by sets won; ties by set difference, game difference, games won, then head-to-head." : "Ranked by games won; ties by head-to-head, game difference" + (tennis ? ", then set difference" : "") + ".") + "</div>" : '<div class="muted">Nobody has entered yet.</div>') + "</div>";
    } else html += '<div class="box"><h3 style="margin:0 0 8px">Entered (' + P.length + ')</h3>' + (P.map(function (p) { return h(p.name); }).join(" · ") || "Nobody yet.") + "</div>";
    if (L.format !== "knockout" && P.length >= 3 && M.some(function (m) { return m.status === "confirmed" || m.status === "walkover"; })) {
      var cell = {}; M.forEach(function (m) { if (!(m.status === "confirmed" || m.status === "walkover") || !m.b_id) return; cell[m.a_id + ">" + m.b_id] = m.a_games; cell[m.b_id + ">" + m.a_id] = m.b_games; });
      html += '<div class="box"><h3 style="margin:0 0 8px">Results grid</h3><div class="xt"><table><thead><tr><th></th>' + st.map(function (c, i) { return "<th>" + (i + 1) + "</th>"; }).join("") + "<th>Games won</th></tr></thead><tbody>" + st.map(function (r, i) { var tot = 0; var cells = st.map(function (c, j) { if (i === j) return '<td class="d"></td>'; var v = cell[r.p.id + ">" + c.p.id]; if (v == null) return "<td>·</td>"; tot += v; return '<td class="' + (v > (cell[c.p.id + ">" + r.p.id] || 0) ? "w" : "") + '">' + v + "</td>"; }).join(""); return "<tr><th>" + (i + 1) + " " + h(r.p.name) + "</th>" + cells + '<td class="t">' + tot + "</td></tr>"; }).join("") + '</tbody></table></div><div class="muted small" style="margin-top:6px">Each cell is the games the row player won against that column. Green = won the match.</div></div>';
    }
    // fixtures
    if (M.length) {
      var rounds = {}; M.forEach(function (m) { (rounds[m.round] = rounds[m.round] || []).push(m); });
      html += '<div class="box"><h3 style="margin:0 0 4px">Fixtures &amp; results</h3>' + Object.keys(rounds).sort(function (a, b) { return a - b; }).map(function (r) {
        return '<div class="rd">Round ' + r + "</div>" + rounds[r].map(function (m) {
          var mineA = myIds.indexOf(m.a_id) >= 0, mineB = myIds.indexOf(m.b_id) >= 0, isMine = mineA || mineB, wn = (m.status === "confirmed" || m.status === "walkover") ? matchWinner(L, m) : null;
          var A = h(name[m.a_id] || "?"), B = m.b_id ? h(name[m.b_id] || "?") : "<i>bye</i>";
          var repSide = m.reported_by && P.filter(function (p) { return p.id === m.a_id && p.user_id === m.reported_by; }).length ? "a" : "b";
          var left = Math.max(0, Math.round((new Date(m.reported_at || 0).getTime() + L.confirm_hours * 36e5 - Date.now()) / 36e5));
          var status = m.status === "reported" ? '<span class="pill p-pend">Waiting for confirmation · auto in ' + left + "h</span>" : m.status === "disputed" ? '<span class="pill p-pend">Disputed' + (m.dispute_note ? ": " + h(m.dispute_note) : "") + "</span>" : m.status === "walkover_claim" ? '<span class="pill p-pend">Walkover claimed</span>' : m.status === "walkover" ? '<span class="pill p-st">Walkover</span>' : "";
          var acts = "";
          if (m.b_id) {
            if (m.status === "scheduled" || m.status === "disputed") { if (isMine || can) acts += '<button data-score="' + m.id + '">Enter score</button>'; if (isMine && m.due_at && new Date(m.due_at) < new Date() && m.status === "scheduled") acts += '<button data-wo="' + m.id + '">Claim walkover</button>'; }
            if (m.status === "reported") { var iAmReporter = m.reported_by === ME.id; if (iAmReporter) acts += '<button data-cancel="' + m.id + '">Withdraw my score</button>'; else if (isMine) acts += '<button class="go" data-ok="' + m.id + '">Confirm</button><button class="no" data-dis="' + m.id + '">Dispute</button>'; if (can) acts += '<button data-score="' + m.id + '">Correct</button><button class="go" data-ok="' + m.id + '">Approve</button>'; }
            if ((m.status === "confirmed" || m.status === "walkover") && can) acts += '<button data-score="' + m.id + '">Edit</button>';
            if (m.status === "walkover_claim" && can) acts += '<button class="go" data-woy="' + m.id + '">Approve walkover</button><button class="no" data-won="' + m.id + '">Reject</button>';
          }
          var score = (m.status === "confirmed" || m.status === "walkover" || m.status === "reported") && m.sets && m.sets.length ? h(scoreText(L, m)) : "v";
          return '<div class="mt" data-m="' + m.id + '" style="flex-wrap:wrap"><div class="t">' + (wn === "a" ? '<b class="w">' + A + "</b>" : A) + '</div><div class="sc" style="min-width:90px">' + score + '</div><div class="t r">' + (wn === "b" ? '<b class="w">' + B + "</b>" : B) + '</div><div style="flex-basis:100%;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span class="muted small">' + (m.due_at ? fmtDT(m.due_at) : "No date yet") + (m.court ? " · " + h(m.court) : "") + (m.proof_path ? ' · <a href="#" data-proof="' + h(m.proof_path) + '">score photo</a>' : "") + "</span>" + status + '<span class="acts" style="margin:0 0 0 auto">' + acts + (can && m.b_id ? '<button data-edit="' + m.id + '">Date/court</button><button class="no" data-delm="' + m.id + '">×</button>' : "") + "</span></div></div>";
        }).join("");
      }).join("") + "</div>";
    }
    if (can) {
      var opts = P.map(function (p) { return '<option value="' + p.id + '">' + h(p.name) + "</option>"; }).join("");
      html += '<div class="box"><h3 style="margin:0 0 6px">Manage this league</h3><p class="muted small" style="margin:0 0 8px">The person who runs the league, administrators, the executive and Saul can change everything here.</p>' +
        '<div class="g2"><input id="a-name" placeholder="Add a ' + (L.participant_type === "pairs" ? "pair (Name & Name)" : "player") + '"><button class="btn btn-outline" id="a-add">Add</button></div>' +
        (P.length ? '<div class="muted small" style="margin-top:8px">' + P.map(function (p) { return h(p.name) + ' <a href="#" data-rm="' + p.id + '" style="color:#b23b2e">remove</a>'; }).join(" · ") + "</div>" : "") +
        '<div class="acts">' + (!M.length && L.approval === "approved" ? '<button class="go" id="gen">Create the fixtures automatically</button>' : "") + '<button id="settings">League settings</button><button class="no" id="del">Delete this league</button></div>' +
        (P.length > 1 ? '<h4 style="margin:14px 0 4px">Add a fixture</h4><div class="g2"><select id="f-a">' + opts + '</select><select id="f-b">' + opts + '</select></div><div class="g2" style="margin-top:6px"><input id="f-round" type="number" min="1" placeholder="Round (e.g. 1)" value="' + (M.length ? Math.max.apply(null, M.map(function (m) { return m.round; })) : 1) + '"><input id="f-due" type="datetime-local"></div><div class="g2" style="margin-top:6px"><input id="f-court" placeholder="Court (optional)"><button class="btn btn-outline" id="f-add">Add fixture</button></div>' : "") + "</div>";
    }
    root.innerHTML = html;
    var on = function (id2, fn) { var n = $(id2); if (n) n.onclick = fn; }, again = function () { viewLeague(id); };
    on("back", function () { location.hash = ""; });
    on("share", function () { var u = location.origin + location.pathname + "#l/" + id; if (navigator.share) navigator.share({ title: L.name, url: u }).catch(function () {}); else { try { navigator.clipboard.writeText(u); toast("Link copied."); } catch (e) { toast(u); } } });
    on("appr", async function () { var x = await sb.rpc("approve_league", { p_league: id, p_ok: true }); toast(x.error ? x.error.message : "Approved ✓", x.error ? "error" : "info"); again(); });
    on("rej", async function () { var x = await sb.rpc("approve_league", { p_league: id, p_ok: false }); toast(x.error ? x.error.message : "Rejected."); again(); });
    on("join", async function () { var x = await sb.rpc("join_league", { p_league: id, p_name: $("j-name").value }); toast(x.error ? x.error.message : x.data, x.error ? "error" : "info"); again(); });
    on("a-add", async function () { var v = $("a-name").value.trim(); if (!v) return; var x = await sb.from("league_participants").insert({ league_id: id, name: v, seed: P.length + 1 }); if (x.error) return toast(/duplicate|unique/i.test(x.error.message) ? "That name is already entered." : x.error.message, "error"); again(); });
    on("gen", async function () { var x = await sb.rpc("generate_league_fixtures", { p_league: id }); toast(x.error ? x.error.message : x.data, x.error ? "error" : "info"); again(); });
    on("del", async function () { if (!confirm("Delete this league and all its results? This cannot be undone.")) return; var x = await sb.from("leagues").delete().eq("id", id); if (x.error) return toast(x.error.message, "error"); window.KR_ACT && window.KR_ACT.log("league deleted", L.name, {}); location.hash = ""; });
    on("f-add", async function () { var a = $("f-a").value, b = $("f-b").value; if (a === b) return toast("Choose two different players.", "warn"); var due = $("f-due").value; var x = await sb.from("league_matches").insert({ league_id: id, stage: "league", round: +$("f-round").value || 1, a_id: a, b_id: b, due_at: due ? new Date(due).toISOString() : null, court: $("f-court").value.trim() || null }); if (x.error) return toast(x.error.message, "error"); toast("Fixture added ✓"); again(); });
    on("settings", function () { settingsModal(L, again); });
    root.onclick = async function (e) {
      var d = e.target.dataset || {}, mm = function (mid) { return M.filter(function (m) { return m.id === mid; })[0]; };
      if (d.rm) { e.preventDefault(); if (M.length && !confirm("Fixtures exist. Removing a player here won't change them. Remove anyway?")) return; var x = await sb.from("league_participants").delete().eq("id", d.rm); if (x.error) return toast(x.error.message, "error"); return again(); }
      if (d.score) return scoreModal(L, mm(d.score), name, can, again);
      if (d.ok) { var r = await sb.rpc("respond_league_result", { p_match: d.ok, p_accept: true }); toast(r.error ? r.error.message : r.data, r.error ? "error" : "info"); return again(); }
      if (d.dis) { var why = prompt("Why do you disagree with the score? (the league admin will see this)"); if (why === null) return; var r2 = await sb.rpc("respond_league_result", { p_match: d.dis, p_accept: false, p_note: why }); toast(r2.error ? r2.error.message : r2.data, r2.error ? "error" : "info"); return again(); }
      if (d.cancel) { await sb.rpc("cancel_league_report", { p_match: d.cancel }); return again(); }
      if (d.wo) { if (!confirm("Claim a walkover? Only do this if your opponent did not turn up. The league admin will check it.")) return; var r3 = await sb.rpc("claim_league_walkover", { p_match: d.wo }); toast(r3.error ? r3.error.message : r3.data, r3.error ? "error" : "info"); return again(); }
      if (d.woy || d.won) { var r4 = await sb.rpc("resolve_league_walkover", { p_match: d.woy || d.won, p_approve: !!d.woy }); if (r4.error) return toast(r4.error.message, "error"); return again(); }
      if (d.delm) { if (!confirm("Delete this fixture?")) return; var x2 = await sb.from("league_matches").delete().eq("id", d.delm); if (x2.error) return toast(x2.error.message, "error"); return again(); }
      if (d.edit) { var m = mm(d.edit), v = prompt("Date and time (YYYY-MM-DD HH:MM), blank to clear", m.due_at ? new Date(m.due_at).toISOString().slice(0, 16).replace("T", " ") : ""); if (v === null) return; var court = prompt("Court (optional)", m.court || ""); if (court === null) return; var dt = v.trim() ? new Date(v.replace(" ", "T")) : null; if (dt && isNaN(dt)) return toast("That date didn't look right.", "warn");
        var x3 = await sb.from("league_matches").update({ due_at: dt ? dt.toISOString() : null, court: court.trim() || null }).eq("id", d.edit); if (x3.error) return toast(x3.error.message, "error"); return again(); }
      if (d.proof) { e.preventDefault(); var u = await sb.storage.from("league-proofs").createSignedUrl(d.proof, 120); if (u.error) return toast("Could not open the photo.", "error"); window.open(u.data.signedUrl, "_blank", "noopener"); }
    };
  }
  function settingsModal(L, done) {
    var box = document.createElement("div"); box.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:12px";
    box.innerHTML = '<div id="st-box" style="background:#fff;border-radius:16px;max-width:520px;width:100%;max-height:92vh;overflow:auto;padding:16px"><div style="display:flex;justify-content:space-between"><b>League settings</b><button data-x style="border:0;background:#eef6d9;border-radius:99px;padding:6px 12px;cursor:pointer">✕</button></div><div id="lg"><label class="l">Name</label><input id="e-name" value="' + h(L.name) + '"><label class="l">About</label><textarea id="e-desc" rows="2">' + h(L.description || "") + '</textarea><label class="l">Venue</label><input id="e-venue" value="' + h(L.venue || "") + '"><label class="l">Rules</label><textarea id="e-rules" rows="3">' + h(L.rules || "") + "</textarea>" + scoringFields(L) +
      '<label class="l">Status</label><select id="e-status"><option value="open"' + (L.status === "open" ? " selected" : "") + '>Open to join</option><option value="in_progress"' + (L.status === "in_progress" ? " selected" : "") + '>In progress</option><option value="finished"' + (L.status === "finished" ? " selected" : "") + '>Finished</option></select><label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="e-open" style="width:auto"' + (L.open_registration ? " checked" : "") + '> Members can enter themselves</label><button class="btn btn-primary" id="e-save" style="width:100%">Save settings</button></div></div>';
    document.body.appendChild(box); box.querySelectorAll("input,select,textarea").forEach(function (i) { if (i.type !== "checkbox") i.style.cssText = "width:100%;padding:9px;border:1.5px solid #dfe6d3;border-radius:8px;font:inherit;background:#fff"; });
    wireScoring();
    box.addEventListener("click", async function (e) {
      if (e.target === box || (e.target.dataset && e.target.dataset.x !== undefined)) return box.remove();
      if (e.target.id === "e-save") { var s = readScoring(), x = await sb.from("leagues").update({ name: $("e-name").value.trim() || L.name, description: $("e-desc").value.trim() || null, venue: $("e-venue").value.trim() || null, rules: $("e-rules").value.trim() || null, status: $("e-status").value, open_registration: $("e-open").checked, match_format: s.p_match_format, games_per_match: s.p_games_per_match, games_to_win: s.p_games_to_win, tiebreak_to: s.p_tiebreak_to, final_set_match_tiebreak: s.p_final_mt, rank_by: s.p_rank_by, confirm_hours: s.p_confirm_hours }).eq("id", L.id); if (x.error) return toast(x.error.message, "error"); window.KR_ACT && window.KR_ACT.log("league settings changed", L.name, {}); box.remove(); toast("Saved ✓"); done(); }
    });
  }
  document.addEventListener("DOMContentLoaded", start);
  window.KR_LEAGUE_TEST = { standings: standings, validate: validate, scoreText: scoreText };
})();
