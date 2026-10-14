// KenRho Park Tennis Club shop — vanilla-JS port of the WeAfrica "Shop" (departments, categories, cart,
// 3 checkout paths, order review, admin tools). Orders are priced and stored by the database
// (place_shop_order), never trusted from the browser.

// ═══ SHOP CONFIGURATION ════════════════════════════════════════════
const SHOP_WHATSAPP_NUMBER = "27694362789";       // digits + country code; blank hides the WhatsApp option
const SHOP_BANK_DETAILS = `Bank: First National Bank
Account name: KenRho Park Tennis Club
Account number: 62920283009
Branch: Eastgate (Code: 257705)
Reference: your name + what you bought`;
const SHOP_CARD_LINK = "";                        // paste a Yoco / iKhokha pay link to switch on "Card"; blank hides it
const CART_KEY = "kr-shop-cart-v1";
// ═══════════════════════════════════════════════════════════════════

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "R" + Number(n).toLocaleString("en-ZA");
const sb = window.sb;
const TINTS = ["linear-gradient(135deg,#D4A017,#7A5A00)", "linear-gradient(135deg,#3c7a2e,#0E2A1C)", "linear-gradient(135deg,#7B3FA0,#341047)", "linear-gradient(135deg,#1B6C8F,#0A2A38)", "linear-gradient(135deg,#C4293A,#4A0F17)", "linear-gradient(135deg,#B8860B,#3A2600)"];
const VERBS = ["Visit", "Check out", "Explore", "Step into", "Discover", "Shop"];
const STATUS = { pending_review: ["Pending review", "#B8860B"], paid: ["Paid", "#2D6A4F"], rejected: ["Rejected", "#C4293A"], whatsapp_sent: ["Sent via WhatsApp", "#25a35a"], fulfilled: ["Fulfilled", "#2D6A4F"], cancelled: ["Cancelled", "#888"] };
const ORDER_SELECT = "id, created_at, status, subtotal, buyer_username, checkout_method, contact_phone, delivery_note, payment_proof_path, shop_order_items(id, qty, product_name, unit_price)";

const S = { view: "browse", products: null, depts: [], cats: [], cart: loadCart(), dept: "all", catPath: [], q: "", sort: "default", inStock: false, catFilter: "all",
  modal: null, chk: {}, orders: null, session: null, profile: null, manager: false, method: null, adminFilter: "pending_review", adminDept: null, editing: null, busy: false, last: null };

