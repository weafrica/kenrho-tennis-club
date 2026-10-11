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
    content: loadContentTab,
    help: loadHelpTab,
    journal: loadJournalTab,
    reports: loadReports,
    settings: loadSettingsTab,
  };
  if (loaders[name]) loaders[name]();
}

// ---------------------------------------------------------------- family requests
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
async function loadFamilyRequests() {
  const wrap = document.getElementById("family-requests-wrap");
  if (!wrap) return;
  const { data: reqs, error } = await window.sb.from("family_link_requests").select("*").eq("status", "pending").order("created_at");
  if (error || !reqs || reqs.length === 0) { wrap.classList.add("hidden"); document.getElementById("family-request-count").textContent = ""; return; }
  wrap.classList.remove("hidden");
  document.getElementById("family-request-count").textContent = reqs.length;
  const ids = reqs.map((r) => r.profile_id);
  const { data: people } = await window.sb.from("profiles").select("id, full_name, email").in("id", ids);
  const { data: families } = await window.sb.from("treasurer_standing").select("id, full_name, member_no").eq("membership_type_code", "family").order("full_name");
  const byId = {}; (people || []).forEach((p) => (byId[p.id] = p));
  const famName = {}; (families || []).forEach((f) => (famName[f.id] = f.full_name));
  const tbody = document.querySelector("#family-requests-table tbody");
  tbody.innerHTML = "";
  reqs.forEach((r) => {
    const p = byId[r.profile_id] || {};
    const opts = [`<option value="">— pick the family —</option>`]
      .concat((families || []).map((f) => `<option value="${esc(f.id)}"${f.id === r.standing_id ? " selected" : ""}>${esc(f.full_name)}${f.member_no ? " (" + esc(f.member_no) + ")" : ""}</option>`)).join("");
    const said = r.standing_id
      ? `Picked from the list:<br><strong>${esc(famName[r.standing_id] || r.typed_family)}</strong>`
      : `<span class="muted small">Family not listed</span>`;
    const contact = r.standing_id
      ? `<span class="muted small">—</span>`
      : `<strong>${esc(r.payer_name)}</strong><br><span class="small">${r.contact_phone ? esc(r.contact_phone) : ""}${r.contact_phone && r.contact_email ? "<br>" : ""}${r.contact_email ? esc(r.contact_email) : ""}</span>`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${esc(p.full_name || "—")}</strong><br><span class="muted small">${esc(p.email || "")}</span></td>
      <td>${said}</td>
      <td>${contact}</td>
      <td><select class="fam-req-select" data-fam-select="${esc(r.id)}">${opts}</select></td>
      <td class="right">
        <button class="btn btn-sm btn-primary" data-fam-confirm="${esc(r.id)}">Confirm</button>
        <button class="btn btn-sm btn-danger" data-fam-reject="${esc(r.id)}">Reject</button>
      </td>`;
    tbody.appendChild(tr);
  });
}
async function confirmFamily(id) {
  const sel = document.querySelector(`[data-fam-select="${id}"]`);
  if (!sel || !sel.value) return window.KR.toast("Pick the family record first.", "error");
  const { data, error } = await window.sb.rpc("admin_confirm_family", { p_request_id: id, p_standing_id: sel.value });
  if (error) return window.KR.toast(error.message, "error");
  if (data !== "confirmed") return window.KR.toast(data || "Could not confirm.", "error");
  window.KR.toast("Confirmed. They are approved and can now see the family's balance.");
  loadMembers();
}
async function rejectFamily(id) {
  const note = prompt("Reason (shown to the member):", "We couldn't match this to a family on our list.");
  if (note === null) return;
  const { error } = await window.sb.rpc("admin_reject_family", { p_request_id: id, p_note: note });
  if (error) return window.KR.toast(error.message, "error");
  window.KR.toast("Request rejected.");
  loadMembers();
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
  await loadFamilyRequests();
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
      <td>${window.KR.badge(inv.status)}</td>
      <td class="right"><button class="btn btn-sm btn-outline" data-dl-invoice="${inv.id}">PDF</button></td>`;
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
  const { data: newInv, error } = await window.sb.from("invoices").insert({
    invoice_number, member_id, description, amount, due_date, created_by: CTX.session.user.id,
  }).select().single();
  if (error) return window.KR.toast(error.message, "error");
  window.KR.toast("Invoice created and posted to the ledger.");
  if (newInv) window.KR_adminDocs.invoice(newInv.id);
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
      <td>${window.KR.badge(r.status)}</td>
      <td class="right">${r.status === "verified" ? `<button class="btn btn-sm btn-outline" data-dl-receipt="${r.id}">PDF</button>` : ""}</td>`;
    allBody.appendChild(tr2);
  });
  document.getElementById("pending-receipt-count").textContent = (data || []).filter((r) => r.status === "pending").length;
}

async function verifyReceipt(id) {
  const { error } = await window.sb.rpc("verify_receipt", { p_receipt_id: id, p_admin_id: CTX.session.user.id });
  if (error) return window.KR.toast(error.message, "error");
  window.KR.toast("Receipt verified, journal entry posted, invoice updated.");
  window.KR_adminDocs.receipt(id);
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

// ---------------------------------------------------------------- content (announcements + gallery)
async function loadContentTab() {
  const { data: anns } = await window.sb.from("announcements").select("*").order("sort_order");
  const tbody = document.querySelector("#announcements-table tbody");
  tbody.innerHTML = "";
  (anns || []).forEach((a) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${a.title}</strong></td>
      <td class="muted small">${a.body.slice(0, 80)}${a.body.length > 80 ? "…" : ""}</td>
      <td>${a.is_active ? "Yes" : "No"}</td>
      <td class="right">
        <button class="btn btn-sm btn-outline" data-toggle-ann="${a.id}" data-active="${a.is_active}">${a.is_active ? "Hide" : "Show"}</button>
        <button class="btn btn-sm btn-danger" data-delete-ann="${a.id}">Delete</button>
      </td>`;
    tbody.appendChild(tr);
  });

  const { data: photos } = await window.sb.from("gallery_photos").select("*").order("sort_order");
  const container = document.getElementById("gallery-admin-container");
  container.innerHTML = "";
  (photos || []).forEach((p) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <img src="${p.url}" alt="${p.caption || ""}" style="width:100%;height:140px;object-fit:cover;border-radius:8px;" />
      <p class="muted small mt-8 mb-0">${p.caption || "—"}</p>
      <button class="btn btn-sm btn-danger mt-8" data-delete-photo="${p.id}">Remove</button>`;
    container.appendChild(div);
  });
}

async function createAnnouncement(ev) {
  ev.preventDefault();
  const title = document.getElementById("ann-title").value;
  const body = document.getElementById("ann-body").value;
  const { error } = await window.sb.from("announcements").insert({ title, body, created_by: CTX.session.user.id });
  if (error) return window.KR.toast(error.message, "error");
  window.KR.toast("Announcement posted.");
  document.getElementById("announcement-form").reset();
  loadContentTab();
}
async function toggleAnnouncement(id, currentlyActive) {
  const { error } = await window.sb.from("announcements").update({ is_active: !currentlyActive }).eq("id", id);
  if (error) return window.KR.toast(error.message, "error");
  loadContentTab();
}
async function deleteAnnouncement(id) {
  if (!confirm("Delete this announcement?")) return;
  const { error } = await window.sb.from("announcements").delete().eq("id", id);
  if (error) return window.KR.toast(error.message, "error");
  loadContentTab();
}

async function uploadGalleryPhoto(ev) {
  ev.preventDefault();
  const file = document.getElementById("gallery-file").files[0];
  const caption = document.getElementById("gallery-caption").value;
  if (!file) return;
  const btn = document.getElementById("gallery-submit-btn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Uploading…`;
  try {
    const path = `${Date.now()}_${file.name}`;
    const { error: upErr } = await window.sb.storage.from("gallery").upload(path, file);
    if (upErr) throw upErr;
    const { data: pub } = window.sb.storage.from("gallery").getPublicUrl(path);
    const { error } = await window.sb.from("gallery_photos").insert({ url: pub.publicUrl, caption, created_by: CTX.session.user.id });
    if (error) throw error;
    window.KR.toast("Photo uploaded.");
    document.getElementById("gallery-form").reset();
    loadContentTab();
  } catch (err) {
    window.KR.toast(err.message || "Upload failed.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Upload photo";
  }
}
async function deleteGalleryPhoto(id) {
  if (!confirm("Remove this photo?")) return;
  const { error } = await window.sb.from("gallery_photos").delete().eq("id", id);
  if (error) return window.KR.toast(error.message, "error");
  loadContentTab();
}

// ---------------------------------------------------------------- help messages
async function loadHelpTab() {
  const { data } = await window.sb.from("support_messages").select("*").order("created_at", { ascending: false });
  const open = (data || []).filter((m) => m.status === "open");
  const resolved = (data || []).filter((m) => m.status === "resolved");
  document.getElementById("open-help-count").textContent = open.length;

  const render = (msgs, containerId, isOpen) => {
    const container = document.getElementById(containerId);
    if (!msgs.length) { container.innerHTML = `<p class="muted">Nothing here.</p>`; return; }
    container.innerHTML = msgs.map((m) => `
      <div class="card mt-16">
        <div class="flex-between">
          <strong>${m.name}</strong>
          <span class="muted small">${window.KR.fmtDate(m.created_at)}</span>
        </div>
        <p class="muted small mb-0">${m.email || "No email given"}</p>
        <p class="mt-8">${m.message}</p>
        ${m.reply ? `<div class="alert alert-info"><strong>Reply:</strong> ${m.reply}</div>` : ""}
        ${isOpen ? `
          <textarea class="mt-8" rows="2" placeholder="Write a reply…" id="reply-${m.id}" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:8px;"></textarea>
          <button class="btn btn-sm btn-primary mt-8" data-reply="${m.id}">Send reply &amp; resolve</button>
        ` : ""}
      </div>`).join("");
  };
  render(open, "open-messages-container", true);
  render(resolved, "resolved-messages-container", false);
}
async function replyToMessage(id) {
  const reply = document.getElementById(`reply-${id}`).value;
  if (!reply.trim()) return window.KR.toast("Write a reply first.", "error");
  const { error } = await window.sb.from("support_messages").update({
    reply, status: "resolved", replied_by: CTX.session.user.id, replied_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return window.KR.toast(error.message, "error");
  window.KR.toast("Reply sent.");
  loadHelpTab();
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

// ---------------------------------------------------------------- membership fee categories
async function loadMembershipTypesTable() {
  const { data } = await window.sb.from("membership_types").select("*").order("sort_order");
  const tbody = document.querySelector("#membership-types-table tbody");
  tbody.innerHTML = "";
  (data || []).forEach((t) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${t.name}</strong></td>
      <td><input type="number" step="0.01" style="width:110px;" value="${t.fee}" data-mt-fee="${t.id}" /></td>
      <td><input type="text" style="width:100%;" value="${t.note || ""}" data-mt-note="${t.id}" /></td>
      <td class="right"><button class="btn btn-sm btn-outline" data-mt-save="${t.id}">Save</button></td>`;
    tbody.appendChild(tr);
  });
}
async function saveMembershipType(id) {
  const fee = parseFloat(document.querySelector(`[data-mt-fee="${id}"]`).value);
  const note = document.querySelector(`[data-mt-note="${id}"]`).value;
  const { error } = await window.sb.from("membership_types").update({ fee, note }).eq("id", id);
  if (error) return window.KR.toast(error.message, "error");
  window.KR.toast("Membership fee updated.");
}

// ---------------------------------------------------------------- settings
async function loadSettingsTab() {
  await loadMembershipTypesTable();
  document.getElementById("set-club-name").value = CTX.settings.club_name;
  document.getElementById("set-fee").value = CTX.settings.membership_fee;
  document.getElementById("set-fee-label").value = CTX.settings.fee_period_label;
  document.getElementById("set-currency").value = CTX.settings.currency;
  document.getElementById("set-bank").value = CTX.settings.bank_details;
  document.getElementById("set-auto-approve").checked = !CTX.settings.require_admin_approval;
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
    updated_at: new Date().toISOString(),
  };
  const { error } = await window.sb.from("settings").update(payload).eq("id", 1);
  if (error) return window.KR.toast(error.message, "error");
  CTX.settings = { ...CTX.settings, ...payload };
  window.KR.toast("Settings saved.");
}

// ---------------------------------------------------------------- boot
document.addEventListener("DOMContentLoaded", async () => {
  const guard = await window.KR_guard("content");
  if (!guard) return;
  CTX.session = guard.session;
  CTX.profile = guard.profile;
  const isFullStaff = ["admin", "treasurer", "secretary", "chairman"].includes(CTX.profile.role);

  const { data: settings } = await window.sb.from("settings").select("*").eq("id", 1).single();
  CTX.settings = settings;
  const { data: accounts } = await window.sb.from("accounts").select("*").order("code");
  CTX.accounts = accounts || [];

  document.getElementById("admin-name").textContent = CTX.profile.full_name || CTX.profile.email;
  document.getElementById("btn-sign-out").addEventListener("click", window.KR_signOut);

  // Committee members (content-editor tier) only get the Content tab —
  // everything financial or member-management stays with full staff.
  if (!isFullStaff) {
    document.querySelectorAll('[data-tab]').forEach((el) => {
      if (el.getAttribute("data-tab") !== "content") el.classList.add("hidden");
    });
  }

  document.querySelectorAll("[data-tab]").forEach((el) => el.addEventListener("click", () => showTab(el.getAttribute("data-tab"))));

  document.getElementById("family-requests-table").addEventListener("click", (e) => {
    if (e.target.dataset.famConfirm) confirmFamily(e.target.dataset.famConfirm);
    if (e.target.dataset.famReject) rejectFamily(e.target.dataset.famReject);
  });
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
  document.getElementById("admin-invoices-table").addEventListener("click", (e) => {
    if (e.target.dataset.dlInvoice) window.KR_adminDocs.invoice(e.target.dataset.dlInvoice);
  });
  document.getElementById("all-receipts-table").addEventListener("click", (e) => {
    if (e.target.dataset.dlReceipt) window.KR_adminDocs.receipt(e.target.dataset.dlReceipt);
  });
  if (CTX.profile.role === "treasurer" || (CTX.profile.email || "").toLowerCase() === "saulestoo@gmail.com") {
    document.getElementById("tab-sheet-link").classList.remove("hidden");
  }
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
  document.getElementById("announcement-form").addEventListener("submit", createAnnouncement);
  document.querySelector("#announcements-table").addEventListener("click", (e) => {
    if (e.target.dataset.toggleAnn) toggleAnnouncement(e.target.dataset.toggleAnn, e.target.dataset.active === "true");
    if (e.target.dataset.deleteAnn) deleteAnnouncement(e.target.dataset.deleteAnn);
  });
  document.getElementById("gallery-form").addEventListener("submit", uploadGalleryPhoto);
  document.getElementById("gallery-admin-container").addEventListener("click", (e) => {
    if (e.target.dataset.deletePhoto) deleteGalleryPhoto(e.target.dataset.deletePhoto);
  });
  document.getElementById("open-messages-container").addEventListener("click", (e) => {
    if (e.target.dataset.reply) replyToMessage(e.target.dataset.reply);
  });
  document.querySelector("#membership-types-table").addEventListener("click", (e) => {
    if (e.target.dataset.mtSave) saveMembershipType(e.target.dataset.mtSave);
  });

  showTab(isFullStaff ? "members" : "content");
});
