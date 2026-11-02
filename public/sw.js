const CACHE_NAME = "cvas-shell-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    // Pre-cache the built JS and CSS referenced by the app shell so the first
    // offline launch works after this service worker takes control.
    const response = await cache.match("/index.html");
    if (response) {
      const html = await response.text();
      const assetPaths = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
        .map(match => match[1])
        .filter(path => path.startsWith("/") && !path.startsWith("//"));
      await Promise.allSettled(assetPaths.map(path => cache.add(path)));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("cvas-shell-") && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put("/index.html", fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(request)) || (await caches.match("/index.html")) || Response.error();
      }
    })());
    return;
  }

  if (/\.(?:js|css|png|svg|webmanifest|woff2?)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const fresh = await fetch(request);
        if (fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, fresh.clone());
        }
        return fresh;
      } catch {
        return cached || Response.error();
      }
    })());
  }
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
