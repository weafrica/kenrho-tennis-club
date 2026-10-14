// Accounts page: monthly / quarterly / yearly statements, T-accounts, preparation pack and journal.
// Statements are for Saul and the treasurer only (enforced by fs_cum() in the database).
const $ = (id) => document.getElementById(id);
const A = window.KR_ACC;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const M = (n) => { n = Number(n) || 0; const s = Math.abs(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00a0/g, " "); return n < 0 ? `<span class="neg">(${s})</span>` : s; };
const MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];
let SEASONS = [], FY = null, KIND = "month", PER = 0, TAB = "st", DATA = null;

// ---- date helpers (all plain YYYY-MM-DD strings, UTC-safe)
const ymd = (d) => d.toISOString().slice(0, 10);
const parse = (s) => new Date(s + "T00:00:00Z");
const addM = (s, m) => { const d = parse(s); d.setUTCMonth(d.getUTCMonth() + m); return ymd(d); };
const addD = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const fmtD = (s) => parse(s).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
function period() {
  const s = FY.starts_on;
  if (KIND === "month") { const f = addM(s, PER); return { from: f, to: addD(addM(f, 1), -1), label: `month ended ${fmtD(addD(addM(f, 1), -1))}` }; }
  if (KIND === "quarter") { const f = addM(s, PER * 3); return { from: f, to: addD(addM(f, 3), -1), label: `quarter ended ${fmtD(addD(addM(f, 3), -1))}` }; }
  return { from: s, to: FY.ends_on, label: `year ended ${fmtD(FY.ends_on)}` };
}

function controls() {
  $("fy").innerHTML = SEASONS.map((x) => `<option value="${x.id}"${x.id === FY.id ? " selected" : ""}>Financial year ${esc(x.label)}</option>`).join("");
  $("kind").innerHTML = ["month", "quarter", "year"].map((k) => `<button data-k="${k}" class="${KIND === k ? "on" : ""}">${k === "month" ? "Month" : k === "quarter" ? "Quarter" : "Year"}</button>`).join(" ");
  const per = $("per"); per.style.display = KIND === "year" ? "none" : "";
  if (KIND === "month") per.innerHTML = MONTHS.map((m, i) => { const f = addM(FY.starts_on, i); return `<option value="${i}"${i === PER ? " selected" : ""}>${m} ${f.slice(0, 4)}</option>`; }).join("");
  if (KIND === "quarter") per.innerHTML = ["Q1 Jul–Sep", "Q2 Oct–Dec", "Q3 Jan–Mar", "Q4 Apr–Jun"].map((q, i) => `<option value="${i}"${i === PER ? " selected" : ""}>${q}</option>`).join("");
  $("fyl").textContent = FY.label;
}

