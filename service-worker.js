/* =========================================================
 * Flipping Tycoon: Gadget Broker — Service Worker (Part 14)
 *
 * Strategy:
 *   - On install: precache the app shell (HTML/CSS/JS/icons/manifest)
 *   - On fetch:
 *       * Same-origin GET requests   -> cache-first, fall back to network
 *       * External CDN GET requests  -> stale-while-revalidate
 *       * Anything else              -> straight to network
 *   - On activate: drop old caches
 *
 * Bump CACHE_VERSION whenever the precache list changes so old
 * clients pick up the new app shell on next launch.
 * ========================================================= */

const CACHE_VERSION = "ft-cache-v10";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./icon.svg",
  "./icon-maskable.svg",
  "./script.js",
  "./gadgets.js",
  "./market.js",
  "./banking.js",
  "./repair.js",
  "./selling.js",
  "./inventory.js",
  "./realestate.js",
  "./batam.js",
  "./accessories.js",
  "./notifications.js",
  "./friends.js",
  "./analytics.js",
  "./warehouse.js",
  "./wholesale.js",
  "./partnerships.js",
  "./fjb.js",
  "./reputation.js",
  "./whatsapp.js",
  "./staff.js",
  "./profile.js",
  "./messenger.js",
  "./chat.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll(APP_SHELL).catch((err) => {
        // Don't fail the install if a single optional asset is missing
        console.warn("[SW] partial precache:", err);
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // Cache-first for app shell, fall back to network, then cache the response
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === "basic") {
              const copy = res.clone();
              caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => caches.match("./index.html"));
      })
    );
    return;
  }

  // External (CDN) GET — stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    )
  );
});
