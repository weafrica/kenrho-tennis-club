// Statement of account for one member: the season's fee, every receipt on file, invoices issued, anything else
// recorded on the register, and the balance — as a PDF the treasurer can download or share (Gmail, Outlook, WhatsApp…).
(function () {
  "use strict";
  var sb = function () { return window.sb; };
  var n = function (v) { return v == null || v === "" || isNaN(Number(v)) ? 0 : Number(v); };
  var R = function (v) { var x = Math.round(n(v) * 100) / 100; return "R" + (Number.isInteger(x) ? x : x.toFixed(2)); };
  var D = function (d) { if (!d) return ""; var p = String(d).slice(0, 10).split("-"); return p[2] + "/" + p[1] + "/" + p[0]; };
  var BANK = ["Bank: First National Bank", "Branch: Eastgate (Code: 257705)", "Account number: 62920283009", "Reference: your name + membership number"];
  var logoCache = null;
  function logo() {
    if (logoCache) return Promise.resolve(logoCache);
    return fetch("assets/logo.png").then(function (r) { return r.blob(); }).then(function (b) {
      return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { logoCache = fr.result; res(logoCache); }; fr.readAsDataURL(b); });
    }).catch(function () { return null; });
  }

  async function build(standingId) {
    var db = sb();
    var s = (await db.from("treasurer_standing").select("*").eq("id", standingId).single()).data;
    if (!s) throw new Error("Member not found.");
    var season = (await db.from("seasons").select("*").eq("id", s.season_id).single()).data || { label: "", starts_on: null };
    var type = (await db.from("membership_types").select("name").eq("code", s.membership_type_code).maybeSingle()).data;
    var docs = (await db.from("documents").select("doc_type,doc_number,doc_date,amount").eq("standing_id", s.id).order("doc_date")).data || [];
    var all = (await db.from("treasurer_standing").select("expected_amount,paid_amount,seasons(label,starts_on)").or("member_no.eq." + (s.member_no || "none") + (s.email ? ",email.ilike." + s.email : "")).neq("id", s.id)).data || [];
    var prof = s.email ? (await db.from("profiles").select("id").ilike("email", s.email).maybeSingle()).data : null;
    var ledgerRec = [], ledgerInv = [], orders = [];
    if (prof) {
      ledgerRec = (await db.from("receipts").select("receipt_number,amount,bank_reference,status,submitted_at").eq("member_id", prof.id).eq("status", "verified")).data || [];
      ledgerInv = (await db.from("invoices").select("invoice_number,description,amount,issue_date,status").eq("member_id", prof.id).neq("status", "void")).data || [];
      orders = (await db.from("shop_orders").select("created_at,subtotal,status,shop_order_items(qty,product_name)").eq("user_id", prof.id).in("status", ["paid", "fulfilled"])).data || [];
    }
    var inSeason = function (d) { if (!d || !season.starts_on) return true; var x = String(d).slice(0, 10); return x >= season.starts_on && x <= season.ends_on; };
    var lines = [], bal = 0, expected = n(s.expected_amount), paid = n(s.paid_amount);
    var dateFee = season.starts_on || null;
    bal += expected; lines.push({ date: dateFee, desc: "Membership fee " + season.label + (type ? " (" + type.name + ")" : ""), ref: s.member_no || "", debit: expected, credit: 0, bal: bal });
    if (s.treasurer_note && /brought forward/i.test(s.treasurer_note)) lines[0].desc += " — " + s.treasurer_note;
    var credits = [];
    docs.filter(function (d) { return d.doc_type === "receipt"; }).forEach(function (d) { credits.push({ date: d.doc_date, desc: "Receipt", ref: d.doc_number, amt: n(d.amount) }); });
    ledgerRec.filter(function (r) { return !/^Treasurer (sheet|register)/i.test(r.bank_reference || "") && inSeason(r.submitted_at); }).forEach(function (r) { credits.push({ date: String(r.submitted_at).slice(0, 10), desc: "Payment received (online proof)", ref: r.receipt_number || "", amt: n(r.amount) }); });
    credits.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var listed = 0;
    credits.forEach(function (c) { listed += c.amt; bal -= c.amt; lines.push({ date: c.date, desc: c.desc, ref: c.ref, debit: 0, credit: c.amt, bal: bal }); });
    var diff = Math.round((paid - listed) * 100) / 100, note = null;
    if (diff > 0.005) { bal -= diff; lines.push({ date: s.last_payment_date || null, desc: "Payments recorded on the membership register", ref: "", debit: 0, credit: diff, bal: bal }); }
    else if (diff < -0.005) note = "Receipts on file total R" + (-diff).toFixed(2) + " more than the payments on the register. The treasurer will confirm.";
    var invoices = docs.filter(function (d) { return d.doc_type === "invoice"; }).map(function (d) { return { date: d.doc_date, ref: d.doc_number, amt: n(d.amount) }; })
      .concat(ledgerInv.filter(function (i) { return inSeason(i.issue_date); }).map(function (i) { return { date: i.issue_date, ref: i.invoice_number, amt: n(i.amount), desc: i.description }; }));
    var shop = orders.map(function (o) { return { date: String(o.created_at).slice(0, 10), amt: n(o.subtotal), desc: (o.shop_order_items || []).map(function (i) { return i.qty + "× " + i.product_name; }).join(", ") }; });
    var prev = all.filter(function (a) { return a.seasons && season.starts_on && a.seasons.starts_on < season.starts_on; }).map(function (a) { return { season: a.seasons.label, expected: n(a.expected_amount), paid: n(a.paid_amount) }; });
    var finalBal = Math.round((expected - paid) * 100) / 100;
    return { member: { name: s.full_name, no: s.member_no, type: type ? type.name : s.membership_type_code, email: s.email, phone: s.phone }, season: season.label, asOf: new Date().toISOString().slice(0, 10),
      lines: lines, invoices: invoices, shop: shop, previous: prev, totals: { charged: expected, paid: paid, balance: finalBal }, note: note };
  }

  async function pdf(st) {
    var jsPDF = window.jspdf.jsPDF, p = new jsPDF({ unit: "mm", format: "a4" }), lg = await logo(), X = 14, W = 182, y = 14;
    var need = function (h) { if (y + h > 282) { p.addPage(); y = 16; } };
    var txt = function (t, o) { o = o || {}; p.setFont("helvetica", o.b ? "bold" : "normal"); p.setFontSize(o.s || 10); if (o.c) p.setTextColor.apply(p, o.c); else p.setTextColor(0); var ls = p.splitTextToSize(String(t), o.w || W); need(ls.length * 5 + (o.gap || 0)); y += o.gap || 0; ls.forEach(function (l) { p.text(l, X + (o.x || 0), y, o.align ? { align: o.align } : undefined); y += 5; }); };
    p.setDrawColor(0); p.setLineWidth(0.4); p.rect(X, y, W, 28); p.line(X + 36, y, X + 36, y + 28);
    if (lg) { try { p.addImage(lg, "PNG", X + 3, y + 3, 30, 22); } catch (e) {} }
    p.setFont("helvetica", "bold"); p.setFontSize(13); p.text("Statement of Account", X + 36 + (W - 36) / 2, y + 10, { align: "center" });
    p.setFontSize(10); p.text("KenRho Park Tennis Club", X + 36 + (W - 36) / 2, y + 16, { align: "center" });
    p.setFont("helvetica", "normal"); p.text("6 Langermann Drive, Kensington, 2094, Johannesburg", X + 36 + (W - 36) / 2, y + 22, { align: "center" }); y += 36;
    txt("Member: " + st.member.name, { b: 1 }); txt("Membership number: " + (st.member.no || "—") + "     Category: " + (st.member.type || "—"), { gap: 1 });
    if (st.member.email || st.member.phone) txt([st.member.email, st.member.phone].filter(Boolean).join("  ·  "), { gap: 1 });
    txt("Season: " + st.season + "     Statement date: " + D(st.asOf), { gap: 1 });
    y += 4; var cw = [24, 70, 34, 18, 18, 18];
    var row = function (c, bold, fill) { need(7); var x = X; if (fill) { p.setFillColor(238, 246, 217); p.rect(X, y - 4.5, W, 7, "F"); } p.setFont("helvetica", bold ? "bold" : "normal"); p.setFontSize(9); p.setTextColor(0);
      c.forEach(function (t, i) { var s = String(t); if (i === 1) s = p.splitTextToSize(s, cw[1] - 2)[0]; p.text(s, i >= 3 ? x + cw[i] - 1 : x + 1, y, i >= 3 ? { align: "right" } : undefined); x += cw[i]; }); p.setDrawColor(210); p.line(X, y + 2, X + W, y + 2); y += 7; };
    row(["Date", "Description", "Reference", "Charges", "Payments", "Balance"], true, true);
    st.lines.forEach(function (l) { row([D(l.date), l.desc, l.ref, l.debit ? R(l.debit) : "", l.credit ? R(l.credit) : "", R(l.bal)]); });
    y += 3; need(24); p.setFillColor(31, 61, 26); p.rect(X, y, W, 20, "F"); p.setTextColor(255); p.setFont("helvetica", "bold"); p.setFontSize(10);
    p.text("Total charged " + R(st.totals.charged), X + 4, y + 7); p.text("Total paid " + R(st.totals.paid), X + 70, y + 7);
    p.setFontSize(13); p.text(st.totals.balance > 0.005 ? "Balance due " + R(st.totals.balance) : st.totals.balance < -0.005 ? "In credit " + R(-st.totals.balance) : "Paid up — nothing owing", X + 4, y + 15); y += 26; p.setTextColor(0);
    if (st.note) txt(st.note, { s: 9, c: [150, 90, 20] });
    if (st.invoices.length) { txt("Invoices issued", { b: 1, gap: 3 }); st.invoices.forEach(function (i) { txt(D(i.date) + "   " + i.ref + "   " + R(i.amt) + (i.desc ? "   " + i.desc : ""), { s: 9 }); }); }
    if (st.previous.length) { txt("Earlier seasons", { b: 1, gap: 3 }); st.previous.forEach(function (a) { txt(a.season + ": fee " + R(a.expected) + ", paid " + R(a.paid) + ", balance " + R(a.expected - a.paid), { s: 9 }); }); }
    if (st.shop.length) { txt("Club shop purchases (not part of the membership balance)", { b: 1, gap: 3 }); st.shop.forEach(function (o) { txt(D(o.date) + "   " + R(o.amt) + "   " + o.desc, { s: 9 }); }); }
    txt("How to pay", { b: 1, gap: 4 }); BANK.forEach(function (b) { txt(b, { s: 9 }); });
    txt("Questions about this statement? Contact the club treasurer on 0694362789 or kenrhoparktennisclub@gmail.com.", { s: 8.5, gap: 4, c: [90, 100, 85] });
    return p.output("blob");
  }
  var fname = function (st) { return "Statement_" + (st.member.no || st.member.name).replace(/[^\w-]+/g, "_") + "_" + st.season + ".pdf"; };
  function download(blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  // ---------------------------------------------------------------- email / share helper (statements, invoices, receipts)
  var CLUB_EMAIL = "kenrhoparktennisclub@gmail.com";
  function treasurerName() {
    return sb().from("profiles").select("full_name").eq("role", "treasurer").limit(1).then(function (r) { return (r.data && r.data[0] && r.data[0].full_name) || "The Treasurer"; }, function () { return "The Treasurer"; });
  }
  function signature(name) { return "Kind regards,\n" + name + "\nTreasurer, KenRho Park Tennis Club\n" + CLUB_EMAIL; }
  // opts: { title, blob, filename, to, memberName, subject, intro, summaryHtml }
  async function mailDialog(opts) {
    var tname = await treasurerName(), first = (opts.memberName || "").split(" ")[0] || "there";
    var body = "Dear " + first + ",\n\n" + opts.intro + "\n\n" + signature(tname);
    var d = document.createElement("div"); d.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483100;display:flex;align-items:center;justify-content:center;padding:14px";
    var inp = "width:100%;padding:9px 10px;border:1.5px solid #dfe6d3;border-radius:8px;font:inherit;margin:3px 0 8px";
    d.innerHTML = '<div style="background:#fff;color:#1b2a17;border-radius:16px;max-width:440px;width:100%;max-height:92vh;overflow:auto;padding:18px;font:15px/1.45 system-ui,sans-serif"><div style="font-weight:800;font-size:1.1rem">' + opts.title + '</div><div style="color:#5d6b57;margin:2px 0 10px">' + (opts.memberName || "") + "</div>" + (opts.summaryHtml || "") +
      '<label style="font-size:.78rem;color:#5d6b57">To (member)</label><input id="km-to" type="email" style="' + inp + '" value="' + (opts.to || "") + '" placeholder="member@email.com"><label style="font-size:.78rem;color:#5d6b57">Copy (club)</label><input id="km-cc" type="email" style="' + inp + '" value="' + CLUB_EMAIL + '">' +
      '<label style="font-size:.78rem;color:#5d6b57">Message (ends with the treasurer\'s name)</label><textarea id="km-body" rows="7" style="' + inp + '">' + body.replace(/</g, "&lt;") + '</textarea>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button data-a="mail" style="flex:1;background:#3c7a2e;color:#fff;border:0;border-radius:99px;padding:11px;font:700 .9rem system-ui;cursor:pointer">📧 Email (addresses filled in)</button><button data-a="share" style="flex:1;background:#fff;border:1px solid #dfe6d3;border-radius:99px;padding:11px;font:700 .9rem system-ui;cursor:pointer">Share PDF…</button><button data-a="dl" style="flex:1;background:#fff;border:1px solid #dfe6d3;border-radius:99px;padding:11px;font:700 .9rem system-ui;cursor:pointer">Download</button></div>' +
      '<p style="font-size:.78rem;color:#6b7a63;margin:8px 0 0">Email opens a draft to the member with the club copied in. The PDF is downloaded first, so attach it to the draft. “Share PDF” sends the file straight to Gmail, Outlook or WhatsApp.</p><button data-a="x" style="display:block;margin:6px auto 0;background:none;border:0;color:#5d6b57;cursor:pointer">Close</button></div>';
    document.body.appendChild(d);
    d.addEventListener("click", async function (e) {
      var a = e.target.dataset && e.target.dataset.a; if (e.target === d || a === "x") return d.remove(); if (!a) return;
      var to = d.querySelector("#km-to").value.trim(), cc = d.querySelector("#km-cc").value.trim(), text = d.querySelector("#km-body").value;
      if (a === "dl") return download(opts.blob, opts.filename);
      if (a === "share") {
        var file = new File([opts.blob], opts.filename, { type: "application/pdf" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: opts.subject, text: text }); } catch (er) {} }
        else { download(opts.blob, opts.filename); window.KR && window.KR.toast("This device can't share files directly. The PDF was downloaded — use Email instead.", "warn"); }
        return;
      }
      if (a === "mail") {
        download(opts.blob, opts.filename);
        location.href = "mailto:" + encodeURIComponent(to) + "?cc=" + encodeURIComponent(cc) + "&subject=" + encodeURIComponent(opts.subject) + "&body=" + encodeURIComponent(text + "\n\n(The PDF was downloaded — please attach " + opts.filename + ".)");
      }
    });
  }
  window.KR_MAIL = { dialog: mailDialog, signature: signature, treasurerName: treasurerName, CLUB_EMAIL: CLUB_EMAIL };

  window.KR_STMT = {
    build: build, pdf: pdf, filename: fname,
    download: async function (st) { download(await pdf(st), fname(st)); },
    open: async function (standingId) {
      var st; try { st = await build(standingId); } catch (e) { return window.KR && window.KR.toast(e.message, "error"); }
      var bal = st.totals.balance, blob = await pdf(st);
      var bt = bal > 0.005 ? "Balance due: " + R(bal) + "." : bal < -0.005 ? "You are in credit by " + R(-bal) + "." : "Your account is paid up.";
      mailDialog({ title: "Statement of account", blob: blob, filename: fname(st), to: st.member.email || "", memberName: st.member.name,
        subject: "KenRho Park — Statement of account (" + st.season + ")", intro: "Please find your statement of account for the " + st.season + " season attached.\n" + bt,
        summaryHtml: '<div style="background:#eef6d9;border-radius:10px;padding:10px 12px;margin-bottom:10px">Charged <b>' + R(st.totals.charged) + "</b> · Paid <b>" + R(st.totals.paid) + "</b><br>" + (bal > 0.005 ? "Balance due <b>" + R(bal) + "</b>" : bal < -0.005 ? "In credit <b>" + R(-bal) + "</b>" : "<b>Paid up</b>") + "</div>" });
    },
  };
})();
