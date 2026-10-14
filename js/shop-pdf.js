// Shop invoice / receipt PDFs (generated in the browser). Used for approved orders, card sales and member downloads.
(function () {
  "use strict";
  var R = function (v) { var x = Math.round((Number(v) || 0) * 100) / 100; return "R" + (Number.isInteger(x) ? x : x.toFixed(2)); };
  var D = function (d) { var p = String(d || new Date().toISOString()).slice(0, 10).split("-"); return p[2] + "/" + p[1] + "/" + p[0]; };
  var logo = null;
  function loadLogo() { if (logo) return Promise.resolve(logo); return fetch("assets/logo.png").then(function (r) { return r.blob(); }).then(function (b) { return new Promise(function (res) { var f = new FileReader(); f.onload = function () { logo = f.result; res(logo); }; f.readAsDataURL(b); }); }).catch(function () { return null; }); }
  // d = { kind:'invoice'|'receipt', number, date, customer, items:[{name,qty,unit}], total, method, reference, note }
  function make(d) {
    return loadLogo().then(function (lg) {
      var p = new window.jspdf.jsPDF({ unit: "mm", format: "a4" }), X = 14, W = 182, y = 14, inv = d.kind === "invoice";
      var t = function (s, o) { o = o || {}; p.setFont("helvetica", o.b ? "bold" : "normal"); p.setFontSize(o.s || 10); p.setTextColor(0); p.splitTextToSize(String(s), W).forEach(function (l) { if (y > 280) { p.addPage(); y = 16; } y += o.gap || 0; o.gap = 0; p.text(l, X, y); y += 5; }); };
      p.setLineWidth(0.4); p.rect(X, y, W, 28); p.line(X + 36, y, X + 36, y + 28); if (lg) { try { p.addImage(lg, "PNG", X + 3, y + 3, 30, 22); } catch (e) {} }
      p.setFont("helvetica", "bold"); p.setFontSize(13); p.text("Shop " + (inv ? "Invoice" : "Receipt"), X + 36 + (W - 36) / 2, y + 10, { align: "center" });
      p.setFontSize(10); p.text("KenRho Park Tennis Club", X + 36 + (W - 36) / 2, y + 16, { align: "center" }); p.setFont("helvetica", "normal"); p.text("6 Langermann Drive, Kensington, 2094, Johannesburg", X + 36 + (W - 36) / 2, y + 22, { align: "center" }); y += 36;
      t((inv ? "Invoice" : "Receipt") + " number: " + d.number); t("Date: " + D(d.date), { gap: 1 }); t("Customer: " + (d.customer || ""), { gap: 1 });
      y += 4; var cw = [100, 20, 30, 32];
      var row = function (c, bold, fill) { if (y > 275) { p.addPage(); y = 16; } var x = X; if (fill) { p.setFillColor(238, 246, 217); p.rect(X, y - 4.5, W, 7, "F"); } p.setFont("helvetica", bold ? "bold" : "normal"); p.setFontSize(9.5); p.setTextColor(0);
        c.forEach(function (s, i) { s = String(s); if (i === 0) s = p.splitTextToSize(s, cw[0] - 2)[0]; p.text(s, i === 0 ? x + 1 : x + cw[i] - 1, y, i === 0 ? undefined : { align: "right" }); x += cw[i]; }); p.setDrawColor(210); p.line(X, y + 2, X + W, y + 2); y += 7; };
      row(["Item", "Qty", "Unit price", "Amount"], true, true);
      (d.items || []).forEach(function (i) { row([i.name, i.qty, R(i.unit), R(i.qty * i.unit)]); });
      y += 3; p.setFont("helvetica", "bold"); p.setFontSize(12); p.text((inv ? "Total due: " : "Total paid: ") + R(d.total), X + W, y + 2, { align: "right" }); y += 12;
      if (!inv && d.method) t("Paid by: " + d.method + (d.reference ? "   Reference: " + d.reference : ""));
      if (inv) { ["Bank: First National Bank", "Account number: 62920283009", "Branch: Eastgate (Code: 257705)", "Reference: your name + invoice number"].forEach(function (s) { t(s, { s: 9 }); }); }
      if (d.note) t(d.note, { gap: 3, s: 9 });
      t("Thank you for supporting the club. Questions: 0694362789 · kenrhoparktennisclub@gmail.com", { gap: 8, s: 8.5 });
      return p.output("blob");
    });
  }
  function download(blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  window.KR_SHOPDOC = { make: make, download: download, money: R };
})();
