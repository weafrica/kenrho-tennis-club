// Appoint / remove officers. Only the club account (and Saul) may do this; enforced in the database by appoint_officer().
const APPOINTERS = ["kenrhoparktennisclub@gmail.com", "saulestoo@gmail.com"];
const LABEL = { chairman: "Chairman", secretary: "Secretary", treasurer: "Treasurer", committee: "Committee members" };
let OFF = [], PEOPLE = [];
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nameOf = (o) => o.full_name || (PEOPLE.find((p) => (p.email || "").toLowerCase() === o.email) || {}).full_name || "";
const who = (o) => `<strong>${esc(nameOf(o) || o.email)}</strong>${nameOf(o) ? `<br><span class="muted small">${esc(o.email)}</span>` : ""}${o.signed_up ? "" : `<br><span class="muted small">Has not signed up yet</span>`}`;

function render() {
  const by = (r) => OFF.filter((o) => o.role === r);
  const slot = (r) => {
    const h = by(r)[0];
    return `<div class="oc"><h3>${LABEL[r]}</h3>
      <div class="holder ${h ? "" : "vacant"}">${h ? who(h) : "Vacant"}</div>
      <label class="muted small">${h ? "Appoint a new " + LABEL[r].toLowerCase() + " (the current one moves to committee)" : "Appoint a " + LABEL[r].toLowerCase()}</label>
      <input type="email" list="people-dl" id="in-${r}" placeholder="Their email address" />
      <button class="btn btn-primary mt-8" data-appoint="${r}">Appoint ${LABEL[r].toLowerCase()}</button></div>`;
  };
  const com = by("committee");
  const admins = by("admin");
  $("grid").innerHTML = slot("chairman") + slot("secretary") + slot("treasurer") +
    `<div class="oc"><h3>${LABEL.committee}</h3>
      ${com.map((o) => `<div class="li2"><div>${who(o)}</div><button class="btn btn-sm btn-danger" data-remove="${esc(o.email)}">Remove</button></div>`).join("") || `<p class="muted small">None yet.</p>`}
      <label class="muted small mt-8" style="display:block">Add a committee member</label>
      <input type="email" list="people-dl" id="in-committee" placeholder="Their email address" />
      <button class="btn btn-primary mt-8" data-appoint="committee">Add to committee</button></div>
     <div class="oc"><h3>Administrators</h3><p class="muted small">Set by the system, not on this page.</p>
      ${admins.map((o) => `<div class="li2"><div>${who(o)}</div></div>`).join("") || `<p class="muted small">None.</p>`}</div>`;
}

async function load() {
  const { data, error } = await window.sb.rpc("list_officers");
  if (error) { $("grid").innerHTML = `<div class="alert alert-error">${esc(error.message)}</div>`; return; }
  OFF = data || []; render();
}

async function appoint(email, role, confirmText) {
  email = (email || "").trim().toLowerCase();
  if (!email) return window.KR.toast("Type their email address first.", "warn");
  if (!confirm(confirmText.replace("{who}", email))) return;
  const { data, error } = await window.sb.rpc("appoint_officer", { p_email: email, p_role: role });
  if (error) return window.KR.toast(error.message, "error");
  window.KR.toast(data); await load();
}

document.addEventListener("DOMContentLoaded", async () => {
  const guard = await window.KR_guard("staff"); if (!guard) return;
  const me = guard.profile;
  if (!(me.role === "admin" && APPOINTERS.includes((me.email || "").toLowerCase()))) { window.location.href = "admin.html"; return; }
  $("who").textContent = me.full_name || me.email; $("btn-sign-out").addEventListener("click", window.KR_signOut);
  const { data } = await window.sb.from("profiles").select("full_name, email").order("full_name");
  PEOPLE = data || [];
  $("people-dl").innerHTML = PEOPLE.map((p) => `<option value="${esc(p.email)}">${esc(p.full_name || "")}</option>`).join("");

  $("grid").addEventListener("click", (e) => {
    const t = e.target;
    if (t.dataset.appoint) {
      const r = t.dataset.appoint, cur = OFF.find((o) => o.role === r && r !== "committee");
      const msg = `Make {who} the ${r}?` + (cur ? ` ${nameOf(cur) || cur.email} will move to committee.` : "");
      appoint($("in-" + r).value, r, msg);
    }
    if (t.dataset.remove) appoint(t.dataset.remove, "member", "Remove {who} from the committee? They stay a normal member.");
  });
  load();
});
