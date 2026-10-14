// Shop records: documents (generated or uploaded PDF/photo), stock takes, sales, accounting records.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const R = (n) => "R" + (Number(n) || 0).toLocaleString("en-ZA", { minimumFractionDigits: Number.isInteger(+n) ? 0 : 2, maximumFractionDigits: 2 }).replace(/\u00a0/g, " ");
const fmtD = (d) => { if (!d) return ""; const p = String(d).slice(0, 10).split("-"); return `${p[2]}/${p[1]}/${p[0]}`; };
const KINDS = { supplier_invoice: "Supplier invoice", purchase_receipt: "Purchase receipt", expense_receipt: "Expense receipt", sales_receipt: "Sales receipt", sales_invoice: "Sales invoice", other: "Other" };
const SPEND = [["1300", "Stock for resale"], ["1200", "Equipment (fixed asset)"], ["5320", "Equipment (small items)"], ["5310", "Tennis balls"], ["5000", "Repairs & maintenance"], ["5300", "Consumables & refreshments"], ["5200", "Utilities"], ["5100", "Coaching fees"], ["5110", "Salaries"], ["5400", "Affiliation fees"], ["5500", "Fundraising expenses"], ["5520", "Reimbursements"], ["5600", "Bank charges"], ["5700", "Advertisements"], ["5900", "Sundry expenses"]];
let ME = null, SHOP = null, CAN_LEDGER = false, TAB = "docs", CAN_FINAL = false;
let docFilter = "all";

const tab = { docs, stock, sales, ledger };
async function render() { $("out").innerHTML = `<p class="muted">Loading…</p>`; try { await tab[TAB](); } catch (e) { $("out").innerHTML = `<div class="alert alert-error">${esc(e.message || e)}</div>`; } }

