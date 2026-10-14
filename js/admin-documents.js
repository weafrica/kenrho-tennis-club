// Invoice & receipt maker for the treasurer and Saul. Saves to public.documents.
const DOC_ALLOWED = ["saulestoo@gmail.com"];
const D = window.KR_DOC;
let S = D.blank("invoice"), ST = [], SAVED = [], PROFILES = [], dirty = false, ME = null, SEASONS = [], DEFAULT_SEASON = null, SAVED_SEASON = null;
const $ = (id) => document.getElementById(id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const money = (v) => D.fmtR(v);

// ------------------------------------------------------------------ helpers
function touch() { dirty = true; refresh(); }
function refresh() { $("preview").innerHTML = D.previewHtml(S); updateHint(); }
function catFromCode(code) {
  const c = (code || "").toLowerCase();
  return c.includes("junior") ? "Junior" : c.includes("family") ? "Family" : c.includes("social") ? "Social"
    : c.includes("pension") || c.includes("senior") ? "Pensioner" : c.includes("league") ? "League" : "";
}
function tickCategory() {
  S.fees.forEach((f) => (f.on = false));
  const f = S.fees.find((x) => x.cat === S.category); if (f) f.on = true;
}
async function nextNumber(type, date) {
  const prefix = `KPTC-${type === "invoice" ? "INV" : "REC"}-${(date || new Date().toISOString()).slice(0, 4)}-`;
  const { data } = await window.sb.from("documents").select("doc_number").eq("doc_type", type).like("doc_number", prefix + "%");
  const max = (data || []).reduce((m, r) => Math.max(m, parseInt((r.doc_number.match(/(\d+)$/) || [])[1], 10) || 0), 0);
  return prefix + String(max + 1).padStart(3, "0");
}
const standingFor = () => ST.find((r) => r.id === S.standing_id);

// ------------------------------------------------------------------ rendering the form
function listRow(list, it, i) {
  const a = `data-list="${list}" data-i="${i}"`, rm = `<button class="x" data-rm="${list}" data-i="${i}" title="Remove">×</button>`;
  if (list === "fees") return `<div class="li"><input type="checkbox" ${a} data-k="on" ${it.on ? "checked" : ""}><input type="text" ${a} data-k="label" value="${D.esc(it.label)}" placeholder="Description"><input class="fee" type="number" step="0.01" ${a} data-k="fee" value="${D.esc(it.fee)}" placeholder="R">${rm}</div>`;
  if (list === "pay") return `<div class="li"><input class="k" type="text" ${a} data-k="k" value="${D.esc(it.k)}" placeholder="Label"><input type="text" ${a} data-k="v" value="${D.esc(it.v)}" placeholder="Detail">${rm}</div>`;
  if (list === "methods") return `<div class="li"><input type="checkbox" ${a} data-k="on" ${it.on ? "checked" : ""}><input type="text" ${a} data-k="label" value="${D.esc(it.label)}">${rm}</div>`;
  return `<div class="li"><input type="text" ${a} value="${D.esc(it)}" placeholder="Note">${rm}</div>`;
}
function renderLists() {
  [["fees", "fees-list"], ["pay", "pay-list"], ["methods", "methods-list"], ["notes", "notes-list"]].forEach(([l, id]) => {
    $(id).innerHTML = S[l].map((it, i) => listRow(l, it, i)).join("") || `<div class="muted small">Nothing here — add one below if needed.</div>`;
  });
}
function syncInputs() {
  const inv = S.type === "invoice";
  $("seg-invoice").classList.toggle("on", inv); $("seg-receipt").classList.toggle("on", !inv);
  $("blk-invoice").classList.toggle("hidden", !inv); $("blk-receipt").classList.toggle("hidden", inv);
  $("btn-to-receipt").classList.toggle("hidden", !inv);
  $("btn-delete").classList.toggle("hidden", !S.id);
  $("lbl-number").textContent = (inv ? "Invoice" : "Receipt") + " number (automatic, you can change it)";
  $("lbl-override").textContent = inv ? "Different total? (leave empty to use the ticked fees)" : "Fee total on this receipt (leave empty to use the ticked fees)";
  $("f-name").value = S.name; $("f-memno").value = S.member_no; $("f-date").value = S.date; $("f-number").value = S.number;
  $("f-override").value = S.override; $("f-paid").value = S.paid; $("f-ref").value = S.reference; $("f-method").value = S.method || "EFT";
  $("f-treasurer").value = S.treasurer; $("f-contact").value = S.contact;
  $("cat-pills").innerHTML = D.CATS.map((c) => `<button type="button" data-cat="${c}" class="${S.category === c ? "on" : ""}">${c}</button>`).join("");
  renderLists(); refresh();
}
function updateHint() {
  const r = standingFor(), h = $("hint");
  if (!r) { h.classList.add("hidden"); return; }
  const bal = Number(r.expected_amount || 0) - Number(r.paid_amount || 0);
  h.classList.remove("hidden");
  h.innerHTML = `On the sheet: expected <b>${money(r.expected_amount)}</b> · paid <b>${money(r.paid_amount)}</b> · ` +
    (bal > 0 ? `still owing <b>${money(bal)}</b> <button type="button" class="btn btn-sm btn-outline" id="use-balance">Use ${money(bal)}</button>` : `<b>nothing owing</b>`) + ` <button type="button" class="btn btn-sm btn-primary" data-stmt>📑 Statement of account</button>`;
  $("rec-sheet-lbl").textContent = `Also add this payment to ${r.full_name}'s Paid amount on the Membership sheet`;
}

// ------------------------------------------------------------------ member picking
function applyMember(r) {
  S.standing_id = r.id; S.name = r.full_name; S.member_no = r.member_no || "";
  S.category = catFromCode(r.membership_type_code) || S.category; tickCategory(); S.override = ""; S.paid = "";
  syncInputs(); dirty = true;
}
async function newDoc(type) {
  S = D.blank(type); S.number = await nextNumber(type, S.date); dirty = false; syncInputs();
}
async function setType(t) {
  if (S.type === t) return;
  if (S.id) return window.KR.toast("This document is already saved. Use “Make a receipt from this invoice” or start a new one.", "warn");
  const inv = D.DEFAULT_NOTES_INV();
  S.type = t; S.number = await nextNumber(t, S.date);
  if (t === "receipt" && JSON.stringify(S.notes) === JSON.stringify(inv)) S.notes = [];
  if (t === "invoice" && !S.notes.length) S.notes = inv;
  syncInputs(); dirty = true;
}

// ------------------------------------------------------------------ saving
async function save() {
  if (!S.name.trim()) { window.KR.toast("Please enter the member's name first.", "warn"); $("f-name").focus(); return false; }
  if (!S.number.trim()) { window.KR.toast("Please enter a document number.", "warn"); return false; }
  const c = D.calc(S), amount = S.type === "receipt" ? c.paid : c.due;
  if (!amount && !confirm("The amount is R0. Save anyway?")) return false;
  const row = { doc_type: S.type, doc_number: S.number.trim(), doc_date: S.date, member_name: S.name.trim(), member_no: S.member_no || null,
    category: S.category || null, amount, standing_id: S.standing_id || null, data: S, updated_at: new Date().toISOString() };
  const isNew = !S.id; let res;
  for (let attempt = 0; attempt < 2; attempt++) {
    row.doc_number = S.number.trim();
    res = isNew ? await window.sb.from("documents").insert({ ...row, created_by: ME.id }).select().single()
                : await window.sb.from("documents").update(row).eq("id", S.id).select().single();
    if (res.error && res.error.code === "23505" && isNew && attempt === 0) { S.number = await nextNumber(S.type, S.date); $("f-number").value = S.number; continue; }
    break;
  }
  if (res.error) { window.KR.toast(res.error.code === "23505" ? "That number is already used." : res.error.message, "error"); return false; }
  S.id = res.data.id; dirty = false;
  await window.sb.from("documents").update({ data: S }).eq("id", S.id);
  if (isNew && S.type === "receipt" && S.standing_id && $("rec-sheet").checked) {
    const r = standingFor();
    if (r) {
      const paid = Number(r.paid_amount || 0) + c.paid;
      const { error } = await window.sb.from("treasurer_standing").update({ paid_amount: paid, last_payment_date: S.date, updated_at: new Date().toISOString() }).eq("id", r.id);
      if (!error) { r.paid_amount = paid; r.last_payment_date = S.date; $("rec-sheet").checked = false; }
    }
  }
  if (isNew && S.type === "receipt" && $("rec-acc") && $("rec-acc").checked) { const rr = await window.sb.rpc("record_document_receipt", { p_doc: S.id, p_account: "4000" }); window.KR.toast(rr.error ? "Saved, but not recorded in the accounts: " + rr.error.message : rr.data, rr.error ? "warn" : "info"); }
  $("state-msg").textContent = `Saved ${S.number} ✓`; $("btn-delete").classList.remove("hidden");
  window.KR.toast(`${S.number} saved.`); loadSaved(); updateHint();
  return true;
}

// ------------------------------------------------------------------ saved list / existing
async function loadSaved() {
  let dq = window.sb.from("documents").select("id,doc_type,doc_number,doc_date,member_name,member_no,category,amount,data").order("created_at", { ascending: false }).limit(300);
  if (SAVED_SEASON) dq = dq.eq("season_id", SAVED_SEASON);
  const { data } = await dq;
  SAVED = data || []; renderSaved(); buildExisting();
}
function renderSaved() {
  const q = $("saved-q").value.trim().toLowerCase();
  const rows = SAVED.filter((r) => !q || (r.doc_number + " " + (r.member_name || "")).toLowerCase().includes(q));
  $("saved-body").innerHTML = rows.map((r) => `<tr><td><b>${D.esc(r.doc_number)}</b></td><td>${r.doc_type === "invoice" ? "Invoice" : "Receipt"}</td><td>${D.esc(r.member_name)}</td><td>${D.esc(r.category)}</td><td>${D.fmtDate(r.doc_date)}</td><td class="right">${money(r.amount)}</td>
    <td class="right" style="white-space:nowrap"><button class="btn btn-sm btn-outline" data-open="${r.id}">Open</button> <button class="btn btn-sm btn-outline" data-copy="${r.id}">Copy</button> <button class="btn btn-sm btn-outline" data-pdf="${r.id}">PDF</button> <button class="btn btn-sm btn-danger" data-del="${r.id}">Delete</button></td></tr>`).join("")
    || `<tr><td colspan="7" class="muted" style="padding:20px;">No saved documents yet.</td></tr>`;
}
async function buildExisting() {
  const sel = $("use-existing");
  const [{ data: inv }, { data: rec }] = await Promise.all([
    window.sb.from("invoices").select("*").order("created_at", { ascending: false }).limit(40),
    window.sb.from("receipts").select("*").eq("status", "verified").order("created_at", { ascending: false }).limit(40),
  ]);
  window._ledger = { inv: inv || [], rec: rec || [] };
  const nm = (id) => (PROFILES.find((p) => p.id === id) || {}).full_name || "Member";
  sel.innerHTML = `<option value="">Or start from an existing invoice / receipt…</option>` +
    (SAVED.length ? `<optgroup label="Saved documents">${SAVED.map((r) => `<option value="doc:${r.id}">${D.esc(r.doc_number)} — ${D.esc(r.member_name)}</option>`).join("")}</optgroup>` : "") +
    (inv && inv.length ? `<optgroup label="Invoices from the app">${inv.map((r) => `<option value="inv:${r.id}">${D.esc(r.invoice_number)} — ${D.esc(nm(r.member_id))} (${money(r.amount)})</option>`).join("")}</optgroup>` : "") +
    (rec && rec.length ? `<optgroup label="Verified receipts from the app">${rec.map((r) => `<option value="rec:${r.id}">${D.esc(r.receipt_number || "Receipt")} — ${D.esc(nm(r.member_id))} (${money(r.amount)})</option>`).join("")}</optgroup>` : "");
}
function matchStanding(name, email) {
  const e = (email || "").toLowerCase(), n = (name || "").trim().toLowerCase();
  return ST.find((r) => e && (r.email || "").toLowerCase() === e) || ST.find((r) => (r.full_name || "").trim().toLowerCase() === n);
}
async function useExisting(v) {
  const [kind, id] = v.split(":");
  if (kind === "doc") {
    const r = SAVED.find((x) => x.id === id); if (!r) return;
    S = clone(r.data); S.id = null; S.date = new Date().toISOString().slice(0, 10); S.number = await nextNumber(S.type, S.date);
    syncInputs(); dirty = true; return window.KR.toast("Copied. Change what you need, then save.");
  }
  const p = (mid) => PROFILES.find((x) => x.id === mid) || {};
  if (kind === "inv") {
    const r = window._ledger.inv.find((x) => x.id === id), pr = p(r.member_id); S = D.blank("invoice");
    S.name = pr.full_name || ""; S.override = r.amount; if (r.description) S.notes.unshift(r.description);
    const m = matchStanding(pr.full_name, pr.email); if (m) { S.standing_id = m.id; S.member_no = m.member_no || ""; S.category = catFromCode(m.membership_type_code); tickCategory(); }
  } else {
    const r = window._ledger.rec.find((x) => x.id === id), pr = p(r.member_id); S = D.blank("receipt");
    S.name = pr.full_name || ""; S.paid = r.amount; S.reference = r.reference || "";
    const m = matchStanding(pr.full_name, pr.email); if (m) { S.standing_id = m.id; S.member_no = m.member_no || ""; S.category = catFromCode(m.membership_type_code); tickCategory(); }
  }
  S.number = await nextNumber(S.type, S.date); syncInputs(); dirty = true;
  window.KR.toast("Details filled in. Check them, then save.");
}

// ------------------------------------------------------------------ boot
document.addEventListener("DOMContentLoaded", async () => {
  const guard = await window.KR_guard("staff"); if (!guard) return;
  ME = guard.profile;
  const ok = ME.status === "approved" && (ME.role === "treasurer" || DOC_ALLOWED.includes((ME.email || "").toLowerCase()));
  if (!ok) { window.location.href = "admin.html"; return; }
  $("who").textContent = ME.full_name || ME.email; $("btn-sign-out").addEventListener("click", window.KR_signOut);

  const { data: ssn } = await window.sb.from("seasons").select("*").order("starts_on", { ascending: false }); SEASONS = ssn || [];
  DEFAULT_SEASON = (SEASONS.find((x) => x.is_default) || {}).id || null; SAVED_SEASON = DEFAULT_SEASON;
  const [{ data: st }, { data: pr }] = await Promise.all([
    (DEFAULT_SEASON ? window.sb.from("treasurer_standing").select("*").eq("season_id", DEFAULT_SEASON) : window.sb.from("treasurer_standing").select("*")).order("full_name"),
    window.sb.from("profiles").select("id, full_name, email"),
  ]);
  ST = st || []; PROFILES = pr || [];
  $("members-dl").innerHTML = ST.map((r) => `<option value="${D.esc(r.full_name)}">${D.esc(r.member_no || "")}</option>`).join("");

  // static inputs
  const bind = (id, key, after) => $(id).addEventListener("input", (e) => { S[key] = e.target.value; if (after) after(e.target.value); touch(); });
  bind("f-memno", "member_no"); bind("f-date", "date"); bind("f-number", "number"); bind("f-override", "override");
  bind("f-paid", "paid"); bind("f-ref", "reference"); bind("f-treasurer", "treasurer"); bind("f-contact", "contact");
  $("f-method").addEventListener("change", (e) => { S.method = e.target.value; touch(); });
  $("f-name").addEventListener("input", (e) => {
    S.name = e.target.value; const m = ST.find((r) => r.full_name.toLowerCase() === S.name.trim().toLowerCase());
    if (m && m.id !== S.standing_id) return applyMember(m);
    if (!m) S.standing_id = null; touch();
  });
  $("cat-pills").addEventListener("click", (e) => { const c = e.target.dataset.cat; if (!c) return; S.category = c; tickCategory(); syncInputs(); dirty = true; });

  // lists: edit / add / remove
  $("form").addEventListener("input", (e) => {
    const t = e.target, l = t.dataset.list; if (!l) return; const i = +t.dataset.i;
    if (l === "notes") S.notes[i] = t.value; else S[l][i][t.dataset.k] = t.type === "checkbox" ? t.checked : t.value;
    touch();
  });
  $("form").addEventListener("click", (e) => {
    const t = e.target;
    if (t.dataset.rm) { S[t.dataset.rm].splice(+t.dataset.i, 1); renderLists(); touch(); }
    else if (t.dataset.add) {
      const a = t.dataset.add;
      S[a].push(a === "fees" ? { label: "", fee: "", on: true, cat: "" } : a === "pay" ? { k: "", v: "" } : a === "methods" ? { label: "", on: false } : "");
      renderLists(); touch();
      const last = $({ fees: "fees-list", pay: "pay-list", methods: "methods-list", notes: "notes-list" }[a]).querySelector(".li:last-child input[type=text]"); if (last) last.focus();
    }
  });
  $("hint").addEventListener("click", (e) => {
    if (e.target.dataset.stmt !== undefined) return window.KR_STMT.open(S.standing_id);
    if (e.target.id !== "use-balance") return; const r = standingFor(), bal = Number(r.expected_amount || 0) - Number(r.paid_amount || 0);
    if (S.type === "invoice") { S.override = bal; $("f-override").value = bal; } else { S.paid = bal; $("f-paid").value = bal; }
    touch();
  });

  $("seg-invoice").addEventListener("click", () => setType("invoice"));
  $("seg-receipt").addEventListener("click", () => setType("receipt"));
  $("use-existing").addEventListener("change", (e) => { if (e.target.value) useExisting(e.target.value); e.target.value = ""; });
  $("btn-save").addEventListener("click", save);
  $("btn-save-pdf").addEventListener("click", async () => { if (await save()) D.pdf(S); });
  $("btn-print").addEventListener("click", () => window.print());
  $("btn-new").addEventListener("click", () => { if (!dirty || confirm("Discard what you have typed and start a blank one?")) newDoc(S.type); });
  $("btn-reset").addEventListener("click", () => {
    if (!confirm("Put the fees, payment details and notes back to the club template? Name and amounts stay.")) return;
    const keep = { name: S.name, member_no: S.member_no, standing_id: S.standing_id, category: S.category, number: S.number, date: S.date, id: S.id, type: S.type, override: S.override, paid: S.paid, reference: S.reference };
    S = Object.assign(D.blank(S.type), keep); if (S.category) tickCategory(); syncInputs(); dirty = true;
  });
  $("btn-to-receipt").addEventListener("click", async () => {
    const c = D.calc(S); const r = Object.assign(D.blank("receipt"), { name: S.name, member_no: S.member_no, standing_id: S.standing_id, category: S.category, fees: clone(S.fees), paid: c.due, treasurer: S.treasurer, contact: S.contact });
    r.number = await nextNumber("receipt", r.date); S = r; syncInputs(); dirty = true; window.KR.toast("Receipt started from the invoice. Add the reference, then save.");
  });
  $("btn-delete").addEventListener("click", async () => {
    if (!S.id || !confirm(`Delete ${S.number}? This cannot be undone.`)) return;
    const { error } = await window.sb.from("documents").delete().eq("id", S.id); if (error) return window.KR.toast(error.message, "error");
    window.KR.toast("Deleted."); await loadSaved(); newDoc(S.type);
  });

  // tabs + saved list
  const tab = (t) => { $("p-create").classList.toggle("hidden", t !== "create"); $("p-saved").classList.toggle("hidden", t !== "saved"); $("tab-create").classList.toggle("on", t === "create"); $("tab-saved").classList.toggle("on", t === "saved"); };
  $("tab-create").addEventListener("click", () => tab("create")); $("tab-saved").addEventListener("click", () => tab("saved"));
  $("saved-q").addEventListener("input", renderSaved);
  $("saved-body").addEventListener("click", async (e) => {
    const t = e.target, id = t.dataset.open || t.dataset.copy || t.dataset.pdf || t.dataset.del; if (!id) return;
    const r = SAVED.find((x) => x.id === id);
    if (t.dataset.pdf) return D.pdf(Object.assign(clone(r.data), { id: r.id, number: r.doc_number }));
    if (t.dataset.open) { S = Object.assign(clone(r.data), { id: r.id, number: r.doc_number }); syncInputs(); dirty = false; tab("create"); return; }
    if (t.dataset.copy) { await useExisting("doc:" + id); tab("create"); return; }
    if (!confirm(`Delete ${r.doc_number}? This cannot be undone.`)) return;
    const { error } = await window.sb.from("documents").delete().eq("id", id); if (error) return window.KR.toast(error.message, "error");
    if (S.id === id) await newDoc(S.type); loadSaved();
  });

  $("saved-season").innerHTML = SEASONS.map((x) => `<option value="${x.id}"${x.id === SAVED_SEASON ? " selected" : ""}>Season ${D.esc(x.label)}${x.is_default ? " · current" : ""}</option>`).join("");
  $("saved-season").addEventListener("change", (e) => { SAVED_SEASON = e.target.value; loadSaved(); });
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
  const qp = new URLSearchParams(location.search), sid = qp.get("standing");
  await newDoc(qp.get("type") === "receipt" ? "receipt" : "invoice"); await loadSaved();
  const pre = sid && ST.find((r) => r.id === sid);
  if (pre) {
    applyMember(pre);
    const amt = qp.get("amount");
    if (amt) { if (S.type === "receipt") S.paid = amt; else S.override = amt; }
    syncInputs(); dirty = false; history.replaceState(null, "", location.pathname);
  }
});
