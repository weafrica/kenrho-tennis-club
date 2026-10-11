// Treasurer/admin side of invoice + receipt PDFs. Needs jsPDF, invoice.js (KR_PDF) and admin.js (CTX).
window.KR_adminDocs = {
  _logo: null,
  async _ctx() {
    if (!this._logo) this._logo = await window.KR_PDF.loadLogoDataUrl();
    return { settings: CTX.settings, logoDataUrl: this._logo };
  },
  async _member(id) {
    const { data } = await window.sb.from("profiles").select("id, full_name, email").eq("id", id).single();
    return data || { full_name: "Member", email: "" };
  },
  async invoice(invoiceId) {
    const { data: inv, error } = await window.sb.from("invoices").select("*").eq("id", invoiceId).single();
    if (error) return window.KR.toast(error.message, "error");
    await window.KR_PDF.invoice({ invoice: inv, member: await this._member(inv.member_id), ...(await this._ctx()) });
  },
  async receipt(receiptId) {
    const { data: r, error } = await window.sb.from("receipts").select("*").eq("id", receiptId).single();
    if (error) return window.KR.toast(error.message, "error");
    if (r.status !== "verified") return window.KR.toast("Receipts are only issued once a payment is verified.", "warn");
    await window.KR_PDF.receipt({ receipt: r, member: await this._member(r.member_id), ...(await this._ctx()) });
  },
};
