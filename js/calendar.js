// Club calendar. Everyone reads it; admins, the executive and committee members add and edit events (with repeats, categories, RSVPs).
// League fixtures and fundraiser days are added automatically.
(function () {
  "use strict";
  var sb = window.sb, $ = function (id) { return document.getElementById(id); };
  var h = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var toast = function (m, t) { if (window.KR && window.KR.toast) window.KR.toast(m, t); else alert(m); };
  var CATS = { social: ["Social tennis", "#3c7a2e"], league: ["League", "#1B6C8F"], tournament: ["Tournament", "#7B3FA0"], coaching: ["Coaching", "#D4A017"], junior: ["Juniors", "#E07B39"], fundraiser: ["Fundraiser", "#C4293A"], meeting: ["Meeting", "#5d6b57"], maintenance: ["Courts & grounds", "#8a6a3a"], other: ["Other", "#2f4f4f"] };
  var ME = { id: null, name: "", edit: false }, VIEW = "month", CUR = new Date(), SEL = null, OFF = {}, RAW = { events: [], fund: [], matches: [], leagues: {}, names: {} };
  CUR.setDate(1); CUR.setHours(0, 0, 0, 0);
  var pad = function (n) { return String(n).padStart(2, "0"); }, key = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var tm = function (d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  var dayName = function (d) { return d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" }); };

  // ------------------------------------------------------------ build every occurrence in a range
  function occurrences(from, to) {
    var out = [];
    RAW.events.forEach(function (e) {
      var s = new Date(e.starts_at), en = e.ends_at ? new Date(e.ends_at) : null, dur = en ? en - s : 0, until = e.repeat_until ? new Date(e.repeat_until + "T23:59:59") : to, d = new Date(s), n = 0;
      while (d <= to && d <= until && n < 400) {
        if (d >= new Date(from.getTime() - 864e5 * 2) || e.repeat === "none") { if (d >= from && d <= to) out.push({ src: "event", id: e.id, e: e, title: e.title, cat: e.category, start: new Date(d), end: dur ? new Date(d.getTime() + dur) : null, allDay: e.all_day, loc: e.location, desc: e.description, link: e.link, occ: key(d), rsvp: e.rsvp_enabled }); }
        if (e.repeat === "none") break; var nx = new Date(d); if (e.repeat === "weekly") nx.setDate(nx.getDate() + 7); else if (e.repeat === "biweekly") nx.setDate(nx.getDate() + 14); else { var day = s.getDate(); nx.setDate(1); nx.setMonth(nx.getMonth() + 1); nx.setDate(Math.min(day, new Date(nx.getFullYear(), nx.getMonth() + 1, 0).getDate())); }
        d = nx; n++;
      }
    });
    RAW.fund.forEach(function (f) { var d = new Date(f.event_date + "T09:00:00"); if (d >= from && d <= to) out.push({ src: "fund", title: f.title, cat: "fundraiser", start: d, allDay: !f.time_label, loc: f.venue, desc: (f.time_label || "") + (f.price_label ? " · " + f.price_label : "") + (f.summary ? " — " + f.summary : ""), link: "fundraiser.html?f=" + f.slug, linkLabel: "Fundraiser page" }); });
    RAW.matches.forEach(function (m) { var d = new Date(m.due_at); if (d >= from && d <= to) { var L = RAW.leagues[m.league_id] || {}; out.push({ src: "match", title: (RAW.names[m.a_id] || "?") + " v " + (RAW.names[m.b_id] || "?"), cat: L.kind === "official" ? "tournament" : "league", start: d, loc: m.court ? "Court " + m.court : L.venue, desc: (L.name || "League") + " · Round " + m.round, link: "leagues.html#l/" + m.league_id, linkLabel: "Open the league" }); } });
    return out.filter(function (o) { return !OFF[o.cat]; }).sort(function (a, b) { return a.start - b.start; });
  }

  // ------------------------------------------------------------ data
  async function load() {
    var from = new Date(CUR.getFullYear(), CUR.getMonth() - 1, 1).toISOString(), to = new Date(CUR.getFullYear(), CUR.getMonth() + 2, 1).toISOString();
    var ev = await sb.from("club_events").select("*").order("starts_at"), fu = await sb.from("fundraisers").select("title,slug,event_date,time_label,venue,price_label,summary,is_active,kind").eq("is_active", true).eq("kind", "one_day").not("event_date", "is", null);
    var mt = await sb.from("league_matches").select("id,league_id,round,a_id,b_id,due_at,court,status").gte("due_at", from).lt("due_at", to).not("b_id", "is", null);
    RAW.events = ev.data || []; RAW.fund = fu.data || []; RAW.matches = (mt.data || []).filter(function (m) { return m.status !== "confirmed" && m.status !== "walkover" || true; });
    var lids = [...new Set(RAW.matches.map(function (m) { return m.league_id; }))];
    if (lids.length) { var l = await sb.from("leagues").select("id,name,kind,venue").in("id", lids), p = await sb.from("league_participants").select("id,name").in("league_id", lids); RAW.leagues = {}; (l.data || []).forEach(function (x) { RAW.leagues[x.id] = x; }); RAW.names = {}; (p.data || []).forEach(function (x) { RAW.names[x.id] = x.name; }); }
    draw();
  }

  // ------------------------------------------------------------ drawing
  function chips() { return '<div class="chips">' + Object.keys(CATS).map(function (k) { return '<button class="chip ' + (OFF[k] ? "off" : "") + '" data-cat="' + k + '"><i style="background:' + CATS[k][1] + '"></i>' + CATS[k][0] + "</button>"; }).join("") + "</div>"; }
  function draw() {
    var root = $("cal"), y = CUR.getFullYear(), mo = CUR.getMonth();
    var top = '<div class="top"><div style="display:flex;gap:6px;align-items:center"><button class="btn2" data-nav="-1">‹</button><button class="btn2" data-nav="0">Today</button><button class="btn2" data-nav="1">›</button><h2 style="margin-left:8px">' + CUR.toLocaleDateString("en-ZA", { month: "long", year: "numeric" }) + '</h2></div><div style="display:flex;gap:6px"><button class="btn2 ' + (VIEW === "month" ? "on" : "") + '" data-view="month">Month</button><button class="btn2 ' + (VIEW === "list" ? "on" : "") + '" data-view="list">List</button></div></div>';
    if (VIEW === "list") {
      var from = new Date(); from.setHours(0, 0, 0, 0); var to = new Date(from.getFullYear(), from.getMonth() + 4, 0, 23, 59), list = occurrences(from, to);
      root.innerHTML = '<div class="box">' + top.replace(/<h2.*?<\/h2>/, "<h2>Coming up</h2>") + chips() + (list.length ? list.map(agItem).join("") : '<div class="muted">Nothing coming up. ' + (ME.edit ? "Add the first event!" : "Check back soon.") + "</div>") + "</div>"; return;
    }
    var first = new Date(y, mo, 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7)); var end = new Date(start); end.setDate(end.getDate() + 41); end.setHours(23, 59);
    var occ = occurrences(start, end), by = {}; occ.forEach(function (o) { (by[key(o.start)] = by[key(o.start)] || []).push(o); });
    var cells = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(function (d) { return '<div class="h">' + d + "</div>"; }).join(""), d = new Date(start), todayK = key(new Date());
    for (var i = 0; i < 42; i++) {
      var k = key(d), list2 = by[k] || [];
      cells += '<div class="day' + (d.getMonth() !== mo ? " o" : "") + (k === todayK ? " today" : "") + (k === SEL ? " sel" : "") + '" data-day="' + k + '"><span class="n">' + d.getDate() + "</span>" + list2.slice(0, 3).map(function (o) { return '<span class="ev" style="background:' + CATS[o.cat][1] + '">' + (o.allDay ? "" : tm(o.start) + " ") + h(o.title) + "</span>"; }).join("") + (list2.length > 3 ? '<span class="ev" style="background:#9aa593">+' + (list2.length - 3) + " more</span>" : "") + '<div class="dots">' + list2.slice(0, 6).map(function (o) { return '<i style="background:' + CATS[o.cat][1] + '"></i>'; }).join("") + "</div></div>";
      d.setDate(d.getDate() + 1);
    }
    var selList = SEL ? (by[SEL] || []) : occ.filter(function (o) { return o.start.getMonth() === mo && o.start >= new Date(new Date().setHours(0, 0, 0, 0)); }).slice(0, 8);
    root.innerHTML = '<div class="box">' + top + chips() + '<div class="grid7">' + cells + '</div></div><div class="box"><h3 style="margin:0 0 6px">' + (SEL ? dayName(new Date(SEL + "T12:00:00")) : "Coming up this month") + (ME.edit && SEL ? ' <button class="btn2 go" data-addday="' + SEL + '" style="float:right">+ Add</button>' : "") + "</h3>" + (selList.length ? selList.map(agItem).join("") : '<div class="muted">Nothing on.</div>') + "</div>";
  }
  function agItem(o) {
    var i = RAW._idx = (RAW._idx || 0) + 1; o._i = i; (RAW._o = RAW._o || {})[i] = o;
    return '<div class="ag" data-o="' + i + '"><div class="d"><span>' + o.start.toLocaleDateString("en-ZA", { month: "short" }) + "</span><b>" + o.start.getDate() + "</b><span>" + o.start.toLocaleDateString("en-ZA", { weekday: "short" }) + '</span></div><div class="t"><span class="tag" style="background:' + CATS[o.cat][1] + '">' + CATS[o.cat][0] + "</span><b>" + h(o.title) + "</b><small>" + (o.allDay ? "All day" : tm(o.start) + (o.end ? "–" + tm(o.end) : "")) + (o.loc ? " · " + h(o.loc) : "") + (o.e && o.e.repeat !== "none" ? " · repeats " + o.e.repeat : "") + "</small></div></div>";
  }

  // ------------------------------------------------------------ event details + RSVP
  async function showEvent(o) {
    var counts = { going: 0, maybe: 0 }, mine = null;
    if (o.src === "event" && o.rsvp) { var c = await sb.rpc("event_rsvp_counts", { p_event: o.id }); (c.data || []).forEach(function (r) { if (r.occurrence === o.occ) { counts.going = +r.going; counts.maybe = +r.maybe; } }); if (ME.id) { var m = await sb.from("event_rsvps").select("status").eq("event_id", o.id).eq("occurrence", o.occ).eq("user_id", ME.id).maybeSingle(); mine = m.data && m.data.status; } }
    var rsvpHtml = "";
    if (o.src === "event" && o.rsvp) {
      var btns = ME.id ? `<button class="btn2 ${mine === "going" ? "go" : ""}" data-rsvp="going">I am going</button><button class="btn2 ${mine === "maybe" ? "on" : ""}" data-rsvp="maybe">Maybe</button>${mine ? '<button class="btn2" data-rsvp="none">Cancel</button>' : ""}` : '<a class="btn2" href="auth.html">Sign in to RSVP</a>';
      rsvpHtml = `<div style="background:#f3f9e6;border-radius:12px;padding:10px;margin-top:8px"><b>Are you coming?</b> <span class="muted small">${counts.going} going · ${counts.maybe} maybe</span><div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${btns}</div></div>`;
    }
    var box = modal('<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><span class="tag" style="background:' + CATS[o.cat][1] + '">' + CATS[o.cat][0] + '</span><h3 style="margin:6px 0 2px">' + h(o.title) + '</h3></div><button class="btn2" data-x>✕</button></div><div><b>' + dayName(o.start) + "</b><br>" + (o.allDay ? "All day" : tm(o.start) + (o.end ? " – " + tm(o.end) : "")) + (o.e && o.e.repeat !== "none" ? " · repeats " + o.e.repeat + (o.e.repeat_until ? " until " + o.e.repeat_until : "") : "") + "</div>" + (o.loc ? '<div style="margin-top:4px">📍 ' + h(o.loc) + "</div>" : "") + (o.desc ? '<p style="white-space:pre-line">' + h(o.desc) + "</p>" : "") + (o.link ? '<p><a href="' + h(o.link) + '">' + h(o.linkLabel || "More information") + " →</a></p>" : "") +
      rsvpHtml +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px"><button class="btn2 go" data-ics>Add to my calendar</button><button class="btn2" data-share>Share</button>' + (ME.edit && o.src === "event" ? '<button class="btn2" data-edit>Edit</button><button class="btn2" data-dup>Duplicate</button>' : "") + "</div>");
    box.addEventListener("click", async function (e) {
      var d = e.target.dataset || {}; if (d.x !== undefined) return box.remove();
      if (d.rsvp) { if (d.rsvp === "none") await sb.from("event_rsvps").delete().eq("event_id", o.id).eq("occurrence", o.occ).eq("user_id", ME.id); else await sb.from("event_rsvps").upsert({ event_id: o.id, user_id: ME.id, occurrence: o.occ, name: ME.name, status: d.rsvp }); box.remove(); showEvent(o); }
      if (d.ics !== undefined) download([o], o.title);
      if (d.share !== undefined) { var u = location.origin + location.pathname, t = o.title + " — " + dayName(o.start) + (o.allDay ? "" : " " + tm(o.start)) + (o.loc ? " · " + o.loc : ""); if (navigator.share) navigator.share({ title: o.title, text: t, url: u }).catch(function () {}); else window.open("https://wa.me/?text=" + encodeURIComponent(t + " " + u), "_blank", "noopener"); }
      if (d.edit !== undefined) { box.remove(); editor(o.e); } if (d.dup !== undefined) { box.remove(); editor(Object.assign({}, o.e, { id: null, title: o.e.title + " (copy)" })); }
    });
  }
  function modal(html) { var box = document.createElement("div"); box.className = "ov"; box.innerHTML = '<div class="md">' + html + "</div>"; document.body.appendChild(box); box.addEventListener("click", function (e) { if (e.target === box) box.remove(); }); return box; }

  // ------------------------------------------------------------ add / edit (admins, executive, committee)
  function editor(ev, dayKey) {
    ev = ev || {}; var s = ev.starts_at ? new Date(ev.starts_at) : (dayKey ? new Date(dayKey + "T09:00:00") : new Date(new Date().setHours(9, 0, 0, 0))), en = ev.ends_at ? new Date(ev.ends_at) : null;
    var loc = function (d) { return d ? key(d) + "T" + tm(d) : ""; };
    var box = modal('<div style="display:flex;justify-content:space-between"><b style="font-size:1.1rem">' + (ev.id ? "Edit event" : "Add an event") + '</b><button class="btn2" data-x>✕</button></div>' +
      '<label>Title</label><input id="e-title" value="' + h(ev.title || "") + '" placeholder="e.g. Social tennis Saturday">' +
      '<div class="g2"><div><label>Type</label><select id="e-cat">' + Object.keys(CATS).map(function (k) { return '<option value="' + k + '"' + ((ev.category || "social") === k ? " selected" : "") + ">" + CATS[k][0] + "</option>"; }).join("") + '</select></div><div><label>Where</label><input id="e-loc" value="' + h(ev.location || "KenRho Park Tennis Club") + '"></div></div>' +
      '<label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="e-all" style="width:auto"' + (ev.all_day ? " checked" : "") + '> All day</label><div class="g2"><div><label>Starts</label><input id="e-start" type="datetime-local" value="' + loc(s) + '"></div><div><label>Ends (optional)</label><input id="e-end" type="datetime-local" value="' + loc(en) + '"></div></div>' +
      '<div class="g2"><div><label>Repeats</label><select id="e-rep">' + [["none", "Does not repeat"], ["weekly", "Every week"], ["biweekly", "Every 2 weeks"], ["monthly", "Every month"]].map(function (r) { return '<option value="' + r[0] + '"' + ((ev.repeat || "none") === r[0] ? " selected" : "") + ">" + r[1] + "</option>"; }).join("") + '</select></div><div><label>Repeats until</label><input id="e-until" type="date" value="' + (ev.repeat_until || "") + '"></div></div>' +
      '<label>Details</label><textarea id="e-desc" rows="3">' + h(ev.description || "") + '</textarea><label>Link (optional)</label><input id="e-link" value="' + h(ev.link || "") + '" placeholder="https://…">' +
      '<label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="e-rsvp" style="width:auto"' + (ev.rsvp_enabled === false ? "" : " checked") + '> Let members say they are coming</label><label style="display:flex;gap:8px;align-items:center;margin-top:6px"><input type="checkbox" id="e-pub" style="width:auto"' + (ev.is_public === false ? "" : " checked") + '> Show to everyone (untick = committee only)</label>' +
      '<div style="display:flex;gap:8px;margin-top:14px"><button class="btn2 go" data-save style="flex:1">Save</button>' + (ev.id ? '<button class="btn2 no" data-del>Delete</button>' : "") + "</div>");
    box.addEventListener("click", async function (e) {
      var d = e.target.dataset || {}; if (d.x !== undefined) return box.remove();
      if (d.save !== undefined) {
        var title = $("e-title").value.trim(), st = $("e-start").value; if (!title || !st) return toast("A title and a start time are needed.", "warn");
        var row = { title: title, category: $("e-cat").value, location: $("e-loc").value.trim() || null, all_day: $("e-all").checked, starts_at: new Date(st).toISOString(), ends_at: $("e-end").value ? new Date($("e-end").value).toISOString() : null, repeat: $("e-rep").value, repeat_until: $("e-until").value || null, description: $("e-desc").value.trim() || null, link: $("e-link").value.trim() || null, rsvp_enabled: $("e-rsvp").checked, is_public: $("e-pub").checked, updated_by_name: ME.name, updated_at: new Date().toISOString() };
        var r = ev.id ? await sb.from("club_events").update(row).eq("id", ev.id) : await sb.from("club_events").insert(Object.assign(row, { created_by: ME.id, created_by_name: ME.name }));
        if (r.error) return toast(r.error.message, "error"); box.remove(); toast("Saved ✓"); load();
      }
      if (d.del !== undefined) { if (!confirm("Delete this event" + (ev.repeat !== "none" ? " and all its repeats" : "") + "?")) return; var x = await sb.from("club_events").delete().eq("id", ev.id); if (x.error) return toast(x.error.message, "error"); box.remove(); toast("Deleted."); load(); }
    });
  }

  // ------------------------------------------------------------ .ics
  function ics(list) {
    var z = function (d) { return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + "00Z"; }, ymd = function (d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); };
    var esc = function (s) { return String(s || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n"); };
    return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//KenRho Park Tennis Club//Calendar//EN\r\nCALSCALE:GREGORIAN\r\n" + list.map(function (o, i) {
      return "BEGIN:VEVENT\r\nUID:" + (o.id || "x") + "-" + ymd(o.start) + "-" + i + "@kenrhotennis\r\nDTSTAMP:" + z(new Date()) + "\r\n" + (o.allDay ? "DTSTART;VALUE=DATE:" + ymd(o.start) : "DTSTART:" + z(o.start) + "\r\nDTEND:" + z(o.end || new Date(o.start.getTime() + 36e5))) + "\r\nSUMMARY:" + esc(o.title) + "\r\n" + (o.loc ? "LOCATION:" + esc(o.loc) + "\r\n" : "") + (o.desc ? "DESCRIPTION:" + esc(o.desc) + "\r\n" : "") + "END:VEVENT\r\n";
    }).join("") + "END:VCALENDAR";
  }
  function download(list, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics(list)], { type: "text/calendar" })); a.download = (name || "kenrho-calendar").replace(/[^\w-]+/g, "_") + ".ics"; document.body.appendChild(a); a.click(); a.remove(); }

  // ------------------------------------------------------------ start
  document.addEventListener("DOMContentLoaded", async function () {
    var s = await sb.auth.getSession();
    if (s.data.session) { ME.id = s.data.session.user.id; var pr = await sb.from("profiles").select("full_name,email").eq("id", ME.id).single(); ME.name = (pr.data && (pr.data.full_name || pr.data.email)) || ""; var ok = await sb.rpc("can_edit_calendar"); ME.edit = ok.data === true; }
    if (ME.edit) $("add-btn").style.display = "";
    $("add-btn").onclick = function () { editor(null, SEL); };
    $("ics-btn").onclick = function () { var from = new Date(); from.setHours(0, 0, 0, 0); var to = new Date(from.getFullYear() + 1, from.getMonth(), from.getDate()); download(occurrences(from, to), "kenrho-park-calendar"); };
    $("cal").addEventListener("click", function (e) {
      var d = e.target.closest("[data-nav],[data-view],[data-cat],[data-day],[data-o],[data-addday]"); if (!d) return; var ds = d.dataset;
      if (ds.nav !== undefined) { if (ds.nav === "0") { CUR = new Date(); CUR.setDate(1); CUR.setHours(0, 0, 0, 0); SEL = key(new Date()); } else CUR.setMonth(CUR.getMonth() + +ds.nav); SEL = ds.nav === "0" ? SEL : null; return load(); }
      if (ds.view) { VIEW = ds.view; return draw(); } if (ds.cat) { OFF[ds.cat] = !OFF[ds.cat]; return draw(); }
      if (ds.addday) return editor(null, ds.addday); if (ds.day) { SEL = ds.day; return draw(); }
      if (ds.o) showEvent(RAW._o[ds.o]);
    });
    load();
  });
})();
