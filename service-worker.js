const CACHE_NAME = "xiaokui-todo-v11";
const NO_CACHE_PATHS = [
  "/codex-todolist-html/dictation-review-app/"
];
const APP_ASSETS = [
  "./",
  "./index.html",
  "./todo-list.html",
  "./manifest.webmanifest",
  "./apple-touch-icon.png",
  "./apple-touch-icon-152.png",
  "./apple-touch-icon-167.png",
  "./apple-touch-icon-180.png",
  "./favicon-192.png",
  "./assets/luo-tianyi-poster.jpg",
  "./assets/luo-tianyi-avatar.png",
  "./assets/luo-tianyi-shop.png",
  "./assets/app-icon-192.png",
  "./assets/app-icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (NO_CACHE_PATHS.some((path) => url.pathname.startsWith(path))) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => (
      cached || fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
    ))
  );
});
