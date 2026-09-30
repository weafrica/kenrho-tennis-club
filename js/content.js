// Renders the homepage's News and Gallery sections from data committee
// members and staff can edit from the admin dashboard's Content tab.

async function loadNews() {
  const container = document.getElementById("news-container");
  if (!container) return;
  const { data } = await window.sb.from("announcements").select("*").eq("is_active", true).order("sort_order");
  if (!data || !data.length) {
    container.innerHTML = `<div class="card"><p class="muted">No announcements right now — check back soon.</p></div>`;
    return;
  }
  container.innerHTML = data
    .map(
      (a, i) => `
    <div class="card">
      <h3>${a.title}</h3>
      <p id="news-${i}" class="muted">${a.body}</p>
      <button class="btn btn-outline btn-sm mt-8" data-read-aloud="news-${i}">🔊 Read aloud</button>
    </div>`
    )
    .join("");
}

async function loadGallery() {
  const container = document.getElementById("gallery-container");
  if (!container) return;
  const { data } = await window.sb.from("gallery_photos").select("*").order("sort_order");
  if (!data || !data.length) return; // keep the placeholder gradients already in the HTML
  container.innerHTML = data
    .map((p) => `<div style="background-image:url('${p.url}');background-size:cover;background-position:center;" title="${p.caption || ""}"></div>`)
    .join("");
}

document.addEventListener("DOMContentLoaded", () => {
  loadNews();
  loadGallery();
});
