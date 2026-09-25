// Requires the jsPDF UMD build to be loaded on the page (see <script> tags).
window.KR_PDF = {
  _header(doc, title, logoDataUrl) {
    doc.setFillColor(31, 61, 26); // pine
    doc.rect(0, 0, 210, 34, "F");
    if (logoDataUrl) {
      try { doc.addImage(logoDataUrl, "PNG", 14, 6, 22, 22); } catch (e) {}
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text(window.KENRHO_CONFIG.CLUB_NAME || "KenRho Park Tennis Club", 42, 16);
    doc.setFontSize(11);
    doc.setTextColor(200, 230, 150);
    doc.text(title, 42, 24);
    doc.setTextColor(20, 23, 15);
  },
  _footer(doc) {
    doc.setFontSize(8.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      "Generated automatically by the KenRho Park Tennis Club member portal.",
      14,
      287
    );
  },
  async invoice({ invoice, member, settings, logoDataUrl }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    this._header(doc, "TAX INVOICE", logoDataUrl);

    doc.setFontSize(11);
    let y = 46;
    doc.text(`Invoice #: ${invoice.invoice_number}`, 14, y);
    doc.text(`Issue date: ${window.KR.fmtDate(invoice.issue_date)}`, 140, y);
    y += 7;
    doc.text(`Status: ${invoice.status.replace("_", " ").toUpperCase()}`, 14, y);
    if (invoice.due_date) doc.text(`Due date: ${window.KR.fmtDate(invoice.due_date)}`, 140, y);
    y += 12;

    doc.setFont(undefined, "bold");
    doc.text("Billed to:", 14, y);
    doc.setFont(undefined, "normal");
    y += 6;
    doc.text(member.full_name || member.email, 14, y);
    y += 6;
    doc.text(member.email, 14, y);
    y += 14;

    // line item table
    doc.setFillColor(238, 246, 217);
    doc.rect(14, y, 182, 9, "F");
    doc.setFont(undefined, "bold");
    doc.text("Description", 18, y + 6);
    doc.text("Amount", 176, y + 6, { align: "right" });
    doc.setFont(undefined, "normal");
    y += 15;
    doc.text(invoice.description, 18, y);
    doc.text(window.KR.fmtMoney(invoice.amount, settings.currency), 176, y, { align: "right" });
    y += 10;
    doc.setDrawColor(230, 230, 220);
    doc.line(14, y, 196, y);
    y += 8;
    doc.setFont(undefined, "bold");
    doc.text("Total due", 18, y);
    doc.text(window.KR.fmtMoney(invoice.amount - invoice.amount_paid, settings.currency), 176, y, { align: "right" });
    doc.setFont(undefined, "normal");

    y += 16;
    doc.setFont(undefined, "bold");
    doc.text("How to pay", 14, y);
    doc.setFont(undefined, "normal");
    y += 6;
    const bankLines = doc.splitTextToSize(settings.bank_details || "", 180);
    doc.text(bankLines, 14, y);
    y += bankLines.length * 6 + 4;
    doc.text("After paying, upload your proof of payment on the member portal so it can be verified.", 14, y);

    this._footer(doc);
    doc.save(`${invoice.invoice_number}.pdf`);
  },
  async receipt({ receipt, member, settings, logoDataUrl }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    this._header(doc, "OFFICIAL RECEIPT", logoDataUrl);

    let y = 46;
    doc.setFontSize(11);
    doc.text(`Receipt #: ${receipt.receipt_number}`, 14, y);
    doc.text(`Date verified: ${window.KR.fmtDate(receipt.verified_at)}`, 120, y);
    y += 12;
    doc.text(`Received from: ${member.full_name || member.email}`, 14, y);
    y += 8;
    doc.text(`Payment method: ${receipt.payment_method || "EFT"}`, 14, y);
    if (receipt.bank_reference) doc.text(`Reference: ${receipt.bank_reference}`, 120, y);
    y += 16;

    doc.setFillColor(238, 246, 217);
    doc.rect(14, y, 182, 16, "F");
    doc.setFont(undefined, "bold");
    doc.setFontSize(13);
    doc.text("Amount received:", 18, y + 10);
    doc.text(window.KR.fmtMoney(receipt.amount, settings.currency), 190, y + 10, { align: "right" });
    doc.setFont(undefined, "normal");
    doc.setFontSize(11);

    y += 30;
    doc.text("Thank you for supporting KenRho Park Tennis Club.", 14, y);

    this._footer(doc);
    doc.save(`${receipt.receipt_number}.pdf`);
  },
  async loadLogoDataUrl() {
    try {
      const res = await fetch("assets/logo.png");
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return null;
    }
  },
};
