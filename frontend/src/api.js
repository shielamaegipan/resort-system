import { openDB } from 'idb';

export const getToken = () => localStorage.getItem('token');

export async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'May error');
  return data;
}

// ---------- Offline outbox (IndexedDB) ----------
const dbPromise = openDB('pwa-db', 1, {
  upgrade(db) {
    db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
  },
});

export async function createItemOfflineAware(item) {
  if (navigator.onLine) {
    try {
      await api('/items', { method: 'POST', body: item });
      return { queued: false };
    } catch (err) {
      if (!(err instanceof TypeError)) throw err; // network error lang ang i-queue
    }
  }
  const db = await dbPromise;
  await db.add('outbox', { url: '/api/items', method: 'POST', body: item, token: getToken() });
  const reg = await navigator.serviceWorker.ready;
  if ('sync' in reg) await reg.sync.register('sync-items');
  return { queued: true };
}

export async function pendingCount() {
  return (await dbPromise).count('outbox');
}
