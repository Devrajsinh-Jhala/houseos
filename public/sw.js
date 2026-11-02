// Build-time markers are replaced by scripts/precache.mjs after Vite finishes.
// A version is installable only after its complete shell has been downloaded.
const BUILD_ID = "__HOUSEOS_BUILD_ID__";
const PRECACHE_PATHS = ["__HOUSEOS_PRECACHE__"];
const PREFIX = `houseos-shell:${self.registration.scope}:`;
const CACHE = `${PREFIX}${BUILD_ID}`;
const SHELL_URL = new URL("index.html", self.registration.scope).href;
const PRECACHE_URLS = PRECACHE_PATHS.map((path) => new URL(path, self.registration.scope).href);
const PRECACHED_PATHS = new Set(PRECACHE_URLS.map((url) => new URL(url).pathname));

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      // addAll rejects failed HTTP responses and commits the batch together.
      await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: "reload", credentials: "same-origin" })));
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) =>
      (key.startsWith(PREFIX) && key !== CACHE) ||
      (key === "houseos-v1" && new URL(self.registration.scope).pathname === "/")
    ).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Readiness is confirmed from cached resources, rather than inferred from the
// network connection or from registration merely returning successfully.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "HOUSEOS_OFFLINE_STATUS" || !event.ports[0]) return;
  const port = event.ports[0];
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      const resources = await Promise.all(PRECACHE_URLS.map((url) => cache.match(url, { ignoreVary: true })));
      port.postMessage({ type: "HOUSEOS_OFFLINE_STATUS", ready: resources.every(Boolean), buildId: BUILD_ID });
    } catch {
      port.postMessage({ type: "HOUSEOS_OFFLINE_STATUS", ready: false, buildId: BUILD_ID });
    }
  })());
});

function offlineResponse() {
  return new Response("HouseOS couldn't load this resource. Reconnect and open the app again.", {
    status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (request.method !== "GET" || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const shell = await cache.match(SHELL_URL, { ignoreVary: true });
      // Keep HTML and its hashed assets on the same fully cached build. The
      // browser checks sw.js for updates; an installed update serves next open.
      if (shell) return shell;
      try {
        const response = await fetch(request);
        return response.ok ? response : offlineResponse();
      } catch { return offlineResponse(); }
    })());
    return;
  }

  // Do not capture API traffic or unrelated same-origin resources.
  if (!PRECACHED_PATHS.has(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // These are only this build's declared static files. Vite and some hosts
    // add Vary: Origin; module requests carry a different Origin header from
    // precache requests even though the hashed asset is exactly the same.
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return hit;
    try {
      const response = await fetch(request);
      if (response.ok && response.type !== "opaque") {
        try { await cache.put(request, response.clone()); } catch { /* Quota failure must not discard a good network response. */ }
      }
      return response;
    } catch { return offlineResponse(); }
  })());
});
