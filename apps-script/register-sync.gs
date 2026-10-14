/**
 * KenRho Park Tennis Club — keeps a tab in this sheet in step with the website's membership register.
 * Paste into Extensions → Apps Script, then Deploy → New deployment → Web app (Execute as: Me, Access: Anyone).
 * The website pings the Web app URL whenever the register changes. Your own tabs are never touched.
 */
const SUPABASE_URL = '__SUPABASE_URL__';
const ANON_KEY     = '__ANON_KEY__';
const TOKEN        = '__TOKEN__';
const TAB_NAME     = 'Website register (auto)';

function doPost(e) { return respond_(syncRegister_()); }
function doGet(e)  { return respond_(syncRegister_()); }
function respond_(msg) { return ContentService.createTextOutput(JSON.stringify({ ok: true, message: msg })).setMimeType(ContentService.MimeType.JSON); }

function onOpen() {
  SpreadsheetApp.getUi().createMenu('KenRho website').addItem('Sync register now', 'syncNow').addToUi();
}
function syncNow() { SpreadsheetApp.getActive().toast(syncRegister_(), 'KenRho', 5); }

function syncRegister_() {
  const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/register_export', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY },
    payload: JSON.stringify({ p_token: TOKEN })
  });
  if (res.getResponseCode() !== 200) throw new Error('Register export failed: ' + res.getContentText());
  const data = JSON.parse(res.getContentText());
  const rows = data.rows || [];
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(TAB_NAME) || ss.insertSheet(TAB_NAME);
  const header = ['Member No.', 'Full Name', 'Membership Type', 'Email', 'Contact Number', 'Form Submitted', 'Date Form Received', 'Proof of Payment', 'Last Payment Date', 'Expected', 'Paid', 'Balance', 'Notes / Follow-ups', 'Social media'];
  const body = rows.map(function (r) {
    return [r.member_no || '', r.full_name || '', r.type || '', r.email || '', r.phone || '', r.form_submitted ? 'Yes' : 'No', r.date_form_received || '',
            r.proof_received ? 'Yes' : 'No', r.last_payment_date || '', Number(r.expected || 0), Number(r.paid || 0), Number(r.balance || 0), r.notes || '', r.social_media || ''];
  });
  sh.clear();
  sh.getRange(1, 1).setValue('KenRho website register — season ' + data.season + ' — updated ' + Utilities.formatDate(new Date(), 'Africa/Johannesburg', 'yyyy-MM-dd HH:mm')).setFontWeight('bold');
  sh.getRange(2, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#eef6d9');
  if (body.length) {
    sh.getRange(3, 1, body.length, header.length).setValues(body);
    sh.getRange(3, 10, body.length, 3).setNumberFormat('R #,##0.00');
    const t = body.length + 3;
    sh.getRange(t, 9).setValue('Totals').setFontWeight('bold');
    sh.getRange(t, 10).setFormula('=SUM(J3:J' + (t - 1) + ')'); sh.getRange(t, 11).setFormula('=SUM(K3:K' + (t - 1) + ')'); sh.getRange(t, 12).setFormula('=SUM(L3:L' + (t - 1) + ')');
    sh.getRange(t, 10, 1, 3).setNumberFormat('R #,##0.00').setFontWeight('bold');
  }
  sh.setFrozenRows(2); sh.autoResizeColumns(1, header.length);
  return rows.length + ' members synced for season ' + data.season;
}