async function load() {
  const p = period(), sb = window.sb; $("out").innerHTML = `<p class="muted">Working it out…</p>`;
  const prior = addD(FY.starts_on, -1);
  const [to, bf, fb, ln, cp] = await Promise.all([
    sb.rpc("fs_cum", { p_to: p.to }), sb.rpc("fs_cum", { p_to: addD(p.from, -1) }), sb.rpc("fs_cum", { p_to: prior }),
    sb.rpc("ledger_lines", { p_from: p.from, p_to: p.to }), sb.from("fs_comparatives").select("*").eq("fy_end", prior),
  ]);
  const err = to.error || bf.error || fb.error || ln.error;
  if (err) { $("out").innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`; return; }
  const st = A.statements(to.data, bf.data, fb.data);
  const comp = {}; (cp.data || []).forEach((r) => ((comp[r.section] = comp[r.section] || {})[r.line] = Number(r.amount)));
  DATA = { p, st, lines: ln.data || [], tacc: A.taccounts(ln.data || [], bf.data, to.data), comp, year: KIND === "year" };
  render();
}

const tr = (cls, label, a, b, cols) => `<tr class="${cls}"><td class="${cls === "" ? "i" : ""}">${label}</td><td class="n">${a == null ? "" : M(a)}</td>${cols ? `<td class="n">${b == null ? "" : M(b)}</td>` : ""}</tr>`;
function sheetIE() {
  const { st, comp, year, p } = DATA, cols = year && comp.income, c = (sec, l) => (cols ? (comp[sec] || {})[l] || 0 : null);
  const th = `<tr><th></th><th>${year ? "This year" : "Period"}</th>${cols ? "<th>Prior year</th>" : ""}</tr>`;
  const prevInc = cols ? Object.values(comp.income || {}).reduce((s, x) => s + x, 0) : null, prevExp = cols ? Object.values(comp.expense || {}).reduce((s, x) => s + x, 0) : null;
  return `<div class="sheet"><h2>Income &amp; Expenditure Account</h2><div class="p">KenRho Park Tennis Club — for the ${p.label}</div><table class="f">${th}
    ${tr("h", "Income", null, null, cols)}${st.income.map(([l, v]) => tr("", esc(l), v, c("income", l), cols)).join("")}${tr("t", "Total income", st.totalIncome, prevInc, cols)}
    ${tr("h", "Expenditure", null, null, cols)}${st.expense.map(([l, v]) => tr("", esc(l), v, c("expense", l), cols)).join("")}${tr("t", "Total expenditure", st.totalExpense, prevExp, cols)}
    ${tr("g", "Surplus / (deficit) for the period", st.surplus, cols ? prevInc - prevExp : null, cols)}</table></div>`;
}
function sheetBS() {
  const { st, comp, year, p } = DATA, b = st.bs, cols = year && comp.assets, c = (sec, l) => (cols ? (comp[sec] || {})[l] || 0 : null);
  const th = `<tr><th></th><th>${fmtD(p.to).replace(/^\d+ /, "")}</th>${cols ? "<th>Prior year</th>" : ""}</tr>`;
  const pa = cols ? Object.values(comp.assets).reduce((s, x) => s + x, 0) : null, pl = cols ? Object.values(comp.liabilities).reduce((s, x) => s + x, 0) : null;
  return `<div class="sheet"><h2>Balance Sheet</h2><div class="p">KenRho Park Tennis Club — as at ${fmtD(p.to)}</div><table class="f">${th}
    ${tr("h", "Assets", null, null, cols)}${tr("", "Fixed assets (net book value)", b.nbv, c("assets", "Fixed assets (net book value)"), cols)}${tr("", "Investments", b.investments, c("assets", "Investments"), cols)}
    ${tr("", "Shop stock", b.stock, cols ? 0 : null, cols)}${tr("", "Receivables", b.receivables, cols ? 0 : null, cols)}${tr("", "Bank balance", b.cash, c("assets", "Bank balance"), cols)}${tr("t", "Total assets", b.totalAssets, pa, cols)}
    ${tr("h", "Liabilities", null, null, cols)}${tr("", "Creditors", b.creditors, c("liabilities", "Creditors"), cols)}${b.deferred ? tr("", "Deferred income", b.deferred, 0, cols) : ""}${tr("", "League &amp; tournament fees held", b.leagueHeld, c("liabilities", "League & Tournament Fees Held"), cols)}${tr("t", "Total liabilities", b.totalLiab, pl, cols)}
    ${tr("h", "Accumulated fund", null, null, cols)}${tr("", "Balance at the start of the year", b.fundOpening, c("equity", "Accumulated fund"), cols)}${tr("", "Surplus / (deficit) for the year to date", b.surplusToDate, null, cols)}${tr("t", "Total accumulated fund", b.funds, c("equity", "Accumulated fund"), cols)}
    ${tr("g", "Total liabilities and accumulated fund", b.totalLiabFunds, pa, cols)}</table>
    ${Math.abs(b.check) > 0.01 ? `<p class="warn">⚠️ The balance sheet is out by ${M(b.check)}. Check the Preparation tab.</p>` : `<p class="ok small">✓ Balances: assets equal liabilities plus the accumulated fund.</p>`}</div>`;
}
function sheetCF() {
  const { st, p, year, comp } = DATA, f = st.cf, cols = year && comp.cashflow;
  return `<div class="sheet"><h2>Cash Flow Statement</h2><div class="p">KenRho Park Tennis Club — for the ${p.label}</div><table class="f"><tr><th></th><th>Period</th></tr>
    ${tr("h", "Cash flows from operating activities", null)}${tr("", "Surplus / (deficit) for the period", f.surplus)}${tr("", "Add back: depreciation", f.depreciation)}${tr("", "(Increase) / decrease in shop stock", f.dStock)}${tr("", "(Increase) / decrease in receivables", f.dReceivables)}${tr("", "Increase / (decrease) in creditors", f.dCreditors)}${f.dDeferred ? tr("", "Increase / (decrease) in deferred income", f.dDeferred) : ""}${tr("", "Increase / (decrease) in league &amp; tournament fees held", f.dLeague)}${tr("t", "Net cash from operating activities", f.operating)}
    ${tr("h", "Cash flows from investing activities", null)}${tr("", "Purchase of fixed assets", f.fa)}${tr("", "Investments made", f.inv)}${tr("t", "Net cash from investing activities", f.investing)}
    ${tr("t", "Net increase / (decrease) in cash", f.net)}${tr("", "Cash at the beginning of the period", f.open)}${tr("g", "Cash at the end of the period", f.close)}</table>
    ${Math.abs(f.check) > 0.01 ? `<p class="warn">⚠️ The cash flow is out by ${M(f.check)}.</p>` : `<p class="ok small">✓ Agrees to the bank and cash balances.</p>`}${cols ? `<p class="muted small">Prior year: net decrease in cash ${M(comp.cashflow["Net decrease in cash"])}, closing cash ${M(comp.cashflow["Cash at end of year"])}.</p>` : ""}</div>`;
}
function sheetNotes() {
  const { st } = DATA, b = st.bs, s = st.shop;
  return `<div class="sheet"><h2>Notes to the statements</h2><div class="p">Prepared automatically — not audited</div>
    <p><b>1. Basis of preparation.</b> The statements are built from the journal: member receipts and invoices, shop sales, supplier invoices and receipts that were captured on the website, stock takes and monthly depreciation. Membership and shop income is recognised when the money is received.</p>
    <p><b>2. Fixed assets.</b> Cost ${M(b.faCost)}, less accumulated depreciation ${M(b.accDep)}, net book value ${M(b.nbv)}. Depreciation is 10% a year, straight line, posted monthly.</p>
    <p><b>3. Investments.</b> ${M(b.investments)} held in the club's fixed deposit / call account.</p>
    <p><b>4. Shop trading.</b> Sales ${M(s.sales)}, cost of goods sold ${M(s.cogs)}, gross profit ${M(s.gross)}. Shop stock on hand is valued at cost: ${M(b.stock)}.</p>
    <p><b>5. Opening balances.</b> The 1 July 2026 balances come from the club's financial statements for the year ended 30 June 2026.</p></div>`;
}
function tabST() { return sheetIE() + sheetBS() + sheetCF() + sheetNotes(); }
function tabTA() {
  const t = DATA.tacc; if (!t.length) return `<div class="sheet"><p class="muted">No entries in this period.</p></div>`;
  const row = (l, side) => `<div class="r"><span>${esc(l.entry_date.slice(5))} ${esc((l.description || "").slice(0, 26))}</span><span>${M(side === "dr" ? l.debit : l.credit)}</span></div>`;
  return `<div class="tg">${t.map((a) => `<div class="tacc"><h4>${esc(a.code)} · ${esc(a.name)}</h4><div class="r"><i>${a.opening >= 0 ? "Balance b/d (Dr)" : "Balance b/d (Cr)"}</i><b>${M(Math.abs(a.opening))}</b></div>
    <div class="tt"><div><b>Debit</b>${a.dr.map((l) => row(l, "dr")).join("")}<div class="r tot"><span>Total</span><span>${M(a.drTotal)}</span></div></div><div><b>Credit</b>${a.cr.map((l) => row(l, "cr")).join("")}<div class="r tot"><span>Total</span><span>${M(a.crTotal)}</span></div></div></div>
    <div class="r" style="margin-top:4px"><i>${a.closing >= 0 ? "Balance c/d (Dr)" : "Balance c/d (Cr)"}</i><b>${M(Math.abs(a.closing))}</b></div></div>`).join("")}</div>`;
}
async function tabPR() {
  const { st, p } = DATA, sb = window.sb;
  const [pend, st1, docs, dep] = await Promise.all([
    sb.from("shop_orders").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    sb.from("stock_takes").select("take_date,status").eq("status", "open"),
    sb.from("shop_documents").select("id", { count: "exact", head: true }).is("journal_entry_id", null).in("doc_kind", ["supplier_invoice", "purchase_receipt", "expense_receipt"]).gt("amount", 0),
    sb.from("journal_entries").select("reference").like("reference", "DEP-%").gte("entry_date", FY.starts_on).lte("entry_date", p.to),
  ]);
  const chk = (ok, good, bad) => `<div class="chk"><span class="${ok ? "ok" : "warn"}">${ok ? "✓" : "⚠️"}</span><span>${ok ? good : bad}</span></div>`;
  const openStock = (st1.data || []).length;
  return `<div class="sheet"><h2>Trial balance</h2><div class="p">As at ${fmtD(p.to)}</div><table class="f"><tr><th>Account</th><th>Debit</th><th>Credit</th></tr>${st.tb.map((x) => `<tr><td>${esc(x.code)} ${esc(x.name)}</td><td class="n">${x.debit ? M(x.debit) : ""}</td><td class="n">${x.credit ? M(x.credit) : ""}</td></tr>`).join("")}<tr class="g"><td>Totals</td><td class="n">${M(st.tbDebit)}</td><td class="n">${M(st.tbCredit)}</td></tr></table>
    ${Math.abs(st.tbDebit - st.tbCredit) < 0.01 ? `<p class="ok small">✓ Debits equal credits.</p>` : `<p class="warn">⚠️ The trial balance does not balance.</p>`}</div>
    <div class="sheet"><h2 style="text-align:left">Before you finalise</h2>
    ${chk((pend.count || 0) === 0, "No shop orders waiting for approval.", `${pend.count} shop order(s) are still waiting for approval, so their sales are not in the accounts yet.`)}
    ${chk((docs.count || 0) === 0, "Every supplier invoice and receipt has been posted.", `${docs.count} document(s) were filed without an amount or payment method and are not in the accounts.`)}
    ${chk(openStock === 0, "All stock takes are finalised.", `${openStock} stock take(s) are still open. Count and finalise them so the stock value is right.`)}
    ${chk((dep.data || []).length > 0 || KIND === "month" && PER === 0 && false, "Depreciation has been posted.", "No depreciation has been posted yet for this period (it is created automatically at the start of each month).")}
    <p class="muted small">Adjustments made automatically: monthly depreciation (10% a year) and stock-take differences. See the Journal tab for every entry.</p></div>`;
}
function tabJR() {
  const g = {}; DATA.lines.forEach((l) => (g[l.entry_id] = g[l.entry_id] || { d: l.entry_date, t: l.description, r: l.reference, s: l.source_type, ls: [] }).ls.push(l));
  const es = Object.values(g); if (!es.length) return `<div class="sheet"><p class="muted">No journal entries in this period.</p></div>`;
  return es.map((e) => `<div class="sheet" style="padding:10px 14px"><b>${esc(e.d)}</b> · ${esc(e.t)} <span class="muted small">${esc(e.r || "")} · ${esc(e.s)}</span><table class="f">${e.ls.map((l) => `<tr><td>${esc(l.code)} ${esc(l.name)}</td><td class="n">${Number(l.debit) ? M(l.debit) : ""}</td><td class="n">${Number(l.credit) ? M(l.credit) : ""}</td></tr>`).join("")}</table></div>`).join("");
}
async function render() {
  const f = { st: tabST, ta: tabTA, pr: tabPR, jr: tabJR }[TAB];
  $("out").innerHTML = await f();
}
function exportCsv() {
  const { st, p } = DATA, q = (v) => `"${String(v).replace(/"/g, '""')}"`, rows = [["KenRho Park Tennis Club", p.label], [], ["Income & Expenditure"], ...st.income.map(([l, v]) => [l, v]), ["Total income", st.totalIncome], ...st.expense.map(([l, v]) => [l, v]), ["Total expenditure", st.totalExpense], ["Surplus / (deficit)", st.surplus], [], ["Balance sheet"],
    ["Fixed assets (NBV)", st.bs.nbv], ["Investments", st.bs.investments], ["Shop stock", st.bs.stock], ["Receivables", st.bs.receivables], ["Bank balance", st.bs.cash], ["Total assets", st.bs.totalAssets], ["Creditors", st.bs.creditors], ["League & tournament fees held", st.bs.leagueHeld], ["Accumulated fund", st.bs.funds]];
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" })); a.download = `kenrho-statements-${p.to}.csv`; a.click();
}

document.addEventListener("DOMContentLoaded", async () => {
  const g = await window.KR_guard("staff"); if (!g) return; const me = g.profile;
  if (!(me.role === "treasurer" || (me.email || "").toLowerCase() === "saulestoo@gmail.com")) { location.href = "admin.html"; return; }
  $("who").textContent = me.full_name || me.email; $("btn-sign-out").onclick = window.KR_signOut;
  const { data } = await window.sb.from("seasons").select("*").order("starts_on", { ascending: false }); SEASONS = data || [];
  if (!SEASONS.length) { $("out").innerHTML = `<div class="alert alert-error">No seasons found.</div>`; return; }
  const now = ymd(new Date()), yy = parse(now).getUTCFullYear() - (parse(now).getUTCMonth() < 6 ? 1 : 0), lbl = `${yy}-${yy + 1}`;
  if (!SEASONS.some((x) => x.label === lbl)) SEASONS.unshift({ id: "fy-" + lbl, label: lbl, starts_on: `${yy}-07-01`, ends_on: `${yy + 1}-06-30`, virtual: true });   // the current financial year, even before its season is opened
  FY = SEASONS.find((x) => now >= x.starts_on && now <= x.ends_on) || SEASONS[0]; if (now >= FY.starts_on && now <= FY.ends_on) { const m = (parse(now).getUTCFullYear() - parse(FY.starts_on).getUTCFullYear()) * 12 + parse(now).getUTCMonth() - parse(FY.starts_on).getUTCMonth(); PER = Math.max(0, Math.min(11, m - 1)); }
  window.sb.rpc("ensure_period_records").then(() => {}, () => {});   // depreciation + month-end stock sheet, created automatically
  controls(); await load();
  $("fy").addEventListener("change", (e) => { FY = SEASONS.find((x) => x.id === e.target.value); PER = 0; controls(); load(); });
  $("kind").addEventListener("click", (e) => { const k = e.target.dataset.k; if (k) { KIND = k; PER = 0; controls(); load(); } });
  $("per").addEventListener("change", (e) => { PER = +e.target.value; load(); });
  $("tabs").addEventListener("click", (e) => { const t = e.target.dataset.t; if (!t) return; TAB = t; document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === t)); render(); });
  $("print").onclick = () => window.print(); $("csv").onclick = () => DATA && exportCsv();
});
