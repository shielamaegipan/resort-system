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
  e.waitUntil((async () => {
    await self.registration.showNotification(data.title || 'Resort', {
      body: data.body || '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || '/', category: data.category || null, entityId: data.entityId || null }
    });
    // Tell any open page to refresh its notification count.
    const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    pages.forEach((c) => c.postMessage({ type: 'push-received', category: data.category || null }));
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    if (list[0]) return list[0].focus();
    return self.clients.openWindow(target);
  }));
});

// Background Sync: ask the open page to send the queued offline bookings
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-bookings') {
    e.waitUntil(self.clients.matchAll().then((list) => list.forEach((c) => c.postMessage({ type: 'flush-bookings' }))));
  }
});