// Loaded after config.js and the supabase-js CDN script.
const { createClient } = supabase;
window.sb = createClient(window.KENRHO_CONFIG.SUPABASE_URL, window.KENRHO_CONFIG.SUPABASE_ANON_KEY);

// Small shared helpers used across pages -----------------------------------
window.KR = {
  fmtMoney(n, currency) {
    const c = currency || (window.KENRHO_CONFIG && window.KENRHO_CONFIG.CURRENCY) || "ZAR";
    const num = Number(n || 0);
    try {
      return new Intl.NumberFormat("en-ZA", { style: "currency", currency: c }).format(num);
    } catch (e) {
      return c + " " + num.toFixed(2);
    }
  },
  fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
  },
  badge(status) {
    const label = (status || "").replace(/_/g, " ");
    return `<span class="badge ${status}">${label}</span>`;
  },
  async currentProfile() {
    const { data: { session } } = await window.sb.auth.getSession();
    if (!session) return { session: null, profile: null };
    const { data: profile } = await window.sb
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();
    return { session, profile };
  },
  toast(msg, type = "info") {
    let el = document.getElementById("kr-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "kr-toast";
      el.style.cssText =
        "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:999;max-width:90vw;";
      document.body.appendChild(el);
    }
    const bg = type === "error" ? "#b23b2e" : type === "warn" ? "#8a5a12" : "#1f3d1a";
    el.innerHTML = `<div style="background:${bg};color:#fff;padding:12px 20px;border-radius:8px;font-family:'Work Sans',sans-serif;font-size:0.9rem;box-shadow:0 8px 24px rgba(0,0,0,.25);">${msg}</div>`;
    el.style.display = "block";
    clearTimeout(window.__krToastTimer);
    window.__krToastTimer = setTimeout(() => (el.style.display = "none"), 3500);
  },
};
