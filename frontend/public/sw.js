// Service worker: offline shell, push notifications, background sync
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;
  if (url.pathname.startsWith('/@') || url.pathname.startsWith('/src/') || url.pathname.startsWith('/node_modules/')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        if (res.ok) e.waitUntil(caches.open('resort-v1').then((c) => c.put(req, copy)));
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? await caches.match('/') : null) || Response.error())
  );
});

self.addEventListener('push', (e) => {
  let data = { title: 'Resort', body: '' };
  try { data = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(data.title || 'Resort', { body: data.body, icon: '/icon.svg', badge: '/icon.svg', tag: data.tag, data: { url: data.url || '/' } }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow('/'))));
});

// Background Sync: ask the open page to send the queued offline bookings
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-bookings') {
    e.waitUntil(self.clients.matchAll().then((list) => list.forEach((c) => c.postMessage({ type: 'flush-bookings' }))));
  }
});
