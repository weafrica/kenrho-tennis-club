// Inline managers for the homepage news ("Social tennis this weekend", "Coaching bookings open"…) and the matchday photo gallery.
// Shown only to admins while they are in "Edit page" mode. Every change is logged (and can be undone) in the Edit activity feed.
(function () {
  "use strict";
  var sb = window.sb, me = { id: null, name: "" };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var toast = function (m) { if (window.KR && window.KR.toast) window.KR.toast(m); };
  var st = document.createElement("style");
  st.textContent = ".kr-mgr{border:2px dashed #D4A017;background:#fffdf3;border-radius:14px;padding:14px;margin:12px 0;font:14px/1.45 system-ui,sans-serif;color:#1b2a17}.kr-mgr h3{margin:0 0 8px;font-size:1rem}.kr-mgr .r{background:#fff;border:1px solid #dfe6d3;border-radius:10px;padding:8px;margin:6px 0}.kr-mgr input[type=text],.kr-mgr textarea{width:100%;padding:8px 10px;border:1.5px solid #dfe6d3;border-radius:8px;font:inherit;margin:2px 0}.kr-mgr button{border:0;border-radius:99px;padding:7px 13px;font:700 .78rem system-ui;cursor:pointer;background:#eef6d9;color:#1f3d1a;margin:4px 6px 0 0}.kr-mgr .go{background:#3c7a2e;color:#fff}.kr-mgr .no{background:#fdecea;color:#b23b2e}.kr-gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}.kr-gal .t{position:relative;background:#fff;border:1px solid #dfe6d3;border-radius:10px;overflow:hidden}.kr-gal img{width:100%;aspect-ratio:1;object-fit:cover;display:block}.kr-gal .x{position:absolute;top:4px;right:4px;width:28px;height:28px;border-radius:50%;padding:0;background:rgba(0,0,0,.65);color:#fff;margin:0}.kr-gal input{border:0;border-top:1px solid #eee;border-radius:0;font-size:.75rem}";
  document.head.appendChild(st);
  sb.auth.getSession().then(function (s) { if (!s.data.session) return; me.id = s.data.session.user.id; return sb.from("profiles").select("full_name,email").eq("id", me.id).single().then(function (r) { me.name = (r.data && (r.data.full_name || r.data.email)) || "An admin"; }); });
  function log(type, key, action, label, oldV, newV) { return sb.from("site_edit_log").insert({ page: "index.html", target_type: type, target_key: String(key), action: action, label: label, old_value: oldV || null, new_value: newV || null, edited_by: me.id, editor_name: me.name }); }

  // ------------------------------------------------------------ news / notices
  function newsPanel() {
    var host = document.getElementById("news-container"); if (!host) return;
    var box = document.getElementById("kr-news-mgr"); if (!box) { box = document.createElement("div"); box.id = "kr-news-mgr"; box.className = "kr-mgr kr-cms-ui"; host.parentNode.insertBefore(box, host); }
    sb.from("announcements").select("*").order("sort_order").then(function (r) {
      var rows = r.data || [];
      box.innerHTML = "<h3>📣 News & notices — edit what shows on the home page</h3>" + rows.map(function (a) {
        return '<div class="r" data-id="' + a.id + '"><input type="text" data-f="title" value="' + esc(a.title) + '" placeholder="Title"><textarea data-f="body" rows="2" placeholder="Details">' + esc(a.body || "") + '</textarea><label style="font-size:.8rem"><input type="checkbox" data-f="is_active" ' + (a.is_active ? "checked" : "") + ' style="width:auto"> Show on the website</label><br><button class="go" data-a="save">Save</button><button class="no" data-a="del">Remove</button></div>';
      }).join("") + '<div class="r"><b>Add a notice</b><input type="text" id="kr-n-title" placeholder="e.g. Social tennis this weekend"><textarea id="kr-n-body" rows="2" placeholder="Details"></textarea><button class="go" data-a="add">+ Add notice</button></div>';
      box.onclick = function (e) {
        var a = e.target.dataset && e.target.dataset.a; if (!a) return; var row = e.target.closest("[data-id]"), id = row && row.dataset.id, old = rows.find(function (x) { return x.id === id; });
        var refresh = function () { if (window.loadNews) window.loadNews(); newsPanel(); };
        if (a === "save") { var nv = { title: row.querySelector('[data-f="title"]').value.trim(), body: row.querySelector('[data-f="body"]').value.trim(), is_active: row.querySelector('[data-f="is_active"]').checked }; if (!nv.title) return toast("A title is needed.");
          sb.from("announcements").update(nv).eq("id", id).then(function (r2) { if (r2.error) return toast(r2.error.message); log("announcement", id, "edit", "Notice “" + nv.title + "” updated", old, Object.assign({}, old, nv)); toast("Saved ✓"); refresh(); }); }
        if (a === "del") { if (!confirm("Remove this notice from the website?")) return; sb.from("announcements").delete().eq("id", id).then(function (r2) { if (r2.error) return toast(r2.error.message); log("announcement", id, "delete", "Notice “" + old.title + "” removed", old, null); toast("Removed. You can undo it in the Activity feed."); refresh(); }); }
        if (a === "add") { var t = box.querySelector("#kr-n-title").value.trim(); if (!t) return toast("Type a title first.");
          var next = rows.length ? Math.max.apply(null, rows.map(function (x) { return x.sort_order || 0; })) + 1 : 0;
          sb.from("announcements").insert({ title: t, body: box.querySelector("#kr-n-body").value.trim(), is_active: true, sort_order: next }).select().single().then(function (r2) { if (r2.error) return toast(r2.error.message); log("announcement", r2.data.id, "add", "Notice “" + t + "” added", null, r2.data); toast("Added ✓"); refresh(); }); }
      };
    });
  }

  // ------------------------------------------------------------ matchday gallery
  function resize(file) { return createImageBitmap(file).then(function (b) { var r = Math.min(1, 1600 / Math.max(b.width, b.height)), c = document.createElement("canvas"); c.width = Math.round(b.width * r); c.height = Math.round(b.height * r); c.getContext("2d").drawImage(b, 0, 0, c.width, c.height); return new Promise(function (res) { c.toBlob(res, "image/jpeg", 0.85); }); }); }
  function galleryPanel() {
    var host = document.getElementById("gallery-container"); if (!host) return;
    var box = document.getElementById("kr-gal-mgr"); if (!box) { box = document.createElement("div"); box.id = "kr-gal-mgr"; box.className = "kr-mgr kr-cms-ui"; host.parentNode.insertBefore(box, host); }
    sb.from("gallery_photos").select("*").order("sort_order").then(function (r) {
      var rows = r.data || [];
      box.innerHTML = '<h3>📷 Matchday photos — add and remove club photos</h3><div class="kr-gal">' + rows.map(function (p) { return '<div class="t" data-id="' + p.id + '"><img src="' + esc(p.url) + '" alt=""><button class="x" data-a="rm" title="Remove">×</button><input type="text" data-f="caption" value="' + esc(p.caption || "") + '" placeholder="Caption"></div>'; }).join("") + '</div><div style="margin-top:8px"><button class="go" data-a="add">+ Add photos</button> <span style="color:#6b7a63;font-size:.8rem">Pick one or many. Photos are resized for you.</span></div>';
      var refresh = function () { if (window.loadGallery) window.loadGallery(); galleryPanel(); };
      box.onclick = function (e) {
        var a = e.target.dataset && e.target.dataset.a; if (!a) return; var t = e.target.closest("[data-id]"), id = t && t.dataset.id, old = rows.find(function (x) { return x.id === id; });
        if (a === "rm") { if (!confirm("Remove this photo from the website?")) return; sb.from("gallery_photos").delete().eq("id", id).then(function (r2) { if (r2.error) return toast(r2.error.message); log("gallery", id, "delete", "Photo removed" + (old.caption ? ": " + old.caption : ""), old, null); toast("Removed. You can undo it in the Activity feed."); if (rows.length === 1) location.reload(); else refresh(); }); }
        if (a === "add") { var f = document.createElement("input"); f.type = "file"; f.accept = "image/*"; f.multiple = true;
          f.onchange = function () { var files = [].slice.call(f.files); if (!files.length) return; toast("Uploading " + files.length + " photo" + (files.length > 1 ? "s" : "") + "…"); var next = rows.length ? Math.max.apply(null, rows.map(function (x) { return x.sort_order || 0; })) + 1 : 0;
            files.reduce(function (p, file, i) { return p.then(function () { return resize(file).then(function (blob) { var path = "gallery/" + Date.now() + "-" + i + ".jpg"; return sb.storage.from("site-media").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" }).then(function (up) { if (up.error) throw up.error; var url = sb.storage.from("site-media").getPublicUrl(path).data.publicUrl; return sb.from("gallery_photos").insert({ url: url, caption: "", sort_order: next + i }).select().single(); }).then(function (r2) { if (r2.error) throw r2.error; return log("gallery", r2.data.id, "add", "Photo added", null, r2.data); }); }); }); }, Promise.resolve()).then(function () { toast("Photos added ✓"); refresh(); }).catch(function (er) { toast("Could not add photo: " + (er.message || er)); });
          }; f.click(); }
      };
      box.onchange = function (e) { if (!e.target.dataset || e.target.dataset.f !== "caption") return; var t = e.target.closest("[data-id]"), old = rows.find(function (x) { return x.id === t.dataset.id; }), v = e.target.value.trim(); sb.from("gallery_photos").update({ caption: v }).eq("id", t.dataset.id).then(function (r2) { if (!r2.error) { log("gallery", t.dataset.id, "edit", "Photo caption: “" + v + "”", old, Object.assign({}, old, { caption: v })); old.caption = v; if (window.loadGallery) window.loadGallery(); } }); };
    });
  }

  window.addEventListener("kr-cms-mode", function (e) {
    if (e.detail.editing) { newsPanel(); galleryPanel(); }
    else ["kr-news-mgr", "kr-gal-mgr"].forEach(function (id) { var n = document.getElementById(id); if (n) n.remove(); });
  });
})();
