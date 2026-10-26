// Officers & teams. Rules:
//  • The CLUB ACCOUNT only appoints the executive (chairman, secretary, treasurer). It never removes anyone, because a shared account can't be traced.
//  • The EXECUTIVE adds and removes administrators, committee, the coach, the shop team and the fundraising team.
//  • Everything is recorded with the person's name in User activity.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const CLUB_EMAIL = "kenrhoparktennisclub@gmail.com";
let OFF = [], SHOP = [], FUND = [], PEOPLE = [], ME = {}, CLUB = false, EXEC = false;
const by = (r) => OFF.filter((o) => o.role === r);
const nameOf = (o) => o.full_name || (PEOPLE.find((p) => (p.email || "").toLowerCase() === o.email) || {}).full_name || "";
const who = (o) => `<strong>${esc(nameOf(o) || o.email)}</strong>${nameOf(o) ? `<br><span class="muted small">${esc(o.email)}</span>` : ""}${o.signed_up === false ? `<br><span class="muted small">Has not signed up yet</span>` : ""}`;
const row = (o, rm) => `<div class="li2"><div>${who(o)}</div>${rm ? `<button class="btn btn-sm btn-danger" ${rm}="${esc(o.email)}">Remove</button>` : ""}</div>`;

function roleCard(title, role, hint, opts) {
  opts = opts || {}; const list = by(role);
  return `<div class="oc"><h3>${title}</h3><p class="muted small">${hint}</p>${list.map((o) => row(o, opts.canRemove ? "data-remove" : null)).join("") || `<p class="muted small">${opts.empty || "None."}</p>`}
    <input type="email" list="people-dl" id="in-${role}" placeholder="Their email address"><button class="btn btn-primary mt-8" data-appoint="${role}">${opts.btn || "Appoint"}</button></div>`;
}
function teamCard(title, hint, list, roles, key) {
  const line = (x) => `<div class="li2"><div><strong>${esc(x.full_name || x.email)}</strong>${x.full_name ? `<br><span class="muted small">${esc(x.email)}</span>` : ""}<br><span class="muted small">${esc(x.role)}${x.signed_up ? "" : " · has not signed up yet"}</span></div>${x.email === "saulestoo@gmail.com" ? "" : `<button class="btn btn-sm btn-danger" data-${key}-remove="${esc(x.email)}">Remove</button>`}</div>`;
  return `<div class="oc"><h3>${title}</h3><p class="muted small">${hint}</p>${list.map(line).join("") || `<p class="muted small">None.</p>`}
    <input type="email" list="people-dl" id="in-${key}" placeholder="Their email address"><select id="role-${key}" style="margin-top:6px;width:100%;padding:9px;border:1.5px solid var(--line);border-radius:8px">${roles.map((r) => `<option value="${r[0]}">${r[1]}</option>`).join("")}</select><button class="btn btn-primary mt-8" data-${key}-add>Add</button></div>`;
}
function render() {
  const execInfo = `<div class="oc"><h3>Executive</h3><p class="muted small">${CLUB && !EXEC ? "You are signed in with the club account. Appoint the executive below." : "Only the club account appoints the executive."}</p>
    ${["chairman", "secretary", "treasurer"].map((r) => `<div class="li2"><div><b style="text-transform:capitalize">${r}</b><br>${by(r)[0] ? who(by(r)[0]) : `<span class="muted small">Vacant</span>`}</div></div>`).join("")}</div>`;
  if (CLUB && !EXEC) {
    const card = (r) => `<div class="oc"><h3 style="text-transform:capitalize">${r}</h3><div class="holder ${by(r)[0] ? "" : "vacant"}" style="margin:10px 0;padding:10px 12px;background:#eef6d9;border-radius:8px">${by(r)[0] ? who(by(r)[0]) : "Vacant"}</div>
      <label class="muted small">${by(r)[0] ? "Appoint a new " + r + " (the current one moves to committee)" : "Appoint a " + r}</label><input type="email" list="people-dl" id="in-${r}" placeholder="Their email address"><button class="btn btn-primary mt-8" data-appoint="${r}">Appoint ${r}</button></div>`;
    $("grid").innerHTML = card("chairman") + card("secretary") + card("treasurer") + `<div class="oc"><h3>About this account</h3><p class="muted small">The club account is shared, so actions on it can't be traced to one person. It can therefore only appoint the executive. It cannot remove anyone, and it cannot change administrators, the committee, the coach, the shop team or the fundraising team. Those are managed by the executive, and every change carries their name.</p></div>`;
    return;
  }
  $("grid").innerHTML = execInfo +
    roleCard("Administrators", "admin", "Administrators can edit the website and run the club's pages. Removing someone here is recorded with your name.", { canRemove: true, btn: "Add administrator" }) +
    roleCard("Committee members", "committee", "Committee members help run the club.", { canRemove: true, btn: "Add to committee" }) +
    roleCard("Coach", "coach", "The coach can edit the Coaching page only.", { canRemove: true, btn: "Appoint coach", empty: "No coach appointed." }) +
    teamCard("Shop team", "Managers and assistants run the shop: products, orders, receipts and stock takes.", SHOP, [["manager", "Shop manager"], ["assistant", "Shop assistant"]], "shop") +
    teamCard("Fundraising team", "They run fundraisers: confirm gifts, edit the fundraiser pages.", FUND, [["admin", "Fundraising admin"], ["helper", "Fundraising helper"]], "fund");
}
async function load() {
  const { data, error } = await window.sb.rpc("list_officers");
  if (error) { $("grid").innerHTML = `<div class="alert alert-error">${esc(error.message)}</div>`; return; }
  OFF = data || []; if (EXEC) { SHOP = (await window.sb.rpc("list_shop_team")).data || []; FUND = (await window.sb.rpc("list_fundraising_team")).data || []; }
  render();
}
async function call(fn, args, ok) { const { data, error } = await window.sb.rpc(fn, args); if (error) return window.KR.toast(error.message, "error"); window.KR.toast(data || ok || "Done."); await load(); }
document.addEventListener("DOMContentLoaded", async () => {
  const guard = await window.KR_guard("staff").catch(() => null); ME = guard ? guard.profile : (await window.KR.currentProfile()).profile; if (!ME) { location.href = "auth.html"; return; }
  CLUB = (ME.email || "").toLowerCase() === CLUB_EMAIL; EXEC = ["chairman", "secretary", "treasurer"].includes(ME.role);
  if (!CLUB && !EXEC) { location.href = "admin.html"; return; }
  $("who").textContent = ME.full_name || ME.email; $("btn-sign-out").addEventListener("click", window.KR_signOut);
  const { data } = await window.sb.from("profiles").select("full_name, email").order("full_name"); PEOPLE = data || [];
  $("people-dl").innerHTML = PEOPLE.map((p) => `<option value="${esc(p.email)}">${esc(p.full_name || "")}</option>`).join("");
  $("grid").addEventListener("click", async (e) => {
    const d = e.target.dataset || {}, val = (id) => ($(id) ? $(id).value.trim().toLowerCase() : "");
    if (d.appoint) { const em = val("in-" + d.appoint); if (!em) return window.KR.toast("Type their email address first.", "warn"); const cur = by(d.appoint)[0];
      const msg = `Make ${em} the ${d.appoint}?` + (["chairman", "secretary", "treasurer"].includes(d.appoint) && cur ? ` ${nameOf(cur) || cur.email} moves to committee.` : "") + (d.appoint === "treasurer" ? " This also opens the new season and carries last season's members across." : "") + (d.appoint === "admin" ? " Administrators can edit the whole website." : "") + "\n\nThis is recorded with your name.";
      if (confirm(msg)) call("appoint_officer", { p_email: em, p_role: d.appoint }); }
    if (d.remove) { if (confirm(`Remove ${d.remove} from their role? They stay a normal member.\n\nThis is recorded with your name.`)) call("appoint_officer", { p_email: d.remove, p_role: "member" }); }
    if (d.shopAdd !== undefined) { const em = val("in-shop"); if (!em) return window.KR.toast("Type their email address first.", "warn"); call("appoint_shop_staff", { p_email: em, p_role: $("role-shop").value }); }
    if (d.shopRemove) { if (confirm(`Remove ${d.shopRemove} from the shop team?`)) call("appoint_shop_staff", { p_email: d.shopRemove, p_role: "none" }); }
    if (d.fundAdd !== undefined) { const em = val("in-fund"); if (!em) return window.KR.toast("Type their email address first.", "warn"); call("appoint_fundraising_staff", { p_email: em, p_role: $("role-fund").value }); }
    if (d.fundRemove) { if (confirm(`Remove ${d.fundRemove} from the fundraising team?`)) call("appoint_fundraising_staff", { p_email: d.fundRemove, p_role: "none" }); }
  });
  load();
});
