/* lemon Service Worker — GitHub Pages のサブパスでも動くよう相対解決のみ使う */
const VERSION = 'etan-v8';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/csv.js',
  './js/srs.js',
  './js/store.js',
  './js/app.js',
  './data/manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // data/*.csv はネットワーク優先(更新しやすく)、失敗時はキャッシュ
  if (url.pathname.endsWith('.csv')) {
    e.respondWith(fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(request, copy));
      return res;
    }).catch(() => caches.match(request)));
    return;
  }
  e.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => {
    const copy = res.clone();
    caches.open(VERSION).then((c) => c.put(request, copy));
    return res;
  }).catch(() => caches.match('./index.html'))));
});

// 通知タップでアプリを開く/前面に出す
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    if (clients.openWindow) return clients.openWindow('./');
  }));
});
