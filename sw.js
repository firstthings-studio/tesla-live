// Offline start-up for the Tesla live page.
// Network first, so a new upload is always picked up when there is signal; the saved copy is used only when the network fails.
// Only this site's own files are handled. The relay, Teslemetry, map tiles and the CDN all go straight to the network and are never stored.
const CACHE = "tesla-live-v2";
const SHELL = ["./", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  // each file on its own, so one missing file can't leave the whole cache empty
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  const isPage = req.mode === "navigate";
  const key = isPage ? "./" : req; // every visit to the page (with any ?query) shares one saved copy
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
      return res;
    }).catch(() => caches.match(key).then(hit => hit || Response.error()))
  );
});
