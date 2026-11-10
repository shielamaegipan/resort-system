import { openDB } from 'idb';

const dbp = openDB('resort', 1, {
  upgrade(db) {
    db.createObjectStore('pending', { keyPath: 'localId', autoIncrement: true });
    db.createObjectStore('cache');
  },
});

export const queueBooking = async (b) => (await dbp).add('pending', b);
export const pendingBookings = async () => (await dbp).getAll('pending');
export const removePending = async (id) => (await dbp).delete('pending', id);
export const cacheSet = async (k, v) => (await dbp).put('cache', v, k);
export const cacheGet = async (k) => (await dbp).get('cache', k);
