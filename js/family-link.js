// KenRho Park — "which family do you belong to?" (typeahead + fallback)
//
//  * Suggests existing family memberships by NAME ONLY as the person types.
//  * If theirs isn't listed: asks for the surname / first name of whoever paid or
//    submitted the registration form, plus an email OR phone (any country code).
//  * Those contact details are only for the treasurer. They are never used to
//    sign in or to match an account, and nobody else can see them.
//  * Nothing is shared until the treasurer confirms the request in Admin.
(function () {
  "use strict";

  var COUNTRIES = [
    ["+27", "South Africa"], ["+267", "Botswana"], ["+264", "Namibia"], ["+263", "Zimbabwe"],
    ["+258", "Mozambique"], ["+266", "Lesotho"], ["+268", "Eswatini"], ["+260", "Zambia"],
    ["+265", "Malawi"], ["+244", "Angola"], ["+243", "DR Congo"], ["+255", "Tanzania"],
    ["+254", "Kenya"], ["+256", "Uganda"], ["+234", "Nigeria"], ["+233", "Ghana"],
    ["+44", "United Kingdom"], ["+1", "USA / Canada"], ["+61", "Australia"], ["+49", "Germany"],
    ["+31", "Netherlands"], ["+91", "India"], ["+971", "UAE"], ["+86", "China"]
  ];

  // "082 123 4567", "27821234567", "+27 82 123 4567", "0027821234567" -> "+27821234567"
  function normalizePhone(cc, raw) {
    var s = String(raw || "").trim().replace(/\(0\)/g, "");   // "+27 (0)82 ..." -> drop the optional trunk 0
    if (!s) return "";
    var digits = s.replace(/\D/g, "");
    if (!digits) return "";
    if (s.charAt(0) === "+") return "+" + digits;
    if (digits.indexOf("00") === 0) return "+" + digits.slice(2);
    var ccDigits = String(cc || "").replace(/\D/g, "");
    if (!ccDigits) return "";
    var local = digits.replace(/^0+/, "");
    // already typed with the country code (e.g. 27 82 ...) and long enough to be a full number
    if (local.indexOf(ccDigits) === 0 && local.length >= ccDigits.length + 7) return "+" + local;
    return "+" + ccDigits + local;
  }
  function validPhone(p) { return /^\+[1-9][0-9]{6,14}$/.test(p); }
  function validEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 254; }

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }

  function mount(root, prefix) {
    var state = { chosen: null, none: false, timer: null, active: -1, results: [], seq: 0 };
    var P = prefix + "-";
    var countryOptions = COUNTRIES.map(function (c) {
      return '<option value="' + c[0] + '">' + c[0] + " " + c[1] + "</option>";
    }).join("");

    root.innerHTML =
      '<div class="fam">' +
        '<label for="' + P + 'q">Which family do you belong to?</label>' +
        '<div class="fam-wrap">' +
          '<input type="text" id="' + P + 'q" autocomplete="off" autocapitalize="words" spellcheck="false" ' +
            'placeholder="Type a surname or first name" role="combobox" aria-expanded="false" aria-controls="' + P + 'list" />' +
          '<ul class="fam-list hidden" id="' + P + 'list" role="listbox"></ul>' +
        '</div>' +
        '<div class="fam-chosen hidden" id="' + P + 'chosen"></div>' +
        '<p class="fam-hint muted small hidden" id="' + P + 'hint"></p>' +
        '<label class="fam-none-toggle"><input type="checkbox" id="' + P + 'none" /> My family isn\'t listed</label>' +
        '<div class="fam-none hidden" id="' + P + 'nonebox">' +
          '<div class="form-row">' +
            '<label for="' + P + 'payer">Surname or first name of the person who paid or submitted the registration form</label>' +
            '<input type="text" id="' + P + 'payer" maxlength="120" autocomplete="off" />' +
          '</div>' +
          '<div class="form-row">' +
            '<label>How can the treasurer reach them? <span class="muted small">(email or phone)</span></label>' +
            '<div class="fam-method">' +
              '<label><input type="radio" name="' + P + 'method" value="phone" checked /> Phone</label>' +
              '<label><input type="radio" name="' + P + 'method" value="email" /> Email</label>' +
            '</div>' +
            '<div class="fam-phone" id="' + P + 'phonebox">' +
              '<select id="' + P + 'cc" aria-label="Country code">' + countryOptions + '<option value="other">Other (type the +code)</option></select>' +
              '<input type="tel" id="' + P + 'phone" inputmode="tel" placeholder="82 123 4567" autocomplete="off" />' +
            '</div>' +
            '<input type="email" id="' + P + 'email" class="hidden" placeholder="name@example.com" autocomplete="off" />' +
            '<p class="muted small mb-0" id="' + P + 'phonepreview"></p>' +
          '</div>' +
        '</div>' +
        '<p class="muted small fam-privacy">Only the club treasurer sees these details. They are used to find your family\'s record and <strong>cannot be used to sign in</strong>. You\'ll see your family\'s balance once the treasurer has confirmed you.</p>' +
      '</div>';

    var q = root.querySelector("#" + P + "q");
    var list = root.querySelector("#" + P + "list");
    var chosenBox = root.querySelector("#" + P + "chosen");
    var hint = root.querySelector("#" + P + "hint");
    var noneCb = root.querySelector("#" + P + "none");
    var noneBox = root.querySelector("#" + P + "nonebox");
    var payer = root.querySelector("#" + P + "payer");
    var cc = root.querySelector("#" + P + "cc");
    var phone = root.querySelector("#" + P + "phone");
    var email = root.querySelector("#" + P + "email");
    var phoneBox = root.querySelector("#" + P + "phonebox");
    var preview = root.querySelector("#" + P + "phonepreview");

    function method() {
      var r = root.querySelector('input[name="' + P + 'method"]:checked');
      return r ? r.value : "phone";
    }
    function closeList() { list.classList.add("hidden"); q.setAttribute("aria-expanded", "false"); state.active = -1; }
    function openList() { list.classList.remove("hidden"); q.setAttribute("aria-expanded", "true"); }
    function paintActive() {
      Array.prototype.forEach.call(list.children, function (li, i) { li.classList.toggle("active", i === state.active); });
    }
    function choose(item) {
      state.chosen = item;
      q.value = "";
      q.classList.add("hidden");
      closeList();
      hint.classList.add("hidden");
      chosenBox.classList.remove("hidden");
      chosenBox.innerHTML = "";
      chosenBox.appendChild(el("span", { class: "fam-tick" }, "✓"));
      chosenBox.appendChild(el("strong", null, item.label));
      var change = el("button", { type: "button", class: "fam-change" }, "Change");
      change.addEventListener("click", function () {
        state.chosen = null; chosenBox.classList.add("hidden"); q.classList.remove("hidden"); q.focus();
      });
      chosenBox.appendChild(change);
      noneCb.checked = false; setNone(false);
    }
    function setNone(on) {
      state.none = on;
      noneBox.classList.toggle("hidden", !on);
      if (on) {
        state.chosen = null; chosenBox.classList.add("hidden"); q.classList.remove("hidden"); closeList(); hint.classList.add("hidden");
      }
    }
    function render(results, term) {
      state.results = results; state.active = -1;
      list.innerHTML = "";
      if (!results.length) {
        closeList();
        hint.classList.remove("hidden");
        hint.textContent = "No family found for “" + term + "”. Check the spelling, or tick “My family isn’t listed” below.";
        return;
      }
      hint.classList.add("hidden");
      results.forEach(function (r, i) {
        var li = el("li", { role: "option", "data-i": String(i) }, r.label);
        li.addEventListener("mousedown", function (e) { e.preventDefault(); choose(r); });
        list.appendChild(li);
      });
      openList();
    }
    function search() {
      var term = q.value.trim();
      if (term.length < 2) { closeList(); hint.classList.add("hidden"); return; }
      var my = ++state.seq;
      window.sb.rpc("search_families", { p_q: term }).then(function (res) {
        if (my !== state.seq) return;                  // a newer keystroke already replaced this
        render(res && res.data ? res.data : [], term);
      }, function () { /* offline: stay quiet, they can still tick "not listed" */ });
    }

    q.addEventListener("input", function () { clearTimeout(state.timer); state.timer = setTimeout(search, 220); });
    q.addEventListener("focus", function () { if (state.results.length && q.value.trim().length >= 2) openList(); });
    q.addEventListener("blur", function () { setTimeout(closeList, 120); });
    q.addEventListener("keydown", function (e) {
      if (list.classList.contains("hidden")) return;
      if (e.key === "ArrowDown") { e.preventDefault(); state.active = Math.min(state.active + 1, state.results.length - 1); paintActive(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); state.active = Math.max(state.active - 1, 0); paintActive(); }
      else if (e.key === "Enter" && state.active >= 0) { e.preventDefault(); choose(state.results[state.active]); }
      else if (e.key === "Escape") { closeList(); }
    });
    noneCb.addEventListener("change", function () { setNone(noneCb.checked); });
    root.querySelectorAll('input[name="' + P + 'method"]').forEach(function (r) {
      r.addEventListener("change", function () {
        var isPhone = method() === "phone";
        phoneBox.classList.toggle("hidden", !isPhone);
        email.classList.toggle("hidden", isPhone);
        preview.textContent = "";
      });
    });
    function updatePreview() {
      if (method() !== "phone") return;
      var n = normalizePhone(cc.value === "other" ? "" : cc.value, phone.value);
      preview.textContent = n ? "We'll save this as " + n : "";
    }
    phone.addEventListener("input", updatePreview);
    cc.addEventListener("change", function () {
      phone.placeholder = cc.value === "other" ? "+code and number, e.g. +49 151 2345678" : "82 123 4567";
      updatePreview();
    });

    return {
      // returns an error message, or "" when OK
      validate: function () {
        if (state.chosen) return "";
        if (state.none) {
          if (payer.value.trim().length < 2) return "Please type the surname or first name of the person who paid or submitted the form.";
          if (method() === "email") {
            if (!validEmail(email.value.trim())) return "Please enter a valid email address for that person.";
          } else {
            var n = normalizePhone(cc.value === "other" ? "" : cc.value, phone.value);
            if (!validPhone(n)) return "Please enter a phone number for that person (include the country code if it isn't +27).";
          }
          return "";
        }
        if (q.value.trim().length) return "Pick your family from the list, or tick “My family isn’t listed”.";
        return "Please choose your family, or tick “My family isn’t listed”.";
      },
      submit: function () {
        var args = { p_standing_id: null, p_typed_family: null, p_payer_name: null, p_contact_email: null, p_contact_phone: null };
        if (state.chosen) {
          args.p_standing_id = state.chosen.id; args.p_typed_family = state.chosen.label;
        } else {
          args.p_payer_name = payer.value.trim();
          if (method() === "email") args.p_contact_email = email.value.trim();
          else args.p_contact_phone = normalizePhone(cc.value === "other" ? "" : cc.value, phone.value);
        }
        return window.sb.rpc("submit_family_link", args);
      }
    };
  }

  // -------------------------------------------------------------- public API
  var formCtl = null, cardCtl = null;
  var api = {
    // inside the registration form: shown only while the chosen category is "Family"
    init: function () {
      var holder = document.getElementById("family-block");
      var sel = document.getElementById("reg-membership-type");
      if (!holder || !sel || holder.dataset.ready) return;
      holder.dataset.ready = "1";
      formCtl = mount(holder, "regfam");
      function sync() { holder.classList.toggle("hidden", !api.isFamilyType(sel.value)); }
      sel.addEventListener("change", sync);
      sync();
    },
    isFamilyType: function (typeId) {
      var t = (typeof CTX !== "undefined" && CTX.membershipTypes) || [];
      var m = t.filter(function (x) { return x.id === typeId; })[0];
      return !!(m && m.code === "family");
    },
    isActive: function () {
      var holder = document.getElementById("family-block");
      return !!(formCtl && holder && !holder.classList.contains("hidden"));
    },
    // used by the registration form: returns true to carry on saving, false to stop
    submitFromForm: function () {
      if (!api.isActive()) return Promise.resolve(true);
      var err = formCtl.validate();
      if (err) { window.KR.toast(err, "error"); return Promise.resolve(false); }
      return formCtl.submit().then(function (res) {
        if (res.error) { window.KR.toast(res.error.message || "Could not send your family request.", "error"); return false; }
        window.KR.toast("Family request sent. The treasurer will confirm it.");
        return true;
      });
    },
    // standalone card for already-registered family members who aren't linked yet
    afterLoad: function () {
      var card = document.getElementById("family-card");
      var standing = document.getElementById("standing-card");
      if (!card) return;
      var isFamily = api.isFamilyType((typeof CTX !== "undefined" && CTX.profile && CTX.profile.membership_type_id) || "");
      var hasStanding = standing && !standing.classList.contains("hidden");
      var regVisible = !document.getElementById("registration-card").classList.contains("hidden");
      if (!isFamily || hasStanding || regVisible) { card.classList.add("hidden"); return; }

      window.sb.rpc("my_family_request").then(function (res) {
        var r = res && res.data && res.data[0];
        var status = document.getElementById("family-card-status");
        var body = document.getElementById("family-card-body");
        var btn = document.getElementById("family-card-submit");
        status.innerHTML = "";
        card.classList.remove("hidden");
        if (r && r.status === "pending") {
          body.classList.add("hidden"); btn.classList.add("hidden");
          var s = el("div", { class: "alert alert-info" });
          s.appendChild(el("strong", null, "Request sent. "));
          s.appendChild(document.createTextNode("The treasurer is confirming that you belong to " + (r.family_label || "your family") + ". Your family's balance will show here once that's done."));
          status.appendChild(s);
          return;
        }
        if (r && r.status === "rejected") {
          var s2 = el("div", { class: "alert alert-warn" });
          s2.appendChild(document.createTextNode("The treasurer couldn't match your request" + (r.staff_note ? ": " + r.staff_note : ".") + " Please try again below."));
          status.appendChild(s2);
        }
        body.classList.remove("hidden"); btn.classList.remove("hidden");
        if (!cardCtl) {
          cardCtl = mount(body, "cardfam");
          btn.addEventListener("click", function () {
            var err = cardCtl.validate();
            if (err) return window.KR.toast(err, "error");
            btn.disabled = true;
            cardCtl.submit().then(function (res2) {
              btn.disabled = false;
              if (res2.error) return window.KR.toast(res2.error.message || "Could not send your request.", "error");
              window.KR.toast("Family request sent. The treasurer will confirm it.");
              cardCtl = null; body.innerHTML = "";
              api.afterLoad();
            });
          });
        }
      });
    }
  };
  window.KR_family = api;
  window.KR_normalizePhone = normalizePhone;
})();
