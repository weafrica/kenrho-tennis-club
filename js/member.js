let CTX = { session: null, profile: null, settings: null, logoDataUrl: null, membershipTypes: [] };

async function loadSettings() {
  const { data } = await window.sb.from("settings").select("*").eq("id", 1).single();
  return data;
}

async function loadMembershipTypes() {
  const { data } = await window.sb.from("membership_types").select("*").eq("is_active", true).order("sort_order");
  return data || [];
}

function profileNeedsRegistration(p) {
  return !p.membership_type_id || !p.date_of_birth || !p.residential_address;
}

function renderRegistrationCard() {
  const card = document.getElementById("registration-card");
  if (!profileNeedsRegistration(CTX.profile)) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  const sel = document.getElementById("reg-membership-type");
  sel.innerHTML = CTX.membershipTypes
    .map((t) => `<option value="${t.id}"${t.id === CTX.profile.membership_type_id ? " selected" : ""}>${t.name} — ${window.KR.fmtMoney(t.fee, CTX.settings.currency)}/year${t.note ? " (" + t.note + ")" : ""}</option>`)
    .join("");
  if (window.KR_family) window.KR_family.init();
}

async function submitRegistration(ev) {
  ev.preventDefault();
  const btn = document.getElementById("registration-submit-btn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Saving…`;
  try {
    // Family category: send the "which family?" request first; stop if it isn't valid
    if (window.KR_family && !(await window.KR_family.submitFromForm())) return;
    const payload = {
      membership_type_id: document.getElementById("reg-membership-type").value,
      date_of_birth: document.getElementById("reg-dob").value,
      phone: document.getElementById("reg-phone").value,
      residential_address: document.getElementById("reg-address").value,
      postal_code: document.getElementById("reg-postal").value,
      previous_club: document.getElementById("reg-previous-club").value,
      tennis_level: document.getElementById("reg-level").value,
      played_league: document.getElementById("reg-played-league").value === "true",
      photo_consent: document.getElementById("reg-photo-consent").checked,
    };
    const { error } = await window.sb.from("profiles").update(payload).eq("id", CTX.session.user.id);
    if (error) throw error;
    window.KR.toast("Details saved — you're all set to pay your membership fee below.");
    await refreshProfile();
    renderFeeCard();
  } catch (err) {
    window.KR.toast(err.message || "Could not save your details.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save my details";
  }
}

function renderFeeCard() {
  const myType = CTX.membershipTypes.find((t) => t.id === CTX.profile.membership_type_id);
  if (myType) {
    document.getElementById("fee-amount").textContent = window.KR.fmtMoney(myType.fee, CTX.settings.currency);
    document.getElementById("fee-period").textContent = myType.name + " membership — annual";
  } else {
    document.getElementById("fee-amount").textContent = window.KR.fmtMoney(CTX.settings.membership_fee, CTX.settings.currency);
    document.getElementById("fee-period").textContent = "Complete your registration above to see your exact fee";
  }
}

function renderProfileHeader() {
  const p = CTX.profile;
  document.getElementById("member-name").textContent = p.full_name || p.email;
  document.getElementById("member-email").textContent = p.email;
  document.getElementById("member-status-badge").innerHTML = window.KR.badge(p.status);
  document.getElementById("member-avatar").src = p.avatar_url || "assets/logo.png";

  const banner = document.getElementById("status-banner");
  if (p.status === "pending") {
    banner.className = "alert alert-warn";
    banner.classList.remove("hidden");
    banner.textContent =
      "Your account is pending approval. Pay your membership fee and upload proof of payment below — an admin will verify it (or you'll be approved automatically, depending on the club's settings).";
  } else if (p.status === "rejected") {
    banner.className = "alert alert-error";
    banner.classList.remove("hidden");
    banner.textContent = "Your membership application was not approved. Contact the club committee for details.";
  } else if (p.status === "suspended") {
    banner.className = "alert alert-error";
    banner.classList.remove("hidden");
    banner.textContent = "Your membership is currently suspended. Contact the club committee.";
  } else {
    banner.classList.add("hidden");
  }
}

async function loadInvoices() {
  const { data, error } = await window.sb
    .from("invoices")
    .select("*")
    .eq("member_id", CTX.session.user.id)
    .order("issue_date", { ascending: false });
  const tbody = document.querySelector("#invoices-table tbody");
  const empty = document.getElementById("invoices-empty");
  tbody.innerHTML = "";
  if (error || !data || data.length === 0) {
    empty.classList.remove("hidden");
    document.getElementById("invoices-table").classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  document.getElementById("invoices-table").classList.remove("hidden");
  data.forEach((inv) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${inv.invoice_number}</td>
      <td>${inv.description}</td>
      <td>${window.KR.fmtDate(inv.issue_date)}</td>
      <td>${window.KR.fmtMoney(inv.amount, CTX.settings.currency)}</td>
      <td>${window.KR.badge(inv.status)}</td>
      <td class="right">
        <button class="btn btn-sm btn-outline" data-download-invoice="${inv.id}">PDF</button>
        ${inv.status !== "paid" ? `<button class="btn btn-sm btn-primary" data-pay-invoice="${inv.id}">Pay / upload proof</button>` : ""}
      </td>`;
    tbody.appendChild(tr);
  });
  window.__invoiceCache = data;
}

async function loadReceipts() {
  const { data } = await window.sb
    .from("receipts")
    .select("*")
    .eq("member_id", CTX.session.user.id)
    .order("submitted_at", { ascending: false });
  const tbody = document.querySelector("#receipts-table tbody");
  const empty = document.getElementById("receipts-empty");
  tbody.innerHTML = "";
  if (!data || data.length === 0) {
    empty.classList.remove("hidden");
    document.getElementById("receipts-table").classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  document.getElementById("receipts-table").classList.remove("hidden");
  data.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.receipt_number || "—"}</td>
      <td>${window.KR.fmtDate(r.submitted_at)}</td>
      <td>${window.KR.fmtMoney(r.amount, CTX.settings.currency)}</td>
      <td>${r.payment_method || "—"}</td>
      <td>${window.KR.badge(r.status)}</td>
      <td class="right">${r.status === "verified" ? `<button class="btn btn-sm btn-outline" data-download-receipt="${r.id}">PDF</button>` : ""}</td>`;
    tbody.appendChild(tr);
  });
  window.__receiptCache = data;
}

function openPayModal(invoiceId) {
  const inv = (window.__invoiceCache || []).find((i) => i.id === invoiceId);
  document.getElementById("pay-invoice-id").value = invoiceId || "";
  const myType = CTX.membershipTypes.find((t) => t.id === CTX.profile.membership_type_id);
  const defaultAmount = myType ? myType.fee : CTX.settings.membership_fee;
  document.getElementById("pay-amount").value = inv ? (inv.amount - inv.amount_paid).toFixed(2) : defaultAmount;
  document.getElementById("pay-modal-title").textContent = inv ? `Upload proof for ${inv.invoice_number}` : "Upload proof of payment";
  document.getElementById("pay-modal").classList.remove("hidden");
}
function closePayModal() {
  document.getElementById("pay-modal").classList.add("hidden");
  document.getElementById("pay-form").reset();
}

async function submitPayment(ev) {
  ev.preventDefault();
  const btn = document.getElementById("pay-submit-btn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Uploading…`;
  try {
    const invoiceId = document.getElementById("pay-invoice-id").value || null;
    const amount = parseFloat(document.getElementById("pay-amount").value);
    const method = document.getElementById("pay-method").value;
    const reference = document.getElementById("pay-reference").value;
    const file = document.getElementById("pay-file").files[0];

    let proofPath = null;
    if (file) {
      const path = `${CTX.session.user.id}/${Date.now()}_${file.name}`;
      const { error: upErr } = await window.sb.storage.from("receipts").upload(path, file);
      if (upErr) throw upErr;
      proofPath = path;
    }

    const { error } = await window.sb.from("receipts").insert({
      member_id: CTX.session.user.id,
      invoice_id: invoiceId,
      amount,
      payment_method: method,
      bank_reference: reference,
      proof_file_path: proofPath,
    });
    if (error) throw error;

    // If the club allows auto-approval on upload, this flips pending -> approved.
    await window.sb.rpc("maybe_auto_approve", { p_member_id: CTX.session.user.id });

    window.KR.toast("Thanks! Your payment proof was submitted for verification.");
    closePayModal();
    await Promise.all([loadReceipts(), loadInvoices(), refreshProfile()]);
  } catch (err) {
    window.KR.toast(err.message || "Something went wrong.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit for verification";
  }
}

async function loadStanding() {
  const card = document.getElementById("standing-card");
  if (!card) return;
  try {
    const { data, error } = await window.sb.rpc("my_standing");
    const s = !error && data && data.length ? data[0] : null;
    if (!s) { card.classList.add("hidden"); return; }
    const money = (n) => window.KR.fmtMoney(n, CTX.settings.currency);
    const body = document.getElementById("standing-body");
    const pill = document.getElementById("standing-pill");
    card.classList.remove("hidden");

    const expected = Number(s.expected_amount) || 0;
    const paid = Number(s.paid_amount) || 0;
    const balance = Number(s.balance) || 0;
    const pct = expected > 0 ? Math.max(0, Math.min(100, Math.round((paid / expected) * 100))) : 100;

    let tone, label, msg;
    if (balance > 0.005) {
      tone = "owing"; label = "Balance owing";
      msg = `Your balance for 2026 is <strong>${money(balance)}</strong>. Pay using the bank details below and upload your proof of payment.`;
    } else if (balance < -0.005) {
      tone = "credit"; label = "In good standing";
      msg = `Your membership is in good standing, and you are <strong>${money(-balance)}</strong> in credit. Thank you!`;
    } else {
      tone = "paid"; label = "In good standing";
      msg = "Your 2026 membership is in good standing and fully paid. Thank you!";
    }
    // the treasurer's sheet had something to double-check for this member
    const check = !s.confirmed && balance > 0.005
      ? `<p class="muted small">If you have already paid this, please upload your proof of payment below or speak to the treasurer and we will update your record.</p>` : "";

    pill.textContent = label;
    pill.className = "standing-pill standing-pill-" + tone;

    body.innerHTML = `
      <div class="standing-grid">
        <div><div class="standing-label">${s.membership_type || "Membership"} fee</div><div class="standing-value">${money(expected)}</div></div>
        <div><div class="standing-label">Paid so far</div><div class="standing-value">${money(paid)}</div></div>
        <div><div class="standing-label">${balance < -0.005 ? "Credit" : "Balance"}</div><div class="standing-value standing-${tone}">${money(Math.abs(balance))}</div></div>
      </div>
      <div class="standing-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
      <p class="standing-msg">${msg}</p>
      ${check}
      ${s.last_payment_date ? `<p class="muted small mb-0">Last payment recorded: ${window.KR.fmtDate(s.last_payment_date)}${s.member_no ? " · Member no. " + s.member_no : ""}</p>` : (s.member_no ? `<p class="muted small mb-0">Member no. ${s.member_no}</p>` : "")}`;

    // keep the fee tile consistent with the treasurer's figure
    const fee = document.getElementById("fee-amount");
    if (fee && expected > 0) fee.textContent = money(expected);
  } catch (e) {
    card.classList.add("hidden");
  }
}

async function refreshProfile() {
  const { data } = await window.sb.from("profiles").select("*").eq("id", CTX.session.user.id).single();
  CTX.profile = data;
  renderProfileHeader();
}

async function downloadInvoicePdf(id) {
  const inv = (window.__invoiceCache || []).find((i) => i.id === id);
  if (!inv) return;
  await window.KR_PDF.invoice({ invoice: inv, member: CTX.profile, settings: CTX.settings, logoDataUrl: CTX.logoDataUrl });
}
async function downloadReceiptPdf(id) {
  const r = (window.__receiptCache || []).find((x) => x.id === id);
  if (!r) return;
  await window.KR_PDF.receipt({ receipt: r, member: CTX.profile, settings: CTX.settings, logoDataUrl: CTX.logoDataUrl });
}

document.addEventListener("DOMContentLoaded", async () => {
  const guard = await window.KR_guard(null);
  if (!guard) return;
  CTX.session = guard.session;
  CTX.profile = guard.profile;
  CTX.settings = await loadSettings();
  CTX.membershipTypes = await loadMembershipTypes();
  CTX.logoDataUrl = await window.KR_PDF.loadLogoDataUrl();

  renderProfileHeader();
  renderRegistrationCard();
  renderFeeCard();
  document.getElementById("bank-details").textContent = CTX.settings.bank_details;
  document.getElementById("registration-form").addEventListener("submit", submitRegistration);

  await loadInvoices();
  await loadReceipts();
  await loadStanding();
  if (window.KR_family) window.KR_family.afterLoad();

  document.getElementById("btn-pay-general").addEventListener("click", () => openPayModal(null));
  document.getElementById("pay-form").addEventListener("submit", submitPayment);
  document.getElementById("pay-cancel").addEventListener("click", closePayModal);
  document.getElementById("btn-sign-out").addEventListener("click", window.KR_signOut);

  document.querySelector("#invoices-table tbody").addEventListener("click", (e) => {
    const dl = e.target.getAttribute("data-download-invoice");
    const pay = e.target.getAttribute("data-pay-invoice");
    if (dl) downloadInvoicePdf(dl);
    if (pay) openPayModal(pay);
  });
  document.querySelector("#receipts-table tbody").addEventListener("click", (e) => {
    const dl = e.target.getAttribute("data-download-receipt");
    if (dl) downloadReceiptPdf(dl);
  });
});
