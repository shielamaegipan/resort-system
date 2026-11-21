// Service worker: offline shell, push notifications, background sync
self.addEventListener('install', (e) => { e.waitUntil(caches.open('resort-v1').then((c) => c.add('/')).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  if (new URL(self.location.href).searchParams.get('mode') === 'development') return;
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
  try { const payload = e.data.json(); if (payload && typeof payload === 'object') data = { ...data, ...payload }; } catch {}
  e.waitUntil(self.registration.showNotification(data.title || 'Resort', { body: data.body, icon: '/icon.svg', badge: '/icon.svg', tag: data.tag, data: { url: data.url || '/' } }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const target = new URL('/?notifications=1', self.location.origin);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find(window => new URL(window.url).origin === target.origin);
    if (client) {
      client.postMessage({ type: 'open-notifications' });
      return client.focus();
    }
    return self.clients.openWindow(target.href);
  })());
});

// Background Sync: ask the open page to send the queued offline bookings
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-bookings') {
    e.waitUntil(self.clients.matchAll().then((list) => list.forEach((c) => c.postMessage({ type: 'flush-bookings' }))));
  }
});
