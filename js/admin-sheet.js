// Membership register — the treasurer's sheet (public.treasurer_standing) as a friendly page.
// Access: treasurer + saulestoo@gmail.com (enforced in the database by can_edit_member_sheet()).
const SHEET_ALLOWED = ["saulestoo@gmail.com"];
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const R = (n) => "R" + (Number.isInteger(+n) ? +n : (+n).toFixed(2));
const PREFIX = { league: "LGE", senior: "SN", pensioner: "SN", junior: "JN", family: "FAM", social: "SOC" };
let ROWS = [], TYPES = [], FILTER = "all", OPEN = null, ME = null, SEASONS = [], SEASON = null, APPOINTER = false;
const APPOINTERS = ["kenrhoparktennisclub@gmail.com", "saulestoo@gmail.com"];
const curSeason = () => SEASONS.find((x) => x.id === SEASON) || {};
const readOnly = () => curSeason().status === "closed" && !APPOINTER;
const bal = (r) => Number(r.expected_amount || 0) - Number(r.paid_amount || 0);
const typeName = (c) => (TYPES.find((t) => t.code === c) || {}).name || c || "—";
const status = (r) => { const b = bal(r); return b > 0.005 ? ["owe", `Owes ${R(b)}`] : b < -0.005 ? ["cr", `Credit ${R(-b)}`] : Number(r.expected_amount) > 0 ? ["ok", "Paid up"] : ["na", "No fee set"]; };
const pct = (r) => (Number(r.expected_amount) > 0 ? Math.max(0, Math.min(100, (Number(r.paid_amount || 0) / Number(r.expected_amount)) * 100)) : 0);

const FILTERS = [["all", "Everyone", () => true], ["owing", "Owing", (r) => bal(r) > 0.005], ["paid", "Paid up", (r) => bal(r) <= 0.005 && Number(r.expected_amount) > 0],
  ["noform", "Form missing", (r) => !r.form_submitted], ["noproof", "Proof missing", (r) => !r.proof_received]];
function visible() {
  const q = $("q").value.trim().toLowerCase(), f = FILTERS.find((x) => x[0] === FILTER), tf = FILTER.startsWith("t:") ? FILTER.slice(2) : null;
  return ROWS.filter((r) => (tf ? r.membership_type_code === tf : f[2](r)) && (!q || [r.full_name, r.email, r.phone, r.member_no].some((x) => (x || "").toLowerCase().includes(q))));
}
function render() {
  const exp = ROWS.reduce((s, r) => s + Number(r.expected_amount || 0), 0), paid = ROWS.reduce((s, r) => s + Number(r.paid_amount || 0), 0), owing = ROWS.filter((r) => bal(r) > 0.005).length;
  const p = exp ? Math.round((paid / exp) * 100) : 0;
  $("stats").innerHTML = `<div class="st"><div class="k">Members</div><div class="v">${ROWS.length}</div><div class="s">${owing} still owing</div></div>
    <div class="st"><div class="k">Collected</div><div class="v">${R(paid)}</div><div class="s">of ${R(exp)} expected</div><div class="bar"><i style="width:${p}%"></i></div></div>
    <div class="st"><div class="k">Outstanding</div><div class="v">${R(Math.max(0, exp - paid))}</div><div class="s">${p}% collected</div></div>
    <div class="st"><div class="k">Forms missing</div><div class="v">${ROWS.filter((r) => !r.form_submitted).length}</div><div class="s">${ROWS.filter((r) => !r.proof_received).length} without proof</div></div>`;
  const types = TYPES.filter((t) => ROWS.some((r) => r.membership_type_code === t.code));
  $("chips").innerHTML = FILTERS.map(([k, l, fn]) => `<button class="chip ${FILTER === k ? "on" : ""}" data-f="${k}">${l}<small>${ROWS.filter(fn).length}</small></button>`).join("") + types.map((t) => `<button class="chip ${FILTER === "t:" + t.code ? "on" : ""}" data-f="t:${t.code}">${esc(t.name)}<small>${ROWS.filter((r) => r.membership_type_code === t.code).length}</small></button>`).join("");
  const list = visible();
  $("rows").innerHTML = list.map((r) => { const [k, l] = status(r); return `<tr class="m" data-id="${r.id}"><td class="nm"><b>${esc(r.full_name)}${r.review_flag ? " ⚠️" : ""}</b><small>${esc(r.member_no || "no number")}</small> <span class="tp">${esc(typeName(r.membership_type_code))}</span></td>
    <td class="hide-s">${esc(r.phone || "")}<br><small style="color:#7a8873">${esc(r.email || "")}</small></td>
    <td style="min-width:140px"><b>${R(r.paid_amount || 0)}</b> <small style="color:#7a8873">of ${R(r.expected_amount || 0)}</small><div class="bar bar2"><i style="width:${pct(r)}%"></i></div></td>
    <td><span class="pill p-${k}">${l}</span></td>
    <td class="hide-s"><span class="ck"><span class="${r.form_submitted ? "y" : "n"}" title="Form">${r.form_submitted ? "✓" : "✕"}</span><span class="${r.proof_received ? "y" : "n"}" title="Proof of payment">${r.proof_received ? "✓" : "✕"}</span></span></td></tr>`; }).join("") || `<tr><td colspan="5" class="muted" style="padding:24px">No members match.</td></tr>`;
}
async function load() {
  let q = window.sb.from("treasurer_standing").select("*").order("member_no", { nullsFirst: false }); if (SEASON) q = q.eq("season_id", SEASON);
  const { data, error } = await q;
  if (error) return window.KR.toast(error.message, "error");
  ROWS = data || []; render();
}

