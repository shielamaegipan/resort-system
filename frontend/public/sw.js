// Service Worker: app-shell cache, offline GET items, Background Sync, Push
const CACHE = 'resort-system-v1';
const SHELL = ['/', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/socket.io')) return;

  // Network-first: items API at app pages, may fallback sa cache pag offline
  const cacheable = url.pathname === '/api/items' || !url.pathname.startsWith('/api/');
  if (!cacheable) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/')))
  );
});

// ---- IndexedDB (outbox) ----
function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('pwa-db', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
const tx = (db, mode) => db.transaction('outbox', mode).objectStore('outbox');
const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

async function flushOutbox() {
  const db = await openDB();
  const all = await req2p(tx(db, 'readonly').getAll());
  for (const job of all) {
    const res = await fetch(job.url, {
      method: job.method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${job.token}` },
      body: JSON.stringify(job.body),
    });
    // Tanggalin sa outbox kapag success o kapag client error (hindi na mare-retry)
    if (res.ok || (res.status >= 400 && res.status < 500)) {
      await req2p(tx(db, 'readwrite').delete(job.id));
    } else {
      throw new Error('Server error, retry later');
    }
  }
  const clients = await self.clients.matchAll();
  clients.forEach((c) => c.postMessage({ type: 'synced' }));
}

// Background Sync
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-items') e.waitUntil(flushOutbox());
});

// Push Notification
self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : { title: 'Resort System', body: '' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.svg',
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow('/'));
});