// ───────────────────────── documents
async function docs() {
  const { data, error } = await window.sb.from("shop_documents").select("*").order("doc_date", { ascending: false }).order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  const rows = (data || []).filter((d) => docFilter === "all" || d.doc_kind === docFilter);
  const canAdd = !!SHOP || ME.role === "treasurer" || isSaul();
  $("out").innerHTML = `<div class="bar">${canAdd ? `<button class="btn btn-primary" id="add">+ Add invoice / receipt (PDF or photo)</button><button class="btn btn-outline" id="card">💳 Card payment — make invoice &amp; receipt</button>` : ""}
    <select id="kf"><option value="all">All types</option>${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${docFilter === k ? " selected" : ""}>${v}</option>`).join("")}</select></div>
    <div style="overflow:auto"><table class="l"><thead><tr><th>Date</th><th>Type</th><th>Number</th><th>Who</th><th>What</th><th class="r">Amount</th><th>Accounts</th><th></th></tr></thead><tbody>
    ${rows.map((d) => `<tr><td>${fmtD(d.doc_date)}</td><td>${KINDS[d.doc_kind]}${d.generated ? ` <span class="pill g">auto</span>` : ""}</td><td>${esc(d.doc_number || "")}</td><td>${esc(d.party || "")}</td><td>${esc(d.description || "")}</td><td class="r">${R(d.amount)}</td><td>${d.journal_entry_id ? `<span class="pill">posted</span>` : d.doc_kind === "sales_invoice" ? `<span class="pill w">not needed</span>` : d.generated ? `<span class="pill">with order</span>` : `<span class="pill w">not posted</span>`}</td><td>${d.file_path ? `<button class="btn btn-outline btn-sm" data-file="${esc(d.file_path)}">View</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="8" class="muted" style="padding:20px">Nothing filed yet.</td></tr>`}</tbody></table></div>`;
  $("kf").onchange = (e) => { docFilter = e.target.value; docs(); };
  if ($("add")) { $("add").onclick = openAdd; $("card").onclick = openCard; }
  $("out").onclick = async (e) => { const f = e.target.dataset.file; if (!f) return; const { data: u, error: er } = await window.sb.storage.from("shop-documents").createSignedUrl(f, 120); if (er) return window.KR.toast("Could not open the file.", "error"); window.open(u.signedUrl, "_blank", "noopener"); };
}
const isSaul = () => (ME.email || "").toLowerCase() === "saulestoo@gmail.com";
function modal(html) { $("modal").innerHTML = `<div class="ov"><div class="md">${html}</div></div>`; $("modal").querySelector(".ov").addEventListener("click", (e) => { if (e.target.classList.contains("ov") || e.target.dataset.x !== undefined) $("modal").innerHTML = ""; }); }
async function compress(file) {
  if (!file.type.startsWith("image/")) return file;
  try { const b = await createImageBitmap(file), r = Math.min(1, 1800 / Math.max(b.width, b.height)), c = document.createElement("canvas"); c.width = Math.round(b.width * r); c.height = Math.round(b.height * r); c.getContext("2d").drawImage(b, 0, 0, c.width, c.height); return new File([await new Promise((res) => c.toBlob(res, "image/jpeg", 0.85))], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }); } catch { return file; }
}
async function uploadFile(file) {
  const f = await compress(file), ext = (f.name.split(".").pop() || "dat").toLowerCase(), path = `${new Date().getFullYear()}/${crypto.randomUUID ? crypto.randomUUID() : Date.now()}.${ext}`;
  const { error } = await window.sb.storage.from("shop-documents").upload(path, f, { cacheControl: "31536000" }); if (error) throw error; return path;
}
function openAdd() {
  modal(`<div style="display:flex;justify-content:space-between"><b style="font-size:1.1rem">Add an invoice or receipt</b><button class="btn btn-outline btn-sm" data-x>✕</button></div>
  <label>What is it?</label><select id="a-kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
  <div class="g2"><div><label>Date</label><input type="date" id="a-date" value="${new Date().toISOString().slice(0, 10)}"></div><div><label>Document number</label><input id="a-num" placeholder="e.g. INV-1042"></div></div>
  <label>Supplier or customer</label><input id="a-party"><label>What was it for? (description)</label><input id="a-desc">
  <div class="g2"><div><label>Amount (R)</label><input type="number" step="0.01" id="a-amt"></div><div><label>Paid by</label><select id="a-pay"><option value="bank">Bank / EFT / card</option><option value="cash">Cash</option><option value="creditor">Not paid yet (we owe it)</option><option value="none">Not applicable</option></select></div></div>
  <div id="a-acc-wrap"><label>Record it as</label><select id="a-acc">${SPEND.map(([c, n]) => `<option value="${c}">${n}</option>`).join("")}</select></div>
  <label>Photo or PDF</label><input type="file" id="a-file" accept="image/*,application/pdf"><div class="g2" style="margin-top:6px"><button class="btn btn-outline btn-sm" id="a-cam" type="button">📷 Take a photo</button><span class="muted small">or choose a file above</span></div>
  <button class="btn btn-primary" id="a-save" style="width:100%;margin-top:14px">Save</button>`);
  const kind = $("a-kind"), sync = () => { const sale = kind.value.startsWith("sales") || kind.value === "other"; $("a-acc-wrap").style.display = sale ? "none" : ""; };
  kind.onchange = sync; sync();
  $("a-cam").onclick = () => { const i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.capture = "environment"; i.onchange = () => { const dt = new DataTransfer(); dt.items.add(i.files[0]); $("a-file").files = dt.files; window.KR.toast("Photo attached ✓"); }; i.click(); };
  $("a-save").onclick = async () => {
    const amt = Number($("a-amt").value) || 0, f = $("a-file").files[0], k = kind.value;
    if (!f && !confirm("No file attached. Save anyway?")) return;
    $("a-save").disabled = true; let path = null;
    try {
      if (f) path = await uploadFile(f);
      const { error } = await window.sb.rpc("shop_add_document", { p_kind: k, p_number: $("a-num").value.trim(), p_date: $("a-date").value, p_party: $("a-party").value.trim(), p_desc: $("a-desc").value.trim(), p_amount: amt, p_account: k.startsWith("sales") || k === "other" ? "" : $("a-acc").value, p_paid_via: $("a-pay").value, p_file: path || "" });
      if (error) { if (path) await window.sb.storage.from("shop-documents").remove([path]); throw error; }
      $("modal").innerHTML = ""; window.KR.toast("Filed ✓ — and posted to the accounts."); render();
    } catch (e) { $("a-save").disabled = false; window.KR.toast(e.message || String(e), "error"); }
  };
}
function openCard() {
  modal(`<div style="display:flex;justify-content:space-between"><b style="font-size:1.1rem">Card payment at the clubhouse</b><button class="btn btn-outline btn-sm" data-x>✕</button></div>
  <p class="muted small">Creates a numbered invoice and receipt as PDFs, files them, and posts the sale to the accounts.</p>
  <label>Customer name</label><input id="c-name"><label>What was sold?</label><input id="c-desc" placeholder="e.g. Club cap x2">
  <div class="g2"><div><label>Amount (R)</label><input type="number" step="0.01" id="c-amt"></div><div><label>Card reference (optional)</label><input id="c-ref"></div></div>
  <button class="btn btn-primary" id="c-go" style="width:100%;margin-top:14px">Create invoice &amp; receipt</button>`);
  $("c-go").onclick = async () => {
    const name = $("c-name").value.trim(), desc = $("c-desc").value.trim(), amt = Number($("c-amt").value), ref = $("c-ref").value.trim();
    if (!name || !desc || !(amt > 0)) return window.KR.toast("Enter the customer, what was sold and the amount.", "warn");
    $("c-go").disabled = true; const yr = new Date().getFullYear(), today = new Date().toISOString().slice(0, 10);
    try {
      const next = async (kind, pre) => { const { data } = await window.sb.from("shop_documents").select("doc_number").eq("doc_kind", kind).like("doc_number", `${pre}-${yr}-%`); const m = (data || []).reduce((a, r) => Math.max(a, parseInt((r.doc_number.match(/(\d+)$/) || [])[1], 10) || 0), 0); return `${pre}-${yr}-${String(m + 1).padStart(4, "0")}`; };
      const invNo = await next("sales_invoice", "KPTC-SHOP-INV"), recNo = await next("sales_receipt", "KPTC-SHOP-REC"), items = [{ name: desc, qty: 1, unit: amt }];
      const invBlob = await window.KR_SHOPDOC.make({ kind: "invoice", number: invNo, date: today, customer: name, items, total: amt }), recBlob = await window.KR_SHOPDOC.make({ kind: "receipt", number: recNo, date: today, customer: name, items, total: amt, method: "Card", reference: ref });
      const up = async (b, n) => { const p = `${yr}/${n}.pdf`; const { error } = await window.sb.storage.from("shop-documents").upload(p, b, { contentType: "application/pdf" }); if (error) throw error; return p; };
      const pi = await up(invBlob, invNo), pr = await up(recBlob, recNo);
      let r = await window.sb.rpc("shop_add_document", { p_kind: "sales_invoice", p_number: invNo, p_date: today, p_party: name, p_desc: desc, p_amount: amt, p_account: "", p_paid_via: "none", p_file: pi }); if (r.error) throw r.error;
      r = await window.sb.rpc("shop_add_document", { p_kind: "sales_receipt", p_number: recNo, p_date: today, p_party: name, p_desc: desc + (ref ? " (card ref " + ref + ")" : ""), p_amount: amt, p_account: "4400", p_paid_via: "bank", p_file: pr }); if (r.error) throw r.error;
      window.KR_SHOPDOC.download(recBlob, recNo + ".pdf"); window.KR_SHOPDOC.download(invBlob, invNo + ".pdf");
      $("modal").innerHTML = ""; window.KR.toast("Invoice and receipt created and posted ✓"); render();
    } catch (e) { $("c-go").disabled = false; window.KR.toast(e.message || String(e), "error"); }
  };
}