// ───────── member drawer (autosaves as you type)
function openDrawer(id) {
  const r = ROWS.find((x) => x.id === id); if (!r) return; OPEN = id;
  const [k, l] = status(r), b = bal(r), f = (n, v, t = "text", extra = "") => `<input type="${t}" data-f="${n}" value="${esc(v)}" ${extra}>`;
  $("drawer").innerHTML = `<div class="dr-bg" data-close><div class="dr"><div class="flex-between"><div><h2>${esc(r.full_name)}</h2><span class="pill p-${k}">${l}</span> <span class="saved" id="saved"></span></div><button class="btn btn-outline btn-sm" data-close>Close</button></div>
  ${r.review_flag ? `<div class="flag">⚠️ Check this one: ${esc(r.review_flag)}</div>` : ""}
  <div class="sec"><h4>Money</h4><div class="g2"><div><label>Expected (R)</label>${f("expected_amount", r.expected_amount ?? 0, "number", 'step="0.01"')}</div><div><label>Paid so far (R)</label>${f("paid_amount", r.paid_amount ?? 0, "number", 'step="0.01"')}</div></div>
    <label>Last payment date</label>${f("last_payment_date", r.last_payment_date || "", "date")}
    <div class="bar" style="margin-top:10px"><i id="dbar" style="width:${pct(r)}%"></i></div>
    <div style="background:#eef6d9;border-radius:10px;padding:10px;margin-top:10px"><b>Record a payment</b><div class="g2"><div><label>Amount (R)</label><input type="number" id="pay-amt" step="0.01" value="${b > 0 ? b : ""}"></div><div><label>Date received</label><input type="date" id="pay-date" value="${new Date().toISOString().slice(0, 10)}"></div></div>
    <div class="acts" style="margin-top:10px"><button class="btn btn-primary btn-sm" data-pay="0">Add payment</button><button class="btn btn-outline btn-sm" data-pay="1">Add &amp; make receipt</button></div></div></div>
  <div class="sec"><h4>Documents</h4><div class="acts"><a class="btn btn-outline btn-sm" href="admin-documents.html?standing=${r.id}&type=invoice${b > 0 ? "&amount=" + b : ""}">📄 Create invoice</a><a class="btn btn-outline btn-sm" href="admin-documents.html?standing=${r.id}&type=receipt${Number(r.paid_amount) > 0 ? "&amount=" + r.paid_amount : ""}">🧾 Create receipt</a><button class="btn btn-primary btn-sm" data-stmt>📑 Statement of account</button></div></div>
  <div class="sec"><h4>Details</h4><label>Full name</label>${f("full_name", r.full_name)}<div class="g2"><div><label>Member number</label>${f("member_no", r.member_no || "")}</div><div><label>Membership type</label><select data-f="membership_type_code">${TYPES.map((t) => `<option value="${esc(t.code)}"${t.code === r.membership_type_code ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div></div>
    <div class="g2"><div><label>Phone</label>${f("phone", r.phone || "", "tel")}</div><div><label>Email</label>${f("email", r.email || "", "email")}</div></div><label>Social media</label>${f("social_media", r.social_media || "")}</div>
  <div class="sec"><h4>Form &amp; proof</h4><label class="tog"><input type="checkbox" data-f="form_submitted" ${r.form_submitted ? "checked" : ""}> 2026 form received</label><label>Date form received</label>${f("date_form_received", r.date_form_received || "", "date")}<label class="tog"><input type="checkbox" data-f="proof_received" ${r.proof_received ? "checked" : ""}> Proof of payment received</label></div>
  <div class="sec"><h4>Notes &amp; follow-ups</h4><textarea data-f="treasurer_note" rows="3">${esc(r.treasurer_note || "")}</textarea></div>
  <div class="acts" style="justify-content:space-between"><button class="btn btn-sm" style="background:#fdecea;color:#b23b2e" data-remove>Remove this member</button><button class="btn btn-primary btn-sm" data-close>Done</button></div></div></div>`;
  if (readOnly()) { $("drawer").querySelectorAll(".dr input,.dr select,.dr textarea,.dr [data-pay],.dr [data-remove]").forEach((e) => (e.disabled = true)); const h = $("drawer").querySelector(".dr h2"); if (h) h.insertAdjacentHTML("afterend", `<div class="flag">🔒 ${esc(curSeason().label)} is closed — view only.</div>`); }
}
const timers = {};
async function saveField(input) {
  const r = ROWS.find((x) => x.id === OPEN); if (!r) return; const f = input.dataset.f;
  let v = input.type === "checkbox" ? input.checked : input.value;
  if (["expected_amount", "paid_amount"].includes(f)) v = Number(v) || 0; else if (v === "") v = null;
  if (f === "full_name" && !v) return;
  const sv = $("saved"); if (sv) sv.textContent = "Saving…";
  const { error } = await window.sb.from("treasurer_standing").update({ [f]: v, updated_at: new Date().toISOString() }).eq("id", r.id);
  if (error) { if (sv) sv.textContent = ""; return window.KR.toast(error.message, "error"); }
  r[f] = v; if ($("saved")) $("saved").textContent = "Saved ✓"; const bar = $("dbar"); if (bar) bar.style.width = pct(r) + "%"; render();
}
async function addPayment(makeReceipt) {
  const r = ROWS.find((x) => x.id === OPEN), amt = Number($("pay-amt").value), date = $("pay-date").value;
  if (!(amt > 0)) return window.KR.toast("Enter the amount received.", "warn");
  const paid = Number(r.paid_amount || 0) + amt;
  const { error } = await window.sb.from("treasurer_standing").update({ paid_amount: paid, last_payment_date: date || r.last_payment_date, updated_at: new Date().toISOString() }).eq("id", r.id);
  if (error) return window.KR.toast(error.message, "error");
  r.paid_amount = paid; r.last_payment_date = date || r.last_payment_date; window.KR.toast(`${R(amt)} recorded for ${r.full_name}.`);
  if (makeReceipt) return (location.href = `admin-documents.html?standing=${r.id}&type=receipt&amount=${amt}`);
  render(); openDrawer(r.id);
}
async function removeMember() {
  const r = ROWS.find((x) => x.id === OPEN);
  if (!confirm(`Remove ${r.full_name} (${r.member_no || "no number"}) from the register? This cannot be undone.`)) return;
  const { error } = await window.sb.from("treasurer_standing").delete().eq("id", r.id);
  if (error) return window.KR.toast(/foreign key|violates/i.test(error.message) ? "This member is linked to a family account. Unlink them under Admin → Members first." : error.message, "error");
  ROWS = ROWS.filter((x) => x.id !== r.id); $("drawer").innerHTML = ""; OPEN = null; render(); window.KR.toast("Member removed.");
}

// ───────── add a member
function nextNo(code) { const max = ROWS.reduce((m, r) => Math.max(m, parseInt(((r.member_no || "").match(/(\d+)$/) || [])[1], 10) || 0), 0); return `KPTC-26-${PREFIX[code] || "MEM"}-${String(max + 1).padStart(3, "0")}`; }
function openAdd() {
  $("drawer").innerHTML = `<div class="dr-bg" data-close><div class="dr"><div class="flex-between"><h2>Add a member</h2><button class="btn btn-outline btn-sm" data-close>Cancel</button></div>
  <div class="sec"><label>Full name</label><input type="text" id="a-name"><div class="g2"><div><label>Membership type</label><select id="a-type">${TYPES.map((t) => `<option value="${esc(t.code)}" data-fee="${t.fee}">${esc(t.name)}</option>`).join("")}</select></div><div><label>Fee (R)</label><input type="number" id="a-exp" step="0.01"></div></div>
  <div class="g2"><div><label>Phone</label><input type="tel" id="a-phone" placeholder="+27…"></div><div><label>Email</label><input type="email" id="a-email"></div></div><div class="g2"><div><label>Already paid (R)</label><input type="number" id="a-paid" value="0" step="0.01"></div><div><label>Date paid</label><input type="date" id="a-date"></div></div>
  <p class="muted small" style="margin:10px 0 0">The member number is created for you.</p></div><button class="btn btn-primary block" id="a-save" style="width:100%">Add to register</button></div></div>`;
  const fee = () => { const o = $("a-type").selectedOptions[0]; if (o) $("a-exp").value = o.dataset.fee; }; $("a-type").onchange = fee; fee();
  $("a-save").onclick = async () => {
    const name = $("a-name").value.trim(); if (!name) return window.KR.toast("Please enter the member's name.", "warn");
    const code = $("a-type").value, row = { source_key: "app-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()), member_no: nextNo(code), full_name: name, membership_type_code: code,
      email: $("a-email").value.trim() || null, phone: $("a-phone").value.trim() || null, expected_amount: Number($("a-exp").value) || 0, paid_amount: Number($("a-paid").value) || 0, last_payment_date: $("a-date").value || null, season_id: SEASON };
    $("a-save").disabled = true; const { data, error } = await window.sb.from("treasurer_standing").insert(row).select().single();
    if (error) { $("a-save").disabled = false; return window.KR.toast(error.message, "error"); }
    ROWS.push(data); render(); window.KR.toast(`Added ${data.full_name} (${data.member_no}).`); openDrawer(data.id);
  };
}
function exportCsv() {
  const cols = ["member_no", "full_name", "membership_type_code", "email", "phone", "form_submitted", "date_form_received", "proof_received", "last_payment_date", "expected_amount", "paid_amount", "balance", "treasurer_note", "social_media"], q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([[cols.join(",")].concat(ROWS.map((r) => cols.map((c) => q(c === "balance" ? bal(r) : r[c])).join(","))).join("\n")], { type: "text/csv" }));
  a.download = `kenrho-membership-register-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}

document.addEventListener("DOMContentLoaded", async () => {
  const guard = await window.KR_guard("staff"); if (!guard) return; ME = guard.profile;
  if (!(ME.status === "approved" && (ME.role === "treasurer" || SHEET_ALLOWED.includes((ME.email || "").toLowerCase())))) { window.location.href = "admin.html"; return; }
  $("who").textContent = ME.full_name || ME.email; $("btn-sign-out").addEventListener("click", window.KR_signOut);
  const { data } = await window.sb.from("membership_types").select("*").order("sort_order"); TYPES = data || [];
  $("q").addEventListener("input", render); $("btn-add").addEventListener("click", () => (readOnly() ? window.KR.toast("This season is closed.", "warn") : openAdd())); $("btn-csv").addEventListener("click", exportCsv);
  $("chips").addEventListener("click", (e) => { if (e.target.closest("[data-f]")) { FILTER = e.target.closest("[data-f]").dataset.f; render(); } });
  $("rows").addEventListener("click", (e) => { const tr = e.target.closest("tr.m"); if (tr) openDrawer(tr.dataset.id); });
  const dr = $("drawer");
  dr.addEventListener("click", (e) => { const t = e.target; if (t.dataset.close !== undefined && (t === e.currentTarget.firstChild || t.tagName === "BUTTON")) { dr.innerHTML = ""; OPEN = null; } else if (t.dataset.stmt !== undefined) window.KR_STMT.open(OPEN); else if (t.dataset.pay !== undefined) addPayment(t.dataset.pay === "1"); else if (t.dataset.remove !== undefined) removeMember(); });
  const onEdit = (e) => { const i = e.target.closest("[data-f]"); if (!i || !OPEN) return; const k = OPEN + i.dataset.f; clearTimeout(timers[k]); timers[k] = setTimeout(() => saveField(i), i.type === "text" || i.type === "number" || i.type === "email" || i.type === "tel" || i.tagName === "TEXTAREA" ? 700 : 0); };
  dr.addEventListener("input", onEdit); dr.addEventListener("change", onEdit);
  APPOINTER = APPOINTERS.includes((ME.email || "").toLowerCase());
  const { data: ss } = await window.sb.from("seasons").select("*").order("starts_on", { ascending: false }); SEASONS = ss || [];
  const def = SEASONS.find((x) => x.is_default) || SEASONS[0]; SEASON = def ? def.id : null;
  const paintSeasons = () => { $("season").innerHTML = SEASONS.map((x) => `<option value="${x.id}"${x.id === SEASON ? " selected" : ""}>Season ${esc(x.label)}${x.is_default ? " · current" : x.status === "closed" ? " · closed" : ""}</option>`).join(""); const c = curSeason(), n = $("season-note"); n.classList.toggle("hidden", !(c.status === "closed")); n.textContent = c.status === "closed" ? `🔒 Season ${c.label} is closed (view only). Switch to the current season to make changes.` : ""; };
  paintSeasons();
  $("season").addEventListener("change", (e) => { SEASON = e.target.value; paintSeasons(); load(); });
  if (APPOINTER || ME.role === "treasurer") $("btn-newseason").classList.remove("hidden");
  $("btn-newseason").addEventListener("click", async () => {
    if (!confirm("Start the next season now? Everyone on the current register moves across (unpaid balances and credits are brought forward) and the current season becomes view-only.")) return;
    const { data, error } = await window.sb.rpc("start_new_season"); if (error) return window.KR.toast(error.message, "error");
    const r = await window.sb.from("seasons").select("*").order("starts_on", { ascending: false }); SEASONS = r.data || []; const d = SEASONS.find((x) => x.is_default); SEASON = d ? d.id : SEASON; paintSeasons(); await load(); window.KR.toast(`Season ${data} is open.`);
  });
  $("btn-sync").addEventListener("click", openSync);
  load();
});

// ───────── Google Sheet sync (website -> Google Sheet, automatic)
async function openSync() {
  const { data: info, error } = await window.sb.rpc("sheet_sync_info"); if (error) return window.KR.toast(error.message, "error");
  const cfg = window.KENRHO_CONFIG || {};
  $("drawer").innerHTML = `<div class="dr-bg" data-close><div class="dr"><div class="flex-between"><h2>Google Sheet sync</h2><button class="btn btn-outline btn-sm" data-close>Close</button></div>
  <p class="muted small">Every change on this register is copied to a tab called <b>Website register (auto)</b> in the treasurer's Google Sheet, about a minute later. Your own tabs are never touched. Set it up once:</p>
  <div class="sec"><h4>1 · Add the script to the sheet</h4><p class="small">Open the sheet → <b>Extensions → Apps Script</b>, delete what is there, tap the button below, paste, and save.</p><button class="btn btn-primary btn-sm" id="sy-copy">Copy the script</button> <a class="btn btn-outline btn-sm" target="_blank" rel="noopener" href="https://docs.google.com/spreadsheets/d/1ugiOvbj0WnqZ-TX-yCCaz4t1NoKtpSwadNVaPl1cpxY/edit">Open the sheet ↗</a></div>
  <div class="sec"><h4>2 · Publish it</h4><p class="small">In Apps Script: <b>Deploy → New deployment → Web app</b>. Execute as <b>Me</b>, who has access: <b>Anyone</b>. Tap Deploy, approve the permissions, and copy the <b>Web app URL</b>.</p></div>
  <div class="sec"><h4>3 · Paste the web app URL here</h4><input type="text" id="sy-url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(info.webhook || "")}"><div class="acts" style="margin-top:8px"><button class="btn btn-primary btn-sm" id="sy-save">Save &amp; sync now</button></div><div class="saved" id="sy-msg">${info.last_sync ? "Last pinged: " + esc(info.last_sync) : ""}</div></div>
  <p class="muted small">Changes made directly in the Google Sheet are not copied back to the website. Edit members here and the sheet follows.</p></div></div>`;
  $("sy-copy").onclick = async () => { const t = (await (await fetch("apps-script/register-sync.gs")).text()).replace("__SUPABASE_URL__", cfg.SUPABASE_URL || "").replace("__ANON_KEY__", cfg.SUPABASE_ANON_KEY || "").replace("__TOKEN__", info.token); try { await navigator.clipboard.writeText(t); window.KR.toast("Script copied — paste it into Apps Script."); } catch (e) { window.KR.toast("Could not copy. Open apps-script/register-sync.gs and fill in the three values.", "warn"); } };
  $("sy-save").onclick = async () => { const { error: e2 } = await window.sb.rpc("set_sheet_webhook", { p_url: $("sy-url").value.trim() }); $("sy-msg").textContent = e2 ? e2.message : "Saved ✓ — the sheet will update within a minute."; };
}
