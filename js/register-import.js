// Import / compare the membership register with the treasurer's Google Sheet or Excel file, and align the differences.
// Entirely optional: if no link or file is ever added, nothing here runs and the site works as normal.
(function () {
  "use strict";
  var XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  var FIELDS = [["full_name", "Name"], ["membership_type_code", "Type"], ["email", "Email"], ["phone", "Phone"], ["expected_amount", "Expected"], ["paid_amount", "Paid"], ["form_submitted", "Form received"], ["date_form_received", "Form date"], ["proof_received", "Proof received"], ["last_payment_date", "Last payment"], ["treasurer_note", "Notes"], ["social_media", "Social media"]];
  var PFX = { league: "LGE", senior: "SN", pensioner: "SN", junior: "JN", family: "FAM", social: "SOC" };
  var state = { sheet: [], diff: null, source: "" };
  var el = function (id) { return document.getElementById(id); };
  var h = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var toast = function (m, t) { if (window.KR && window.KR.toast) window.KR.toast(m, t); };

  // ------------------------------------------------------------ reading the file
  function parseCSV(text) {
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); } return rows;
  }
  var xlsxP = null; function loadXlsx() { if (window.XLSX) return Promise.resolve(); if (!xlsxP) xlsxP = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = XLSX_URL; s.onload = res; s.onerror = function () { rej(new Error("Could not load the Excel reader. Save the sheet as CSV and upload that instead.")); }; document.head.appendChild(s); }); return xlsxP; }
  function fromFile(file) {
    if (/\.csv$/i.test(file.name)) return file.text().then(parseCSV);
    return loadXlsx().then(function () { return file.arrayBuffer(); }).then(function (buf) {
      var wb = window.XLSX.read(buf, { type: "array", cellDates: true }), name = wb.SheetNames.filter(function (n) { return /register|membership|tracking|member/i.test(n); })[0] || wb.SheetNames[0];
      return window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "" });
    });
  }
  function fromLink(url) {
    var id = (url.match(/\/d\/([\w-]+)/) || [])[1], gid = (url.match(/[?&#]gid=(\d+)/) || [])[1] || "0";
    if (!id) return Promise.reject(new Error("That doesn't look like a Google Sheets link."));
    var tries = /\/pub/.test(url) ? [url] : [];
    tries.push("https://docs.google.com/spreadsheets/d/" + id + "/gviz/tq?tqx=out:csv&gid=" + gid, "https://docs.google.com/spreadsheets/d/" + id + "/export?format=csv&gid=" + gid);
    return tries.reduce(function (p, u) { return p.catch(function () { return fetch(u).then(function (r) { if (!r.ok) throw new Error("blocked"); return r.text(); }).then(function (t) { if (/^\s*<(!doctype|html)/i.test(t)) throw new Error("login"); return parseCSV(t); }); }); }, Promise.reject(new Error("start")))
      .catch(function () { throw new Error("Google would not let the website read that sheet. Open it → Share → “Anyone with the link: Viewer”, or download it (File → Download → CSV / Excel) and upload the file here."); });
  }

  // ------------------------------------------------------------ turning rows into members
  var num = function (v) { if (v === "" || v == null) return null; var n = Number(String(v).replace(/[R\s,]/g, "")); return isNaN(n) ? null : n; };
  var yn = function (v) { var s = String(v == null ? "" : v).trim().toLowerCase(); return /^(yes|y|true|1)$/.test(s) ? true : /^(no|n|false|0)$/.test(s) ? false : null; };
  var pad = function (n) { return String(n).padStart(2, "0"); };
  function dt(v) {
    if (v instanceof Date && !isNaN(v)) return v.getFullYear() + "-" + pad(v.getMonth() + 1) + "-" + pad(v.getDate());
    if (typeof v === "number" && v > 20000) { var d = new Date(Math.round((v - 25569) * 864e5)); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
    var s = String(v == null ? "" : v).trim(); if (!s) return null; if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/); if (!m) return null; var y = +m[3]; if (y < 100) y += 2000; return y + "-" + pad(+m[2]) + "-" + pad(+m[1]);
  }
  var str = function (v) { if (v instanceof Date) return ""; var s = String(v == null ? "" : v).trim(); return s || null; };
  function typeCode(txt) {
    if (!txt) return null; var t = String(txt).toLowerCase(), types = window.TYPES || [];
    var hit = types.filter(function (x) { return x.name.toLowerCase() === t || x.code === t; })[0]; if (hit) return hit.code;
    var kw = /junior/.test(t) ? "junior" : /family/.test(t) ? "family" : /social/.test(t) ? "social" : /pension|senior|65/.test(t) ? "pension" : /league/.test(t) ? "league" : null;
    hit = types.filter(function (x) { return kw && (x.code.indexOf(kw) >= 0 || x.name.toLowerCase().indexOf(kw) >= 0); })[0]; return hit ? hit.code : null;
  }
  function mapRows(aoa) {
    var hi = -1; for (var i = 0; i < Math.min(aoa.length, 15); i++) { var cells = aoa[i].map(function (c) { return String(c).toLowerCase(); }); if (cells.some(function (c) { return /name/.test(c); }) && cells.some(function (c) { return /email|member|contact/.test(c); })) { hi = i; break; } }
    if (hi < 0) throw new Error("I couldn't find the column headings (like “Full Name” and “Email Address”) in that file.");
    var H = aoa[hi].map(function (c) { return String(c).toLowerCase().trim(); }), col = function (re, not) { for (var k = 0; k < H.length; k++) if (re.test(H[k]) && !(not && not.test(H[k]))) return k; return -1; };
    var C = { no: col(/member\s*no|member\s*number/), name: col(/full\s*name|^name/), type: col(/membership\s*type|category|^type/), email: col(/email/), phone: col(/contact|phone|cell|mobile/), form: col(/form\s*submitted/), formDate: col(/date\s*form/), payDate: col(/date\s*payment/), proof: col(/proof/), expected: col(/expected/), paid: col(/^paid|amount\s*paid/, /fee/), notes: col(/notes|follow/), social: col(/social/) };
    if (C.name < 0) throw new Error("There is no “Name” column in that file.");
    var out = []; for (var r = hi + 1; r < aoa.length; r++) {
      var row = aoa[r], g = function (k) { return k >= 0 ? row[k] : ""; }, name = str(g(C.name)); if (!name || /^total/i.test(name)) continue;
      out.push({ member_no: str(g(C.no)), full_name: name, membership_type_code: typeCode(str(g(C.type))), type_text: str(g(C.type)), email: (str(g(C.email)) || "").split(/[\s;,]+/)[0] || null, phone: str(g(C.phone)), form_submitted: yn(g(C.form)), date_form_received: dt(g(C.formDate)),
        last_payment_date: dt(g(C.payDate)), proof_received: yn(g(C.proof)), expected_amount: num(g(C.expected)), paid_amount: num(g(C.paid)), treasurer_note: str(g(C.notes)), social_media: str(g(C.social)) });
    }
    return out;
  }

  // ------------------------------------------------------------ comparing
  var sameVal = function (f, a, b) {
    if (a == null || b == null) return a == b;
    if (f === "expected_amount" || f === "paid_amount") return Math.abs(Number(a) - Number(b)) < 0.005;
    if (f === "phone") return String(a).replace(/\D/g, "") === String(b).replace(/\D/g, "");
    if (typeof a === "boolean" || typeof b === "boolean") return !!a === !!b;
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  };
  function compare(sheet, app) {
    var by = { no: {}, email: {}, name: {} }, key = function (s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); };
    app.forEach(function (r) { if (r.member_no) by.no[String(r.member_no).toUpperCase()] = r; if (r.email) by.email[key(r.email)] = r; by.name[key(r.full_name)] = r; });
    var used = {}, changed = [], onlySheet = [], same = 0;
    sheet.forEach(function (s) {
      var a = (s.member_no && by.no[s.member_no.toUpperCase()]) || (s.email && by.email[key(s.email)]) || by.name[key(s.full_name)];
      if (!a || used[a.id]) { onlySheet.push(s); return; } used[a.id] = true;
      var diffs = FIELDS.filter(function (f) { var sv = s[f[0]]; if (sv == null || sv === "") return false; return !sameVal(f[0], sv, a[f[0]]); }).map(function (f) { return { f: f[0], label: f[1], sheet: s[f[0]], app: a[f[0]] }; });
      if (diffs.length) changed.push({ app: a, sheet: s, diffs: diffs }); else same++;
    });
    return { changed: changed, onlySheet: onlySheet, onlyApp: app.filter(function (a) { return !used[a.id]; }), same: same };
  }
  var show = function (f, v) { if (v == null || v === "") return "—"; if (typeof v === "boolean") return v ? "Yes" : "No"; if (f === "expected_amount" || f === "paid_amount") return "R" + v; if (f === "membership_type_code") { var t = (window.TYPES || []).filter(function (x) { return x.code === v; })[0]; return t ? t.name : v; } return v; };

  // ------------------------------------------------------------ the dialog
  function open() {
    var old = el("imp-modal"); if (old) old.remove();
    var seasons = window.SEASONS || [], cur = window.SEASON;
    var m = document.createElement("div"); m.id = "imp-modal"; m.className = "dr-bg";
    m.innerHTML = '<div class="dr" style="width:min(760px,100%)"><div class="flex-between"><h2>Import / compare with the sheet</h2><button class="btn btn-outline btn-sm" data-x>Close</button></div>' +
      '<p class="muted small">Optional. Add your Google Sheet link or upload the Excel / CSV file, then choose which differences to bring into the website. Nothing changes until you tick things and press Apply.</p>' +
      '<div class="sec"><h4>1 · Where is the register?</h4><label>Google Sheets link</label><input type="text" id="imp-url" placeholder="https://docs.google.com/spreadsheets/d/…"><div class="acts" style="margin-top:8px"><button class="btn btn-primary btn-sm" id="imp-load">Load from link</button><button class="btn btn-outline btn-sm" id="imp-save">Remember this link</button></div>' +
      '<label style="margin-top:12px">…or upload the Excel / CSV file</label><input type="file" id="imp-file" accept=".xlsx,.xls,.csv"><div class="saved" id="imp-msg"></div></div>' +
      '<div class="sec"><h4>2 · Which season should it update?</h4><select id="imp-season">' + seasons.map(function (s) { return '<option value="' + s.id + '"' + (s.id === cur ? " selected" : "") + ">Season " + h(s.label) + (s.is_default ? " · current" : s.status === "closed" ? " · closed" : "") + "</option>"; }).join("") + '</select><p class="muted small" style="margin:6px 0 0">Starting a new financial year? Pick the new season. Seasons run 1 July to 30 June.</p></div>' +
      '<div id="imp-out"></div></div>';
    document.body.appendChild(m);
    m.addEventListener("click", function (e) { if (e.target === m || (e.target.dataset && e.target.dataset.x !== undefined)) m.remove(); });
    window.sb.rpc("register_source_info").then(function (r) { if (r.data && r.data.url) el("imp-url").value = r.data.url; }, function () {});
    el("imp-save").onclick = function () { window.sb.rpc("set_register_source", { p_url: el("imp-url").value.trim() }).then(function (r) { el("imp-msg").textContent = r.error ? r.error.message : "Link remembered ✓"; }); };
    el("imp-load").onclick = function () { var u = el("imp-url").value.trim(); if (!u) return (el("imp-msg").textContent = "Paste the sheet link first."); busy("Reading the sheet…"); fromLink(u).then(ready, fail); };
    el("imp-file").onchange = function (e) { var f = e.target.files[0]; if (f) { busy("Reading " + f.name + "…"); fromFile(f).then(ready, fail); } };
    el("imp-season").onchange = function () { if (state.sheet.length) run(); };
  }
  var busy = function (t) { el("imp-msg").textContent = t; };
  var fail = function (e) { el("imp-msg").textContent = "⚠️ " + (e.message || e); };
  function ready(aoa) { try { state.sheet = mapRows(aoa); } catch (e) { return fail(e); } busy("Read " + state.sheet.length + " people from the file ✓"); run(); }
  function nextNo(app, code) { var max = app.reduce(function (m, r) { return Math.max(m, parseInt(((r.member_no || "").match(/(\d+)$/) || [])[1], 10) || 0); }, 0); return "KPTC-26-" + (PFX[code] || "MEM") + "-" + String(max + 1).padStart(3, "0"); }
  async function run() {
    var sid = el("imp-season").value, r = await window.sb.from("treasurer_standing").select("*").eq("season_id", sid); if (r.error) return fail(r.error);
    var app = r.data || [], d = state.diff = compare(state.sheet, app); state.app = app; state.sid = sid;
    var out = el("imp-out");
    out.innerHTML = '<div class="sec"><h4>3 · What is different</h4><p><b>' + d.same + "</b> people already match · <b>" + d.changed.length + "</b> differ · <b>" + d.onlySheet.length + "</b> only on the sheet · <b>" + d.onlyApp.length + "</b> only on the website</p>" +
      (d.changed.length ? '<div class="acts"><button class="btn btn-outline btn-sm" id="imp-allsheet">Use the sheet for all</button><button class="btn btn-outline btn-sm" id="imp-allapp">Keep the website for all</button></div>' : "") +
      d.changed.map(function (c, i) { return '<div class="flag" style="background:#fff;border-color:#dfe6d3"><b>' + h(c.app.full_name) + '</b> <span class="muted small">' + h(c.app.member_no || "") + "</span>" + c.diffs.map(function (x) { return '<div style="margin-top:6px"><b>' + h(x.label) + '</b><br><label style="display:inline-flex;gap:6px;align-items:center;margin:0 12px 0 0"><input type="radio" name="d' + i + "_" + x.f + '" value="sheet" checked style="width:auto"> Sheet: ' + h(show(x.f, x.sheet)) + '</label><label style="display:inline-flex;gap:6px;align-items:center;margin:0"><input type="radio" name="d' + i + "_" + x.f + '" value="app" style="width:auto"> Website: ' + h(show(x.f, x.app)) + "</label></div>"; }).join("") + "</div>"; }).join("") + "</div>" +
      (d.onlySheet.length ? '<div class="sec"><h4>On the sheet but not on the website</h4>' + d.onlySheet.map(function (s, i) { return '<label class="tog"><input type="checkbox" data-add="' + i + '" checked> Add <b>' + h(s.full_name) + "</b> " + h(s.type_text || "") + (s.expected_amount != null ? " · expected R" + s.expected_amount : "") + "</label>"; }).join("") + "</div>" : "") +
      (d.onlyApp.length ? '<div class="sec"><h4>On the website but not on the sheet</h4><p class="muted small">They stay unless you tick them.</p>' + d.onlyApp.map(function (a, i) { return '<label class="tog"><input type="checkbox" data-rm="' + i + '"> Remove <b>' + h(a.full_name) + "</b> " + h(a.member_no || "") + "</label>"; }).join("") + "</div>" : "") +
      ((d.changed.length || d.onlySheet.length || d.onlyApp.length) ? '<button class="btn btn-primary" id="imp-apply" style="width:100%">Apply the selected changes</button>' : '<div class="flag" style="background:#e2f4d4;border-color:#b7dfa0">✓ The website and the sheet already agree.</div>');
    if (el("imp-allsheet")) { el("imp-allsheet").onclick = function () { out.querySelectorAll('input[value="sheet"]').forEach(function (r) { r.checked = true; }); }; el("imp-allapp").onclick = function () { out.querySelectorAll('input[value="app"]').forEach(function (r) { r.checked = true; }); }; }
    if (el("imp-apply")) el("imp-apply").onclick = apply;
  }
  async function apply() {
    var d = state.diff, out = el("imp-out"), errors = [], n = { upd: 0, add: 0, rm: 0 };
    var sel = []; d.changed.forEach(function (c, i) { var p = {}; c.diffs.forEach(function (x) { var pick = out.querySelector('input[name="d' + i + "_" + x.f + '"]:checked'); if (pick && pick.value === "sheet") p[x.f] = x.sheet; }); if (Object.keys(p).length) sel.push([c.app, p]); });
    var adds = [].slice.call(out.querySelectorAll("[data-add]:checked")).map(function (c) { return d.onlySheet[+c.dataset.add]; }), rms = [].slice.call(out.querySelectorAll("[data-rm]:checked")).map(function (c) { return d.onlyApp[+c.dataset.rm]; });
    var total = sel.length + adds.length + rms.length; if (!total) return toast("Nothing is selected.", "warn");
    if (!confirm("Apply " + sel.length + " update(s), add " + adds.length + " and remove " + rms.length + " on the website?")) return;
    el("imp-apply").disabled = true;
    for (var i = 0; i < sel.length; i++) { var u = await window.sb.from("treasurer_standing").update(Object.assign({}, sel[i][1], { updated_at: new Date().toISOString() })).eq("id", sel[i][0].id); if (u.error) errors.push(sel[i][0].full_name + ": " + u.error.message); else n.upd++; }
    var app = state.app.slice();
    for (var j = 0; j < adds.length; j++) {
      var s = adds[j], code = s.membership_type_code || ((window.TYPES || [])[0] || {}).code, row = { source_key: "import-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + j), member_no: s.member_no || nextNo(app, code), full_name: s.full_name, membership_type_code: code, email: s.email, phone: s.phone,
        expected_amount: s.expected_amount || 0, paid_amount: s.paid_amount || 0, last_payment_date: s.last_payment_date, form_submitted: !!s.form_submitted, date_form_received: s.date_form_received, proof_received: !!s.proof_received, treasurer_note: s.treasurer_note, social_media: s.social_media, season_id: state.sid };
      var a = await window.sb.from("treasurer_standing").insert(row).select().single(); if (a.error) errors.push(s.full_name + ": " + a.error.message); else { n.add++; app.push(a.data); }
    }
    for (var k = 0; k < rms.length; k++) { var dl = await window.sb.from("treasurer_standing").delete().eq("id", rms[k].id); if (dl.error) errors.push(rms[k].full_name + ": " + (/foreign key|violates/i.test(dl.error.message) ? "linked to a family account" : dl.error.message)); else n.rm++; }
    toast("Done: " + n.upd + " updated, " + n.add + " added, " + n.rm + " removed." + (errors.length ? " " + errors.length + " could not be applied." : ""), errors.length ? "warn" : "info");
    if (window.SEASON === state.sid && typeof window.load === "function") await window.load();
    await run(); if (errors.length) { var box = document.createElement("div"); box.className = "flag"; box.innerHTML = "<b>Could not apply:</b><br>" + errors.map(h).join("<br>"); el("imp-out").prepend(box); }
  }
  document.addEventListener("DOMContentLoaded", function () { var b = el("btn-import"); if (b) b.addEventListener("click", open); });
})();
