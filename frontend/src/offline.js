import { openDB } from 'idb';
import { api } from './api';

const getDb = () =>
  openDB('resort', 1, {
    upgrade(d) {
      d.createObjectStore('queue', { keyPath: 'localId', autoIncrement: true });
    },
  });

export async function queueBooking(booking) {
  const db = await getDb();
  await db.add('queue', booking);
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register('sync-bookings');
  } catch {} // hindi lahat ng browser may Background Sync; may 'online' fallback sa App
}

export const getQueue = async () => (await getDb()).getAll('queue');

// Ipadala ang mga naka-pila. Ibinabalik: { synced, failed }
export async function flushQueue() {
  const db = await getDb();
  const items = await db.getAll('queue');
  let synced = 0, failed = 0;
  for (const item of items) {
    const { localId, ...body } = item;
    try {
      await api('/bookings', { method: 'POST', body });
      await db.delete('queue', localId);
      synced++;
    } catch (e) {
      if (e.status && e.status < 500) { await db.delete('queue', localId); failed++; } // tinanggihan ng server
      else break; // network pa rin ang problema; subukan ulit mamaya
    }
  }
  return { synced, failed };
}
