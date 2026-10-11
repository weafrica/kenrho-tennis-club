// Editable "Treasurer's Edits" membership sheet. Backed by public.treasurer_standing.
// Access: treasurer + saulestoo@gmail.com (enforced in the database by can_edit_member_sheet()).
const SHEET_ALLOWED_EMAILS = ["saulestoo@gmail.com"];
let SH = { rows: [], types: [], settings: null, profile: null };
const TYPE_PREFIX = { league: "LGE", senior: "SN", pensioner: "SN", junior: "JN", family: "FAM", social: "SOC" };

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => window.KR.fmtMoney(n, SH.settings && SH.settings.currency);
const num = (v) => (v === "" || v == null ? 0 : Number(v));

function canUseSheet(p) {
  return p && p.status === "approved" && (p.role === "treasurer" || SHEET_ALLOWED_EMAILS.includes((p.email || "").toLowerCase()));
}

function typeOptions(sel) {
  return `<option value=""></option>` + SH.types.map((t) => `<option value="${esc(t.code)}"${t.code === sel ? " selected" : ""}>${esc(t.name)}</option>`).join("");
}

function rowHtml(r) {
  const bal = Number(r.expected_amount || 0) - Number(r.paid_amount || 0);
  const balCls = bal > 0.005 ? "bal-owing" : bal < -0.005 ? "bal-credit" : "";
  const c = (f, v, type = "text") => `<input type="${type}" data-f="${f}" value="${esc(v)}" />`;
  return `<tr data-id="${esc(r.id)}">
    <td>${c("member_no", r.member_no)}</td>
    <td>${c("full_name", r.full_name)}</td>
    <td><select data-f="membership_type_code">${typeOptions(r.membership_type_code)}</select></td>
    <td>${c("email", r.email, "email")}</td>
    <td>${c("phone", r.phone, "tel")}</td>
    <td style="text-align:center"><input type="checkbox" data-f="form_submitted" ${r.form_submitted ? "checked" : ""} /></td>
    <td>${c("date_form_received", r.date_form_received, "date")}</td>
    <td style="text-align:center"><input type="checkbox" data-f="proof_received" ${r.proof_received ? "checked" : ""} /></td>
    <td>${c("last_payment_date", r.last_payment_date, "date")}</td>
    <td class="num"><input type="number" step="0.01" class="num" data-f="expected_amount" value="${esc(r.expected_amount)}" /></td>
    <td class="num"><input type="number" step="0.01" class="num" data-f="paid_amount" value="${esc(r.paid_amount)}" /></td>
    <td class="num ${balCls}" data-bal>${money(bal)}</td>
    <td>${c("treasurer_note", r.treasurer_note)}</td>
    <td>${c("social_media", r.social_media)}</td>
    <td><button class="btn btn-sm btn-danger" data-del="${esc(r.id)}">Remove</button></td>
  </tr>`;
}

function render() {
  const q = document.getElementById("q").value.trim().toLowerCase();
  const rows = SH.rows.filter((r) => !q || [r.full_name, r.email, r.member_no, r.phone].some((x) => (x || "").toLowerCase().includes(q)));
  document.getElementById("sheet-body").innerHTML = rows.length ? rows.map(rowHtml).join("") : `<tr><td colspan="15" class="muted" style="padding:20px;">No members match.</td></tr>`;
  summarise();
}

function summarise() {
  const exp = SH.rows.reduce((s, r) => s + Number(r.expected_amount || 0), 0);
  const paid = SH.rows.reduce((s, r) => s + Number(r.paid_amount || 0), 0);
  document.getElementById("s-count").textContent = SH.rows.length;
  document.getElementById("s-exp").textContent = money(exp);
  document.getElementById("s-paid").textContent = money(paid);
  document.getElementById("s-bal").textContent = money(exp - paid);
}

async function load() {
  const { data, error } = await window.sb.from("treasurer_standing").select("*").order("member_no", { nullsFirst: false });
  if (error) { window.KR.toast(error.message, "error"); return; }
  SH.rows = data || [];
  render();
}

// ---------------------------------------------------------------- autosave
const timers = {};
function setState(msg) { document.getElementById("save-state").textContent = msg; }

