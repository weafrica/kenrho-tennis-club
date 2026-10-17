// Fundraiser page: public giving (EFT / cash pledges the treasurer confirms), progress, supporters wall, and a manager for admins.
(function () {
  "use strict";
  var sb = window.sb;
  var BANK = "Bank: First National Bank\nAccount name: KenRho Park Tennis Club\nAccount number: 62920283009\nBranch: Eastgate (Code: 257705)\nReference: Fundraiser + your name";
  var TIERS = [100, 250, 500, 1000, 2500];
  var F = null, canManage = false, me = { id: null, name: "" };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var R = function (n) { return "R" + (Number(n) || 0).toLocaleString("en-ZA", { maximumFractionDigits: 0 }).replace(/\u00a0/g, " "); };
  var toast = function (m, t) { if (window.KR && window.KR.toast) window.KR.toast(m, t); };

  function daysLeft(d) { if (!d) return null; var n = Math.ceil((new Date(d + "T23:59:59") - new Date()) / 864e5); return n; }
  function paint(pub) {
    var raised = Number(pub.raised || 0), goal = Number(F.goal || 0), pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0, dl = daysLeft(F.deadline);
    $("fund-title").textContent = F.title; $("fund-summary").textContent = F.summary || ""; if (F.image_url) $("fund-img").src = F.image_url;
    document.title = F.title + " — KenRho Park Tennis Club";
    $("progress").innerHTML = '<div class="big">' + R(raised) + '</div><div class="muted">raised' + (goal > 0 ? " of " + R(goal) + " goal" : "") + "</div>" + (goal > 0 ? '<div class="meter"><i style="width:' + pct + '%"></i></div>' : "") +
      '<div class="stats"><div><b>' + (pub.donors || 0) + "</b><span>supporters</span></div>" + (goal > 0 ? "<div><b>" + pct + "%</b><span>of goal</span></div>" : "") + (dl != null ? "<div><b>" + (dl >= 0 ? dl : 0) + "</b><span>" + (dl >= 0 ? "days left" : "days — ended") + "</span></div>" : "") + "</div>";
    var st = $("story"); if (F.story) { st.style.display = ""; st.innerHTML = "<h2 style=\"margin:0 0 6px\">Why we are fundraising</h2><p style=\"white-space:pre-line;margin:0\">" + esc(F.story) + "</p>"; } else st.style.display = "none";
    var w = pub.wall || []; $("wall-box").style.display = w.length ? "" : "none";
    $("wall").innerHTML = w.map(function (x) { return '<div class="w"><b>' + esc(x.name) + "</b>" + (x.message ? ' — “' + esc(x.message) + '”' : "") + "</div>"; }).join("");
  }
  function load() {
    return sb.from("fundraisers").select("*").eq("is_active", true).order("created_at").limit(1).then(function (r) {
      if (!r.data || !r.data[0]) { $("progress").innerHTML = '<div class="muted">There is no fundraiser open right now. Please check back soon.</div>'; $("give").style.display = "none"; return null; }
      F = r.data[0]; return sb.rpc("fundraiser_public", { p_id: F.id }).then(function (p) { paint(p.data || {}); return p.data; });
    }, function () { $("progress").innerHTML = '<div class="muted">The fundraiser could not be loaded right now.</div>'; });
  }

  // ---------------------------------------------------------------- giving
  function form() {
    $("amts").innerHTML = TIERS.map(function (a) { return '<button type="button" data-a="' + a + '">' + R(a) + "</button>"; }).join("");
    $("amts").onclick = function (e) { var a = e.target.dataset && e.target.dataset.a; if (!a) return; $("f-amt").value = a; [].forEach.call($("amts").children, function (b) { b.classList.toggle("on", b === e.target); }); };
    $("eft-box").textContent = BANK;
    $("f-method").onchange = function () { var eft = this.value === "eft"; $("eft-box").style.display = eft ? "" : "none"; $("proof-wrap").style.display = eft ? "" : "none"; };
    $("f-go").onclick = async function () {
      var amt = Number($("f-amt").value), name = $("f-name").value.trim(); if (!name) return toast("Please enter your name.", "warn"); if (!(amt > 0)) return toast("Choose or type an amount.", "warn");
      var btn = this; btn.disabled = true; var path = null;
      try {
        var f = $("f-proof").files[0];
        if (f && $("f-method").value === "eft") { var ext = (f.name.split(".").pop() || "dat").toLowerCase(); path = "fundraiser/" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()) + "." + ext; var up = await sb.storage.from("shop-payment-proofs").upload(path, f); if (up.error) throw up.error; }
        var r = await sb.rpc("submit_pledge", { p_fundraiser: F.id, p_name: name, p_email: $("f-email").value.trim(), p_phone: $("f-phone").value.trim(), p_amount: amt, p_message: $("f-msg").value.trim(), p_anonymous: $("f-anon").checked, p_method: $("f-method").value, p_proof: path || "" });
        if (r.error) throw r.error;
        $("thanks-msg").textContent = "Your gift of " + R(amt) + " is noted. " + ($("f-method").value === "eft" ? "As soon as the treasurer sees the payment in the bank it will appear in the total." : "Please hand it to the treasurer at the clubhouse and it will appear in the total.");
        $("pg-form").classList.remove("on"); $("pg-thanks").classList.add("on");
      } catch (e) { toast(e.message || String(e), "error"); } finally { btn.disabled = false; }
    };
    $("again").onclick = function () { $("pg-thanks").classList.remove("on"); $("pg-form").classList.add("on"); $("f-amt").value = ""; };
    var share = function () { var url = location.origin + location.pathname, text = (F ? F.title : "KenRho Park Fundraiser") + " — please help us reach our goal."; if (navigator.share) navigator.share({ title: F ? F.title : "", text: text, url: url }).catch(function () {}); else window.open("https://wa.me/?text=" + encodeURIComponent(text + " " + url), "_blank", "noopener"); };
    $("share-btn").onclick = share; $("thanks-share").onclick = share;
  }

  // ---------------------------------------------------------------- manager (admins, treasurer)
  function logFund(action, label, oldV, newV) { return sb.from("site_edit_log").insert({ page: "fundraiser.html", target_type: "fundraiser", target_key: F.id, action: action, label: label, old_value: oldV, new_value: newV, edited_by: me.id, editor_name: me.name }); }
  async function manager() {
    var host = $("manager"); var pl = await sb.from("fundraiser_pledges").select("*").eq("fundraiser_id", F.id).order("created_at", { ascending: false }).limit(200); var rows = pl.data || [];
    var pending = rows.filter(function (p) { return p.status === "pending"; }), recd = rows.filter(function (p) { return p.status === "received"; });
    host.innerHTML = '<div class="box mgr"><h2 style="margin:0 0 6px">Manage this fundraiser <span class="muted" style="font-size:.8rem;font-weight:400">(admins only)</span></h2>' +
      '<div class="row"><label class="l">Title</label><input id="m-title" value="' + esc(F.title) + '"><label class="l">Short summary</label><input id="m-sum" value="' + esc(F.summary || "") + '"><label class="l">Why we are fundraising</label><textarea id="m-story" rows="4">' + esc(F.story || "") + '</textarea>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label class="l">Goal (R, 0 = no goal)</label><input id="m-goal" type="number" min="0" value="' + (F.goal || 0) + '"></div><div><label class="l">Closing date</label><input id="m-dl" type="date" value="' + (F.deadline || "") + '"></div></div>' +
      '<label style="display:flex;gap:8px;align-items:center;margin:8px 0"><input type="checkbox" id="m-active" style="width:auto" ' + (F.is_active ? "checked" : "") + '> Open for giving</label><button class="sm go" id="m-save">Save changes</button><button class="sm" id="m-photo" type="button">📷 Change picture</button></div>' +
      "<h3 style=\"margin:14px 0 4px\">Waiting to be confirmed (" + pending.length + ")</h3>" +
      (pending.map(function (p) { return '<div class="row"><b>' + esc(p.donor_name) + "</b> · " + R(p.amount) + ' <span class="muted">· ' + p.method.toUpperCase() + " · " + new Date(p.created_at).toLocaleDateString("en-ZA") + "</span>" + (p.message ? "<br>“" + esc(p.message) + "”" : "") + (p.email || p.phone ? '<br><span class="muted">' + esc([p.email, p.phone].filter(Boolean).join(" · ")) + "</span>" : "") +
        '<div>' + (p.proof_path ? '<button class="sm" data-proof="' + esc(p.proof_path) + '">View proof</button>' : "") + '<button class="sm go" data-ok="' + p.id + '">✓ Money received (bank)</button><button class="sm" data-cash="' + p.id + '">💵 Received in cash</button><button class="sm no" data-no="' + p.id + '">✕ Reject</button></div></div>'; }).join("") || '<p class="muted">Nothing waiting.</p>') +
      '<h3 style="margin:14px 0 4px">Confirmed (' + recd.length + ')</h3><div class="muted" style="font-size:.85rem">' + (recd.map(function (p) { return esc(p.donor_name) + " " + R(p.amount); }).join(" · ") || "None yet.") + '</div><button class="sm" id="m-csv" style="margin-top:8px">Export all pledges (CSV)</button></div>';
    $("m-save").onclick = async function () {
      var nv = { title: $("m-title").value.trim(), summary: $("m-sum").value.trim(), story: $("m-story").value.trim(), goal: Number($("m-goal").value) || 0, deadline: $("m-dl").value || null, is_active: $("m-active").checked };
      if (!nv.title) return toast("A title is needed.", "warn");
      var old = Object.assign({}, F); var r = await sb.from("fundraisers").update(nv).eq("id", F.id); if (r.error) return toast(r.error.message, "error");
      await logFund("edit", "Fundraiser details updated", old, Object.assign({}, F, nv)); toast("Saved ✓ (tracked in the Edit activity feed)"); await load(); manager();
    };
    $("m-photo").onclick = function () {
      var f = document.createElement("input"); f.type = "file"; f.accept = "image/*";
      f.onchange = async function () { var file = f.files[0]; if (!file) return; toast("Uploading…"); try { var b = await createImageBitmap(file), r = Math.min(1, 1400 / Math.max(b.width, b.height)), c = document.createElement("canvas"); c.width = Math.round(b.width * r); c.height = Math.round(b.height * r); c.getContext("2d").drawImage(b, 0, 0, c.width, c.height);
        var blob = await new Promise(function (res) { c.toBlob(res, "image/jpeg", 0.85); }), path = "fundraiser/" + Date.now() + ".jpg", up = await sb.storage.from("site-media").upload(path, blob, { contentType: "image/jpeg" }); if (up.error) throw up.error;
        var url = sb.storage.from("site-media").getPublicUrl(path).data.publicUrl, old = Object.assign({}, F); var u = await sb.from("fundraisers").update({ image_url: url }).eq("id", F.id); if (u.error) throw u.error; await logFund("edit", "Fundraiser picture changed", old, Object.assign({}, F, { image_url: url })); await load(); toast("Picture updated ✓"); } catch (e) { toast(e.message || String(e), "error"); } };
      f.click();
    };
    host.onclick = async function (e) {
      var d = e.target.dataset || {};
      if (d.proof) { var u = await sb.storage.from("shop-payment-proofs").createSignedUrl(d.proof, 120); if (u.error) return toast("Could not open the proof.", "error"); window.open(u.data.signedUrl, "_blank", "noopener"); }
      if (d.ok || d.cash) { var r = await sb.rpc("confirm_pledge", { p_id: d.ok || d.cash, p_cash: !!d.cash }); toast(r.error ? r.error.message : r.data, r.error ? "error" : "info"); await load(); manager(); }
      if (d.no) { if (!confirm("Reject this pledge?")) return; var r2 = await sb.rpc("reject_pledge", { p_id: d.no }); toast(r2.error ? r2.error.message : "Rejected."); manager(); }
    };
    $("m-csv").onclick = function () { var q = function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }; var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([["Date,Name,Email,Phone,Amount,Method,Status,Message"].concat(rows.map(function (p) { return [p.created_at.slice(0, 10), p.donor_name, p.email, p.phone, p.amount, p.method, p.status, p.message].map(q).join(","); })).join("\n")], { type: "text/csv" })); a.download = "fundraiser-pledges.csv"; a.click(); };
  }

  document.addEventListener("DOMContentLoaded", async function () {
    form(); await load();
    try {
      var s = await sb.auth.getSession(); if (!s.data.session || !F) return; me.id = s.data.session.user.id;
      var ok = await sb.rpc("can_manage_fundraisers"); if (ok.data !== true) return; canManage = true;
      var pr = await sb.from("profiles").select("full_name,email").eq("id", me.id).single(); me.name = (pr.data && (pr.data.full_name || pr.data.email)) || "An admin";
      manager();
    } catch (e) {}
  });
})();
