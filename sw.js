/**
 * Service Worker
 * 通常学習は完全オフラインで動作させるため、アプリシェルをキャッシュファーストで配信する。
 * AI通信（Gemini API）はキャッシュ対象外とし、常にネットワークへ通す。
 */

const CACHE_NAME = "vocab-pwa-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/fsrs.js",
  "./js/db.js",
  "./js/settings.js",
  "./js/ai.js",
  "./js/ui.js",
  "./js/import.js",
  "./data/sample-deck.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
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

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Gemini APIなど外部AI通信は素通しする（キャッシュしない）
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok && event.request.method === "GET") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
