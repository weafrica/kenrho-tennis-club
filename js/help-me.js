// "Help me" — role-aware how-to guides, read-aloud, and a message to the club. Replaces the old support bubble.
(function () {
  "use strict";
  if (window.__krHelp) return; window.__krHelp = true;
  var sb = window.sb;
  var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  var ROLE = { key: "visitor", label: "Visitor", profile: null, shop: null };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  // ---------------------------------------------------------------- the guides
  var G = {
    join: ["How do I join the club?", ["Tap “Join the club” and sign in with your Google account.", "Pick your membership category and fill in your details, then tap “Save my details”.", "Pay your fee by EFT, the Yoco card machine at the clubhouse, or a monthly stop order.", "Upload your proof of payment under “Upload proof of payment”. Approval usually happens the same day."]],
    pay: ["How do I pay and send proof of payment?", ["Open “My membership”.", "Pay using the bank details shown under “How to pay”. Use your name and category as the reference.", "Tap “Upload proof of payment”, enter the amount, add a photo or PDF of the proof and submit.", "The treasurer checks it. Your receipt appears under “My payments” once it is verified."]],
    shopBuy: ["How do I buy something in the shop?", ["Open the Shop and tap + on any item, or open it to choose how many.", "Tap the cart, then “Check out”.", "Choose WhatsApp, Card (when available) or EFT. For EFT, pay into the bank details shown and attach your proof of payment.", "The shop team approves EFT orders after checking the money. You can see the status under “My orders” and download your receipt once it is approved."]],
    install: ["How do I install the app?", ["Use Chrome on Android, or Safari on iPhone.", "When the “Install the KenRho app” box appears, tap Install. On iPhone tap Share, then “Add to Home Screen”.", "Open KenRho from your home screen. You stay signed in, and the natural voice downloads quietly in the background."]],
    listen: ["How do I have text read to me?", ["Tap the green 🔊 Listen button under any paragraph longer than ten words.", "Tap again to pause or resume.", "The natural voice downloads once in the background after you install the app. Until it is ready, your phone's own voice is used."]],
    stay: ["I keep being asked to sign in", ["Sign in once with Google and stay on the same browser or the installed app.", "Do not use private or incognito mode, and do not clear the site's data.", "If it keeps happening, tell us below and we will look into it."]],
    balance: ["Where do I see what I owe?", ["Open “My membership”.", "Your account card shows the fee, what you have paid and any balance.", "Invoices and payments are listed further down, with a PDF for each."]],
    family: ["How do I link to my family membership?", ["Open “My membership”.", "Choose Family when you register, then type your family's name in “Link to your family membership”.", "Send it to the treasurer. Once confirmed, the family balance shows on your account."]],
    approve: ["How do I approve members and payments?", ["Open Admin → Members and tap Approve on new sign-ups.", "Open Receipts, check the proof against the bank statement, then Verify or Reject.", "Verifying posts the payment to the accounts and updates the member's invoice."]],
    content: ["How do I change what is on the website?", ["Sign in and open any public page, for example the home page.", "Tap “✏️ Edit page” at the bottom of the screen. Every piece of text becomes editable.", "Click the text, type your change and click away. It saves automatically. Use “Undo my edits” to go back to the original."]],
    register: ["How do I use the membership register?", ["Admin → Membership register shows everyone for the season shown at the top.", "Tap a member to open their card. Everything saves as you type.", "Use “Record a payment” when money arrives. “Add & make receipt” creates the receipt for you.", "Use the filters to see who owes money or has not sent a form."]],
    docs: ["How do I make an invoice or receipt?", ["Open Invoices & receipts, choose New invoice or New receipt.", "Pick the member. Their details and fee fill in. Remove or add any line you like.", "Tap “Save & download PDF”. Receipts can also be recorded in the accounts with one tick."]],
    statement: ["How do I send a member their statement of account?", ["Open the member in the register, or find them in Invoices & receipts.", "Tap “Statement of account”. It combines the invoices, receipts and balance in one PDF.", "Tap Share to send it by Gmail, Outlook or WhatsApp, or Download to save it."]],
    season: ["What is a season and how do I start a new one?", ["A season is one membership year (July to June), for example 2026-2027.", "When the club account appoints a new treasurer, the new season opens automatically and last season's members move across with any unpaid balance.", "Older seasons stay on file. Use the season selector at the top of the register to look at them."]],
    accounts: ["Where are the accounting statements?", ["Admin → Accounts (treasurer and Saul only).", "Choose Month, Quarter or Year. You get the Income & Expenditure account, Balance Sheet, Cash Flow, T-accounts and the trial balance.", "Use Print / PDF to save a copy. Everything comes from the receipts, invoices and shop sales that were captured."]],
    sheet: ["How does the Google Sheet stay in step?", ["Open the membership register and tap “Google Sheet sync”.", "Follow the three steps once (paste the script into the sheet and paste the web app address back).", "After that, every change on the website updates the “Website register (auto)” tab within about a minute."]],
    memberlist: ["Where is the clear list of members?", ["Admin → Member list shows every member by category with contact details and payment status.", "Print it or save it as a PDF to share at meetings."]],
    shopAdd: ["How do I add a product?", ["Open the Shop, tap the ⚙️ icon, then Products → Add product.", "Enter the name, price, cost price and stock, choose a department and add a photo.", "Tap Save. It shows in the shop straight away."]],
    shopOrders: ["How do I approve an EFT order?", ["Shop → ⚙️ → Orders → Pending review.", "Tap “View proof” and check the money in the bank.", "Tap Approve. Stock is reduced, the sale goes into the accounts and a receipt and invoice are created automatically. Reject if the money is not there."]],
    shopDocs: ["How do I add a supplier invoice or receipt?", ["Open Shop records → Documents → Add document.", "Choose the type, enter the supplier, date and amount, say what it was for and how it was paid.", "Attach a PDF or take a photo. It is filed and posted to the accounts automatically."]],
    stock: ["How do I do a stock take?", ["Open Shop records → Stock take. A monthly sheet is created for you; you can also tap “Start a stock take now”.", "Count each item and type the number.", "The shop manager or treasurer finalises it. Any difference is posted to the accounts."]],
    coach: ["How do I edit the coach page?", ["Open the Coach page and tap “✏️ Edit page”.", "Tap any text or photo to change it. It saves as you go.", "You can only edit the coach page."]],
    appoint: ["How do I appoint officers?", ["Sign in with the club account and open Admin → Officers.", "Type the person's email next to the role and tap Appoint. The old holder of treasurer, secretary or chairman moves to committee.", "Appointing a new treasurer also opens the new season.", "The shop team and the coach are appointed on the same page."]],
  };
  var PAGE = {
    "index.html": ["join", "install", "listen"], "": ["join", "install", "listen"], "shop.html": ["shopBuy", "shopAdd", "shopOrders"], "dashboard.html": ["pay", "balance", "family"],
    "auth.html": ["join", "stay"], "admin.html": ["approve", "content", "register"], "admin-sheet.html": ["register", "statement", "season", "sheet"],
    "admin-documents.html": ["docs", "statement"], "admin-officers.html": ["appoint"], "admin-accounts.html": ["accounts"], "shop-records.html": ["shopDocs", "stock"],
    "members-list.html": ["memberlist"], "coach.html": ["coach", "content"],
  };
  var BY_ROLE = {
    visitor: ["join", "shopBuy", "install", "listen"], member: ["pay", "balance", "family", "shopBuy", "install", "listen", "stay"],
    committee: ["approve", "content", "memberlist"], secretary: ["approve", "content", "memberlist", "register"], chairman: ["memberlist", "approve", "content", "accounts"],
    treasurer: ["register", "docs", "statement", "season", "accounts", "sheet", "approve", "shopOrders", "memberlist"],
    admin: ["approve", "content", "register", "docs", "statement", "season", "accounts", "sheet", "memberlist", "appoint", "shopOrders", "shopAdd", "shopDocs", "stock"],
    coach: ["coach", "content"], shop_manager: ["shopAdd", "shopOrders", "shopDocs", "stock", "accounts"], shop_assistant: ["shopAdd", "shopOrders", "shopDocs", "stock"],
  };
  var LABEL = { visitor: "Visitor", member: "Member", committee: "Committee", secretary: "Secretary", chairman: "Chairman", treasurer: "Treasurer", admin: "Administrator", coach: "Coach", shop_manager: "Shop manager", shop_assistant: "Shop assistant" };

  // ---------------------------------------------------------------- UI
  var root = document.createElement("div"); root.id = "kr-help-root";
  var css = document.createElement("style");
  css.textContent = "#kr-help-btn{position:fixed;left:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:84;background:#1f3d1a;color:#fff;border:0;border-radius:99px;padding:11px 16px;font:700 .88rem system-ui,sans-serif;box-shadow:0 8px 22px rgba(0,0,0,.3);cursor:pointer;display:flex;align-items:center;gap:6px}" +
    "#kr-help-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147482000;display:none;align-items:flex-end;justify-content:center}#kr-help-ov.on{display:flex}" +
    "#kr-help-sheet{background:#fbfcf7;color:#1b2a17;width:100%;max-width:520px;max-height:88vh;overflow:auto;border-radius:20px 20px 0 0;font:15px/1.45 system-ui,sans-serif;padding:16px 16px calc(20px + env(safe-area-inset-bottom,0px))}@media(min-width:640px){#kr-help-ov{align-items:center}#kr-help-sheet{border-radius:20px}}" +
    "#kr-help-sheet h2{margin:0;font-size:1.25rem}#kr-help-sheet .rl{display:inline-block;background:#e8f1d6;color:#2f5a22;border-radius:99px;padding:2px 10px;font-size:.74rem;font-weight:700;margin-left:6px}" +
    "#kr-help-sheet input[type=search],#kr-help-sheet input[type=text],#kr-help-sheet input[type=email],#kr-help-sheet textarea{width:100%;padding:10px 12px;border:1.5px solid #dfe6d3;border-radius:10px;font:inherit;background:#fff;color:#1b2a17;margin:6px 0}" +
    "#kr-help-sheet details{background:#fff;border:1px solid #dfe6d3;border-radius:12px;padding:10px 12px;margin:7px 0}#kr-help-sheet summary{font-weight:700;cursor:pointer}#kr-help-sheet ol{margin:8px 0 6px;padding-left:20px}#kr-help-sheet li{margin:4px 0}" +
    "#kr-help-sheet h3{margin:16px 0 4px;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:#5d6b57}#kr-help-sheet .hb{border:0;border-radius:99px;padding:10px 16px;font:700 .86rem system-ui;cursor:pointer;background:#3c7a2e;color:#fff}#kr-help-sheet .hb.o{background:#fff;color:#1b2a17;border:1px solid #dfe6d3}";
  document.head.appendChild(css);
  root.innerHTML = '<button id="kr-help-btn" aria-haspopup="dialog">❓ Help me</button><div id="kr-help-ov" role="dialog" aria-label="Help me"><div id="kr-help-sheet"></div></div>';
  document.body.appendChild(root);
  var ov = root.querySelector("#kr-help-ov"), sheet = root.querySelector("#kr-help-sheet");

  function guideHtml(k, idx) {
    var g = G[k]; if (!g) return "";
    var id = "kr-help-g-" + idx + "-" + k;
    return '<details data-k="' + k + '"><summary>' + esc(g[0]) + '</summary><div id="' + id + '"><ol>' + g[1].map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + '</ol></div><button type="button" class="hb o" data-read-aloud="' + id + '" data-label="Listen" style="margin-top:4px;padding:6px 12px;font-size:.78rem">🔊 Listen</button></details>';
  }
  function build(q) {
    q = (q || "").toLowerCase();
    var seen = {}, out = "", i = 0;
    var section = function (title, keys) {
      var h = ""; keys.forEach(function (k) { if (seen[k] || !G[k]) return; if (q && (G[k][0] + " " + G[k][1].join(" ")).toLowerCase().indexOf(q) < 0) return; seen[k] = 1; h += guideHtml(k, i++); });
      return h ? "<h3>" + title + "</h3>" + h : "";
    };
    out += section("On this page", PAGE[page] || []);
    out += section("For you as " + (LABEL[ROLE.key] || "a visitor").toLowerCase(), BY_ROLE[ROLE.key] || []);
    out += section("Everyone", BY_ROLE.member.concat(["join", "shopBuy"]));
    if (q) out += section("More answers", Object.keys(G));
    if (!out) out = '<p style="color:#5d6b57">No guide matches that. Send us a message below and we will help.</p>';
    return out;
  }
  function render() {
    var vs = window.KR_VOICE ? window.KR_VOICE.status() : null;
    sheet.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><h2>Help me <span class="rl">' + esc(LABEL[ROLE.key]) + '</span></h2><button class="hb o" data-close>Close</button></div>' +
      '<input type="search" id="kr-help-q" placeholder="What do you need help with?"><div id="kr-help-list">' + build("") + "</div>" +
      (vs ? '<h3>Voice</h3><label style="display:flex;gap:8px;align-items:center;font-size:.9rem"><input type="checkbox" id="kr-help-auto" ' + (vs.auto ? "checked" : "") + ' style="width:auto"> Download the natural voice automatically' + (vs.lowEnd ? " (not available on this device or connection)" : "") + "</label>" : "") +
      '<h3>Still stuck? Message the club</h3><form id="kr-help-form"><input type="text" id="kr-help-name" placeholder="Your name" required><input type="email" id="kr-help-email" placeholder="Your email (so we can reply)"><textarea id="kr-help-msg" rows="3" placeholder="Tell us what went wrong" required></textarea>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="hb" type="submit">Send</button><a class="hb o" style="text-decoration:none" href="https://wa.me/27725196875?text=' + encodeURIComponent("Hi, I need help with the KenRho website (" + page + ")") + '" target="_blank" rel="noopener">WhatsApp the club</a></div><div id="kr-help-ok" style="margin-top:8px;font-weight:600"></div></form>';
    var p = ROLE.profile; if (p) { sheet.querySelector("#kr-help-name").value = p.full_name || ""; sheet.querySelector("#kr-help-email").value = p.email || ""; }
  }
  function open() { render(); ov.classList.add("on"); }
  root.querySelector("#kr-help-btn").addEventListener("click", open);
  ov.addEventListener("click", function (e) { if (e.target === ov || e.target.hasAttribute("data-close")) ov.classList.remove("on"); });
  sheet.addEventListener("input", function (e) { if (e.target.id === "kr-help-q") { sheet.querySelector("#kr-help-list").innerHTML = build(e.target.value); if (e.target.value && sheet.querySelector("details")) sheet.querySelector("details").open = true; if (window.KR_READ) sheet.querySelectorAll("[data-read-aloud]").forEach(function (b) { window.KR_READ.init(b); }); } });
  sheet.addEventListener("change", function (e) { if (e.target.id === "kr-help-auto" && window.KR_VOICE) window.KR_VOICE.setAuto(e.target.checked); });
  sheet.addEventListener("toggle", function () { if (window.KR_READ) sheet.querySelectorAll("[data-read-aloud]").forEach(function (b) { if (!b.dataset.state) window.KR_READ.init(b); }); }, true);
  sheet.addEventListener("submit", function (e) {
    e.preventDefault(); if (!sb) return;
    var ok = sheet.querySelector("#kr-help-ok"), row = { name: sheet.querySelector("#kr-help-name").value.trim(), email: sheet.querySelector("#kr-help-email").value.trim() || null, message: "[" + page + "] " + sheet.querySelector("#kr-help-msg").value.trim() };
    if (ROLE.profile) row.member_id = ROLE.profile.id;
    sb.from("support_messages").insert(row).then(function (r) { ok.textContent = r.error ? "Could not send. Please use WhatsApp instead." : "Sent ✓ — the club will get back to you."; if (!r.error) sheet.querySelector("#kr-help-msg").value = ""; });
  });
  // remove the old floating support bubble so there is only one help button
  function dropOld() { var o = document.getElementById("help-widget-btn"); if (o) o.remove(); var p = document.getElementById("help-widget-panel"); if (p) p.remove(); }
  setTimeout(dropOld, 0); setTimeout(dropOld, 1200);
  var q0 = /[?&]help=1/.test(location.search); if (q0) setTimeout(open, 600);

  // ---------------------------------------------------------------- who is this?
  if (sb) sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session; if (!s) return;
    return sb.from("profiles").select("id,full_name,email,role,status").eq("id", s.user.id).single().then(function (p) {
      var pr = p.data; if (!pr) return; ROLE.profile = pr; ROLE.key = pr.role === "member" ? "member" : (BY_ROLE[pr.role] ? pr.role : "member");
      return sb.rpc("my_shop_role").then(function (x) {
        var sr = x && x.data; ROLE.shop = sr;
        if (pr.role === "member" && sr === "manager") ROLE.key = "shop_manager"; else if (pr.role === "member" && sr === "assistant") ROLE.key = "shop_assistant";
      }, function () {});
    });
  }).catch(function () {});
})();
