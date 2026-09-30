// Mobile nav toggle for the public marketing site
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (btn && links) {
    btn.addEventListener("click", () => links.classList.toggle("open"));
  }
});

// Redirects unauthenticated / unapproved visitors away from protected pages.
// requiredRole: null (any signed-in user), "approved" (approved members+),
// or "staff" (admin/treasurer only).
window.KR_guard = async function (requiredRole) {
  const { session, profile } = await window.KR.currentProfile();
  if (!session) {
    window.location.href = "auth.html";
    return null;
  }
  const fullStaffRoles = ["admin", "treasurer", "secretary", "chairman"];
  const contentRoles = [...fullStaffRoles, "committee"];
  if (requiredRole === "staff" && !(profile && fullStaffRoles.includes(profile.role))) {
    window.location.href = "dashboard.html";
    return null;
  }
  if (requiredRole === "content" && !(profile && contentRoles.includes(profile.role))) {
    window.location.href = "dashboard.html";
    return null;
  }
  if (requiredRole === "approved" && profile && profile.status !== "approved" && !fullStaffRoles.includes(profile.role)) {
    window.location.href = "auth.html?status=" + profile.status;
    return null;
  }
  return { session, profile };
};

window.KR_signOut = async function () {
  await window.sb.auth.signOut();
  window.location.href = "index.html";
};