function loadCart() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } }
function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(S.cart)); } catch {} }
const cartCount = () => S.cart.reduce((s, i) => s + i.qty, 0);
const cartTotal = () => S.cart.reduce((s, i) => s + i.qty * i.price, 0);
const photo = (u) => u || "";
function toast(msg) { const t = $("#toast"); t.innerHTML = `<div class="toast">${esc(msg)}</div>`; clearTimeout(toast.t); toast.t = setTimeout(() => (t.innerHTML = ""), 3200); }
function confirmSteps(steps) {
  return new Promise((resolve) => {
    let i = 0; const m = $("#modal");
    const draw = () => (m.innerHTML = `<div class="ov"><div class="sheet" style="padding:20px;border-radius:18px;max-width:360px"><div class="mono" style="color:var(--red);font-size:.7rem;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Confirm ${i + 1} of ${steps.length}</div><p>${esc(steps[i])}</p><div style="display:flex;gap:8px"><button class="btn sec block" data-c="no">Cancel</button><button class="btn red block" data-c="yes">${i === steps.length - 1 ? "Yes, do it" : "Yes, continue"}</button></div></div></div>`);
    m.onclick = (e) => { const c = e.target.dataset.c; if (!c) return; if (c === "no") { m.innerHTML = ""; return resolve(false); } if (++i >= steps.length) { m.innerHTML = ""; return resolve(true); } draw(); };
    draw();
  });
}
async function compress(file, max = 1000, q = 0.85) {
  if (!file.type.startsWith("image/")) return file;
  try {
    const b = await createImageBitmap(file), r = Math.min(1, max / Math.max(b.width, b.height)), c = document.createElement("canvas");
    c.width = Math.round(b.width * r); c.height = Math.round(b.height * r); c.getContext("2d").drawImage(b, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", q));
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}

// ───────────────────────── category tree helpers
const kids = (cats, pid) => cats.filter((c) => (c.parent_category_id || null) === pid).sort((a, b) => a.position - b.position);
function descIds(cats, id) { const out = [], st = kids(cats, id); while (st.length) { const c = st.pop(); out.push(c.id); st.push(...kids(cats, c.id)); } return out; }
function pathName(cats, id) { const by = new Map(cats.map((c) => [c.id, c])), p = []; let c = by.get(id); while (c) { p.unshift(c.name); c = c.parent_category_id ? by.get(c.parent_category_id) : null; } return p.join(" › "); }
const flat = (cats, pid = null, d = 0) => kids(cats, pid).flatMap((c) => [{ ...c, depth: d }, ...flat(cats, c.id, d + 1)]);

// ───────────────────────── data
async function loadAll() {
  const [p, d, c] = await Promise.all([
    sb.from("shop_products").select("id, name, description, price, stock_qty, image_url, active, department_id, category_id").order("created_at", { ascending: false }),
    sb.from("shop_departments").select("id, name, position").order("position"),
    sb.from("shop_categories").select("id, name, position, department_id, parent_category_id").order("position"),
  ]);
  S.products = p.data || []; S.depts = d.data || []; S.cats = c.data || [];
  if (S.manager) { const k = await sb.from("shop_product_costs").select("*"); S.costs = {}; (k.data || []).forEach((x) => (S.costs[x.product_id] = x)); }
}
async function loadMyOrders() { if (!S.session) return; const { data } = await sb.from("shop_orders").select(ORDER_SELECT).eq("user_id", S.session.user.id).order("created_at", { ascending: false }); S.orders = data || []; }
async function loadAdminOrders() { const { data } = await sb.from("shop_orders").select(ORDER_SELECT).order("created_at", { ascending: false }); S.orders = data || []; }

// ───────────────────────── navigation (hash based so the back button works)
function parseHash() {
  const h = decodeURIComponent(location.hash.replace(/^#/, "")), [a, ...r] = h.split("/");
  S.view = "browse"; S.dept = "all"; S.catPath = []; S.adminDept = null;
  if (a === "d") { S.dept = r[0] || "all"; S.catPath = r.slice(1); }
  else if (["cart", "checkout", "confirm", "orders", "admin", "admin-orders", "admin-depts"].includes(a)) S.view = a;
  else if (a === "admin-cats") { S.view = "admin-cats"; S.adminDept = r[0]; }
}
const go = (h) => { if (location.hash.replace(/^#/, "") === h) route(); else location.hash = h; };
async function route() {
  parseHash();
  if (S.view === "orders") { S.orders = null; render(); await loadMyOrders(); }
  if (S.view === "admin-orders") { if (!S.manager) return go(""); S.orders = null; render(); await loadAdminOrders(); }
  if (S.view.startsWith("admin") && !S.manager) { S.view = "browse"; }
  render(); window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

// ───────────────────────── render
function header() {
  const v = S.view;
  $("#hd-actions").innerHTML =
    (S.session ? `<button class="ib ${v === "orders" ? "on" : ""}" data-go="orders" title="My orders">📋</button>` : `<a class="ib" href="auth.html" title="Sign in" style="font-size:.7rem;font-weight:800">Sign&nbsp;in</a>`) +
    (S.manager ? `<button class="ib ${v.startsWith("admin") ? "on" : ""}" data-go="admin" title="Manage shop">⚙️</button>` : "") +
    `<button class="ib ${v === "cart" ? "on" : ""}" data-go="cart" title="Cart">🛒${cartCount() ? `<span class="badge">${cartCount()}</span>` : ""}</button>`;
}
function render() {
  header();
  const a = $("#app");
  if (S.products === null) { a.innerHTML = `<div class="empty">Loading the shop…</div>`; return; }
  const V = { browse: viewBrowse, cart: viewCart, checkout: viewCheckout, confirm: viewConfirm, orders: viewOrders, admin: viewAdminProducts, "admin-orders": viewAdminOrders, "admin-depts": viewAdminDepts, "admin-cats": viewAdminCats };
  const back = S.view === "browse" && S.dept === "all" ? "" : `<p style="margin:0 0 10px"><a href="#" data-back style="color:var(--dim);font-weight:700;text-decoration:none">← ${S.view === "browse" ? "Back" : "Shop"}</a></p>`;
  a.innerHTML = back + (V[S.view] || viewBrowse)() + (S.view === "browse" && cartCount() ? `<button class="cartbar" data-go="cart"><span>🛒 ${cartCount()} item${cartCount() === 1 ? "" : "s"}</span><span>View cart · ${money(cartTotal())}</span></button>` : "");
  renderModal();
}
function collage(photos) {
  const g = photos.length === 1 ? "" : photos.length === 2 ? "grid-template-columns:1fr 1fr" : "grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr";
  return `<div class="col" style="${g}">${photos.map((s, i) => `<img src="${esc(s)}" alt="" loading="lazy" ${photos.length === 3 && i === 0 ? 'style="grid-row:span 2"' : ""}>`).join("")}</div>`;
}
const uniqPhotos = (items) => [...new Set(items.map((i) => photo(i.image_url)).filter(Boolean))].slice(0, 4);
const fromPrice = (items) => { const p = items.map((i) => Number(i.price)).filter((n) => n > 0); return p.length ? Math.min(...p) : null; };

function productCard(p) {
  const can = p.active && p.stock_qty !== 0;
  return `<div class="pc" data-open="${p.id}" style="opacity:${p.active ? 1 : 0.5}"><div class="im">${p.image_url ? `<img src="${esc(photo(p.image_url))}" alt="${esc(p.name)}" loading="lazy">` : "🎾"}${can ? `<button class="qa" data-quick="${p.id}" aria-label="Add to cart">+</button>` : ""}</div>
    <div class="bd"><div class="nm">${esc(p.name)}</div><div class="pr">${money(p.price)}</div>${!p.active ? `<small style="color:var(--faint)">HIDDEN</small>` : p.stock_qty === 0 ? `<small style="color:var(--red)">OUT OF STOCK</small>` : ""}</div></div>`;
}
const grid = (items) => (items.length ? `<div class="grid p">${items.map(productCard).join("")}</div>` : `<div class="empty">Nothing here yet.</div>`);

function viewBrowse() {
  const all = S.manager ? S.products : S.products.filter((p) => p.active);
  if (!all.length) return `<div class="empty">No products yet — check back soon.</div>`;
  const q = S.q.trim().toLowerCase();
  let list = q ? all.filter((p) => p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q)) : all;
  if (S.inStock) list = list.filter((p) => p.stock_qty !== 0);
  if (S.sort === "price_asc") list = [...list].sort((a, b) => a.price - b.price); else if (S.sort === "price_desc") list = [...list].sort((a, b) => b.price - a.price); else if (S.sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  const deptIds = new Set(S.depts.map((d) => d.id));
  const num = new Map(S.depts.filter((d) => all.some((p) => p.department_id === d.id)).map((d, i) => [d.id, String(i + 1).padStart(2, "0")]));
  const grouped = S.depts.map((d) => ({ d, items: list.filter((p) => p.department_id === d.id) })).filter((g) => g.items.length);
  const other = list.filter((p) => !p.department_id || !deptIds.has(p.department_id));
  const chips = [{ id: "all", name: S.depts.length ? "All departments" : "All", n: list.length }, ...grouped.map(({ d, items }) => ({ id: d.id, name: d.name, n: items.length })), ...(other.length ? [{ id: "other", name: "Other", n: other.length }] : [])];
  const tools = `<div class="tools"><input id="q" type="search" placeholder="🔍 Search the shop…" value="${esc(S.q)}" style="min-width:200px;flex:1;border-radius:99px">
    <select id="sort"><option value="default">Sort: Featured</option><option value="price_asc"${S.sort === "price_asc" ? " selected" : ""}>Price: Low to High</option><option value="price_desc"${S.sort === "price_desc" ? " selected" : ""}>Price: High to Low</option><option value="name"${S.sort === "name" ? " selected" : ""}>Name: A–Z</option></select>
    <button class="chip ${S.inStock ? "on" : ""}" data-instock>In stock only</button></div>`;
  const chipRow = S.depts.length ? `<div class="chips">${chips.map((c) => `<button class="chip ${S.dept === c.id ? "on" : ""}" data-dept="${c.id}">${esc(c.name)} <span style="opacity:.6">${c.n}</span></button>`).join("")}</div>` : "";
  const head = `<div style="margin-bottom:12px"><h1>🛍️ Club Shop</h1><div class="sub">Kit, gear and club merchandise</div></div>`;

  let body = "";
  if (S.dept === "all" && !q && grouped.length + (other.length ? 1 : 0) >= 2) {
    body += `<div class="grid" style="margin:10px 0 18px">${grouped.map(({ d, items }, idx) => {
      const n = num.get(d.id), hero = idx === 0 && grouped.length >= 3, ph = uniqPhotos(items), from = fromPrice(items);
      return `<button class="tile ${hero ? "hero" : ""}" data-dept="${d.id}" style="background:${TINTS[(parseInt(n, 10) - 1) % TINTS.length]}">${ph.length ? collage(ph) : ""}<div class="sh"></div><span class="dn">DEPT ${n}</span><span class="pill">Enter ›</span><div class="tx"><small>${VERBS[(parseInt(n, 10) - 1) % VERBS.length].toUpperCase()}</small><b>${esc(d.name)}</b><small>${items.length} item${items.length === 1 ? "" : "s"}${from != null ? ` · from ${money(from)}` : ""}</small></div></button>`;
    }).join("")}${other.length ? `<button class="tile" data-dept="other" style="background:var(--card);color:var(--text);border:1.5px dashed var(--line)"><div class="tx"><small>MORE TO FIND</small><b>Other items</b><small>${other.length} items</small></div></button>` : ""}</div>`;
  }
  const real = S.depts.find((d) => d.id === S.dept);
  const dCats = S.cats.filter((c) => c.department_id === S.dept);
  const deptItems = list.filter((p) => p.department_id === S.dept);
  const cur = S.catPath.length ? S.catPath[S.catPath.length - 1] : null;
  const itemsFor = (id) => { const ids = new Set([id, ...descIds(dCats, id)]); return deptItems.filter((p) => p.category_id && ids.has(p.category_id)); };
  const direct = deptItems.filter((p) => (p.category_id || null) === cur), childCats = kids(dCats, cur);
  if (real) {
    const allD = all.filter((p) => p.department_id === real.id), ph = uniqPhotos(allD), n = num.get(real.id) || "01", from = fromPrice(allD);
    body += `<div class="hero2" style="background:${TINTS[(parseInt(n, 10) - 1) % TINTS.length]}">${ph.length ? collage(ph) : ""}<div class="sh"></div><button class="chip" data-dept="all" style="position:absolute;top:10px;left:10px;background:rgba(0,0,0,.55);color:#fff;border:0">‹ All departments</button><div class="mono" style="font-size:.66rem;letter-spacing:.2em;text-transform:uppercase">Department ${n} · you're inside</div><div style="font-size:2rem;font-weight:800;text-transform:uppercase;line-height:.95">${esc(real.name)}</div><div class="mono" style="font-size:.72rem;margin-top:6px">${deptItems.length} items${dCats.length ? ` · ${dCats.length} categories` : ""}${from != null ? ` · from ${money(from)}` : ""}</div></div>`;
  }
  if (S.catPath.length) body += `<div class="crumb"><a data-crumb="0">${esc(real ? real.name : "")}</a>${S.catPath.map((id, i) => { const c = S.cats.find((x) => x.id === id), last = i === S.catPath.length - 1; return ` › ${last ? esc(c ? c.name : "") : `<a data-crumb="${i + 1}">${esc(c ? c.name : "")}</a>`}`; }).join("")}</div>`;
  if (real && childCats.length) body += `<div class="grid" style="margin-bottom:14px">${childCats.map((c) => { const it = itemsFor(c.id), ph = uniqPhotos(it); return `<button class="tile" data-cat="${c.id}" style="aspect-ratio:16/10;background:var(--card);border:1px solid var(--line)">${ph.length ? collage(ph) + `<div class="sh"></div>` : ""}<div class="tx" style="${ph.length ? "" : "color:var(--text)"}"><b style="font-size:.85rem">${esc(c.name)}</b><small>${it.length} item${it.length === 1 ? "" : "s"}</small></div></button>`; }).join("")}</div>`;
  if (real && childCats.length && direct.length) body += `<div style="display:flex;gap:6px;margin-bottom:10px"><button class="chip ${S.catFilter === "all" ? "on" : ""}" data-cf="all">All ${itemsFor(cur).length}</button><button class="chip ${S.catFilter === "direct" ? "on" : ""}" data-cf="direct">Other ${direct.length}</button></div>`;

  if (S.dept === "all") {
    body += grouped.map(({ d, items }) => `<div style="margin:0 0 22px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="background:var(--gold);color:#1a1200;font-size:.62rem;font-weight:800;padding:2px 6px;border-radius:4px;letter-spacing:.12em">DEPT ${num.get(d.id)}</span><b style="text-transform:uppercase;font-size:1.05rem">${esc(d.name)}</b><span style="color:var(--faint)">(${items.length})</span><button class="chip" style="margin-left:auto" data-dept="${d.id}">Visit ›</button></div>${grid(items)}</div>`).join("") + (other.length ? `<div><div class="sub" style="margin-bottom:8px">Other items (${other.length})</div>${grid(other)}</div>` : "");
  } else if (S.dept === "other") body += grid(other);
  else {
    const shown = S.catFilter === "direct" ? direct : cur === null ? deptItems : itemsFor(cur);
    body += grid(shown);
  }
  if (!list.length) body = `<div class="empty">Nothing matching “${esc(S.q)}”.</div>`;
  return head + tools + chipRow + body;
}

// ───────────────────────── product sheet
function renderModal() {
  const m = $("#modal");
  if (S.modalConfirm) return;
  const p = S.modal;
  if (!p) { if (!m.querySelector("[data-c]")) m.innerHTML = ""; return; }
  const out = (p.stock_qty ?? 0) === 0, q = S.modalQty || 1;
  m.innerHTML = `<div class="ov" data-close><div class="sheet"><div class="im">${p.image_url ? `<img src="${esc(photo(p.image_url))}" alt="">` : `<span style="font-size:3rem">🎾</span>`}<button class="x sh2" data-share="${p.id}" style="left:10px;right:auto">⤴</button><button class="x" data-close>✕</button></div>
    <div style="padding:16px"><div style="font-size:1.2rem;font-weight:800;text-transform:uppercase;line-height:1.1">${esc(p.name)}</div><div class="pr" style="margin-top:4px;font-size:1rem">${money(p.price)}</div>${p.description ? `<p style="color:var(--dim)">${esc(p.description)}</p>` : ""}
    ${out ? `<div class="empty" style="padding:10px;margin-top:10px">Out of stock</div>` : `<div style="display:flex;justify-content:center;margin:14px 0"><span class="qty"><button data-mq="-1">−</button><span>${q}</span><button data-mq="1">+</button></span></div><button class="btn block" data-addmodal>Add to cart</button>`}</div></div></div>`;
}
function addToCart(p, qty) {
  const cap = p.stock_qty ?? 99, ex = S.cart.find((i) => i.productId === p.id);
  if (ex) ex.qty = Math.min(ex.qty + qty, cap); else S.cart.push({ productId: p.id, name: p.name, price: p.price, image_url: p.image_url, qty: Math.min(qty, cap) });
  saveCart(); toast(`Added ${p.name} to cart.`); header();
}
async function shareProduct(p) {
  const url = `${location.origin}${location.pathname}?p=${p.id}`;
  if (navigator.share) { try { await navigator.share({ title: p.name, text: `${p.name} — ${money(p.price)}`, url }); } catch {} return; }
  try { await navigator.clipboard.writeText(url); toast("Product link copied."); } catch { toast(url); }
}

// ───────────────────────── cart / checkout / orders
function viewCart() {
  if (!S.cart.length) return `<h1>🛒 Your cart</h1><div class="empty" style="margin-top:14px">Your cart is empty.<div style="margin-top:12px"><button class="btn" data-go="">Browse the shop</button></div></div>`;
  return `<h1>🛒 Your cart</h1><div style="margin-top:14px">${S.cart.map((i) => `<div class="row"><div class="th">${i.image_url ? `<img src="${esc(photo(i.image_url))}" alt="">` : "🎾"}</div><div class="mid"><b>${esc(i.name)}</b><span class="pr">${money(i.price)}</span></div><span class="qty"><button data-cq="${i.productId}" data-d="-1">−</button><span>${i.qty}</span><button data-cq="${i.productId}" data-d="1">+</button></span><button class="btn red sm" data-crm="${i.productId}">🗑</button></div>`).join("")}</div>
    <div style="display:flex;justify-content:space-between;margin:14px 4px;font-weight:800"><span style="color:var(--dim)">Total</span><span class="mono" style="font-size:1.2rem">${money(cartTotal())}</span></div><button class="btn block" data-go="checkout">Check out</button>`;
}
function viewCheckout() {
  if (!S.cart.length) return `<div class="empty">Your cart is empty.</div>`;
  const m = S.method || (SHOP_CARD_LINK ? "card" : SHOP_WHATSAPP_NUMBER ? "whatsapp" : "eft");
  const pr = S.profile || {};
  const note = `<label class="l">Delivery / pickup note (optional)</label><textarea id="c-note" rows="2" placeholder="Collect at the clubhouse, or an address…">${esc(S.chk.note || "")}</textarea>`;
  return `<h1>💳 Checkout</h1><div style="display:flex;justify-content:space-between;margin:12px 4px;font-weight:800"><span style="color:var(--dim)">${cartCount()} item(s)</span><span class="mono" style="font-size:1.2rem">${money(cartTotal())}</span></div>
  <div class="seg3"><button data-m="card" class="${m === "card" ? "on" : ""}" ${SHOP_CARD_LINK ? "" : "disabled"}>${SHOP_CARD_LINK ? "💳" : "🔒"} Card</button><button data-m="whatsapp" class="${m === "whatsapp" ? "on" : ""}" ${SHOP_WHATSAPP_NUMBER ? "" : "disabled"}>💬 WhatsApp</button><button data-m="eft" class="${m === "eft" ? "on" : ""}">🏦 EFT proof</button></div>
  <label class="l">Your name</label><input id="c-name" value="${esc(S.chk.name ?? pr.full_name ?? "")}" placeholder="So we know who the order is from">
  <label class="l">Contact number</label><input id="c-phone" type="tel" value="${esc(S.chk.phone ?? pr.phone ?? "")}" placeholder="Where can we reach you?">
  ${m === "whatsapp" ? `<p style="color:var(--dim)">Your order summary opens in WhatsApp and we confirm payment and collection with you there.</p>${note}<button class="btn block" style="background:#25D366;color:#fff" data-place="whatsapp" ${S.busy ? "disabled" : ""}>💬 ${S.busy ? "Sending…" : "Order on WhatsApp"}</button>` : ""}
  ${m === "eft" ? `<div class="card pre" style="margin-top:12px">${esc(SHOP_BANK_DETAILS)}</div>${note}<label class="l">Proof of payment</label><input id="c-proof" type="file" accept="image/*,.pdf"><button class="btn block" style="margin-top:14px" data-place="manual_proof" ${S.busy ? "disabled" : ""}>${S.busy ? "Submitting…" : "Submit order"}</button>` : ""}
  ${m === "card" ? `<p style="color:var(--dim)">You'll be taken to a secure card page to pay ${money(cartTotal())}. Come back afterwards — we confirm your order shortly.</p>${note}<button class="btn block green" data-place="ikhokha_link" ${S.busy ? "disabled" : ""}>💳 ${S.busy ? "Submitting…" : `Pay ${money(cartTotal())}`}</button>` : ""}
  <p style="text-align:center"><a href="#cart" style="color:var(--faint);font-size:.82rem">Back to cart</a></p>`;
}
async function placeOrder(method, btn) {
  const name = ($("#c-name").value || "").trim(), phone = ($("#c-phone").value || "").trim(), note = $("#c-note") ? $("#c-note").value : "";
  if (!name) return toast("Let us know your name before ordering.");
  let proofPath = null;
  const label = btn.textContent; btn.disabled = true; btn.textContent = "Please wait…";
  try {
    if (method === "manual_proof") {
      const f = $("#c-proof") && $("#c-proof").files[0];
      if (!f) throw new Error("Attach your proof of payment before submitting.");
      const file = await compress(f, 1600), ext = (file.name.split(".").pop() || "dat").toLowerCase();
      proofPath = `${S.session ? S.session.user.id : "guest-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now())}/order-${Date.now()}.${ext}`;
      const up = await sb.storage.from("shop-payment-proofs").upload(proofPath, file, { cacheControl: "31536000" });
      if (up.error) throw new Error("Couldn't upload proof: " + up.error.message);
    }
    const { data, error } = await sb.rpc("place_shop_order", { p_items: S.cart.map((i) => ({ product_id: i.productId, qty: i.qty })), p_method: method, p_name: name, p_phone: phone, p_note: note, p_proof_path: proofPath });
    if (error) throw new Error(error.message);
    const lines = S.cart.map((i) => `${i.qty}x ${i.name} — ${money(i.qty * i.price)}`).join("\n"), total = cartTotal();
    S.cart = []; saveCart(); S.last = { method, total };
    if (method === "whatsapp") window.open(`https://wa.me/${SHOP_WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hi, I'd like to order from the KenRho Club Shop:\n\n${lines}\n\nTotal: ${money(total)}\n\nName: ${name}`)}`, "_blank", "noopener");
    if (method === "ikhokha_link" && SHOP_CARD_LINK) window.open(SHOP_CARD_LINK, "_blank", "noopener");
    S.chk = {}; await loadAll(); go("confirm");
  } catch (e) { btn.disabled = false; btn.textContent = label; toast(e.message); }
}
function viewConfirm() {
  return `<div style="text-align:center;padding-top:30px"><div style="font-size:3rem">✅</div><h1>Order placed</h1><p style="color:var(--dim)">${S.session ? "We've got it — check “My orders” for updates." : "We've got it — we'll reach out on the number you gave us."}</p><div style="display:flex;gap:8px;justify-content:center"><button class="btn sec" data-go="">Keep browsing</button>${S.session ? `<button class="btn" data-go="orders">My orders</button>` : ""}</div></div>`;
}
const stBadge = (s) => { const [l, c] = STATUS[s] || [s, "#888"]; return `<span class="st" style="background:${c}22;color:${c}">${esc(l)}</span>`; };
function orderCard(o, admin) {
  return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><b>${admin ? esc(o.buyer_username) : new Date(o.created_at).toLocaleDateString()}</b>${stBadge(o.status)}</div>
  ${admin ? `<div class="mono" style="font-size:.7rem;color:var(--faint);margin-bottom:6px">${new Date(o.created_at).toLocaleString()} · ${o.checkout_method === "ikhokha_link" ? "💳 card" : esc(o.checkout_method.replace("_", " "))}${o.contact_phone ? " · " + esc(o.contact_phone) : ""}</div>` : ""}
  ${(o.shop_order_items || []).map((i) => `<div style="display:flex;justify-content:space-between;color:var(--dim);font-size:.85rem"><span>${i.qty}× ${esc(i.product_name)}</span><span>${money(i.qty * i.unit_price)}</span></div>`).join("")}
  ${o.delivery_note ? `<div style="font-size:.82rem;color:var(--faint);margin-top:4px">Note: ${esc(o.delivery_note)}</div>` : ""}
  ${!admin && ["paid", "fulfilled"].includes(o.status) ? `<div style="margin-top:8px"><button class="btn sec sm" data-rcpt="${o.id}">🧾 Download receipt</button></div>` : ""}
  <div style="display:flex;justify-content:space-between;border-top:1px solid var(--line);margin-top:8px;padding-top:8px"><b>Total</b><b class="mono">${money(o.subtotal)}</b></div>
  ${admin ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${o.payment_proof_path ? `<button class="btn sec sm" data-proof="${o.id}">View proof</button>` : ""}${["pending_review", "whatsapp_sent"].includes(o.status) ? `<button class="btn green sm" data-rv="${o.id}" data-s="paid">✓ Approve (bank)</button><button class="btn sec sm" data-rv="${o.id}" data-s="paid" data-cash="1">💵 Paid cash</button>` : ""}${o.status === "pending_review" ? `<button class="btn red sm" data-rv="${o.id}" data-s="rejected">✕ Reject</button>` : ""}${["paid", "fulfilled"].includes(o.status) ? `<button class="btn sec sm" data-rcpt="${o.id}">🧾 Receipt PDF</button>` : ""}${["paid", "whatsapp_sent"].includes(o.status) ? `<button class="btn sec sm" data-rv="${o.id}" data-s="fulfilled">🚚 Mark fulfilled</button>` : ""}</div>` : ""}</div>`;
}
function viewOrders() {
  if (!S.session) return `<div class="empty">Sign in to see your orders.</div>`;
  if (S.orders === null) return `<div class="empty">Loading…</div>`;
  return `<h1>📋 My orders</h1><div style="margin-top:14px">${S.orders.length ? S.orders.map((o) => orderCard(o, false)).join("") : `<div class="empty">No orders yet.</div>`}</div>`;
}

// ───────────────────────── admin
const adminNav = (cur) => `<div class="tools"><button class="chip ${cur === "p" ? "on" : ""}" data-go="admin">Products</button><button class="chip ${cur === "d" ? "on" : ""}" data-go="admin-depts">Departments</button><button class="chip ${cur === "o" ? "on" : ""}" data-go="admin-orders">Orders${S.pendingN ? ` (${S.pendingN})` : ""}</button><button class="chip" data-gopage="shop-records.html">Records &amp; stock take</button></div>`;
function viewAdminProducts() {
  const q = (S.aq || "").toLowerCase(), list = S.products.filter((p) => !q || p.name.toLowerCase().includes(q));
  const dn = new Map(S.depts.map((d) => [d.id, d.name]));
  return `<h1>📦 Products</h1>${adminNav("p")}<input id="aq" type="search" placeholder="Search products…" value="${esc(S.aq || "")}" style="margin-bottom:10px"><button class="btn block" data-edit="new" style="margin-bottom:12px">+ Add product</button>
  ${list.map((p) => `<div class="row"><div class="th">${p.image_url ? `<img src="${esc(photo(p.image_url))}" alt="">` : "🎾"}</div><div class="mid"><b>${esc(p.name)}</b><small>${money(p.price)} · ${p.stock_qty} in stock${p.active ? "" : " · hidden"}${p.department_id && dn.has(p.department_id) ? " · " + esc(dn.get(p.department_id)) : ""}${p.category_id ? " › " + esc(pathName(S.cats, p.category_id)) : ""}</small></div><button class="btn sec sm" data-edit="${p.id}">Edit</button><button class="btn red sm" data-delp="${p.id}">🗑</button></div>`).join("") || `<div class="empty">No products yet.</div>`}`;
}
function openProductForm(id) {
  const p = id === "new" ? {} : S.products.find((x) => x.id === id) || {};
  S.editing = p;
  const dept = p.department_id || "", dc = dept ? flat(S.cats.filter((c) => c.department_id === dept)) : [];
  const catOpts = (d) => `<option value="">Uncategorized</option>` + flat(S.cats.filter((c) => c.department_id === d)).map((c) => `<option value="${c.id}"${c.id === p.category_id ? " selected" : ""}>${"\u00A0\u00A0\u00A0\u00A0".repeat(c.depth)}${c.depth ? "↳ " : ""}${esc(c.name)}</option>`).join("");
  $("#modal").innerHTML = `<div class="ov"><div class="sheet" style="padding:16px"><div style="display:flex;justify-content:space-between;align-items:center"><b style="text-transform:uppercase;font-size:1.1rem">${p.id ? "Edit product" : "Add product"}</b><button class="btn sec sm" data-closeform>✕</button></div>
  <label class="l">Name</label><input id="f-name" value="${esc(p.name || "")}"><label class="l">Description</label><textarea id="f-desc" rows="2">${esc(p.description || "")}</textarea>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label class="l">Price (R)</label><input id="f-price" type="number" min="0" step="0.01" value="${p.price ?? ""}"></div><div><label class="l">Stock</label><input id="f-stock" type="number" min="0" value="${p.stock_qty ?? 0}"></div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label class="l">Cost price (R) — private</label><input id="f-cost" type="number" min="0" step="0.01" value="${(S.costs && S.costs[p.id] ? S.costs[p.id].cost_price : 0)}"></div><div><label class="l">Warn me when stock is at or below</label><input id="f-reorder" type="number" min="0" value="${(S.costs && S.costs[p.id] ? S.costs[p.id].reorder_level : 0)}"></div></div>
  <label class="l">Department</label><select id="f-dept"><option value="">Uncategorized</option>${S.depts.map((d) => `<option value="${d.id}"${d.id === dept ? " selected" : ""}>${esc(d.name)}</option>`).join("")}</select>
  <div id="f-catwrap" style="${dc.length ? "" : "display:none"}"><label class="l">Category</label><select id="f-cat">${catOpts(dept)}</select></div>
  <label class="l">Product photo</label><input id="f-photo" type="file" accept="image/*"><label style="display:flex;gap:8px;align-items:center;margin:12px 0"><input id="f-active" type="checkbox" style="width:auto" ${p.active === false ? "" : "checked"}> Visible in the shop</label>
  <button class="btn block" data-saveform>Save product</button></div></div>`;
  $("#f-dept").onchange = (e) => { const d = e.target.value, has = d && S.cats.some((c) => c.department_id === d); $("#f-catwrap").style.display = has ? "" : "none"; $("#f-cat").innerHTML = catOpts(d).replace(" selected", ""); };
}
async function saveProductForm() {
  const p = S.editing || {}, name = $("#f-name").value.trim(), price = Number($("#f-price").value);
  if (!name || !(price >= 0) || $("#f-price").value === "") return toast("Name and price are required.");
  let image_url = p.image_url || null; const f = $("#f-photo").files[0];
  $("[data-saveform]").disabled = true;
  if (f) {
    const file = await compress(f), path = `${Date.now()}.jpg`, up = await sb.storage.from("shop-photos").upload(path, file, { cacheControl: "31536000", contentType: "image/jpeg" });
    if (up.error) { $("[data-saveform]").disabled = false; return toast("Couldn't upload image: " + up.error.message); }
    image_url = sb.storage.from("shop-photos").getPublicUrl(path).data.publicUrl;
  }
  const payload = { name, description: $("#f-desc").value || null, price, stock_qty: Number($("#f-stock").value) || 0, active: $("#f-active").checked, image_url, department_id: $("#f-dept").value || null, category_id: $("#f-cat") && $("#f-dept").value ? $("#f-cat").value || null : null };
  let pid = p.id, error;
  if (pid) ({ error } = await sb.from("shop_products").update(payload).eq("id", pid));
  else { const r = await sb.from("shop_products").insert(payload).select("id").single(); error = r.error; pid = r.data && r.data.id; }
  if (!error && pid) { const c = await sb.from("shop_product_costs").upsert({ product_id: pid, cost_price: Number($("#f-cost").value) || 0, reorder_level: parseInt($("#f-reorder").value, 10) || 0 }); error = c.error; }
  if (error) { $("[data-saveform]").disabled = false; return toast("Couldn't save product: " + error.message); }
  $("#modal").innerHTML = ""; toast(p.id ? "Product updated." : "Product added."); await loadAll(); render();
}
function viewAdminDepts() {
  const cc = (id) => S.cats.filter((c) => c.department_id === id).length, pc = (id) => S.products.filter((p) => p.department_id === id).length;
  return `<h1>🗂 Departments</h1>${adminNav("d")}<div style="display:flex;gap:8px;margin-bottom:12px"><input id="nd" placeholder="New department name…"><button class="btn" data-adddept>Add</button></div>
  ${S.depts.map((d, i) => `<div class="row"><span style="display:flex;flex-direction:column"><button class="qty" style="all:unset;cursor:pointer;opacity:${i ? 1 : 0.3}" data-mvd="${d.id}" data-d="-1">▲</button><button style="all:unset;cursor:pointer;opacity:${i < S.depts.length - 1 ? 1 : 0.3}" data-mvd="${d.id}" data-d="1">▼</button></span><div class="mid"><b>${esc(d.name)}</b><small>${pc(d.id)} products · ${cc(d.id)} categories</small></div><button class="btn sec sm" data-go="admin-cats/${d.id}">Categories</button><button class="btn sec sm" data-rend="${d.id}">Rename</button><button class="btn red sm" data-deld="${d.id}">🗑</button></div>`).join("") || `<div class="empty">No departments yet — everything shows under “Other”.</div>`}`;
}
function viewAdminCats() {
  const d = S.depts.find((x) => x.id === S.adminDept); if (!d) return `<div class="empty">Department not found.</div>`;
  const dc = S.cats.filter((c) => c.department_id === d.id), cnt = (id) => S.products.filter((p) => p.category_id === id).length;
  const row = (c, depth) => { const sib = kids(dc, c.parent_category_id || null), idx = sib.findIndex((s) => s.id === c.id), k = kids(dc, c.id);
    return `<div class="row" style="margin-left:${depth * 18}px"><span style="display:flex;flex-direction:column"><button style="all:unset;cursor:pointer;opacity:${idx ? 1 : 0.3}" data-mvc="${c.id}" data-d="-1">▲</button><button style="all:unset;cursor:pointer;opacity:${idx < sib.length - 1 ? 1 : 0.3}" data-mvc="${c.id}" data-d="1">▼</button></span><div class="mid"><b>${esc(c.name)}</b><small>${cnt(c.id)} products${k.length ? ` · ${k.length} subcategories` : ""}</small></div><button class="btn sec sm" data-subc="${c.id}">+ Sub</button><button class="btn sec sm" data-renc="${c.id}">Rename</button><button class="btn red sm" data-delc="${c.id}">🗑</button></div>${k.map((x) => row(x, depth + 1)).join("")}`; };
  return `<p style="margin:0 0 6px"><a href="#admin-depts" style="color:var(--dim);font-weight:700;text-decoration:none">← Departments</a></p><h1>Categories <span class="sub" style="display:inline">in ${esc(d.name)}</span></h1><div style="display:flex;gap:8px;margin:12px 0"><input id="nc" placeholder="New top-level category…"><button class="btn" data-addcat>Add</button></div>${kids(dc, null).map((c) => row(c, 0)).join("") || `<div class="empty">No categories in “${esc(d.name)}” yet.</div>`}`;
}
function viewAdminOrders() {
  if (S.orders === null) return `<h1>📋 Orders</h1>${adminNav("o")}<div class="empty">Loading…</div>`;
  const f = S.adminFilter, list = f === "all" ? S.orders : S.orders.filter((o) => o.status === f);
  S.pendingN = S.orders.filter((o) => o.status === "pending_review").length;
  return `<h1>📋 Orders</h1>${adminNav("o")}<div class="tools">${["pending_review", "paid", "whatsapp_sent", "fulfilled", "rejected", "all"].map((x) => `<button class="chip ${f === x ? "on" : ""}" data-af="${x}">${x.replace("_", " ")}</button>`).join("")}</div>${list.length ? list.map((o) => orderCard(o, true)).join("") : `<div class="empty">No orders here.</div>`}`;
}
async function autoDocs(orderId) {
  try {
    const { data, error } = await sb.rpc("shop_issue_documents", { p_order: orderId }); if (error) throw error;
    const o = S.orders.find((x) => x.id === orderId), items = (o.shop_order_items || []).map((i) => ({ name: i.product_name, qty: i.qty, unit: i.unit_price })), method = { whatsapp: "WhatsApp / cash", manual_proof: "EFT", ikhokha_link: "Card" }[o.checkout_method] || o.checkout_method;
    const mk = (kind, d) => window.KR_SHOPDOC.make({ kind, number: d.doc_number, date: d.doc_date, customer: o.buyer_username, items, total: o.subtotal, method });
    const [ib, rb] = await Promise.all([mk("invoice", data.invoice), mk("receipt", data.receipt)]);
    for (const [b, d] of [[ib, data.invoice], [rb, data.receipt]]) { const path = `${new Date().getFullYear()}/${d.doc_number}.pdf`; const up = await sb.storage.from("shop-documents").upload(path, b, { contentType: "application/pdf" }); if (!up.error || /exists/i.test(up.error.message)) await sb.rpc("shop_set_document_file", { p_id: d.id, p_path: path }); }
    window.KR_SHOPDOC.download(rb, data.receipt.doc_number + ".pdf"); toast(`Receipt ${data.receipt.doc_number} and invoice ${data.invoice.doc_number} created and filed.`);
  } catch (e) { toast("Approved, but the receipt could not be created: " + (e.message || e)); }
}
async function downloadReceipt(id) {
  const o = (S.orders || []).find((x) => x.id === id); if (!o) return;
  let number = "RCPT-" + id.slice(0, 8).toUpperCase(), date = o.created_at; const { data } = await sb.rpc("shop_order_docs", { p_order: id }), rec = (data || []).find((d) => d.doc_kind === "sales_receipt");
  if (rec) { number = rec.doc_number; date = rec.doc_date; }
  const blob = await window.KR_SHOPDOC.make({ kind: "receipt", number, date, customer: o.buyer_username, items: (o.shop_order_items || []).map((i) => ({ name: i.product_name, qty: i.qty, unit: i.unit_price })), total: o.subtotal, method: { whatsapp: "WhatsApp / cash", manual_proof: "EFT", ikhokha_link: "Card" }[o.checkout_method] || "" });
  window.KR_SHOPDOC.download(blob, number + ".pdf");
}
async function mv(table, rows, id, d) {
  const i = rows.findIndex((r) => r.id === id), o = rows[i + d]; if (!o) return;
  const me = rows[i]; await sb.from(table).update({ position: o.position }).eq("id", me.id); await sb.from(table).update({ position: me.position }).eq("id", o.id); await loadAll(); render();
}

// ───────────────────────── events
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-go],[data-back],[data-open],[data-quick],[data-dept],[data-cat],[data-crumb],[data-cf],[data-instock],[data-close],[data-share],[data-mq],[data-addmodal],[data-cq],[data-crm],[data-m],[data-place],[data-rv],[data-rcpt],[data-gopage],[data-proof],[data-af],[data-edit],[data-delp],[data-closeform],[data-saveform],[data-adddept],[data-mvd],[data-rend],[data-deld],[data-addcat],[data-mvc],[data-subc],[data-renc],[data-delc]");
  if (!t) return; const D = t.dataset;
  if (D.close !== undefined && e.target !== t && !e.target.matches("[data-close]")) return;
  if (D.go !== undefined) { e.preventDefault(); return go(D.go); }
  if (D.back !== undefined) { e.preventDefault(); if (S.catPath.length) return go(["d", S.dept, ...S.catPath.slice(0, -1)].join("/")); if (S.dept !== "all") return go(""); return history.length > 1 ? history.back() : go(""); }
  if (D.open) { S.modal = S.products.find((p) => p.id === D.open); S.modalQty = 1; return renderModal(); }
  if (D.quick) { e.stopPropagation(); return addToCart(S.products.find((p) => p.id === D.quick), 1), render(); }
  if (D.dept) return go(D.dept === "all" ? "" : "d/" + D.dept);
  if (D.cat) return go(["d", S.dept, ...S.catPath, D.cat].join("/"));
  if (D.crumb !== undefined) return go(["d", S.dept, ...S.catPath.slice(0, +D.crumb)].join("/"));
  if (D.cf) { S.catFilter = D.cf; return render(); }
  if (D.instock !== undefined) { S.inStock = !S.inStock; return render(); }
  if (D.close !== undefined) { S.modal = null; return renderModal(); }
  if (D.share) return shareProduct(S.modal);
  if (D.mq) { const p = S.modal; S.modalQty = Math.max(1, Math.min(p.stock_qty || 99, (S.modalQty || 1) + +D.mq)); return renderModal(); }
  if (D.addmodal !== undefined) { addToCart(S.modal, S.modalQty || 1); S.modal = null; return render(); }
  if (D.cq) { const i = S.cart.find((x) => x.productId === D.cq); i.qty += +D.d; if (i.qty <= 0) S.cart = S.cart.filter((x) => x !== i); saveCart(); return render(); }
  if (D.crm) { S.cart = S.cart.filter((x) => x.productId !== D.crm); saveCart(); return render(); }
  if (D.m) { S.method = D.m; return render(); }
  if (D.place) return placeOrder(D.place, t);
  if (D.rv) { const { error } = await sb.rpc("shop_review_order", { p_order: D.rv, p_status: D.s, p_cash: D.cash === "1" }); if (error) return toast(error.message); if (D.s === "paid") { toast("Order approved — stock updated and sale recorded."); await autoDocs(D.rv); } else toast("Order updated."); await Promise.all([loadAdminOrders(), loadAll()]); return render(); }
  if (D.rcpt) return downloadReceipt(D.rcpt);
  if (D.gopage) { location.href = D.gopage; return; }
  if (D.proof) { const o = S.orders.find((x) => x.id === D.proof), { data, error } = await sb.storage.from("shop-payment-proofs").createSignedUrl(o.payment_proof_path, 120); return error ? toast("Couldn't open the proof.") : window.open(data.signedUrl, "_blank", "noopener"); }
  if (D.af) { S.adminFilter = D.af; return render(); }
  if (D.edit) return openProductForm(D.edit);
  if (D.closeform !== undefined) { $("#modal").innerHTML = ""; return; }
  if (D.saveform !== undefined) return saveProductForm();
  if (D.delp) { const p = S.products.find((x) => x.id === D.delp); if (await confirmSteps([`Delete “${p.name}”? This can't be undone.`, "Are you sure? It will be permanently removed from the shop.", `Final check — permanently delete “${p.name}”.`])) { const { error } = await sb.from("shop_products").delete().eq("id", p.id); if (error) return toast(error.message); toast("Product deleted."); await loadAll(); render(); } return; }
  if (D.adddept !== undefined) { const n = $("#nd").value.trim(); if (!n) return; const pos = S.depts.length ? Math.max(...S.depts.map((d) => d.position)) + 1 : 0; const { error } = await sb.from("shop_departments").insert({ name: n, position: pos }); if (error) return toast(error.message); await loadAll(); return render(); }
  if (D.mvd) return mv("shop_departments", S.depts, D.mvd, +D.d);
  if (D.rend) { const d = S.depts.find((x) => x.id === D.rend), n = prompt("Rename department", d.name); if (n && n.trim() && n.trim() !== d.name) { const { error } = await sb.from("shop_departments").update({ name: n.trim() }).eq("id", d.id); if (error) return toast(error.message); await loadAll(); render(); } return; }
  if (D.deld) { const d = S.depts.find((x) => x.id === D.deld), n = S.products.filter((p) => p.department_id === d.id).length, cn = S.cats.filter((c) => c.department_id === d.id).length; if (await confirmSteps([`Delete “${d.name}”? ${n ? `${n} product(s) will move to “Other”.` : "This can't be undone."}`, `Are you sure? ${cn ? `Its ${cn} categories will be deleted too.` : "This department will be gone for good."}`, `Final check — permanently delete “${d.name}”.`])) { const { error } = await sb.from("shop_departments").delete().eq("id", d.id); if (error) return toast(error.message); await loadAll(); render(); } return; }
  if (D.addcat !== undefined) return addCategory(null, $("#nc").value);
  if (D.subc) return addCategory(D.subc, prompt("New subcategory name"));
  if (D.mvc) { const c = S.cats.find((x) => x.id === D.mvc); return mv("shop_categories", kids(S.cats.filter((x) => x.department_id === c.department_id), c.parent_category_id || null), c.id, +D.d); }
  if (D.renc) { const c = S.cats.find((x) => x.id === D.renc), n = prompt("Rename category", c.name); if (n && n.trim() && n.trim() !== c.name) { const { error } = await sb.from("shop_categories").update({ name: n.trim() }).eq("id", c.id); if (error) return toast(error.message); await loadAll(); render(); } return; }
  if (D.delc) { const c = S.cats.find((x) => x.id === D.delc), dc = S.cats.filter((x) => x.department_id === c.department_id), ds = descIds(dc, c.id), n = [c.id, ...ds].reduce((s, id) => s + S.products.filter((p) => p.category_id === id).length, 0); if (await confirmSteps([`Delete “${c.name}”${ds.length ? ` (and ${ds.length} subcategories)` : ""}? ${n ? `${n} product(s) will move to “Other”.` : "This can't be undone."}`, `Are you sure you want to remove “${c.name}”?`, `Final check — permanently delete “${c.name}”.`])) { const { error } = await sb.from("shop_categories").delete().eq("id", c.id); if (error) return toast(error.message); await loadAll(); render(); } return; }
});
async function addCategory(parent, name) {
  if (!name || !name.trim()) return; const dc = S.cats.filter((c) => c.department_id === S.adminDept), sib = kids(dc, parent), pos = sib.length ? Math.max(...sib.map((c) => c.position)) + 1 : 0;
  const { error } = await sb.from("shop_categories").insert({ name: name.trim(), department_id: S.adminDept, parent_category_id: parent, position: pos }); if (error) return toast(error.message); await loadAll(); render();
}
document.addEventListener("input", (e) => { if (e.target.id === "c-name") S.chk.name = e.target.value; if (e.target.id === "c-phone") S.chk.phone = e.target.value; if (e.target.id === "c-note") S.chk.note = e.target.value; if (e.target.id === "q") { S.q = e.target.value; clearTimeout(S.qt); S.qt = setTimeout(() => { const p = e.target.selectionStart; render(); const n = $("#q"); if (n) { n.focus(); n.setSelectionRange(p, p); } }, 250); } if (e.target.id === "aq") { S.aq = e.target.value; const p = e.target.selectionStart; render(); const n = $("#aq"); n.focus(); n.setSelectionRange(p, p); } });
document.addEventListener("change", (e) => { if (e.target.id === "sort") { S.sort = e.target.value; render(); } });

// ───────────────────────── boot
(async function boot() {
  const { data: { session } } = await sb.auth.getSession(); S.session = session;
  if (session) { const { data } = await sb.from("profiles").select("full_name, phone, role, status, email").eq("id", session.user.id).single(); S.profile = data; const sr = await sb.rpc("my_shop_role"); S.shopRole = sr.data || null; S.manager = !!S.shopRole; }
  await loadAll();
  const shared = new URLSearchParams(location.search).get("p");
  await route();
  if (shared) { const p = S.products.find((x) => x.id === shared); if (p) { S.modal = p; S.modalQty = 1; renderModal(); } else toast("That product link isn't available anymore."); }
  if (S.manager) { const { count } = await sb.from("shop_orders").select("id", { count: "exact", head: true }).eq("status", "pending_review"); S.pendingN = count || 0; }
})();