// ───────────────────────── stock take
async function stock() {
  window.sb.rpc("ensure_period_records").then(() => {}, () => {});
  const [{ data: takes }, { data: prods }] = await Promise.all([window.sb.from("stock_takes").select("*").order("take_date", { ascending: false }).limit(40), window.sb.from("shop_products").select("id,name,stock_qty,active").order("name")]);
  const { data: cs } = await window.sb.from("shop_product_costs").select("*"), cm = {}; (cs || []).forEach((c) => (cm[c.product_id] = c));
  const low = (prods || []).filter((p) => p.active && cm[p.id] && cm[p.id].reorder_level > 0 && p.stock_qty <= cm[p.id].reorder_level), value = (prods || []).reduce((s, p) => s + p.stock_qty * Number((cm[p.id] || {}).cost_price || 0), 0);
  $("out").innerHTML = `<div class="st"><div><b>${(prods || []).length}</b><span>Products</span></div><div><b>${R(value)}</b><span>Stock at cost</span></div><div><b>${low.length}</b><span>Low on stock</span></div></div>
    ${low.length ? `<div class="alert" style="background:#fff3da;margin-bottom:10px">⚠️ Running low: ${low.map((p) => esc(p.name) + " (" + p.stock_qty + ")").join(", ")}</div>` : ""}
    <div class="bar"><button class="btn btn-primary" id="st-new">Start a stock take now</button></div>
    <table class="l"><thead><tr><th>Date</th><th>Type</th><th>Status</th><th class="r">Value counted</th><th class="r">Difference</th><th></th></tr></thead><tbody>
    ${(takes || []).map((t) => `<tr><td>${fmtD(t.take_date)}</td><td>${t.kind === "monthly" ? "Month-end (automatic)" : "Spot check"}</td><td><span class="pill ${t.status === "final" ? "" : "w"}">${t.status === "final" ? "Finalised" : "Open"}</span></td><td class="r">${t.status === "final" ? R(t.total_counted_value) : "—"}</td><td class="r">${t.status === "final" ? R(t.variance_value) : "—"}</td><td><button class="btn btn-outline btn-sm" data-take="${t.id}">${t.status === "final" ? "View" : "Count"}</button></td></tr>`).join("") || `<tr><td colspan="6" class="muted" style="padding:20px">No stock takes yet. A month-end sheet is created for you automatically.</td></tr>`}</tbody></table>`;
  $("st-new").onclick = async () => { const { data, error } = await window.sb.rpc("generate_stock_take", { p_date: new Date().toISOString().slice(0, 10), p_kind: "spot" }); if (error) return window.KR.toast(error.message, "error"); openTake(data); };
  $("out").onclick = (e) => { if (e.target.dataset.take) openTake(e.target.dataset.take); };
}
async function openTake(id) {
  const [{ data: t }, { data: ls }] = await Promise.all([window.sb.from("stock_takes").select("*").eq("id", id).single(), window.sb.from("stock_take_lines").select("*").eq("take_id", id).order("product_name")]);
  const open = t.status === "open";
  $("out").innerHTML = `<div class="bar"><button class="btn btn-outline" id="back">← All stock takes</button><button class="btn btn-outline" onclick="window.print()">Print count sheet</button>${open && CAN_FINAL ? `<button class="btn btn-primary" id="fin">Finalise &amp; post differences</button>` : ""}</div>
    <h3>${t.kind === "monthly" ? "Month-end" : "Spot"} stock take — ${fmtD(t.take_date)} <span class="pill ${open ? "w" : ""}">${open ? "Open" : "Finalised"}</span></h3>
    <table class="l"><thead><tr><th>Product</th><th class="r">Cost</th><th class="r">System</th><th class="r">Counted</th><th class="r">Difference</th><th class="r">Value</th></tr></thead><tbody>
    ${ls.map((l) => { const diff = l.counted_qty == null ? null : l.counted_qty - l.system_qty; return `<tr data-l="${l.id}" data-sys="${l.system_qty}" data-cost="${l.unit_cost}"><td>${esc(l.product_name)}</td><td class="r">${R(l.unit_cost)}</td><td class="r">${l.system_qty}</td><td class="r">${open ? `<input class="cnt" type="number" min="0" value="${l.counted_qty ?? ""}" data-in>` : l.counted_qty}</td><td class="r" data-d>${diff == null ? "" : diff}</td><td class="r" data-v>${diff == null ? "" : R(diff * l.unit_cost)}</td></tr>`; }).join("")}</tbody></table>
    ${open && !CAN_FINAL ? `<p class="muted small">Enter your counts. The shop manager or treasurer finalises the stock take.</p>` : ""}`;
  $("back").onclick = () => render();
  const timers = {};
  $("out").addEventListener("input", (e) => {
    if (!e.target.hasAttribute("data-in")) return; const tr = e.target.closest("tr"), id2 = tr.dataset.l, v = e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10));
    const d = v == null ? "" : v - Number(tr.dataset.sys); tr.querySelector("[data-d]").textContent = d; tr.querySelector("[data-v]").textContent = d === "" ? "" : R(d * Number(tr.dataset.cost));
    clearTimeout(timers[id2]); timers[id2] = setTimeout(() => window.sb.from("stock_take_lines").update({ counted_qty: v }).eq("id", id2).then((r) => { if (r.error) window.KR.toast(r.error.message, "error"); }), 500);
  });
  if ($("fin")) $("fin").onclick = async () => { if (!confirm("Finalise this stock take? Stock levels are set to the counted numbers and any difference is posted to the accounts.")) return; const { data, error } = await window.sb.rpc("finalize_stock_take", { p_id: id }); if (error) return window.KR.toast(error.message, "error"); window.KR.toast(data); openTake(id); };
}

