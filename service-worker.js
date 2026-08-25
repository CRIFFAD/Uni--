/* ============================================================
   Summit Hub — service worker.
   Caches the app shell for fast/offline loads. Supabase, R2, and
   the esm.sh CDN import always go straight to the network — never
   cached, so data is always live.
   ============================================================ */

const CACHE_VERSION = 'v7';
const CACHE_NAME = `summit-hub-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  'index.html',
  'news.html',
  'events.html',
  'media.html',
  'article.html',
  'compose.html',
  'profile.html',
  'market.html',
  'listing.html',
  'auth.html',
  'post.html',
  'dashboard.html',
  'chat.html',
  'offline.html',
  'css/style.css',
  'js/nav.js',
  'js/notifications.js',
  'js/supabase.js',
  'js/supabase-config.js',
  'js/r2-config.js',
  'js/image-utils.js',
  'manifest.json',
  'assets/logo.png',
  'assets/icon-192.png',
  'assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const id = event.notification.data && event.notification.data.id;
  const url = id ? `article.html?id=${id}` : 'index.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients){
        if (client.url.includes(self.location.origin) && 'focus' in client){
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET' || url.origin !== self.location.origin){
    return;
  }

  if (req.mode === 'navigate'){
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('offline.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
