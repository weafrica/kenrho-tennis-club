async function renderAuthState() {
  const params = new URLSearchParams(window.location.search);
  const { data: { session } } = await window.sb.auth.getSession();

  const signedOutEl = document.getElementById("state-signed-out");
  const pendingEl = document.getElementById("state-pending");
  const rejectedEl = document.getElementById("state-rejected");
  const suspendedEl = document.getElementById("state-suspended");
  [signedOutEl, pendingEl, rejectedEl, suspendedEl].forEach((el) => el.classList.add("hidden"));

  if (!session) {
    signedOutEl.classList.remove("hidden");
    return;
  }

  const { data: profile } = await window.sb
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (!profile) {
    // Row not created yet (trigger lag) — try again shortly.
    setTimeout(renderAuthState, 800);
    return;
  }

  if (profile.role === "admin" || profile.role === "treasurer" || profile.status === "approved") {
    window.location.href = "dashboard.html";
    return;
  }
  if (profile.status === "rejected") {
    rejectedEl.classList.remove("hidden");
    return;
  }
  if (profile.status === "suspended") {
    suspendedEl.classList.remove("hidden");
    return;
  }
  // pending: still let them into the dashboard in "pending" mode so they can
  // upload proof of payment — dashboard.html itself checks status and shows
  // the right screen. We just avoid trapping them here.
  window.location.href = "dashboard.html";
}

async function signInWithGoogle() {
  await window.sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname.replace("auth.html", "auth.html") },
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-google-signin]").forEach((b) => b.addEventListener("click", signInWithGoogle));
  const signOutBtn = document.getElementById("btn-sign-out-here");
  if (signOutBtn) signOutBtn.addEventListener("click", window.KR_signOut);
  renderAuthState();
  window.sb.auth.onAuthStateChange((_event, _session) => renderAuthState());
});
