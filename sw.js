// KenRho Park Tennis Club — service worker
// Bump this version whenever any cached file changes, so old caches are
// dropped and clients pick up the new files.
const CACHE_NAME = "kenrho-shell-v4";

const SHELL_FILES = [
  "index.html",
  "auth.html",
  "dashboard.html",
  "admin.html",
  "offline.html",
  "css/styles.css",
  "js/supabaseClient.js",
  "js/site.js",
  "js/auth.js",
  "js/member.js",
  "js/admin.js",
  "js/invoice.js",
  "js/read-aloud.js",
  "js/pwa.js",
  "assets/logo.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isStaticShellRequest(url) {
  // Only ever cache same-origin, GET requests for the app shell itself.
  // Supabase calls, fonts, CDN scripts and anything else always go to the
  // network untouched — this app's data is never served from cache.
  return url.origin === self.location.origin;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never intercept writes
  const url = new URL(req.url);
  if (!isStaticShellRequest(url)) return; // let Supabase/CDN calls hit the network directly

  // Config holds environment-specific values (Supabase URL/key) that can
  // change after the app is already installed — never even fall back to cache.
  if (url.pathname.endsWith("/js/config.js")) {
    event.respondWith(fetch(req));
    return;
  }

  // Network-first for EVERYTHING in the shell (HTML, JS, CSS, images alike).
  // A stale cached copy of app code is far more dangerous for a live club
  // management app (silently showing old behaviour) than the minor latency
  // cost of checking the network first. The cache is purely a fallback for
  // when there's no connection at all — never the default source.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
            return caches.match("offline.html");
          }
          return Response.error();
        })
      )
  );
});
