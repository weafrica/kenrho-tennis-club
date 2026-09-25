let CTX = { session: null, profile: null, settings: null, accounts: [] };

// ---------------------------------------------------------------- tab logic
function showTab(name) {
  document.querySelectorAll(".admin-tab").forEach((el) => el.classList.add("hidden"));
  document.querySelectorAll("[data-tab]").forEach((el) => el.classList.remove("active"));
  document.getElementById("tab-" + name).classList.remove("hidden");
  document.querySelector(`[data-tab="${name}"]`).classList.add("active");
  const loaders = {
    members: loadMembers,
    receipts: loadReceipts,
    invoices: loadInvoicesAdmin,
    bookings: loadBookingsTab,
    journal: loadJournalTab,
    reports: loadReports,
    settings: loadSettingsTab,
  };
  if (loaders[name]) loaders[name]();
}

// ---------------------------------------------------------------- members
async function loadMembers() {
  const { data } = await window.sb.from("profiles").select("*").order("joined_at", { ascending: false });
  const pendingBody = document.querySelector("#pending-members-table tbody");
  const allBody = document.querySelector("#all-members-table tbody");
  pendingBody.innerHTML = "";
  allBody.innerHTML = "";
  (data || []).forEach((m) => {
    if (m.status === "pending") {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${m.full_name || "—"}</td><td>${m.email}</td><td>${window.KR.fmtDate(m.joined_at)}</td>
        <td class="right">
          <button class="btn btn-sm btn-primary" data-approve="${m.id}">Approve</button>
          <button class="btn btn-sm btn-danger" data-reject="${m.id}">Reject</button>
        </td>`;
      pendingBody.appendChild(tr);
    }
    const tr2 = document.createElement("tr");
    tr2.innerHTML = `
      <td>${m.full_name || "—"}</td><td>${m.email}</td>
      <td>${window.KR.badge(m.status)}</td>
      <td>${m.role}</td>
      <td class="right">
        ${m.status !== "suspended" ? `<button class="btn btn-sm btn-outline" data-suspend="${m.id}">Suspend</button>` : `<button class="btn btn-sm btn-outline" data-approve="${m.id}">Reinstate</button>`}
        ${m.role === "member" ? `<button class="btn btn-sm btn-outline" data-make-staff="${m.id}">Make treasurer</button>` : ""}
      </td>`;
    allBody.appendChild(tr2);
  });
  document.getElementById("pending-count").textContent = (data || []).filter((m) => m.status === "pending").length;
}

async function setMemberStatus(id, status) {
  const { error } = await window.sb.from("profiles").update({ status, approved_by: CTX.session.user.id, approved_at: new Date().toISOString() }).eq("id", id);
  if (error) return window.KR.toast(error.message, "error");
  window.KR.toast("Member updated.");
  loadMembers();
}
async function makeStaff(id) {
  const { error } = await window.sb.from("profiles").update({ role: "treasurer" }).eq("id", id);
  if (error) return window.KR.toast(error.message, "error");
  window.KR.toast("Role updated.");
  loadMembers();
}

// ---------------------------------------------------------------- invoices
async function loadInvoicesAdmin() {
  const { data: members } = await window.sb.from("profiles").select("id, full_name, email").eq("status", "approved").order("full_name");
  const sel = document.getElementById("invoice-member");
  sel.innerHTML = (members || []).map((m) => `<option value="${m.id}">${m.full_name || m.email}</option>`).join("");

  const { data } = await window.sb
    .from("invoices")
    .select("*, profiles!invoices_member_id_fkey(full_name,email)")
    .order("issue_date", { ascending: false })
    .limit(100);
  const tbody = document.querySelector("#admin-invoices-table tbody");
  tbody.innerHTML = "";
  (data || []).forEach((inv) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${inv.invoice_number}</td>
      <td>${inv.profiles ? inv.profiles.full_name || inv.profiles.email : "—"}</td>
      <td>${inv.description}</td>
      <td>${window.KR.fmtMoney(inv.amount, CTX.settings.currency)}</td>
      <td>${window.KR.badge(inv.status)}</td>`;
    tbody.appendChild(tr);
  });
}

async function createInvoice(ev) {
  ev.preventDefault();
  const member_id = document.getElementById("invoice-member").value;
  const description = document.getElementById("invoice-desc").value || "Membership fee";
  const amount = parseFloat(document.getElementById("invoice-amount").value);
  const due_date = document.getElementById("invoice-due").value || null;
  if (!member_id || !amount) return window.KR.toast("Pick a member and amount.", "error");

  const { data: numRow } = await window.sb.rpc("next_invoice_number");
  const invoice_number = numRow;
  const { error } = await window.sb.from("invoices").insert({
    invoice_number, member_id, description, amount, due_date, created_by: CTX.session.user.id,
  });
  if (error) return window.KR.toast(error.message, "error");
  window.KR.toast("Invoice created and posted to the ledger.");
  document.getElementById("invoice-form").reset();
  loadInvoicesAdmin();
}

// ---------------------------------------------------------------- receipts
async function loadReceipts() {
  const { data } = await window.sb
    .from("receipts")
    .select("*, profiles!receipts_member_id_fkey(full_name,email)")
    .order("submitted_at", { ascending: false });
  const pendingBody = document.querySelector("#pending-receipts-table tbody");
  const allBody = document.querySelector("#all-receipts-table tbody");
  pendingBody.innerHTML = "";
  allBody.innerHTML = "";
  (data || []).forEach((r) => {
    const memberLabel = r.profiles ? r.profiles.full_name || r.profiles.email : "—";
    if (r.status === "pending") {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${memberLabel}</td>
        <td>${window.KR.fmtMoney(r.amount, CTX.settings.currency)}</td>
        <td>${r.payment_method || "—"}</td>
        <td>${r.bank_reference || "—"}</td>
        <td>${r.proof_file_path ? `<button class="btn btn-sm btn-outline" data-view-proof="${r.proof_file_path}">View file</button>` : "No file"}</td>
        <td class="right">
          <button class="btn btn-sm btn-primary" data-verify="${r.id}">Verify</button>
          <button class="btn btn-sm btn-danger" data-reject-receipt="${r.id}">Reject</button>
        </td>`;
      pendingBody.appendChild(tr);
    }
    const tr2 = document.createElement("tr");
    tr2.innerHTML = `
      <td>${r.receipt_number || "—"}</td><td>${memberLabel}</td>
      <td>${window.KR.fmtMoney(r.amount, CTX.settings.currency)}</td>
      <td>${window.KR.fmtDate(r.submitted_at)}</td>
      <td>${window.KR.badge(r.status)}</td>`;
    allBody.appendChild(tr2);
  });
  document.getElementById("pending-receipt-count").textContent = (data || []).filter((r) => r.status === "pending").length;
}

async function verifyReceipt(id) {
  const { error } = await window.sb.rpc("verify_receipt", { p_receipt_id: id, p_admin_id: CTX.session.user.id });
  if (error) return window.KR.toast(error.message, "error");
  window.KR.toast("Receipt verified, journal entry posted, invoice updated.");
  loadReceipts();
}
async function rejectReceipt(id) {
  const notes = prompt("Reason for rejecting this receipt (shown to the member):", "Could not match this to a bank statement entry.");
  if (notes === null) return;
  const { error } = await window.sb.from("receipts").update({ status: "rejected", notes, verified_by: CTX.session.user.id, verified_at: new Date().toISOString() }).eq("id", id);
  if (error) return window.KR.toast(error.message, "error");
  window.KR.toast("Receipt rejected.");
  loadReceipts();
}
async function viewProof(path) {
  const { data, error } = await window.sb.storage.from("receipts").createSignedUrl(path, 60 * 5);
  if (error) return window.KR.toast(error.message, "error");
  window.open(data.signedUrl, "_blank");
}

// ---------------------------------------------------------------- bookings
function timeSlots(open, close) {
  const out = [];
  let [h] = open.split(":").map(Number);
  const [endH] = close.split(":").map(Number);
  while (h < endH) { out.push(String(h).padStart(2, "0") + ":00"); h += 1; }
  return out;
}
function addHour(t) {
  const [h, m] = t.split(":").map(Number);
  return String(h + 1).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}
function fmtSlot(t) {
  const [h] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${ampm}`;
}

async function loadBookingsTab() {
  const { data: courts } = await window.sb.from("courts").select("*").eq("is_active", true).order("sort_order");
  document.getElementById("wb-court").innerHTML = (courts || []).map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  document.getElementById("wb-time").innerHTML = timeSlots(CTX.settings.booking_open_time, CTX.settings.booking_close_time)
    .map((s) => `<option value="${s}">${fmtSlot(s)}</option>`).join("");

  const { data: members } = await window.sb.from("profiles").select("id, full_name, email").eq("status", "approved").order("full_name");
  document.getElementById("wb-member").innerHTML =
    `<option value="">— Guest / day visitor —</option>` + (members || []).map((m) => `<option value="${m.id}">${m.full_name || m.email}</option>`).join("");

  if (!document.getElementById("ab-date").value) document.getElementById("ab-date").value = new Date().toISOString().slice(0, 10);
  if (!document.getElementById("wb-date").value) document.getElementById("wb-date").value = new Date().toISOString().slice(0, 10);
  await loadAdminBookings();
}

async function createWalkinBooking(ev) {
  ev.preventDefault();
  const court_id = document.getElementById("wb-court").value;
  const date = document.getElementById("wb-date").value;
  const start = document.getElementById("wb-time").value;
  const type = document.getElementById("wb-type").value;
  const member_id = document.getElementById("wb-member").value || null;
  const guest_name = document.getElementById("wb-guest-name").value || null;
  if (!date) return window.KR.toast("Pick a date.", "error");
  if (!member_id && !guest_name) return window.KR.toast("Pick a member or enter a guest name.", "error");

  const { error } = await window.sb.rpc("create_booking", {
    p_court_id: court_id, p_date: date, p_start: start, p_end: addHour(start),
    p_type: type, p_member_id: member_id, p_guest_name: guest_name,
    p_amount: CTX.settings.court_fee_per_hour,
  });
  if (error) return window.KR.toast(error.message, "error");
  window.KR.toast("Booking created.");
  document.getElementById("walkin-booking-form").reset();
  document.getElementById("ab-date").value = date;
  loadAdminBookings();
}

async function loadAdminBookings() {
  const date = document.getElementById("ab-date").value;
  const { data } = await window.sb
    .from("bookings")
    .select("*, courts(name), profiles(full_name,email)")
    .eq("booking_date", date)
    .order("start_time");
  const tbody = document.querySelector("#admin-bookings-table tbody");
  tbody.innerHTML = "";
  (data || []).forEach((b) => {
    const who = b.profiles ? (b.profiles.full_name || b.profiles.email) : (b.guest_name || "—");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${b.courts ? b.courts.name : "—"}</td>
      <td>${fmtSlot(b.start_time.slice(0,5))}&ndash;${fmtSlot(b.end_time.slice(0,5))}</td>
      <td>${who}</td>
      <td>${window.KR.badge(b.type)}</td>
      <td>${b.type === "paid" ? window.KR.badge(b.payment_status) : "—"}</td>
      <td>${window.KR.badge(b.status)}</td>
      <td class="right">${b.status === "confirmed" ? `<button class="btn btn-sm btn-outline" data-cancel-booking="${b.id}">Cancel</button>` : ""}</td>`;
    tbody.appendChild(tr);
  });
  if (!data || data.length === 0) tbody.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:20px;">No bookings for this date.</td></tr>`;
}

async function cancelBookingAdmin(id) {
  if (!confirm("Cancel this booking?")) return;
  const { error } = await window.sb.rpc("cancel_booking", { p_booking_id: id });
  if (error) return window.KR.toast(error.message, "error");
  window.KR.toast("Booking cancelled.");
  loadAdminBookings();
}

// ---------------------------------------------------------------- manual journal entries
let manualLines = [];
function renderManualLines() {
  const body = document.querySelector("#manual-lines-table tbody");
  body.innerHTML = "";
  let totalDr = 0, totalCr = 0;
  manualLines.forEach((l, i) => {
    totalDr += Number(l.debit || 0);
    totalCr += Number(l.credit || 0);
    const acc = CTX.accounts.find((a) => a.id === l.account_id);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${acc ? acc.code + " — " + acc.name : "—"}</td>
      <td class="right">${l.debit ? window.KR.fmtMoney(l.debit, CTX.settings.currency) : ""}</td>
      <td class="right">${l.credit ? window.KR.fmtMoney(l.credit, CTX.settings.currency) : ""}</td>
      <td class="right"><button type="button" class="btn btn-sm btn-outline" data-remove-line="${i}">Remove</button></td>`;
    body.appendChild(tr);
  });
  document.getElementById("manual-total-debit").textContent = window.KR.fmtMoney(totalDr, CTX.settings.currency);
  document.getElementById("manual-total-credit").textContent = window.KR.fmtMoney(totalCr, CTX.settings.currency);
  const balanced = Math.abs(totalDr - totalCr) < 0.005 && totalDr > 0;
  document.getElementById("manual-balance-msg").textContent = balanced
    ? "Balanced ✓ — ready to post."
    : "Debits must equal credits before you can post this entry.";
  document.getElementById("manual-balance-msg").className = balanced ? "muted" : "alert alert-warn";
  document.getElementById("btn-post-manual").disabled = !balanced;
}
function addManualLine(ev) {
  ev.preventDefault();
  const account_id = document.getElementById("manual-account").value;
  const side = document.getElementById("manual-side").value;
  const amount = parseFloat(document.getElementById("manual-line-amount").value);
  if (!account_id || !amount) return;
  manualLines.push({ account_id, debit: side === "debit" ? amount : 0, credit: side === "credit" ? amount : 0 });
  document.getElementById("manual-line-amount").value = "";
  renderManualLines();
}
async function postManualEntry() {
  const description = document.getElementById("manual-description").value || "Manual journal entry";
  const entry_date = document.getElementById("manual-date").value || new Date().toISOString().slice(0, 10);
  if (manualLines.length < 2) return window.KR.toast("Add at least two lines.", "error");

  const { data: entry, error } = await window.sb
    .from("journal_entries")
    .insert({ description, entry_date, source_type: "manual", created_by: CTX.session.user.id })
    .select()
    .single();
  if (error) return window.KR.toast(error.message, "error");

  const rows = manualLines.map((l) => ({ entry_id: entry.id, account_id: l.account_id, debit: l.debit, credit: l.credit }));
  const { error: lineErr } = await window.sb.from("journal_lines").insert(rows);
  if (lineErr) return window.KR.toast(lineErr.message, "error");

  window.KR.toast("Journal entry posted.");
  manualLines = [];
  renderManualLines();
  document.getElementById("manual-description").value = "";
}

async function loadJournalTab() {
  const sel = document.getElementById("manual-account");
  sel.innerHTML = CTX.accounts.map((a) => `<option value="${a.id}">${a.code} — ${a.name}</option>`).join("");
  document.getElementById("manual-date").value = new Date().toISOString().slice(0, 10);
  renderManualLines();

  const { data } = await window.sb
    .from("v_ledger_detail")
    .select("*")
    .order("entry_date", { ascending: false })
    .limit(200);
  const tbody = document.querySelector("#recent-journal-table tbody");
  tbody.innerHTML = "";
  (data || []).forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${window.KR.fmtDate(r.entry_date)}</td><td>${r.description}</td><td>${r.account_code} ${r.account_name}</td>
      <td class="right">${r.debit ? window.KR.fmtMoney(r.debit, CTX.settings.currency) : ""}</td>
      <td class="right">${r.credit ? window.KR.fmtMoney(r.credit, CTX.settings.currency) : ""}</td>`;
    tbody.appendChild(tr);
  });
}

// ---------------------------------------------------------------- reports
async function loadReports() {
  await renderTrialBalance();
  await renderTAccounts();
  await renderIncomeStatement();
  await renderBalanceSheet();
}

async function renderTrialBalance() {
  const asOf = document.getElementById("tb-date").value || new Date().toISOString().slice(0, 10);
  const { data } = await window.sb.rpc("get_trial_balance", { p_as_of: asOf });
  const tbody = document.querySelector("#trial-balance-table tbody");
  tbody.innerHTML = "";
  let totalDebit = 0, totalCredit = 0;
  (data || []).forEach((row) => {
    const drSide = row.balance >= 0 ? row.balance : 0;
    const crSide = row.balance < 0 ? -row.balance : 0;
    totalDebit += drSide; totalCredit += crSide;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.account_code}</td><td>${row.account_name}</td>
      <td class="right">${drSide ? window.KR.fmtMoney(drSide, CTX.settings.currency) : ""}</td>
      <td class="right">${crSide ? window.KR.fmtMoney(crSide, CTX.settings.currency) : ""}</td>`;
    tbody.appendChild(tr);
  });
  document.getElementById("tb-total-debit").textContent = window.KR.fmtMoney(totalDebit, CTX.settings.currency);
  document.getElementById("tb-total-credit").textContent = window.KR.fmtMoney(totalCredit, CTX.settings.currency);
}

async function renderTAccounts() {
  const { data } = await window.sb.from("v_ledger_detail").select("*").order("entry_date");
  const byAccount = {};
  (data || []).forEach((r) => {
    byAccount[r.account_code] = byAccount[r.account_code] || { name: r.account_name, lines: [] };
    byAccount[r.account_code].lines.push(r);
  });
  const container = document.getElementById("t-accounts-container");
  container.innerHTML = "";
  Object.keys(byAccount).sort().forEach((code) => {
    const acc = byAccount[code];
    const totalDr = acc.lines.reduce((s, l) => s + Number(l.debit), 0);
    const totalCr = acc.lines.reduce((s, l) => s + Number(l.credit), 0);
    const div = document.createElement("div");
    div.className = "t-account";
    div.innerHTML = `
      <h4>${code} — ${acc.name}</h4>
      <div class="t-body">
        <div class="col debit">
          <div class="col-head">Debit</div>
          ${acc.lines.filter((l) => l.debit > 0).map((l) => `<div class="row"><span>${window.KR.fmtDate(l.entry_date)}</span><span>${window.KR.fmtMoney(l.debit, CTX.settings.currency)}</span></div>`).join("") || '<div class="muted small">—</div>'}
          <div class="t-total"><span>Total</span><span>${window.KR.fmtMoney(totalDr, CTX.settings.currency)}</span></div>
        </div>
        <div class="col credit">
          <div class="col-head">Credit</div>
          ${acc.lines.filter((l) => l.credit > 0).map((l) => `<div class="row"><span>${window.KR.fmtDate(l.entry_date)}</span><span>${window.KR.fmtMoney(l.credit, CTX.settings.currency)}</span></div>`).join("") || '<div class="muted small">—</div>'}
          <div class="t-total"><span>Total</span><span>${window.KR.fmtMoney(totalCr, CTX.settings.currency)}</span></div>
        </div>
      </div>`;
    container.appendChild(div);
  });
  if (!Object.keys(byAccount).length) container.innerHTML = '<div class="empty">No transactions posted yet.</div>';
}

async function renderIncomeStatement() {
  const start = document.getElementById("is-start").value;
  const end = document.getElementById("is-end").value || new Date().toISOString().slice(0, 10);
  if (!start) return;
  const { data } = await window.sb.rpc("get_income_statement", { p_start: start, p_end: end });
  const revenue = (data || []).filter((r) => r.account_type === "revenue");
  const expense = (data || []).filter((r) => r.account_type === "expense");
  const totalRev = revenue.reduce((s, r) => s + Number(r.amount), 0);
  const totalExp = expense.reduce((s, r) => s + Number(r.amount), 0);
  const rows = (arr) => arr.map((r) => `<div class="row"><span>${r.account_name}</span><span>${window.KR.fmtMoney(r.amount, CTX.settings.currency)}</span></div>`).join("") || '<div class="muted small">—</div>';
  document.getElementById("income-statement-body").innerHTML = `
    <h4 class="mb-0">Income</h4>
    ${rows(revenue)}
    <div class="t-total"><span>Total income</span><span>${window.KR.fmtMoney(totalRev, CTX.settings.currency)}</span></div>
    <h4 class="mt-24 mb-0">Expenses</h4>
    ${rows(expense)}
    <div class="t-total"><span>Total expenses</span><span>${window.KR.fmtMoney(totalExp, CTX.settings.currency)}</span></div>
    <div class="t-total mt-16" style="font-size:1.15rem;"><span>Net surplus / (deficit)</span><span>${window.KR.fmtMoney(totalRev - totalExp, CTX.settings.currency)}</span></div>`;
}

async function renderBalanceSheet() {
  const asOf = document.getElementById("bs-date").value || new Date().toISOString().slice(0, 10);
  const { data } = await window.sb.rpc("get_balance_sheet", { p_as_of: asOf });
  const assets = (data || []).filter((r) => r.account_type === "asset");
  const liabilities = (data || []).filter((r) => r.account_type === "liability");
  const equity = (data || []).filter((r) => r.account_type === "equity");
  const sum = (arr) => arr.reduce((s, r) => s + Number(r.balance), 0);
  const rows = (arr) => arr.map((r) => `<div class="row"><span>${r.account_name}</span><span>${window.KR.fmtMoney(r.balance, CTX.settings.currency)}</span></div>`).join("") || '<div class="muted small">—</div>';
  document.getElementById("balance-sheet-body").innerHTML = `
    <h4 class="mb-0">Assets</h4>${rows(assets)}
    <div class="t-total"><span>Total assets</span><span>${window.KR.fmtMoney(sum(assets), CTX.settings.currency)}</span></div>
    <h4 class="mt-24 mb-0">Liabilities</h4>${rows(liabilities)}
    <div class="t-total"><span>Total liabilities</span><span>${window.KR.fmtMoney(sum(liabilities), CTX.settings.currency)}</span></div>
    <h4 class="mt-24 mb-0">Equity</h4>${rows(equity)}
    <div class="t-total"><span>Total equity</span><span>${window.KR.fmtMoney(sum(equity), CTX.settings.currency)}</span></div>
    <p class="muted small mt-16">Tip: at each year-end, post a manual journal entry closing net income into "Club Equity / Retained Funds" (3000) so the balance sheet stays in balance going into the new year.</p>`;
}

// ---------------------------------------------------------------- settings
async function loadSettingsTab() {
  document.getElementById("set-club-name").value = CTX.settings.club_name;
  document.getElementById("set-fee").value = CTX.settings.membership_fee;
  document.getElementById("set-fee-label").value = CTX.settings.fee_period_label;
  document.getElementById("set-currency").value = CTX.settings.currency;
  document.getElementById("set-bank").value = CTX.settings.bank_details;
  document.getElementById("set-auto-approve").checked = !CTX.settings.require_admin_approval;
  document.getElementById("set-court-fee").value = CTX.settings.court_fee_per_hour;
  document.getElementById("set-booking-days").value = CTX.settings.booking_days_ahead;
  document.getElementById("set-open-time").value = CTX.settings.booking_open_time;
  document.getElementById("set-close-time").value = CTX.settings.booking_close_time;
}
async function saveSettings(ev) {
  ev.preventDefault();
  const payload = {
    club_name: document.getElementById("set-club-name").value,
    membership_fee: parseFloat(document.getElementById("set-fee").value),
    fee_period_label: document.getElementById("set-fee-label").value,
    currency: document.getElementById("set-currency").value,
    bank_details: document.getElementById("set-bank").value,
    require_admin_approval: !document.getElementById("set-auto-approve").checked,
    court_fee_per_hour: parseFloat(document.getElementById("set-court-fee").value),
    booking_days_ahead: parseInt(document.getElementById("set-booking-days").value, 10),
    booking_open_time: document.getElementById("set-open-time").value,
    booking_close_time: document.getElementById("set-close-time").value,
    updated_at: new Date().toISOString(),
  };
  const { error } = await window.sb.from("settings").update(payload).eq("id", 1);
  if (error) return window.KR.toast(error.message, "error");
  CTX.settings = { ...CTX.settings, ...payload };
  window.KR.toast("Settings saved.");
}

// ---------------------------------------------------------------- boot
document.addEventListener("DOMContentLoaded", async () => {
  const guard = await window.KR_guard("staff");
  if (!guard) return;
  CTX.session = guard.session;
  CTX.profile = guard.profile;

  const { data: settings } = await window.sb.from("settings").select("*").eq("id", 1).single();
  CTX.settings = settings;
  const { data: accounts } = await window.sb.from("accounts").select("*").order("code");
  CTX.accounts = accounts || [];

  document.getElementById("admin-name").textContent = CTX.profile.full_name || CTX.profile.email;
  document.getElementById("btn-sign-out").addEventListener("click", window.KR_signOut);

  document.querySelectorAll("[data-tab]").forEach((el) => el.addEventListener("click", () => showTab(el.getAttribute("data-tab"))));

  document.querySelector("#pending-members-table").addEventListener("click", (e) => {
    if (e.target.dataset.approve) setMemberStatus(e.target.dataset.approve, "approved");
    if (e.target.dataset.reject) setMemberStatus(e.target.dataset.reject, "rejected");
  });
  document.querySelector("#all-members-table").addEventListener("click", (e) => {
    if (e.target.dataset.approve) setMemberStatus(e.target.dataset.approve, "approved");
    if (e.target.dataset.suspend) setMemberStatus(e.target.dataset.suspend, "suspended");
    if (e.target.dataset.makeStaff) makeStaff(e.target.dataset.makeStaff);
  });
  document.querySelector("#pending-receipts-table").addEventListener("click", (e) => {
    if (e.target.dataset.verify) verifyReceipt(e.target.dataset.verify);
    if (e.target.dataset.rejectReceipt) rejectReceipt(e.target.dataset.rejectReceipt);
    if (e.target.dataset.viewProof) viewProof(e.target.dataset.viewProof);
  });

  document.getElementById("invoice-form").addEventListener("submit", createInvoice);
  document.getElementById("walkin-booking-form").addEventListener("submit", createWalkinBooking);
  document.getElementById("ab-date").addEventListener("change", loadAdminBookings);
  document.querySelector("#admin-bookings-table").addEventListener("click", (e) => {
    if (e.target.dataset.cancelBooking) cancelBookingAdmin(e.target.dataset.cancelBooking);
  });
  document.getElementById("manual-add-line").addEventListener("click", addManualLine);
  document.getElementById("btn-post-manual").addEventListener("click", postManualEntry);
  document.querySelector("#manual-lines-table").addEventListener("click", (e) => {
    const i = e.target.dataset.removeLine;
    if (i !== undefined) { manualLines.splice(Number(i), 1); renderManualLines(); }
  });

  document.getElementById("tb-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("bs-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("is-start").value = new Date().toISOString().slice(0, 8) + "01";
  document.getElementById("is-end").value = new Date().toISOString().slice(0, 10);
  document.getElementById("tb-date").addEventListener("change", renderTrialBalance);
  document.getElementById("bs-date").addEventListener("change", renderBalanceSheet);
  document.getElementById("is-start").addEventListener("change", renderIncomeStatement);
  document.getElementById("is-end").addEventListener("change", renderIncomeStatement);

  document.getElementById("settings-form").addEventListener("submit", saveSettings);

  showTab("members");
});
