// Public, anonymous-safe court availability grid for the homepage.
// Reads via the get_availability() RPC, which never exposes who booked a slot.
let HB = { date: null, slots: [], courts: [] };

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

async function loadHomeAvailability() {
  const { data: settings } = await window.sb.from("settings").select("booking_open_time,booking_close_time").eq("id", 1).single();
  const { data: courts } = await window.sb.from("courts").select("*").eq("is_active", true).order("sort_order");
  HB.courts = courts || [];
  HB.slots = timeSlots(settings ? settings.booking_open_time : "06:00", settings ? settings.booking_close_time : "18:00");

  const head = document.getElementById("home-availability-head");
  head.innerHTML = "<th>Court</th>" + HB.slots.map((s) => `<th>${fmtSlot(s)}</th>`).join("");

  const { data: bookings } = await window.sb.rpc("get_availability", { p_date: HB.date });
  const byCourtTime = {};
  (bookings || []).forEach((b) => {
    byCourtTime[b.court_id + "_" + b.start_time.slice(0, 5)] = b.type;
  });

  const body = document.getElementById("home-availability-body");
  body.innerHTML = "";
  HB.courts.forEach((c) => {
    const tr = document.createElement("tr");
    let cells = `<td><strong>${c.name}</strong></td>`;
    HB.slots.forEach((s) => {
      const type = byCourtTime[c.id + "_" + s];
      cells += `<td>${type ? `<span class="badge ${type === "paid" ? "paid" : "unpaid"}">${type}</span>` : ""}</td>`;
    });
    tr.innerHTML = cells;
    body.appendChild(tr);
  });
}

function renderDateToggle() {
  const wrap = document.getElementById("home-date-toggle");
  const days = [
    { label: "Today", offset: 0 },
    { label: "Tomorrow", offset: 1 },
    { label: "In 2 days", offset: 2 },
  ];
  wrap.innerHTML = days
    .map((d, i) => `<button data-offset="${d.offset}" class="${i === 0 ? "active" : ""}">${d.label}</button>`)
    .join("");
  wrap.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      wrap.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const d = new Date();
      d.setDate(d.getDate() + Number(btn.dataset.offset));
      HB.date = d.toISOString().slice(0, 10);
      loadHomeAvailability();
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("home-availability-table")) return;
  HB.date = new Date().toISOString().slice(0, 10);
  renderDateToggle();
  loadHomeAvailability();
});
