let CTX = { session: null, profile: null, settings: null, courts: [], slots: [], date: null, grid: {}, logoDataUrl: null };

function timeSlots(open, close) {
  const out = [];
  let [h] = open.split(":").map(Number);
  const [endH] = close.split(":").map(Number);
  while (h < endH) {
    out.push(String(h).padStart(2, "0") + ":00");
    h += 1;
  }
  return out;
}
function fmtSlot(t) {
  const [h] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${ampm}`;
}
function addHour(t) {
  const [h, m] = t.split(":").map(Number);
  return String(h + 1).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

async function loadGrid() {
  const head = document.getElementById("availability-head");
  head.innerHTML = "<th>Court</th>" + CTX.slots.map((s) => `<th>${fmtSlot(s)}</th>`).join("");

  const { data: bookings } = await window.sb.rpc("get_availability", { p_date: CTX.date });
  CTX.grid = {};
  (bookings || []).forEach((b) => {
    CTX.grid[b.court_id + "_" + b.start_time.slice(0, 5)] = b;
  });

  const body = document.getElementById("availability-body");
  body.innerHTML = "";
  CTX.courts.forEach((c) => {
    const tr = document.createElement("tr");
    let cells = `<td><strong>${c.name}</strong></td>`;
    CTX.slots.forEach((s) => {
      const b = CTX.grid[c.id + "_" + s];
      let cellContent = "";
      if (b) {
        const cls = b.type === "paid" ? "paid" : "unpaid";
        cellContent = `<span class="badge ${cls}">${b.is_mine ? "mine" : b.type}</span>`;
      }
      cells += `<td style="cursor:pointer;text-align:center;" data-court="${c.id}" data-court-name="${c.name}" data-time="${s}">${cellContent}</td>`;
    });
    tr.innerHTML = cells;
    body.appendChild(tr);
  });
}

function openBookModal(courtId, courtName, time) {
  const existing = CTX.grid[courtId + "_" + time];
  if (existing && existing.type === "paid") {
    window.KR.toast("That slot is already paid for and secured.", "warn");
    return;
  }
  document.getElementById("book-court-id").value = courtId;
  document.getElementById("book-date").value = CTX.date;
  document.getElementById("book-start").value = time;
  document.getElementById("book-end").value = addHour(time);
  document.getElementById("book-modal-title").textContent = `${courtName} — ${fmtSlot(time)} to ${fmtSlot(addHour(time))}`;

  const typeSelect = document.getElementById("book-type");
  const sub = document.getElementById("book-modal-sub");
  if (existing && existing.type === "free" && !existing.is_mine) {
    typeSelect.innerHTML = `<option value="paid">Paid booking (will replace the current free booking)</option>`;
    sub.textContent = "This slot already has a free booking on it. A paid booking will bump it and secure the court for you.";
  } else if (existing && existing.is_mine) {
    sub.textContent = "This is your own booking. Cancel it from the \"My bookings\" list below if you no longer need it.";
    document.getElementById("book-modal").classList.remove("hidden");
    typeSelect.parentElement.classList.add("hidden");
    document.getElementById("book-submit-btn").classList.add("hidden");
    return;
  } else {
    typeSelect.innerHTML = `<option value="free">Free booking</option><option value="paid">Paid booking (secures the slot)</option>`;
    sub.textContent = "";
  }
  typeSelect.parentElement.classList.remove("hidden");
  document.getElementById("book-submit-btn").classList.remove("hidden");
  updateFeeNote();
  document.getElementById("book-modal").classList.remove("hidden");
}
function updateFeeNote() {
  const type = document.getElementById("book-type").value;
  document.getElementById("book-fee-note").textContent =
    type === "paid" ? `Court fee: ${window.KR.fmtMoney(CTX.settings.court_fee_per_hour, CTX.settings.currency)} per hour. You'll be asked to upload proof of payment next.` : "Free bookings don't require payment.";
}
function closeBookModal() {
  document.getElementById("book-modal").classList.add("hidden");
}

async function submitBooking(ev) {
  ev.preventDefault();
  const type = document.getElementById("book-type").value;
  const isApprovedOrStaff = CTX.profile.status === "approved" || !["member"].includes(CTX.profile.role);
  if (type === "free" && !isApprovedOrStaff) {
    window.KR.toast("Free bookings are a member perk — approved members only. Choose a paid booking to book as a guest.", "error");
    return;
  }
  const btn = document.getElementById("book-submit-btn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Booking…`;
  try {
    const { data, error } = await window.sb.rpc("create_booking", {
      p_court_id: document.getElementById("book-court-id").value,
      p_date: document.getElementById("book-date").value,
      p_start: document.getElementById("book-start").value,
      p_end: document.getElementById("book-end").value,
      p_type: document.getElementById("book-type").value,
      p_member_id: CTX.session.user.id,
      p_guest_name: null,
      p_amount: CTX.settings.court_fee_per_hour,
    });
    if (error) throw error;
    closeBookModal();
    await Promise.all([loadGrid(), loadMyBookings()]);
    if (data.type === "paid") {
      window.KR.toast("Court secured — now upload your proof of payment.");
      openPayModal(data.id, data.amount);
    } else {
      window.KR.toast("Court booked!");
    }
  } catch (err) {
    window.KR.toast(err.message || "Could not book that slot.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm booking";
  }
}

function openPayModal(bookingId, amount) {
  document.getElementById("pay-booking-id").value = bookingId;
  document.getElementById("pay-amount").value = Number(amount).toFixed(2);
  document.getElementById("pay-modal-sub").textContent = "Upload your proof of payment so an admin can verify it and confirm the court fee has been paid.";
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
    const bookingId = document.getElementById("pay-booking-id").value;
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
      booking_id: bookingId,
      amount,
      payment_method: method,
      bank_reference: reference,
      proof_file_path: proofPath,
    });
    if (error) throw error;
    window.KR.toast("Thanks! Your payment is pending verification.");
    closePayModal();
    await loadMyBookings();
  } catch (err) {
    window.KR.toast(err.message || "Something went wrong.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit for verification";
  }
}