async function saveField(tr, input) {
  const id = tr.dataset.id, f = input.dataset.f;
  let v = input.type === "checkbox" ? input.checked : input.value;
  if (["expected_amount", "paid_amount"].includes(f)) v = num(v);
  else if (v === "") v = null;
  const row = SH.rows.find((r) => r.id === id);
  if (!row) return;
  tr.className = "saving"; setState("Saving…");
  const { error } = await window.sb.from("treasurer_standing").update({ [f]: v, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) { tr.className = "err"; setState("Could not save: " + error.message); window.KR.toast(error.message, "error"); return; }
  row[f] = v;
  const bal = Number(row.expected_amount || 0) - Number(row.paid_amount || 0);
  const cell = tr.querySelector("[data-bal]");
  cell.textContent = money(bal);
  cell.className = "num " + (bal > 0.005 ? "bal-owing" : bal < -0.005 ? "bal-credit" : "");
  tr.className = "saved"; setState("All changes saved ✓");
  summarise();
  setTimeout(() => { if (tr.className === "saved") tr.className = ""; }, 1200);
}

function onEdit(e) {
  const input = e.target.closest("[data-f]");
  if (!input) return;
  const tr = input.closest("tr");
  const key = tr.dataset.id + input.dataset.f;
  clearTimeout(timers[key]);
  const delay = input.type === "checkbox" || input.tagName === "SELECT" || input.type === "date" ? 0 : 600;
  timers[key] = setTimeout(() => saveField(tr, input), delay);
}

// ---------------------------------------------------------------- add / remove
function nextMemberNo(code) {
  const max = SH.rows.reduce((m, r) => {
    const n = parseInt(((r.member_no || "").match(/(\d+)$/) || [])[1], 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `KPTC-26-${TYPE_PREFIX[code] || "MEM"}-${String(max + 1).padStart(3, "0")}`;
}

async function addMember(ev) {
  ev.preventDefault();
  const code = document.getElementById("a-type").value;
  const row = {
    source_key: "app-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()),
    member_no: nextMemberNo(code),
    full_name: document.getElementById("a-name").value.trim(),
    membership_type_code: code,
    email: document.getElementById("a-email").value.trim() || null,
    phone: document.getElementById("a-phone").value.trim() || null,
    expected_amount: num(document.getElementById("a-exp").value),
    paid_amount: num(document.getElementById("a-paid").value),
  };
  const btn = document.getElementById("a-submit"); btn.disabled = true;
  const { data, error } = await window.sb.from("treasurer_standing").insert(row).select().single();
  btn.disabled = false;
  if (error) return window.KR.toast(error.message, "error");
  SH.rows.push(data);
  document.getElementById("add-form").reset();
  document.getElementById("add-card").classList.add("hidden");
  document.getElementById("q").value = "";
  render();
  window.KR.toast(`Added ${data.full_name} (${data.member_no}).`);
}

async function removeMember(id) {
  const r = SH.rows.find((x) => x.id === id);
  if (!r || !confirm(`Remove ${r.full_name} (${r.member_no || "no number"}) from the sheet? This cannot be undone.`)) return;
  const { error } = await window.sb.from("treasurer_standing").delete().eq("id", id);
  if (error) {
    const linked = /foreign key|violates/i.test(error.message);
    return window.KR.toast(linked ? "This member is linked to a family account. Unlink them under Admin → Members first." : error.message, "error");
  }
  SH.rows = SH.rows.filter((x) => x.id !== id);
  render();
  window.KR.toast("Member removed.");
}

function exportCsv() {
  const cols = ["member_no","full_name","membership_type_code","email","phone","form_submitted","date_form_received","proof_received","last_payment_date","expected_amount","paid_amount","balance","treasurer_note","social_media"];
  const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const lines = [cols.join(",")].concat(SH.rows.map((r) => cols.map((c) => q(c === "balance" ? Number(r.expected_amount || 0) - Number(r.paid_amount || 0) : r[c])).join(",")));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  a.download = `kenrho-membership-sheet-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

document.addEventListener("DOMContentLoaded", async () => {
  const guard = await window.KR_guard("staff");
  if (!guard) return;
  SH.profile = guard.profile;
  if (!canUseSheet(SH.profile)) { window.location.href = "admin.html"; return; }
  document.getElementById("who").textContent = SH.profile.full_name || SH.profile.email;
  document.getElementById("btn-sign-out").addEventListener("click", window.KR_signOut);

  const [{ data: settings }, { data: types }] = await Promise.all([
    window.sb.from("settings").select("*").eq("id", 1).single(),
    window.sb.from("membership_types").select("*").order("sort_order"),
  ]);
  SH.settings = settings; SH.types = types || [];
  document.getElementById("a-type").innerHTML = SH.types.map((t) => `<option value="${esc(t.code)}" data-fee="${t.fee}">${esc(t.name)}</option>`).join("");
  const fillFee = () => { const o = document.getElementById("a-type").selectedOptions[0]; if (o) document.getElementById("a-exp").value = o.dataset.fee; };
  document.getElementById("a-type").addEventListener("change", fillFee); fillFee();

  const body = document.getElementById("sheet-body");
  body.addEventListener("input", onEdit);
  body.addEventListener("change", onEdit);
  body.addEventListener("click", (e) => { if (e.target.dataset.del) removeMember(e.target.dataset.del); });
  document.getElementById("q").addEventListener("input", render);
  document.getElementById("btn-add").addEventListener("click", () => document.getElementById("add-card").classList.toggle("hidden"));
  document.getElementById("a-cancel").addEventListener("click", () => document.getElementById("add-card").classList.add("hidden"));
  document.getElementById("add-form").addEventListener("submit", addMember);
  document.getElementById("btn-csv").addEventListener("click", exportCsv);
  load();
});
