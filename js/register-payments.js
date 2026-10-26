// Payments for one member (each payment is its own line) + a tool to assign bank payments that did not match a member.
(function () {
  "use strict";
  var h = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var Rm = function (n) { return "R" + (Number.isInteger(+n) ? +n : (+n).toFixed(2)); };
  var fd = function (d) { var p = String(d).slice(0, 10).split("-"); return p[2] + "/" + p[1] + "/" + p[0]; };
  var tidy = function (t) { return String(t || "").replace(/^(Magtape Credit|Payshap Credit|FNB App Payment From|Int-Banking Pmt Frm|ADT Cash Deposit|FNB OB Pmt)\s*/i, ""); };
  var toast = function (m, t) { if (window.KR && window.KR.toast) window.KR.toast(m, t); };

  async function refreshRow(row) {
    var r = await window.sb.from("treasurer_standing").select("*").eq("id", row.id).single(); if (r.data) Object.assign(row, r.data);
    if (typeof render === "function") render(); if (typeof openDrawer === "function") openDrawer(row.id);
  }
  window.krPaymentsSection = async function (row, ro) {
    var dr = document.querySelector("#drawer .dr"); if (!dr || dr.querySelector("#kr-pay-sec")) return;
    var r = await window.sb.from("member_payments").select("*").eq("standing_id", row.id).order("pay_date");
    var list = r.data || []; if (!document.querySelector("#drawer .dr")) return;
    var counted = list.filter(function (p) { return p.counts; }).reduce(function (s, p) { return s + Number(p.amount); }, 0);
    var sec = document.createElement("div"); sec.className = "sec"; sec.id = "kr-pay-sec";
    sec.innerHTML = "<h4>Payments received (" + h(Rm(counted)) + ")</h4>" + (list.length ? list.map(function (p) {
      return '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #eef1e6;font-size:.84rem;' + (p.counts ? "" : "opacity:.6") + '"><div style="flex:1;min-width:0"><b>' + h(Rm(p.amount)) + "</b> · " + fd(p.pay_date) + '<br><span class="muted small">' + h(tidy(p.description)) + " · " + (p.source === "bank" ? "bank" : p.source === "sheet" ? "sheet" : "entered") + (p.counts ? "" : " · not counted") + (p.note && !p.counts ? "<br>" + h(p.note) : "") + '</span></div><label style="margin:0;font-size:.75rem;display:flex;align-items:center;gap:4px"><input type="checkbox" data-pcount="' + p.id + '" ' + (p.counts ? "checked" : "") + (ro ? " disabled" : "") + ' style="width:auto"> count</label>' + (ro ? "" : '<button class="btn btn-sm" style="background:#fdecea;color:#b23b2e" data-pdel="' + p.id + '">×</button>') + "</div>";
    }).join("") : '<p class="muted small">No payments recorded yet. Use “Record a payment” above.</p>') + '<p class="muted small" style="margin:8px 0 0">“Paid so far” is added up from these lines, so the statement of account always agrees. Untick “count” for something that should not be included.</p>';
    var money = dr.querySelector(".sec"); money.parentNode.insertBefore(sec, money.nextSibling);
    var paidInp = dr.querySelector('[data-f="paid_amount"]'); if (paidInp && list.length) { paidInp.readOnly = true; paidInp.title = "Calculated from the payments below"; paidInp.style.background = "#f3f7ea"; }
    sec.addEventListener("change", async function (e) { var id = e.target.dataset && e.target.dataset.pcount; if (!id) return; var u = await window.sb.from("member_payments").update({ counts: e.target.checked }).eq("id", id); if (u.error) return toast(u.error.message, "error"); await refreshRow(row); });
    sec.addEventListener("click", async function (e) { var id = e.target.dataset && e.target.dataset.pdel; if (!id) return; if (!confirm("Delete this payment line?")) return; var d = await window.sb.from("member_payments").delete().eq("id", id); if (d.error) return toast(d.error.message, "error"); await refreshRow(row); });
  };

  // ------------------------------------------------------------ bank payments that did not match a member
  async function openUnallocated() {
    var rows = (window.ROWS || []).slice().sort(function (a, b) { return (a.full_name || "").localeCompare(b.full_name || ""); });
    var r = await window.sb.from("member_payments").select("*").is("standing_id", null).eq("counts", true).eq("season_id", window.SEASON).order("pay_date");
    var list = r.data || [], old = document.getElementById("unalloc-modal"); if (old) old.remove();
    var m = document.createElement("div"); m.id = "unalloc-modal"; m.className = "dr-bg";
    var opts = '<option value="">Choose member…</option>' + rows.map(function (x) { return '<option value="' + x.id + '">' + h(x.full_name) + " " + h(x.member_no || "") + "</option>"; }).join("");
    m.innerHTML = '<div class="dr" style="width:min(720px,100%)"><div class="flex-between"><h2>Bank payments to assign</h2><button class="btn btn-outline btn-sm" data-x>Close</button></div><p class="muted small">These came off the bank statements but the name did not match anyone on the register. Pick who each one belongs to, or mark it as not a membership payment (visitors, hire, events…). ' + list.length + " waiting, " + Rm(list.reduce(function (s, p) { return s + Number(p.amount); }, 0)) + ".</p>" +
      (list.map(function (p) { return '<div class="sec" data-id="' + p.id + '" style="margin:8px 0"><b>' + h(Rm(p.amount)) + "</b> · " + fd(p.pay_date) + " · " + h(tidy(p.description)) + '<div style="display:flex;gap:8px;margin-top:6px"><select data-sel style="flex:1">' + opts + '</select><button class="btn btn-primary btn-sm" data-assign>Assign</button><button class="btn btn-outline btn-sm" data-skip title="Not a membership payment">Not a member</button></div></div>'; }).join("") || '<div class="flag" style="background:#e2f4d4;border-color:#b7dfa0">✓ Everything is assigned.</div>') + "</div>";
    document.body.appendChild(m);
    m.addEventListener("click", async function (e) {
      if (e.target === m || (e.target.dataset && e.target.dataset.x !== undefined)) return m.remove();
      var box = e.target.closest("[data-id]"); if (!box) return; var id = box.dataset.id;
      if (e.target.hasAttribute("data-assign")) { var sid = box.querySelector("[data-sel]").value; if (!sid) return toast("Choose a member first.", "warn"); var u = await window.sb.from("member_payments").update({ standing_id: sid, season_id: window.SEASON, note: "Assigned by the treasurer" }).eq("id", id); if (u.error) return toast(u.error.message, "error"); toast("Assigned ✓"); box.remove(); if (typeof load === "function") load(); badge(); }
      if (e.target.hasAttribute("data-skip")) { var u2 = await window.sb.from("member_payments").update({ counts: false, note: "Not a membership payment" }).eq("id", id); if (u2.error) return toast(u2.error.message, "error"); box.remove(); badge(); }
    });
  }
  async function badge() {
    var b = document.getElementById("btn-unalloc"); if (!b || !window.SEASON) return;
    var r = await window.sb.from("member_payments").select("id", { count: "exact", head: true }).is("standing_id", null).eq("counts", true).eq("season_id", window.SEASON);
    var n = r.count || 0; b.textContent = "🏦 Bank payments to assign" + (n ? " (" + n + ")" : ""); b.style.display = n ? "" : "none";
  }
  document.addEventListener("DOMContentLoaded", function () { var b = document.getElementById("btn-unalloc"); if (b) { b.addEventListener("click", openUnallocated); setTimeout(badge, 2500); var s = document.getElementById("season"); if (s) s.addEventListener("change", function () { setTimeout(badge, 500); }); } });
})();