async function loadMyBookings() {
  const { data } = await window.sb
    .from("bookings")
    .select("*, courts(name)")
    .eq("member_id", CTX.session.user.id)
    .order("booking_date", { ascending: false })
    .order("start_time", { ascending: false });
  const tbody = document.querySelector("#my-bookings-table tbody");
  const empty = document.getElementById("my-bookings-empty");
  tbody.innerHTML = "";
  if (!data || data.length === 0) {
    empty.classList.remove("hidden");
    document.getElementById("my-bookings-table").classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  document.getElementById("my-bookings-table").classList.remove("hidden");
  data.forEach((b) => {
    const isFuture = b.booking_date >= CTX.today && b.status === "confirmed";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${b.courts ? b.courts.name : "—"}</td>
      <td>${window.KR.fmtDate(b.booking_date)}</td>
      <td>${fmtSlot(b.start_time.slice(0, 5))}&ndash;${fmtSlot(b.end_time.slice(0, 5))}</td>
      <td>${window.KR.badge(b.type)}</td>
      <td>${b.type === "paid" ? window.KR.badge(b.payment_status) : "&mdash;"}</td>
      <td class="right">
        ${b.type === "paid" && b.payment_status === "pending" ? `<button class="btn btn-sm btn-primary" data-pay="${b.id}" data-amount="${b.amount}">Upload proof</button>` : ""}
        ${isFuture ? `<button class="btn btn-sm btn-outline" data-cancel="${b.id}">Cancel</button>` : ""}
        ${b.status === "overridden" ? `<span class="muted small">Bumped by a paid booking</span>` : ""}
      </td>`;
    tbody.appendChild(tr);
  });
}

async function cancelBooking(id) {
  if (!confirm("Cancel this booking?")) return;
  const { error } = await window.sb.rpc("cancel_booking", { p_booking_id: id });
  if (error) return window.KR.toast(error.message, "error");
  window.KR.toast("Booking cancelled.");
  await Promise.all([loadGrid(), loadMyBookings()]);
}

document.addEventListener("DOMContentLoaded", async () => {
  const guard = await window.KR_guard(null);
  if (!guard) return;
  CTX.session = guard.session;
  CTX.profile = guard.profile;
  CTX.today = new Date().toISOString().slice(0, 10);
  CTX.date = CTX.today;
  CTX.logoDataUrl = await window.KR_PDF.loadLogoDataUrl();

  const { data: settings } = await window.sb.from("settings").select("*").eq("id", 1).single();
  CTX.settings = settings;
  const { data: courts } = await window.sb.from("courts").select("*").eq("is_active", true).order("sort_order");
  CTX.courts = courts || [];
  CTX.slots = timeSlots(settings.booking_open_time, settings.booking_close_time);

  if (CTX.profile.status !== "approved" && !["admin", "treasurer"].includes(CTX.profile.role)) {
    document.getElementById("status-banner").classList.remove("hidden");
  }

  const picker = document.getElementById("booking-date-picker");
  picker.value = CTX.date;
  picker.min = CTX.today;
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + (settings.booking_days_ahead || 14));
  picker.max = maxDate.toISOString().slice(0, 10);
  picker.addEventListener("change", () => {
    CTX.date = picker.value;
    loadGrid();
  });

  document.getElementById("availability-body").addEventListener("click", (e) => {
    const td = e.target.closest("td[data-court]");
    if (!td) return;
    openBookModal(td.dataset.court, td.dataset.courtName, td.dataset.time);
  });
  document.getElementById("book-type").addEventListener("change", updateFeeNote);
  document.getElementById("book-form").addEventListener("submit", submitBooking);
  document.getElementById("book-cancel").addEventListener("click", closeBookModal);
  document.getElementById("pay-form").addEventListener("submit", submitPayment);
  document.getElementById("pay-cancel").addEventListener("click", closePayModal);
  document.querySelector("#my-bookings-table").addEventListener("click", (e) => {
    if (e.target.dataset.pay) openPayModal(e.target.dataset.pay, e.target.dataset.amount);
    if (e.target.dataset.cancel) cancelBooking(e.target.dataset.cancel);
  });
  document.getElementById("btn-sign-out").addEventListener("click", window.KR_signOut);

  await loadGrid();
  await loadMyBookings();
});
