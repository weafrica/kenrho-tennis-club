// Website editor. Public pages show any saved edits; admins (and the coach, on the coach page) get an "Edit page" button.
// Edits are stored as plain text keyed by the page + the original wording, so nothing in the HTML has to be tagged.
(function () {
  "use strict";
  var sb = window.sb; if (!sb || document.body.classList.contains("app-shell")) return;
  var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  var SKIP = "script,style,noscript,svg,input,textarea,select,option,button:not(.btn),[data-no-cms],#fees-table,#news-container,#gallery-container,#kr-help-root,#kr-install-pop,.kr-listen,#kr-cms-bar,#kr-hd-offer";
  var LEAF = "h1,h2,h3,h4,h5,p,li,figcaption,blockquote,td,th,dt,dd,label,.lede,.hero-eyebrow,.btn,a,span,small,strong,em,b,div";
  var rows = {}, els = [], editing = false, canEdit = false;
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  var norm = function (t) { return (t || "").replace(/\s+/g, " ").trim(); };
  function candidates() {
    var out = [], seen = {};
    document.querySelectorAll(LEAF).forEach(function (el) {
      if (el.closest(SKIP) || el.querySelector("*:not(br)")) return;
      var t = norm(el.textContent); if (t.length < 2 || !/[A-Za-z]/.test(t)) return;
      var k = page + "|t|" + hash(t); seen[k] = (seen[k] || 0) + 1;
      out.push({ el: el, key: k + "|" + seen[k], orig: t, kind: "text" });
    });
    var iseen = {};
    document.querySelectorAll("img").forEach(function (img) {
      if (img.closest(SKIP) || !img.getAttribute("src")) return;
      var s = img.getAttribute("src"), k = page + "|i|" + hash(s); iseen[k] = (iseen[k] || 0) + 1;
      out.push({ el: img, key: k + "|" + iseen[k], orig: s, kind: "image" });
    });
    return out;
  }
  function apply() {
    els = candidates();
    els.forEach(function (c) {
      var r = rows[c.key]; if (!r || r.value == null) return;
      if (c.kind === "text") c.el.textContent = r.value; else c.el.setAttribute("src", r.value);
    });
  }
  sb.from("site_content").select("key,kind,value").eq("page", page).then(function (r) {
    (r.data || []).forEach(function (x) { rows[x.key] = x; });
    apply(); who();
  });

  function who() {
    sb.auth.getSession().then(function (s) {
      if (!s.data.session) return;
      return sb.rpc("can_edit_site", { p_page: page }).then(function (r) { if (r.data === true) { canEdit = true; bar(); } });
    }).catch(function () {});
  }
  function toast(m) { if (window.KR && window.KR.toast) window.KR.toast(m); }
  function bar() {
    var b = document.createElement("div"); b.id = "kr-cms-bar";
    b.style.cssText = "position:fixed;right:14px;bottom:calc(64px + env(safe-area-inset-bottom,0px));z-index:83;display:flex;gap:8px;font:700 .85rem system-ui,sans-serif";
    b.innerHTML = '<button id="kr-cms-go" style="background:#D4A017;color:#1a1200;border:0;border-radius:99px;padding:11px 16px;box-shadow:0 8px 22px rgba(0,0,0,.3);cursor:pointer;font:inherit">✏️ Edit page</button>';
    document.body.appendChild(b);
    b.addEventListener("click", function (e) {
      if (e.target.id === "kr-cms-go") toggle();
      if (e.target.id === "kr-cms-reset") reset();
    });
  }
  var style = document.createElement("style");
  style.textContent = ".kr-cms-on [data-kr-key]{outline:2px dashed rgba(212,160,23,.9);outline-offset:2px;cursor:text;min-width:1ch}.kr-cms-on img[data-kr-key]{cursor:pointer;outline-offset:-2px}.kr-cms-on [data-kr-key]:focus{outline:2px solid #3c7a2e;background:rgba(214,240,138,.25)}";
  document.head.appendChild(style);

  function toggle() {
    editing = !editing; document.body.classList.toggle("kr-cms-on", editing);
    var go = document.getElementById("kr-cms-go"); go.textContent = editing ? "✓ Done editing" : "✏️ Edit page";
    var bar = document.getElementById("kr-cms-bar"), rs = document.getElementById("kr-cms-reset");
    if (editing && !rs) { rs = document.createElement("button"); rs.id = "kr-cms-reset"; rs.textContent = "Reset page"; rs.style.cssText = "background:#fff;color:#b23b2e;border:1px solid #dfe6d3;border-radius:99px;padding:11px 14px;cursor:pointer;font:inherit"; bar.insertBefore(rs, go); }
    if (!editing && rs) rs.remove();
    els.forEach(function (c) {
      if (c.kind === "text") {
        if (editing) {
          c.el.setAttribute("data-kr-key", c.key);
          c.el.setAttribute("contenteditable", "plaintext-only"); if (c.el.contentEditable !== "plaintext-only") c.el.setAttribute("contenteditable", "true");
          c.el.addEventListener("blur", c.onblur = function () { save(c); });
          c.el.addEventListener("click", c.onclick = function (e) { if (c.el.closest("a") || c.el.tagName === "A") e.preventDefault(); });
          c.el.addEventListener("paste", c.onpaste = function (e) { e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain")); });
          c.el.addEventListener("keydown", c.onkey = function (e) { if (e.key === "Enter" && !/^(P|DIV|LI|BLOCKQUOTE|TD|DD)$/.test(c.el.tagName)) e.preventDefault(); });
        } else {
          c.el.removeAttribute("data-kr-key"); c.el.removeAttribute("contenteditable");
          ["blur:onblur", "click:onclick", "paste:onpaste", "keydown:onkey"].forEach(function (p) { var a = p.split(":"); if (c[a[1]]) c.el.removeEventListener(a[0], c[a[1]]); });
        }
      } else {
        if (editing) { c.el.setAttribute("data-kr-key", c.key); c.el.addEventListener("click", c.onclick = function (e) { e.preventDefault(); pickImage(c); }); }
        else { c.el.removeAttribute("data-kr-key"); if (c.onclick) c.el.removeEventListener("click", c.onclick); }
      }
    });
  }
  function save(c) {
    var now = norm(c.el.textContent), prev = rows[c.key] ? rows[c.key].value : c.orig;
    if (now === norm(prev)) return;
    sb.auth.getSession().then(function (s) {
      var uid = s.data.session && s.data.session.user.id;
      if (now === c.orig) {
        return sb.from("site_content").delete().eq("key", c.key).then(function (r) { if (!r.error) { delete rows[c.key]; toast("Back to the original ✓"); } });
      }
      return sb.from("site_content").upsert({ key: c.key, page: page, kind: "text", value: now, updated_by: uid, updated_at: new Date().toISOString() }).then(function (r) {
        if (r.error) { toast("Could not save: " + r.error.message); c.el.textContent = prev; } else { rows[c.key] = { key: c.key, kind: "text", value: now }; toast("Saved ✓"); }
      });
    });
  }
  function pickImage(c) {
    var f = document.createElement("input"); f.type = "file"; f.accept = "image/*";
    f.onchange = function () {
      var file = f.files[0]; if (!file) return; toast("Uploading…");
      resize(file).then(function (blob) {
        var path = page.replace(/\W/g, "_") + "/" + Date.now() + ".jpg";
        return sb.storage.from("site-media").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" }).then(function (up) {
          if (up.error) throw up.error;
          var url = sb.storage.from("site-media").getPublicUrl(path).data.publicUrl;
          return sb.auth.getSession().then(function (s) {
            return sb.from("site_content").upsert({ key: c.key, page: page, kind: "image", value: url, updated_by: s.data.session.user.id, updated_at: new Date().toISOString() });
          }).then(function (r) { if (r.error) throw r.error; c.el.setAttribute("src", url); rows[c.key] = { key: c.key, kind: "image", value: url }; toast("Photo updated ✓"); });
        });
      }).catch(function (e) { toast("Could not upload: " + (e.message || e)); });
    };
    f.click();
  }
  function resize(file) {
    return createImageBitmap(file).then(function (b) {
      var r = Math.min(1, 1600 / Math.max(b.width, b.height)), c = document.createElement("canvas"); c.width = Math.round(b.width * r); c.height = Math.round(b.height * r);
      c.getContext("2d").drawImage(b, 0, 0, c.width, c.height); return new Promise(function (res) { c.toBlob(res, "image/jpeg", 0.85); });
    });
  }
  function reset() {
    if (!confirm("Put every edited piece of text and every photo on this page back to the original?")) return;
    sb.from("site_content").delete().eq("page", page).then(function (r) { if (r.error) toast(r.error.message); else { toast("Page reset."); setTimeout(function () { location.reload(); }, 600); } });
  }
})();
