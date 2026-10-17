// Website editor (v2). Public pages show saved edits. Admins (and the coach, on the coach page) get an "Edit page" button:
// every paragraph gets its own ✏️ Edit button with Save / Undo / 📷 Picture; every change is tracked, can be undone, and
// lands in a shared Activity feed where admins say why they changed it. Edits are keyed by page + original wording, so no HTML tags are needed.
(function () {
  "use strict";
  var sb = window.sb; if (!sb || document.body.classList.contains("app-shell")) return;
  var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  var PAGE_NAMES = { "index.html": "Home", "coach.html": "Coaching", "fundraiser.html": "Fundraiser", "shop.html": "Shop" };
  var pageName = function (p) { return PAGE_NAMES[p] || p.replace(".html", ""); };
  var SKIP = "script,style,noscript,svg,input,textarea,select,option,button:not(.btn),[data-no-cms],#fees-table,#news-container,#gallery-container,#kr-help-root,#kr-install-pop,.kr-listen,.kr-cms-ui,.kr-cms-eb,.kr-cms-tb,#kr-cms-bar,#kr-hd-offer,#kr-fund-app";
  var LEAF = "h1,h2,h3,h4,h5,p,li,figcaption,blockquote,td,th,dt,dd,label,.lede,.hero-eyebrow,.btn,a,span,small,strong,em,b,div";
  var rows = {}, els = [], canEdit = false, editing = false, active = null, me = { id: null, name: "" };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var norm = function (t) { return (t || "").replace(/\s+/g, " ").trim(); };
  var snippet = function (t) { t = norm(t); return t.length > 70 ? t.slice(0, 67) + "…" : t; };
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function toast(m) { if (window.KR && window.KR.toast) window.KR.toast(m); }

  function candidates() {
    var out = [], seen = {}, iseen = {};
    document.querySelectorAll(LEAF).forEach(function (el) {
      if (el.closest(SKIP) || el.querySelector("*:not(br)")) return;
      var t = norm(el.textContent); if (t.length < 2 || !/[A-Za-z]/.test(t)) return;
      var k = page + "|t|" + hash(t); seen[k] = (seen[k] || 0) + 1;
      out.push({ el: el, key: k + "|" + seen[k], orig: t, kind: "text", block: /^(H[1-6]|P|LI|BLOCKQUOTE|FIGCAPTION|TD|TH|DT|DD)$/.test(el.tagName) || el.classList.contains("lede") });
    });
    document.querySelectorAll("img").forEach(function (img) {
      if (img.closest(SKIP) || !img.getAttribute("src")) return;
      var s = img.getAttribute("src"), k = page + "|i|" + hash(s); iseen[k] = (iseen[k] || 0) + 1;
      out.push({ el: img, key: k + "|" + iseen[k], orig: s, kind: "image" });
    });
    return out;
  }
  function figure(c, url) {
    var old = document.querySelector('.kr-cms-pic[data-for="' + c.key + '"]'); if (old) old.remove();
    if (!url) return;
    var f = document.createElement("figure"); f.className = "kr-cms-pic"; f.setAttribute("data-for", c.key);
    f.innerHTML = '<img src="' + esc(url) + '" alt="" loading="lazy"><button type="button" class="kr-cms-ui kr-cms-rm" data-rmpic="' + esc(c.key) + '" title="Remove picture">×</button>';
    c.el.insertAdjacentElement("afterend", f);
  }
  function apply() {
    els = candidates();
    els.forEach(function (c) {
      var r = rows[c.key]; if (r && r.value != null) { if (c.kind === "text") c.el.textContent = r.value; else c.el.setAttribute("src", r.value); }
      var p = rows[c.key + "|pic"]; if (p && p.value && c.kind === "text") figure(c, p.value);
    });
  }
  sb.from("site_content").select("key,kind,value").eq("page", page).then(function (r) { (r.data || []).forEach(function (x) { rows[x.key] = x; }); apply(); who(); });

  function who() {
    sb.auth.getSession().then(function (s) {
      if (!s.data.session) return; me.id = s.data.session.user.id;
      return Promise.all([sb.rpc("can_edit_site", { p_page: page }), sb.from("profiles").select("full_name,email").eq("id", me.id).single()]).then(function (r) {
        if (r[0].data !== true) return; canEdit = true; me.name = (r[1].data && (r[1].data.full_name || r[1].data.email)) || "An admin";
        bar(); indexPage();
        if (document.getElementById("news-container") || document.getElementById("gallery-container")) { var s2 = document.createElement("script"); s2.src = (document.querySelector('script[src*="cms.js"]').src || "js/cms.js").replace("cms.js", "home-admin.js"); document.head.appendChild(s2); }
      });
    }).catch(function () {});
  }

  // ------------------------------------------------------------ styles + bar
  var st = document.createElement("style");
  st.textContent = ".kr-cms-on [data-kr-key]{outline:2px dashed rgba(212,160,23,.9);outline-offset:2px;cursor:pointer}.kr-cms-on img[data-kr-key]{outline-offset:-2px}.kr-cms-editing{outline:2px solid #3c7a2e!important;background:rgba(214,240,138,.28);cursor:text!important}" +
    ".kr-cms-eb{display:inline-flex;align-items:center;gap:4px;margin:2px 6px 2px 0;padding:2px 9px;border:1px solid #D4A017;background:#fff8e1;color:#1a1200;border-radius:99px;font:700 .7rem system-ui,sans-serif;cursor:pointer}" +
    ".kr-cms-tb{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px;padding:6px;background:#fff;border:1px solid #3c7a2e;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.15);font:700 .8rem system-ui,sans-serif;color:#1b2a17}" +
    ".kr-cms-tb button,.kr-cms-ui.b{border:0;border-radius:99px;padding:7px 13px;font:700 .8rem system-ui;cursor:pointer;background:#eef6d9;color:#1f3d1a}.kr-cms-tb .go{background:#3c7a2e;color:#fff}.kr-cms-tb .no{background:#fdecea;color:#b23b2e}" +
    ".kr-cms-pic{position:relative;margin:.6rem 0;max-width:100%}.kr-cms-pic img{max-width:100%;border-radius:12px;display:block}.kr-cms-rm{display:none;position:absolute;top:6px;right:6px;width:30px;height:30px;border-radius:50%;border:0;background:rgba(0,0,0,.65);color:#fff;font-size:1.1rem;cursor:pointer}.kr-cms-on .kr-cms-rm{display:block}" +
    "#kr-cms-bar{position:fixed;right:14px;bottom:calc(64px + env(safe-area-inset-bottom,0px));z-index:83;display:flex;gap:8px;font:700 .85rem system-ui,sans-serif}#kr-cms-bar button{border:0;border-radius:99px;padding:11px 15px;cursor:pointer;font:inherit;box-shadow:0 8px 22px rgba(0,0,0,.3)}" +
    ".kr-cms-snack{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(130px + env(safe-area-inset-bottom,0px));z-index:2147483000;background:#1b2a17;color:#fff;border-radius:14px;padding:12px 14px;max-width:min(440px,94vw);font:14px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4)}.kr-cms-snack input{width:100%;padding:8px 10px;border-radius:8px;border:0;margin-top:8px;font:inherit}.kr-cms-snack button{border:0;border-radius:99px;padding:6px 12px;font:700 .78rem system-ui;cursor:pointer;margin:6px 6px 0 0;background:#d6f08a;color:#1f3d1a}" +
    ".kr-cms-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483100;display:flex;align-items:center;justify-content:center;padding:14px}.kr-cms-md{background:#fff;color:#1b2a17;border-radius:16px;max-width:520px;width:100%;max-height:90vh;overflow:auto;padding:18px;font:15px/1.45 system-ui,sans-serif}.kr-cms-md h3{margin:0 0 8px}.kr-cms-md .it{border:1px solid #dfe6d3;border-radius:10px;padding:8px 10px;margin:6px 0;font-size:.85rem}.kr-cms-md .it s{color:#999}" +
    ".kr-cms-dr{position:fixed;top:0;right:0;bottom:0;width:min(460px,100%);background:#fbfcf7;color:#1b2a17;z-index:2147483100;box-shadow:-10px 0 30px rgba(0,0,0,.25);overflow:auto;padding:16px;font:14px/1.45 system-ui,sans-serif}.kr-cms-dr .ev{background:#fff;border:1px solid #dfe6d3;border-radius:12px;padding:10px 12px;margin:8px 0}.kr-cms-dr .ev.un{opacity:.6}.kr-cms-dr small{color:#6b7a63}.kr-cms-dr .cm{background:#f3f7ea;border-radius:8px;padding:6px 8px;margin:5px 0;font-size:.82rem}.kr-cms-dr input[type=text]{width:100%;padding:8px 10px;border:1.5px solid #dfe6d3;border-radius:8px;font:inherit}.kr-cms-dr button,.kr-cms-md button{border:0;border-radius:99px;padding:6px 12px;font:700 .78rem system-ui;cursor:pointer;background:#eef6d9;color:#1f3d1a;margin:4px 6px 0 0}.kr-cms-dr .un-b{background:#fdecea;color:#b23b2e}";
  document.head.appendChild(st);
  function bar() {
    var b = document.createElement("div"); b.id = "kr-cms-bar"; b.className = "kr-cms-ui";
    b.innerHTML = '<button id="kr-cms-act" style="background:#fff;color:#1b2a17">🕘 Activity</button><button id="kr-cms-go" style="background:#D4A017;color:#1a1200">✏️ Edit page</button>';
    document.body.appendChild(b);
    b.addEventListener("click", function (e) { if (e.target.id === "kr-cms-go") toggle(); if (e.target.id === "kr-cms-act") openActivity(); });
  }
  function modal(html) { var d = document.createElement("div"); d.className = "kr-cms-ov kr-cms-ui"; d.innerHTML = '<div class="kr-cms-md">' + html + "</div>"; document.body.appendChild(d); d.addEventListener("click", function (e) { if (e.target === d) d.remove(); }); return d; }

  // ------------------------------------------------------------ edit mode + the "your edits are tracked" notice
  function toggle() {
    if (!editing && !sessionStorage.getItem("kr_cms_ack")) {
      var m = modal('<h3>⚠️ Your edits are tracked</h3><p>Everything you change on the website is recorded with your name and the time. <b>Other admins can see it</b>, comment on it, and undo it.</p><p>Please say <b>why</b> you changed something when you can (it is optional). If a change affects other parts of the site, we will offer to update them too.</p><button class="go" style="background:#3c7a2e;color:#fff;padding:10px 18px;font-size:.9rem" data-ok>I understand — start editing</button>');
      m.addEventListener("click", function (e) { if (e.target.hasAttribute("data-ok")) { sessionStorage.setItem("kr_cms_ack", "1"); m.remove(); toggle(); } });
      return;
    }
    if (active) closeEdit(active, true);
    editing = !editing; document.body.classList.toggle("kr-cms-on", editing);
    document.getElementById("kr-cms-go").textContent = editing ? "✓ Done" : "✏️ Edit page";
    document.querySelectorAll(".kr-cms-eb").forEach(function (b) { b.remove(); });
    els.forEach(function (c) {
      if (editing) {
        c.el.setAttribute("data-kr-key", c.key);
        if (c.kind === "text" && c.block) { var b = document.createElement("button"); b.type = "button"; b.className = "kr-cms-eb kr-cms-ui"; b.setAttribute("data-for", c.key); b.textContent = "✏️ Edit"; c.el.insertAdjacentElement("afterend", b); }
      } else c.el.removeAttribute("data-kr-key");
    });
    window.dispatchEvent(new CustomEvent("kr-cms-mode", { detail: { editing: editing } }));
  }
  document.addEventListener("click", function (e) {
    if (!editing) return;
    var rm = e.target.closest && e.target.closest("[data-rmpic]"); if (rm) { e.preventDefault(); return removePic(rm.getAttribute("data-rmpic")); }
    var eb = e.target.closest && e.target.closest(".kr-cms-eb"); if (eb) { var c = byKey(eb.getAttribute("data-for")); if (c) startEdit(c); return; }
    if (e.target.closest(".kr-cms-ui,.kr-cms-tb")) return;
    var t = e.target.closest && e.target.closest("[data-kr-key]"); if (!t) return;
    var c2 = byKey(t.getAttribute("data-kr-key")); if (!c2) return; e.preventDefault(); e.stopPropagation();
    if (c2.kind === "image") pickImage(c2, "image"); else if (active !== c2) startEdit(c2);
  }, true);
  var byKey = function (k) { for (var i = 0; i < els.length; i++) if (els[i].key === k) return els[i]; return null; };

  // ------------------------------------------------------------ editing one block
  function startEdit(c) {
    if (active && active !== c) closeEdit(active, true);
    active = c; c.start = norm(c.el.textContent);
    c.el.classList.add("kr-cms-editing"); c.el.setAttribute("contenteditable", "plaintext-only"); if (c.el.contentEditable !== "plaintext-only") c.el.setAttribute("contenteditable", "true");
    c.el.addEventListener("paste", c.onpaste = function (ev) { ev.preventDefault(); document.execCommand("insertText", false, (ev.clipboardData || window.clipboardData).getData("text/plain")); });
    c.el.addEventListener("keydown", c.onkey = function (ev) { if (ev.key === "Enter" && !/^(P|DIV|LI|BLOCKQUOTE|TD|DD)$/.test(c.el.tagName)) ev.preventDefault(); if (ev.key === "Escape") closeEdit(c, false); });
    var tb = document.createElement("div"); tb.className = "kr-cms-tb kr-cms-ui"; tb.setAttribute("data-tb", c.key);
    tb.innerHTML = '<button class="go" data-a="save">💾 Save</button><button data-a="undo">↩️ Undo</button><button data-a="pic">📷 ' + (rows[c.key + "|pic"] ? "Change" : "Add") + " picture</button><button class=\"no\" data-a=\"cancel\">✕ Cancel</button>";
    var anchor = document.querySelector('.kr-cms-eb[data-for="' + c.key + '"]') || c.el; anchor.insertAdjacentElement("afterend", tb);
    tb.addEventListener("click", function (e) { var a = e.target.dataset && e.target.dataset.a; if (!a) return; if (a === "save") saveEdit(c); else if (a === "undo") { c.el.textContent = c.start; c.el.focus(); } else if (a === "pic") pickImage(c, "pic"); else closeEdit(c, false); });
    c.el.focus();
  }
  function closeEdit(c, keep) {
    if (!keep) c.el.textContent = c.start != null ? c.start : c.el.textContent;
    c.el.classList.remove("kr-cms-editing"); c.el.removeAttribute("contenteditable");
    if (c.onpaste) c.el.removeEventListener("paste", c.onpaste); if (c.onkey) c.el.removeEventListener("keydown", c.onkey);
    var tb = document.querySelector('.kr-cms-tb[data-tb="' + c.key + '"]'); if (tb) tb.remove(); if (active === c) active = null;
  }
  function log(entry) {
    entry.page = page; entry.edited_by = me.id; entry.editor_name = me.name;
    return sb.from("site_edit_log").insert(entry).select("id").single().then(function (r) { return r.error ? null : r.data.id; });
  }
  function saveEdit(c, silent) {
    var now = norm(c.el.textContent), prevRow = rows[c.key], prev = prevRow ? prevRow.value : c.orig;
    if (now === norm(prev)) { closeEdit(c, true); return Promise.resolve(); }
    if (!now) { toast("The text can't be empty."); return Promise.resolve(); }
    var q = now === c.orig ? sb.from("site_content").delete().eq("key", c.key) : sb.from("site_content").upsert({ key: c.key, page: page, kind: "text", value: now, updated_by: me.id, updated_at: new Date().toISOString() });
    return q.then(function (r) {
      if (r.error) { toast("Could not save: " + r.error.message); return; }
      if (now === c.orig) delete rows[c.key]; else rows[c.key] = { key: c.key, kind: "text", value: now };
      closeEdit(c, true);
      return log({ target_type: "text", target_key: c.key, action: "edit", label: snippet(prev) + " → " + snippet(now), old_value: { value: prevRow ? prevRow.value : null, shown: prev }, new_value: { value: now } }).then(function (id) { afterSave(id, prev, now, c.key, silent); });
    });
  }
  function afterSave(id, prev, now, key, silent) {
    if (!silent) snack(id, "Saved ✓");
    findAffected(prev, now, key).then(function (props) { if (props.length) affectedPrompt(props, prev, now); });
  }
  function snack(id, msg) {
    var old = document.querySelector(".kr-cms-snack"); if (old) old.remove();
    var s = document.createElement("div"); s.className = "kr-cms-snack kr-cms-ui";
    s.innerHTML = "<b>" + esc(msg) + '</b> <button data-s="undo">↩️ Undo</button><button data-s="x" style="background:#33482e;color:#fff">✕</button><input type="text" placeholder="Why did you change this? (optional)" maxlength="300"><button data-s="why">Add reason</button>';
    document.body.appendChild(s); var timer = setTimeout(function () { s.remove(); }, 25000);
    s.addEventListener("click", function (e) {
      var a = e.target.dataset && e.target.dataset.s; if (!a) return;
      if (a === "x") { clearTimeout(timer); s.remove(); }
      if (a === "undo" && id) sb.rpc("site_undo", { p_log: id }).then(function (r) { toast(r.error ? r.error.message : "Change undone."); if (!r.error) setTimeout(function () { location.reload(); }, 500); });
      if (a === "why") { var v = s.querySelector("input").value.trim(); if (v && id) sb.rpc("site_set_reason", { p_log: id, p_reason: v }).then(function () { toast("Reason added ✓"); s.remove(); }); }
    });
  }

  // ------------------------------------------------------------ pictures on a paragraph (and replacing photos)
  function resize(file) { return createImageBitmap(file).then(function (b) { var r = Math.min(1, 1600 / Math.max(b.width, b.height)), c = document.createElement("canvas"); c.width = Math.round(b.width * r); c.height = Math.round(b.height * r); c.getContext("2d").drawImage(b, 0, 0, c.width, c.height); return new Promise(function (res) { c.toBlob(res, "image/jpeg", 0.85); }); }); }
  function pickImage(c, type) {
    var f = document.createElement("input"); f.type = "file"; f.accept = "image/*";
    f.onchange = function () {
      var file = f.files[0]; if (!file) return; toast("Uploading…");
      resize(file).then(function (blob) {
        var path = page.replace(/\W/g, "_") + "/" + Date.now() + ".jpg";
        return sb.storage.from("site-media").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" }).then(function (up) {
          if (up.error) throw up.error; var url = sb.storage.from("site-media").getPublicUrl(path).data.publicUrl;
          var key = type === "pic" ? c.key + "|pic" : c.key, prev = rows[key] ? rows[key].value : null;
          return sb.from("site_content").upsert({ key: key, page: page, kind: "image", value: url, updated_by: me.id, updated_at: new Date().toISOString() }).then(function (r) {
            if (r.error) throw r.error; rows[key] = { key: key, kind: "image", value: url };
            if (type === "pic") figure(c, url); else c.el.setAttribute("src", url);
            return log({ target_type: type, target_key: key, action: "edit", label: type === "pic" ? "Picture added under “" + snippet(c.el.textContent) + "”" : "Photo replaced", old_value: { value: prev }, new_value: { value: url } }).then(function (id) { snack(id, type === "pic" ? "Picture saved ✓" : "Photo updated ✓"); });
          });
        });
      }).catch(function (e) { toast("Could not upload: " + (e.message || e)); });
    };
    f.click();
  }
  function removePic(key) {
    var c = byKey(key.replace(/\|pic$/, "")), row = rows[key + "|pic"] || rows[key]; var k = rows[key + "|pic"] ? key + "|pic" : key; if (!row) return;
    if (!confirm("Remove this picture?")) return;
    sb.from("site_content").delete().eq("key", k).then(function (r) { if (r.error) return toast(r.error.message); var old = rows[k].value; delete rows[k]; var f = document.querySelector('.kr-cms-pic[data-for="' + key.replace(/\|pic$/, "") + '"]'); if (f) f.remove();
      log({ target_type: "pic", target_key: k, action: "delete", label: "Picture removed", old_value: { value: old }, new_value: { value: null } }).then(function (id) { snack(id, "Picture removed"); }); });
  }

  // ------------------------------------------------------------ "this change may affect other areas"
  var TOK = [/[\w.+-]+@[\w-]+\.[\w.-]+/g, /\+?\d[\d\s()-]{6,}\d/g, /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/gi, /R\s?\d[\d\s,]*(?:\.\d+)?/g];
  function tokens(t) { var out = []; TOK.forEach(function (re) { (t.match(re) || []).forEach(function (x) { out.push(norm(x)); }); }); return out; }
  function findAffected(prev, now, selfKey) {
    var oT = tokens(prev), nT = tokens(now), removed = oT.filter(function (x) { return nT.indexOf(x) < 0; }), added = nT.filter(function (x) { return oT.indexOf(x) < 0; });
    var pairs = removed.length && removed.length === added.length ? removed.map(function (r, i) { return [r, added[i]]; }) : [];
    var like = function (s) { return "%" + s.replace(/[%_\\]/g, function (m) { return "\\" + m; }) + "%"; };
    var jobs = [sb.from("site_text_index").select("key,page,orig").eq("orig", norm(prev)).neq("key", selfKey).limit(20), sb.from("site_content").select("key,page,value").eq("kind", "text").eq("value", norm(prev)).neq("key", selfKey).limit(20)];
    pairs.forEach(function (p) { jobs.push(sb.from("site_text_index").select("key,page,orig").ilike("orig", like(p[0])).neq("key", selfKey).limit(20)); jobs.push(sb.from("site_content").select("key,page,value").eq("kind", "text").ilike("value", like(p[0])).neq("key", selfKey).limit(20)); });
    return Promise.all(jobs).then(function (res) {
      var map = {};
      var cur = function (k, page2, orig, val) { return map[k] || (map[k] = { key: k, page: page2, current: val != null ? val : orig }); };
      res.forEach(function (r, i) { (r.data || []).forEach(function (x) { var o = cur(x.key, x.page, x.orig, x.value); if (x.value != null) o.current = x.value; }); });
      var props = [];
      Object.keys(map).forEach(function (k) {
        var o = map[k], next = o.current; if (norm(next) === norm(prev)) next = now; pairs.forEach(function (p) { next = next.split(p[0]).join(p[1]); });
        if (norm(next) !== norm(o.current)) props.push({ key: k, page: o.page, current: o.current, next: next });
      });
      return props.slice(0, 25);
    }).catch(function () { return []; });
  }
  function affectedPrompt(props, prev, now) {
    var m = modal('<h3>This change may affect other parts of the site</h3><p class="muted" style="color:#5d6b57;font-size:.88rem">You changed “' + esc(snippet(prev)) + '”. The same wording appears in:</p>' +
      props.map(function (p, i) { return '<label class="it" style="display:block"><input type="checkbox" checked data-i="' + i + '"> <b>' + esc(pageName(p.page)) + "</b><br><s>" + esc(snippet(p.current)) + "</s><br>→ " + esc(snippet(p.next)) + "</label>"; }).join("") +
      '<div style="margin-top:10px"><button class="go" data-a="all" style="background:#3c7a2e;color:#fff;padding:9px 16px">Update the selected ones for me</button><button data-a="skip">Skip — I will adjust them myself</button></div>');
    m.addEventListener("click", function (e) {
      var a = e.target.dataset && e.target.dataset.a; if (!a) return; if (a === "skip") return m.remove();
      var sel = [].slice.call(m.querySelectorAll("input:checked")).map(function (x) { return props[+x.dataset.i]; });
      Promise.all(sel.map(function (p) {
        return sb.from("site_content").upsert({ key: p.key, page: p.page, kind: "text", value: p.next, updated_by: me.id, updated_at: new Date().toISOString() }).then(function (r) {
          if (r.error) return; if (p.page === page) { rows[p.key] = { key: p.key, kind: "text", value: p.next }; var c = byKey(p.key); if (c) c.el.textContent = p.next; }
          return log({ target_type: "text", target_key: p.key, action: "auto", label: "Auto-adjusted after a change on " + pageName(page) + ": " + snippet(p.current) + " → " + snippet(p.next), old_value: { value: p.current === "" ? null : (p.current === (rows[p.key] && rows[p.key].value) ? null : p.current) }, new_value: { value: p.next } });
        });
      })).then(function () { toast("Updated " + sel.length + " other place" + (sel.length === 1 ? "" : "s") + " ✓"); m.remove(); });
    });
  }
  // admins quietly keep a list of the page's wording (once a day) so changes can be checked against every page
  function indexPage() {
    var k = "kr_idx_" + page, last = +(localStorage.getItem(k) || 0); if (Date.now() - last < 864e5) return;
    var items = els.filter(function (c) { return c.kind === "text"; }).map(function (c) { return { key: c.key, page: page, orig: c.orig, updated_at: new Date().toISOString() }; });
    var chunks = []; for (var i = 0; i < items.length; i += 100) chunks.push(items.slice(i, i + 100));
    Promise.all(chunks.map(function (ch) { return sb.from("site_text_index").upsert(ch); })).then(function () { try { localStorage.setItem(k, String(Date.now())); } catch (e) {} });
  }

  // ------------------------------------------------------------ activity feed + comments + undo
  function ago(t) { var s = (Date.now() - new Date(t).getTime()) / 1000; return s < 60 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : new Date(t).toLocaleDateString("en-ZA"); }
  function openActivity() {
    var d = document.createElement("div"); d.className = "kr-cms-dr kr-cms-ui"; d.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:1.1rem">🕘 Edit activity</b><button data-x>Close</button></div><p style="color:#5d6b57;margin:4px 0">Every change is posted here automatically. Add a reason or a comment, or undo a change.</p><div id="kr-act-list">Loading…</div>';
    document.body.appendChild(d);
    var load = function () {
      Promise.all([sb.from("site_edit_log").select("*").order("created_at", { ascending: false }).limit(40), sb.from("site_edit_comments").select("*").order("created_at")]).then(function (r) {
        var cm = {}; (r[1].data || []).forEach(function (c) { (cm[c.log_id] = cm[c.log_id] || []).push(c); });
        d.querySelector("#kr-act-list").innerHTML = (r[0].data || []).map(function (e) {
          var verb = { edit: "edited", add: "added", delete: "removed", undo: "undid a change", auto: "auto-adjusted" }[e.action] || e.action;
          return '<div class="ev ' + (e.undone_at ? "un" : "") + '"><b>' + esc(e.editor_name || "Someone") + "</b> " + verb + " on <b>" + esc(pageName(e.page)) + "</b> <small>· " + ago(e.created_at) + "</small><br>" + (e.undone_at ? "<s>" + esc(e.label) + "</s> <small>(undone)</small>" : esc(e.label)) +
            (e.reason ? '<div class="cm"><b>Why:</b> ' + esc(e.reason) + "</div>" : "") + (cm[e.id] || []).map(function (c) { return '<div class="cm"><b>' + esc(c.author_name || "") + ":</b> " + esc(c.body) + " <small>" + ago(c.created_at) + "</small></div>"; }).join("") +
            '<div>' + (!e.undone_at && e.action !== "undo" ? '<button class="un-b" data-undo="' + e.id + '">↩️ Undo</button>' : "") + (e.edited_by === me.id && !e.reason ? '<button data-why="' + e.id + '">Add reason</button>' : "") + '<button data-cmt="' + e.id + '">Comment</button></div><div data-box="' + e.id + '"></div></div>';
        }).join("") || "<p>No edits yet.</p>";
      });
    };
    load();
    d.addEventListener("click", function (e) {
      var t = e.target, ds = t.dataset || {};
      if (ds.x !== undefined) d.remove();
      if (ds.undo) { if (!confirm("Undo this change?")) return; sb.rpc("site_undo", { p_log: +ds.undo }).then(function (r) { toast(r.error ? r.error.message : "Change undone."); if (!r.error) { load(); setTimeout(function () { location.reload(); }, 800); } }); }
      if (ds.why || ds.cmt) { var id = ds.why || ds.cmt, box = d.querySelector('[data-box="' + id + '"]'); box.innerHTML = '<input type="text" maxlength="300" placeholder="' + (ds.why ? "Why did you make this change?" : "Write a comment") + '"><button data-send="' + id + '" data-kind="' + (ds.why ? "why" : "cmt") + '">Post</button>'; box.querySelector("input").focus(); }
      if (ds.send) { var v = t.previousElementSibling.value.trim(); if (!v) return; var p = ds.kind === "why" ? sb.rpc("site_set_reason", { p_log: +ds.send, p_reason: v }) : sb.from("site_edit_comments").insert({ log_id: +ds.send, body: v, author_id: me.id, author_name: me.name }); p.then(function () { load(); }); }
    });
  }
})();
