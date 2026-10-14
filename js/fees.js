// Fills the "Membership" fees table on the public site from membership_types.
(function () {
  "use strict";
  var tbody = document.querySelector("#fees-table tbody");
  if (!tbody || !window.sb) return;
  var fmt = function (n) { return (window.KR && window.KR.fmtMoney) ? window.KR.fmtMoney(n) : "R" + Number(n).toFixed(2); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function load() {
    window.sb.from("membership_types").select("code,name,fee,note,sort_order,is_active").eq("is_active", true).order("sort_order").then(function (r) {
      if (r.error || !r.data || !r.data.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="muted" style="text-align:center;padding:20px;">Fees could not be loaded. <a href="#" id="fees-retry">Try again</a> or contact the club.</td></tr>';
        var a = document.getElementById("fees-retry"); if (a) a.onclick = function (e) { e.preventDefault(); load(); };
        return;
      }
      tbody.innerHTML = r.data.map(function (t) { return "<tr><td>" + esc(t.name) + "</td><td><strong>" + fmt(t.fee) + "</strong></td><td class=\"muted\">" + esc(t.note || "") + "</td></tr>"; }).join("");
    });
  }
  load();
})();
