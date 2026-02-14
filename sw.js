const CACHE_NAME = "baccarat-main-only-v29";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js?ver=v29",
  "./favicon.ico",
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
  event.respondWith((async ()=>{
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try{
      const res = await fetch(event.request);
      return res;
    }catch{
      // offline fallback
      return caches.match("./index.html");
    }
  })());
});
