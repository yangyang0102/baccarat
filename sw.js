const CACHE_NAME = "baccarat-main-only-v14";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./engine.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async ()=>{
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k===CACHE_NAME)? null : caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Network-first for HTML (avoid stale UI after deploy), cache-first for others.
  const isHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html") || url.pathname.endsWith("/index.html");

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    if (isHTML) {
      try {
        const fresh = await fetch(req);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match("./index.html");
        return cached || Response.error();
      }
    }

    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      // Optionally cache same-origin GETs
      if (req.method === "GET" && url.origin === self.location.origin) {
        cache.put(req, res.clone());
      }
      return res;
    } catch (e) {
      return caches.match("./index.html");
    }
  })());
});

