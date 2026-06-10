// Spotter service worker — deliberately minimal and safe.
//
// Strategy:
//   - Static assets (CSS, JS, icons, data) → stale-while-revalidate
//   - HTML pages, /api/*, and everything cross-origin → NOT intercepted
//     (always live from the network, so spot data is never stale and a
//     buggy cache can never break navigation)
//
// If you ever need to force-refresh everyone's cache, bump CACHE_NAME.

const CACHE_NAME = "spotter-static-v1";

const PRECACHE = [
  "/css/style.css",
  "/js/toast.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever touch same-origin GET requests
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Only cache known static paths — let everything else hit the network
  const isStatic =
    url.pathname.startsWith("/css/") ||
    url.pathname.startsWith("/js/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/data/") ||
    url.pathname === "/manifest.json";

  if (!isStatic) return;

  // Stale-while-revalidate: serve from cache instantly, refresh in background
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});