// ───────────────────────── sales
async function sales() {
  const { data, error } = await window.sb.from("shop_orders").select("created_at,subtotal,status,checkout_method,shop_order_items(qty,product_name,unit_price)").in("status", ["paid", "fulfilled"]).order("created_at", { ascending: false });
  if (error) throw new Error("Sales figures are available to the shop team and the treasurer.");
  const byM = {}, byP = {}, byMethod = {}; (data || []).forEach((o) => { const m = o.created_at.slice(0, 7); (byM[m] = byM[m] || { n: 0, t: 0 }); byM[m].n++; byM[m].t += Number(o.subtotal); byMethod[o.checkout_method] = (byMethod[o.checkout_method] || 0) + Number(o.subtotal); (o.shop_order_items || []).forEach((i) => { const p = (byP[i.product_name] = byP[i.product_name] || { q: 0, t: 0 }); p.q += i.qty; p.t += i.qty * i.unit_price; }); });
  const total = (data || []).reduce((s, o) => s + Number(o.subtotal), 0), label = { whatsapp: "WhatsApp", manual_proof: "EFT", ikhokha_link: "Card" };
  $("out").innerHTML = `<div class="st"><div><b>${(data || []).length}</b><span>Paid orders</span></div><div><b>${R(total)}</b><span>Total sales</span></div>${Object.entries(byMethod).map(([k, v]) => `<div><b>${R(v)}</b><span>${label[k] || k}</span></div>`).join("")}</div>
    <div class="g2" style="gap:14px"><div><h3>By month</h3><table class="l"><thead><tr><th>Month</th><th class="r">Orders</th><th class="r">Sales</th></tr></thead><tbody>${Object.entries(byM).sort().reverse().map(([m, v]) => `<tr><td>${m}</td><td class="r">${v.n}</td><td class="r">${R(v.t)}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">No sales yet.</td></tr>`}</tbody></table></div>
    <div><h3>Best sellers</h3><table class="l"><thead><tr><th>Product</th><th class="r">Sold</th><th class="r">Sales</th></tr></thead><tbody>${Object.entries(byP).sort((a, b) => b[1].t - a[1].t).slice(0, 12).map(([n, v]) => `<tr><td>${esc(n)}</td><td class="r">${v.q}</td><td class="r">${R(v.t)}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">—</td></tr>`}</tbody></table></div></div>`;
}

// ───────────────────────── accounting records (treasurer, chairman, Saul, shop manager)
async function ledger() {
  const to = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - 62 * 864e5).toISOString().slice(0, 10);
  const { data, error } = await window.sb.rpc("ledger_lines", { p_from: from, p_to: to }); if (error) throw error;
  const g = {}; (data || []).forEach((l) => (g[l.entry_id] = g[l.entry_id] || { d: l.entry_date, t: l.description, r: l.reference, s: l.source_type, ls: [] }).ls.push(l));
  const es = Object.values(g).reverse(), acc = ME.role === "treasurer" || isSaul();
  $("out").innerHTML = `<p class="muted">Journal entries from the last two months.${acc ? ` <a href="admin-accounts.html">Open the full statements →</a>` : ""}</p>` + (es.map((e) => `<div class="card" style="margin-bottom:8px;padding:10px 14px"><b>${fmtD(e.d)}</b> · ${esc(e.t)} <span class="muted small">${esc(e.r || "")} · ${esc(e.s)}</span><table class="l" style="margin-top:6px">${e.ls.map((l) => `<tr><td>${esc(l.code)} ${esc(l.name)}</td><td class="r">${Number(l.debit) ? R(l.debit) : ""}</td><td class="r">${Number(l.credit) ? R(l.credit) : ""}</td></tr>`).join("")}</table></div>`).join("") || `<div class="empty">No entries yet.</div>`);
}

document.addEventListener("DOMContentLoaded", async () => {
  const { session, profile } = await window.KR.currentProfile(); if (!session) { location.href = "auth.html"; return; }
  ME = profile; const r = await window.sb.rpc("my_shop_role"); SHOP = r.data;
  const allowed = SHOP || ["treasurer", "chairman", "admin"].includes(ME.role) || isSaul();
  if (!allowed) { location.href = "dashboard.html"; return; }
  CAN_LEDGER = ["treasurer", "chairman", "admin"].includes(ME.role) || isSaul() || SHOP === "manager"; CAN_FINAL = ["manager", "admin", "treasurer"].includes(SHOP);
  $("who").textContent = ME.full_name || ME.email; $("btn-sign-out").onclick = async () => { await window.sb.auth.signOut(); location.href = "index.html"; };
  if (CAN_LEDGER) $("t-ledger").classList.remove("hidden");
  $("role-note").textContent = SHOP ? `You are signed in as ${SHOP === "manager" ? "shop manager" : SHOP === "assistant" ? "shop assistant" : SHOP}.` : "You can view these records.";
  $("tabs").onclick = (e) => { const t = e.target.dataset.t; if (!t) return; TAB = t; document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === t)); render(); };
  window.sb.rpc("ensure_period_records").then(() => {}, () => {});
  render();
});
