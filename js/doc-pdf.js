// Shared model + renderers (live preview and PDF) for treasurer invoices & receipts.
// Layout follows the club's 2026 Word templates.
(function () {
  const CATS = ["League", "Junior", "Social", "Family", "Pensioner"];
  const DEFAULT_FEES = () => [
    { label: "League (incl TSA fees)", fee: 1500, cat: "League", on: false },
    { label: "Junior (full)", fee: 500, cat: "Junior", on: false },
    { label: "Junior (early bird discount)", fee: 250, cat: "Junior", on: false },
    { label: "Social", fee: 1250, cat: "Social", on: false },
    { label: "Family", fee: 2000, cat: "Family", on: false },
    { label: "Pensioner", fee: 600, cat: "Pensioner", on: false },
  ];
  const DEFAULT_PAY = () => [
    { k: "Bank", v: "First National Bank" },
    { k: "Branch", v: "Eastgate (Code: 257705)" },
    { k: "Account Number", v: "62920283009" },
    { k: "Reference", v: "Name + Surname + Category" },
    { k: "Note", v: "No cash accepted." },
  ];
  const DEFAULT_METHODS = () => [
    { label: "EFT", on: false }, { label: "Monthly Stop Order", on: false }, { label: "Yoco Machine (Clubhouse)", on: false },
  ];
  const DEFAULT_NOTES_INV = () => [
    "Proof of payment must be sent to the Club Secretary, Lynette Moleleki, at kenrhoparktennisclub@gmail.com.",
    "Membership is valid once payment and completed form are received.",
    "Members agree to abide by club rules and municipal by-laws of Rhodes Park.",
  ];

  function blank(type) {
    return {
      id: null, type: type || "invoice", number: "", date: new Date().toISOString().slice(0, 10),
      standing_id: null, name: "", member_no: "", category: "", email: "",
      fees: DEFAULT_FEES(), override: "", paid: "", reference: "", method: "EFT",
      pay: DEFAULT_PAY(), methods: DEFAULT_METHODS(), notes: type === "receipt" ? [] : DEFAULT_NOTES_INV(),
      treasurer: "Saul Moyo", contact: "0694362789 | kenrhoparktennisclub@gmail.com",
    };
  }

  const n = (v) => (v === "" || v == null || isNaN(Number(v)) ? 0 : Number(v));
  const fmtR = (v) => "R" + (Number.isInteger(n(v)) ? n(v) : n(v).toFixed(2));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (d) => { if (!d) return ""; const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; };

  function calc(s) {
    const sum = s.fees.filter((f) => f.on).reduce((a, f) => a + n(f.fee), 0);
    const due = s.override !== "" && s.override != null ? n(s.override) : sum;
    const paid = s.type === "receipt" ? (s.paid !== "" && s.paid != null ? n(s.paid) : due) : 0;
    return { sum, due, paid };
  }
  const catLine = (s) => CATS.map((c) => `(${s.category === c ? "X" : " "}) ${c}`).join("  ");

  function previewHtml(s) {
    const c = calc(s), inv = s.type === "invoice", L = inv ? "Invoice" : "Receipt";
    const row = (a, b) => `<div class="pv-row"><span class="pv-k">${a}</span><span class="pv-v">${esc(b) || "&nbsp;"}</span></div>`;
    let h = `<div class="pv-head"><div class="pv-logo"><img src="assets/logo.png" alt=""></div><div class="pv-title">Membership ${L}: KenRho Park Tennis Club<br>6 Langermann Drive, Kensington, 2094,<br>Johannesburg, South Africa</div></div>`;
    h += row(`${L} Number:`, s.number) + row("Date:", fmtDate(s.date)) + row(inv ? "Name:" : "Member Name:", s.name) + row("Membership Number:", s.member_no);
    h += `<div class="pv-line">Membership Category: ${esc(catLine(s))}</div>`;
    h += `<div class="pv-h">Membership Fees</div><table class="pv-t"><tr><th>Category</th><th>Fee</th><th>${inv ? "Selected" : "Selection"}</th></tr>`;
    h += s.fees.map((f) => `<tr><td>${esc(f.label)}</td><td>${fmtR(f.fee)}</td><td class="c">${f.on ? "X" : ""}</td></tr>`).join("") + `</table>`;
    if (inv) {
      if (s.pay.length) h += `<div class="pv-h u">Payment Details</div>` + s.pay.map((p) => `<div class="pv-line">${esc(p.k)}${p.k ? ": " : ""}${esc(p.v)}</div>`).join("");
      const m = s.methods.filter((x) => x.label);
      if (m.length) h += `<div class="pv-line">Payment Methods: ${m.map((x) => `[${x.on ? "X" : " "}] ${esc(x.label)}`).join(" | ")}</div>`;
      h += `<div class="pv-line"><b>Total Amount Due</b>: ${fmtR(c.due)}</div>`;
      if (s.notes.length) h += `<div class="pv-h">Notes</div>` + s.notes.map((x) => `<div class="pv-line">${esc(x)}</div>`).join("");
      h += `<div class="pv-line">Authorized by: KenRho Park Tennis Club</div><div class="pv-line pv-gap">Treasurer Signature: ___________________</div><div class="pv-line">Date: ${esc(fmtDate(s.date))}</div>`;
    } else {
      h += `<div class="pv-line pv-gap">Amount Paid: <b>${fmtR(c.paid)}</b></div>`;
      h += `<div class="pv-line">Reference Used: ${esc(s.reference)}</div>`;
      if (s.method) h += `<div class="pv-line">Payment Method: ${esc(s.method)}</div>`;
      if (s.notes.length) h += s.notes.map((x) => `<div class="pv-line">${esc(x)}</div>`).join("");
      h += `<div class="pv-line pv-gap">Signature: ______________________</div><div class="pv-line">Club Treasurer: ${esc(s.treasurer)}</div><div class="pv-line">Contact: ${esc(s.contact)}</div>`;
    }
    return h;
  }

  async function pdf(s) {
    const { jsPDF } = window.jspdf, p = new jsPDF({ unit: "mm", format: "a4" });
    const c = calc(s), inv = s.type === "invoice", L = inv ? "Invoice" : "Receipt";
    let logo = null; try { logo = await window.KR_PDF.loadLogoDataUrl(); } catch (e) {}
    const X = 14, W = 182; let y = 14;
    const need = (h) => { if (y + h > 285) { p.addPage(); y = 16; } };
    const text = (t, o = {}) => {
      p.setFont("helvetica", o.b ? "bold" : "normal"); p.setFontSize(o.s || 10);
      const lines = p.splitTextToSize(String(t), W - (o.indent || 0));
      need(lines.length * 5 + (o.gap || 0)); y += o.gap || 0;
      lines.forEach((l) => { p.text(l, X + (o.indent || 0), y); if (o.u) p.line(X, y + 1, X + p.getTextWidth(l), y + 1); y += 5; });
    };
    // header box
    p.setDrawColor(0); p.setLineWidth(0.4); p.rect(X, y, W, 30); p.line(X + 38, y, X + 38, y + 30);
    if (logo) { try { p.addImage(logo, "PNG", X + 3, y + 3, 32, 24); } catch (e) {} }
    p.setFont("helvetica", "bold"); p.setFontSize(12);
    ["Membership " + L + ": KenRho Park Tennis Club", "6 Langermann Drive, Kensington, 2094,", "Johannesburg, South Africa"].forEach((l, i) => p.text(l, X + 38 + (W - 38) / 2, y + 10 + i * 6, { align: "center" }));
    y += 38;
    text(`${L} Number: ${s.number}`); text(`Date: ${fmtDate(s.date)}`, { gap: 2 });
    text(`${inv ? "Name" : "Member Name"}: ${s.name}`, { gap: 2 }); text(`Membership Number: ${s.member_no}`, { gap: 2 });
    text("Membership Category: " + catLine(s), { gap: 2 });
    text("Membership Fees", { b: 1, gap: 4 }); text("Please check the applicable fee:");
    // fee table
    y += 1; const cw = [98, 40, 44];
    const trow = (cells, bold) => {
      need(8); let x = X; p.setFont("helvetica", bold ? "bold" : "normal"); p.setFontSize(10);
      cells.forEach((t, i) => { p.rect(x, y, cw[i], 8); p.text(String(t), i === 2 ? x + cw[i] / 2 : x + 2, y + 5.5, i === 2 ? { align: "center" } : undefined); x += cw[i]; });
      y += 8;
    };
    trow(["Category", "Fee", inv ? "Selected" : "Selection"], true);
    s.fees.forEach((f) => trow([f.label, fmtR(f.fee), f.on ? "X" : ""]));
    y += 3;
    if (inv) {
      if (s.pay.length) { text("Payment Details", { b: 1, u: 1, gap: 3 }); s.pay.forEach((q) => text(`${q.k}${q.k ? ": " : ""}${q.v}`)); }
      const m = s.methods.filter((x) => x.label);
      if (m.length) text("Payment Methods: " + m.map((x) => `[${x.on ? "X" : " "}] ${x.label}`).join(" | "));
      text(`Total Amount Due: ${fmtR(c.due)}`, { b: 1, gap: 2 });
      if (s.notes.length) { text("Notes", { gap: 2 }); s.notes.forEach((q) => text(q)); }
      text("Authorized by: KenRho Park Tennis Club", { gap: 2 });
      text("Treasurer Signature: ____________________", { gap: 8 });
      text(`Date: ${fmtDate(s.date)}`, { gap: 2 });
    } else {
      text(`Amount Paid: ${fmtR(c.paid)}`, { b: 1, gap: 2 });
      text(`Reference Used: ${s.reference}`, { gap: 2 });
      if (s.method) text(`Payment Method: ${s.method}`, { gap: 2 });
      s.notes.forEach((q) => text(q, { gap: 2 }));
      text("Signature: ______________________________", { gap: 10 });
      text(`Club Treasurer: ${s.treasurer}`, { gap: 2 }); text(`Contact: ${s.contact}`);
    }
    p.save(`${(s.number || L).replace(/[^\w-]+/g, "_")}.pdf`);
  }

  window.KR_DOC = { CATS, DEFAULT_FEES, DEFAULT_PAY, DEFAULT_METHODS, DEFAULT_NOTES_INV, blank, calc, fmtR, fmtDate, esc, previewHtml, pdf };
})();
