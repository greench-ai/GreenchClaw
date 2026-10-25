// GreenchClaw Control – Service Worker
// Handles offline caching and push notifications.

// Bumped whenever sw.js is edited. Kept as a literal so the browser sees a changed
// byte sequence and installs the new worker. This is NOT the HTTP cache key — see
// CACHE_NAME below.
const SW_VERSION = 2;

// Cache key that carries the build's asset manifest hash.
//
// This used to be the hardcoded string "GreenchClaw-control-v1". Because the key
// never changed between builds, a browser that had already precached "./" kept
// serving the OLD index.html while the gateway sent the NEW Content-Security-Policy
// header. The inline <script> hashes in the stale HTML no longer matched the CSP, so
// the browser blocked them and logged:
//   "Executing inline script violates the following Content Security Policy..."
//
// Deriving the key from the current build makes every rebuild land in a fresh cache,
// and the activate handler deletes everything that is not the current key.
const BUILD_ID = self.__GREENCHCLAW_BUILD_ID__ || "dev";
const CACHE_NAME = `GreenchClaw-control-${BUILD_ID}`;

// Minimal app-shell files to precache.
const PRECACHE_URLS = ["./"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        // Drop every previous GreenchClaw cache, including older build-stamped
        // keys and the legacy hardcoded "GreenchClaw-control-v1".
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key.startsWith("GreenchClaw-control-"))
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and cross-origin requests.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Skip non-UI routes — API, RPC, and plugin routes should never be cached.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/rpc") ||
    url.pathname.startsWith("/plugins/")
  ) {
    return;
  }

  // Cache-first for hashed assets; network-first for HTML/other.
  if (url.pathname.includes("/assets/")) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          }),
      ),
    );
  } else {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
  }
});

// --- Web Push ---

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "GreenchClaw", body: event.data.text() };
  }

  const title = data.title || "GreenchClaw";
  const options = {
    body: data.body || "",
    icon: "./apple-touch-icon.png",
    badge: "./favicon-32.png",
    tag: data.tag || "GreenchClaw-notification",
    data: { url: data.url || "./" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "./";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus an existing window if one is open.
      for (const client of clients) {
        if (new URL(client.url).pathname === new URL(targetUrl, self.location.origin).pathname) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
