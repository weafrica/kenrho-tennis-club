// Fundraisers: one-day events (like Spring Smash) and ongoing appeals. Public giving, plate reservations, supporters wall, and a manager
// for the executive/admins and the fundraising team. Every gift is confirmed by hand and posted to the accounts as fundraising income.
(function () {
  "use strict";
  var sb = window.sb;
  var BANK = "Bank: First National Bank\nAccount name: KenRho Park Tennis Club\nAccount number: 62920283009\nBranch: Eastgate (Code: 257705)\nReference: Fundraiser + your name";
  var TIERS = [100, 250, 500, 1000, 2500];
  var ALL = [], F = null, PUB = {}, me = { id: null, name: "" }, qty = 1;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var R = function (n) { return "R" + (Number(n) || 0).toLocaleString("en-ZA", { maximumFractionDigits: 0 }).replace(/\u00a0/g, " "); };
  var toast = function (m, t) { if (window.KR && window.KR.toast) window.KR.toast(m, t); };
  var daysTo = function (d) { return d ? Math.ceil((new Date(d + "T23:59:59") - new Date()) / 864e5) : null; };
  var fmtLong = function (d) { return new Date(d + "T12:00:00").toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); };

  function pick(list) {
    var want = new URLSearchParams(location.search).get("f"); if (want) { var w = list.filter(function (x) { return x.slug === want; })[0]; if (w) return w; }
    var today = new Date().toISOString().slice(0, 10), up = list.filter(function (x) { return x.kind === "one_day" && x.event_date >= today; }).sort(function (a, b) { return a.event_date < b.event_date ? -1 : 1; });
    return up[0] || list.filter(function (x) { return x.kind === "ongoing"; })[0] || list[0];
  }
  function paint() {
    document.title = F.title + " — KenRho Park Tennis Club"; $("fund-title").textContent = F.title; $("fund-summary").textContent = F.summary || ""; $("fund-img").src = F.image_url && F.kind !== "one_day" ? F.image_url : "assets/logo.png";
    var ev = $("event");
    if (F.kind === "one_day" && F.event_date) {
      var d = new Date(F.event_date + "T12:00:00"), dl = daysTo(F.event_date);
      ev.style.display = ""; ev.innerHTML = '<div class="ev"><div class="dt"><span>' + d.toLocaleDateString("en-ZA", { weekday: "long" }) + "</span><b>" + d.getDate() + "</b><span>" + d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" }) + '</span></div><div><h2>' + esc(F.title) + '</h2><div style="font-weight:700">' + esc(F.time_label || "") + "</div><div class=\"muted\">" + esc(F.venue || "") + "</div>" +
        (F.price_label ? '<div class="pr">' + esc(F.price_label) + "</div>" : "") + (F.extra_info ? "<div>" + esc(F.extra_info) + "</div>" : "") + (dl != null ? '<div class="muted" style="margin-top:4px">' + (dl > 0 ? dl + " day" + (dl === 1 ? "" : "s") + " to go" : dl === 0 ? "Today!" : "This event has taken place — thank you!") + "</div>" : "") +
        '<div style="margin-top:8px"><button class="btn btn-sm btn-primary" id="ev-cal" type="button">Add to my calendar</button></div></div>' + (F.image_url ? '<img src="' + esc(F.image_url) + '" alt="' + esc(F.title) + ' poster">' : "") + "</div>";
      $("ev-cal").onclick = function () { var a = F.event_date.replace(/-/g, ""), ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:" + a + "\r\nSUMMARY:" + F.title + "\r\nLOCATION:" + (F.venue || "KenRho Park Tennis Club") + "\r\nDESCRIPTION:" + (F.time_label || "") + " " + (F.price_label || "") + "\r\nEND:VEVENT\r\nEND:VCALENDAR"; var l = document.createElement("a"); l.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); l.download = F.slug + ".ics"; l.click(); };
    } else ev.style.display = "none";
    var raised = Number(PUB.raised || 0), goal = Number(F.goal || 0), pct = goal > 0 ? Math.min(100, Math.round(raised / goal * 100)) : 0, plates = F.price_amount ? Number(PUB.plates || 0) : 0;
    $("progress").innerHTML = '<div class="big">' + R(raised) + '</div><div class="muted">raised' + (goal > 0 ? " of " + R(goal) + " goal" : "") + "</div>" + (goal > 0 ? '<div class="meter"><i style="width:' + pct + '%"></i></div>' : "") +
      '<div class="stats"><div><b>' + (PUB.donors || 0) + "</b><span>supporters</span></div>" + (F.price_amount && plates ? "<div><b>" + plates + "</b><span>plates confirmed</span></div>" : "") + (goal > 0 ? "<div><b>" + pct + "%</b><span>of goal</span></div>" : "") + "</div>";
    var st = $("story"); if (F.story) { st.style.display = ""; st.innerHTML = '<h2 style="margin:0 0 6px">' + (F.kind === "one_day" ? "About the day" : "Why we are fundraising") + '</h2><p style="white-space:pre-line;margin:0">' + esc(F.story) + "</p>"; } else st.style.display = "none";
    var w = PUB.wall || []; $("wall-box").style.display = w.length ? "" : "none"; $("wall").innerHTML = w.map(function (x) { return '<div class="w"><b>' + esc(x.name) + "</b>" + (x.message ? ' — “' + esc(x.message) + '”' : "") + "</div>"; }).join("");
    var oth = ALL.filter(function (x) { return x.id !== F.id && x.is_active; }), ob = $("others");
    if (oth.length) { ob.style.display = ""; ob.innerHTML = '<h2 style="margin:0 0 6px">More ways to help</h2>' + oth.map(function (x) { return '<div class="oth"><div style="flex:1"><a href="?f=' + esc(x.slug) + '">' + esc(x.title) + "</a><div class=\"muted small\">" + (x.kind === "one_day" && x.event_date ? fmtLong(x.event_date) : "Ongoing appeal") + "</div></div></div>"; }).join(""); } else ob.style.display = "none";
    // giving form: plates for events with a price, any amount otherwise
    var hasPrice = !!F.price_amount; $("plates-wrap").style.display = hasPrice ? "" : "none"; $("give-title").textContent = hasPrice ? "Reserve your plates" : "Give to the fundraiser"; $("amt-lbl").textContent = hasPrice ? "Total (R) — change it to add a donation on top" : "Amount (R)"; $("amts").style.display = hasPrice ? "none" : "";
    if (hasPrice) { $("plates-lbl").textContent = "How many plates? (" + F.price_label + ")"; $("plate-btns").innerHTML = [1, 2, 3, 4, 5, 6, 8, 10].map(function (n) { return '<button type="button" data-q="' + n + '" class="' + (n === qty ? "on" : "") + '">' + n + "</button>"; }).join(""); $("f-amt").value = qty * F.price_amount; }
    $("f-method").querySelector('option[value="cash"]').textContent = hasPrice ? "Cash on the day" : "Cash at the clubhouse";
  }
  async function load() {
    var r = await sb.from("fundraisers").select("*").eq("is_active", true).order("event_date", { nullsFirst: false });
    var list = r.data || []; if (!list.length) { $("progress").innerHTML = '<div class="muted">There is no fundraiser open right now. Please check back soon.</div>'; $("give").style.display = "none"; return null; }
    ALL = list; F = F ? (list.filter(function (x) { return x.id === F.id; })[0] || pick(list)) : pick(list);
    var p = await sb.rpc("fundraiser_public", { p_id: F.id }); PUB = p.data || {};
    var pl = await sb.from("fundraiser_pledges").select("quantity").eq("fundraiser_id", F.id).eq("status", "received"); if (pl.data) PUB.plates = pl.data.reduce(function (s, x) { return s + (x.quantity || 1); }, 0);
    paint(); return F;
  }

  function form() {
    $("amts").innerHTML = TIERS.map(function (a) { return '<button type="button" data-a="' + a + '">' + R(a) + "</button>"; }).join("");
    $("amts").onclick = function (e) { var a = e.target.dataset && e.target.dataset.a; if (!a) return; $("f-amt").value = a; [].forEach.call($("amts").children, function (b) { b.classList.toggle("on", b === e.target); }); };
    $("plate-btns").onclick = function (e) { var q = e.target.dataset && e.target.dataset.q; if (!q) return; qty = +q; [].forEach.call($("plate-btns").children, function (b) { b.classList.toggle("on", b.dataset.q === q); }); $("f-amt").value = qty * F.price_amount; };
    $("eft-box").textContent = BANK;
    $("f-method").onchange = function () { var eft = this.value === "eft"; $("eft-box").style.display = eft ? "" : "none"; $("proof-wrap").style.display = eft ? "" : "none"; };
    $("f-go").onclick = async function () {
      var amt = Number($("f-amt").value), name = $("f-name").value.trim(); if (!name) return toast("Please enter your name.", "warn"); if (!(amt > 0)) return toast("Choose or type an amount.", "warn");
      var btn = this; btn.disabled = true; var path = null;
      try {
        var f = $("f-proof").files[0];
        if (f && $("f-method").value === "eft") { var ext = (f.name.split(".").pop() || "dat").toLowerCase(); path = "fundraiser/" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()) + "." + ext; var up = await sb.storage.from("shop-payment-proofs").upload(path, f); if (up.error) throw up.error; }
        var q = F.price_amount ? qty : 1, r = await sb.rpc("submit_pledge", { p_fundraiser: F.id, p_name: name, p_email: $("f-email").value.trim(), p_phone: $("f-phone").value.trim(), p_amount: amt, p_message: $("f-msg").value.trim(), p_anonymous: $("f-anon").checked, p_method: $("f-method").value, p_proof: path || "", p_quantity: q });
        if (r.error) throw r.error;
        $("thanks-msg").textContent = F.price_amount ? "You have reserved " + q + " plate" + (q > 1 ? "s" : "") + " (" + R(amt) + "). " + ($("f-method").value === "eft" ? "Your reservation is confirmed once the payment shows in the bank." : "Please pay on the day and we will have your plate ready.") : "Your gift of " + R(amt) + " is noted. " + ($("f-method").value === "eft" ? "As soon as the treasurer sees the payment in the bank it will appear in the total." : "Please hand it to the treasurer at the clubhouse and it will appear in the total.");
        $("pg-form").classList.remove("on"); $("pg-thanks").classList.add("on");
      } catch (e) { toast(e.message || String(e), "error"); } finally { btn.disabled = false; }
    };
    $("again").onclick = function () { $("pg-thanks").classList.remove("on"); $("pg-form").classList.add("on"); };
    var share = function () { var url = location.origin + location.pathname + "?f=" + F.slug, text = F.title + (F.event_date ? " — " + fmtLong(F.event_date) + (F.time_label ? ", " + F.time_label : "") : "") + (F.price_label ? " · " + F.price_label : "") + ". Come and support KenRho Park Tennis Club!"; if (navigator.share) navigator.share({ title: F.title, text: text, url: url }).catch(function () {}); else window.open("https://wa.me/?text=" + encodeURIComponent(text + " " + url), "_blank", "noopener"); };
    $("share-btn").onclick = share; $("thanks-share").onclick = share;
  }

  // ------------------------------------------------------------ manager
  function logFund(action, label, oldV, newV) { return sb.from("site_edit_log").insert({ page: "fundraiser.html", target_type: "fundraiser", target_key: F.id, action: action, label: label, old_value: oldV, new_value: newV, edited_by: me.id, editor_name: me.name }); }
  async function manager() {
    var host = $("manager"); var pl = await sb.from("fundraiser_pledges").select("*").eq("fundraiser_id", F.id).order("created_at", { ascending: false }).limit(300); var rows = pl.data || [];
    var pending = rows.filter(function (p) { return p.status === "pending"; }), recd = rows.filter(function (p) { return p.status === "received"; }), plates = rows.filter(function (p) { return p.status !== "rejected"; }).reduce(function (s, p) { return s + (p.quantity || 1); }, 0);
    var ev = F.kind === "one_day";
    host.innerHTML = '<div class="box mgr"><h2 style="margin:0 0 6px">Manage this fundraiser <span class="muted" style="font-size:.8rem;font-weight:400">(admins &amp; fundraising team)</span></h2>' +
      '<div class="row"><label class="l">Title</label><input id="m-title" value="' + esc(F.title) + '"><label class="l">Short summary</label><input id="m-sum" value="' + esc(F.summary || "") + '"><label class="l">About</label><textarea id="m-story" rows="3">' + esc(F.story || "") + "</textarea>" +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label class="l">Type</label><select id="m-kind"><option value="one_day"' + (ev ? " selected" : "") + '>One-day event</option><option value="ongoing"' + (ev ? "" : " selected") + '>Ongoing appeal</option></select></div><div><label class="l">Event date</label><input id="m-date" type="date" value="' + (F.event_date || "") + '"></div>' +
      '<div><label class="l">Time</label><input id="m-time" value="' + esc(F.time_label || "") + '" placeholder="9:00 AM – 4:00 PM"></div><div><label class="l">Venue</label><input id="m-venue" value="' + esc(F.venue || "") + '"></div>' +
      '<div><label class="l">Price label</label><input id="m-plabel" value="' + esc(F.price_label || "") + '" placeholder="R80 per plate"></div><div><label class="l">Price (R, blank = any amount)</label><input id="m-price" type="number" min="0" value="' + (F.price_amount || "") + '"></div>' +
      '<div><label class="l">Goal (R, 0 = none)</label><input id="m-goal" type="number" min="0" value="' + (F.goal || 0) + '"></div><div><label class="l">Closing date</label><input id="m-dl" type="date" value="' + (F.deadline || "") + '"></div></div>' +
      '<label class="l">Extra info</label><input id="m-extra" value="' + esc(F.extra_info || "") + '" placeholder="Drinks will also be on sale."><label style="display:flex;gap:8px;align-items:center;margin:8px 0"><input type="checkbox" id="m-active" style="width:auto" ' + (F.is_active ? "checked" : "") + '> Open for giving</label><button class="sm go" id="m-save">Save changes</button><button class="sm" id="m-photo" type="button">📷 Change picture / poster</button><button class="sm" id="m-new" type="button">+ New fundraiser</button></div>' +
      '<div class="muted" style="margin:6px 0">Plates reserved so far: <b>' + plates + "</b></div><h3 style=\"margin:14px 0 4px\">Waiting to be confirmed (" + pending.length + ")</h3>" +
      (pending.map(function (p) { return '<div class="row"><b>' + esc(p.donor_name) + "</b> · " + R(p.amount) + (p.quantity > 1 || F.price_amount ? " · " + (p.quantity || 1) + " plate(s)" : "") + ' <span class="muted">· ' + p.method.toUpperCase() + " · " + new Date(p.created_at).toLocaleDateString("en-ZA") + "</span>" + (p.message ? "<br>“" + esc(p.message) + "”" : "") + (p.email || p.phone ? '<br><span class="muted">' + esc([p.email, p.phone].filter(Boolean).join(" · ")) + "</span>" : "") +
        "<div>" + (p.proof_path ? '<button class="sm" data-proof="' + esc(p.proof_path) + '">View proof</button>' : "") + '<button class="sm go" data-ok="' + p.id + '">✓ Money received (bank)</button><button class="sm" data-cash="' + p.id + '">💵 Received in cash</button><button class="sm no" data-no="' + p.id + '">✕ Reject</button></div></div>'; }).join("") || '<p class="muted">Nothing waiting.</p>') +
      '<h3 style="margin:14px 0 4px">Confirmed (' + recd.length + ')</h3><div class="muted" style="font-size:.85rem">' + (recd.map(function (p) { return esc(p.donor_name) + " " + R(p.amount); }).join(" · ") || "None yet.") + '</div><button class="sm" id="m-csv" style="margin-top:8px">Export all (CSV)</button></div>';
    $("m-save").onclick = async function () {
      var nv = { title: $("m-title").value.trim(), summary: $("m-sum").value.trim(), story: $("m-story").value.trim(), kind: $("m-kind").value, event_date: $("m-date").value || null, time_label: $("m-time").value.trim() || null, venue: $("m-venue").value.trim() || null, price_label: $("m-plabel").value.trim() || null, price_amount: $("m-price").value === "" ? null : Number($("m-price").value), extra_info: $("m-extra").value.trim() || null, goal: Number($("m-goal").value) || 0, deadline: $("m-dl").value || null, is_active: $("m-active").checked };
      if (!nv.title) return toast("A title is needed.", "warn");
      var old = Object.assign({}, F), r = await sb.from("fundraisers").update(nv).eq("id", F.id); if (r.error) return toast(r.error.message, "error");
      await logFund("edit", "Fundraiser “" + nv.title + "” updated", old, Object.assign({}, F, nv)); toast("Saved ✓ (tracked in the Edit activity feed)"); await load(); manager();
    };
    $("m-new").onclick = async function () { var t = prompt("Name of the new fundraiser (e.g. Braai Day)"); if (!t) return; var slug = t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + new Date().getFullYear(); var r = await sb.from("fundraisers").insert({ slug: slug, title: t.trim(), summary: "", kind: "one_day", goal: 0, is_active: true, created_by: me.id }).select().single(); if (r.error) return toast(r.error.message, "error"); await logFund("add", "New fundraiser “" + t + "”", null, r.data); location.href = "?f=" + slug; };
    $("m-photo").onclick = function () {
      var f = document.createElement("input"); f.type = "file"; f.accept = "image/*";
      f.onchange = async function () { var file = f.files[0]; if (!file) return; toast("Uploading…"); try { var b = await createImageBitmap(file), r = Math.min(1, 1600 / Math.max(b.width, b.height)), c = document.createElement("canvas"); c.width = Math.round(b.width * r); c.height = Math.round(b.height * r); c.getContext("2d").drawImage(b, 0, 0, c.width, c.height);
        var blob = await new Promise(function (res) { c.toBlob(res, "image/jpeg", 0.88); }), path = "fundraiser/" + Date.now() + ".jpg", up = await sb.storage.from("site-media").upload(path, blob, { contentType: "image/jpeg" }); if (up.error) throw up.error;
        var url = sb.storage.from("site-media").getPublicUrl(path).data.publicUrl, old = Object.assign({}, F), u = await sb.from("fundraisers").update({ image_url: url }).eq("id", F.id); if (u.error) throw u.error; await logFund("edit", "Fundraiser picture changed", old, Object.assign({}, F, { image_url: url })); await load(); toast("Picture updated ✓"); } catch (e) { toast(e.message || String(e), "error"); } };
      f.click();
    };
    host.onclick = async function (e) {
      var d = e.target.dataset || {};
      if (d.proof) { var u = await sb.storage.from("shop-payment-proofs").createSignedUrl(d.proof, 120); if (u.error) return toast("Could not open the proof.", "error"); window.open(u.data.signedUrl, "_blank", "noopener"); }
      if (d.ok || d.cash) { var r = await sb.rpc("confirm_pledge", { p_id: d.ok || d.cash, p_cash: !!d.cash }); toast(r.error ? r.error.message : r.data, r.error ? "error" : "info"); await load(); manager(); }
      if (d.no) { if (!confirm("Reject this pledge?")) return; var r2 = await sb.rpc("reject_pledge", { p_id: d.no }); toast(r2.error ? r2.error.message : "Rejected."); manager(); }
    };
    $("m-csv").onclick = function () { var q = function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }; var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([["Date,Name,Email,Phone,Amount,Plates,Method,Status,Message"].concat(rows.map(function (p) { return [p.created_at.slice(0, 10), p.donor_name, p.email, p.phone, p.amount, p.quantity, p.method, p.status, p.message].map(q).join(","); })).join("\n")], { type: "text/csv" })); a.download = F.slug + "-pledges.csv"; a.click(); };
  }

  document.addEventListener("DOMContentLoaded", async function () {
    form(); await load();
    try {
      var s = await sb.auth.getSession(); if (!s.data.session || !F) return; me.id = s.data.session.user.id;
      var ok = await sb.rpc("can_manage_fundraisers"); if (ok.data !== true) return;
      var pr = await sb.from("profiles").select("full_name,email").eq("id", me.id).single(); me.name = (pr.data && (pr.data.full_name || pr.data.email)) || "An admin";
      manager();
    } catch (e) {}
  });
})();
