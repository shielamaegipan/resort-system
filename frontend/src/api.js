import { queueBooking, pendingBookings, removePending } from './db.js';

const KEY = 'resort_token';
export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

// Safety net: make sure every call to /api carries the login token,
// even if a page calls fetch() directly instead of using api().
if (typeof window !== 'undefined' && !window.__resortFetchPatched) {
  window.__resortFetchPatched = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input && input.url;
      if (url && url.startsWith('/api/') && getToken()) {
        const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
        const current = headers.get('Authorization') || '';
        if (!/^Bearer\s+[\w-]+\.[\w-]+\.[\w-]+$/.test(current)) {
          headers.set('Authorization', 'Bearer ' + getToken());
          init = { ...init, headers };
        }
      }
    } catch {}
    return nativeFetch(input, init);
  };
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const e = new Error((data && data.error) || 'Request failed');
    e.status = res.status;
    throw e;
  }
  return data;
}

// Create a booking; if offline, keep it in IndexedDB and sync later.
export async function createBooking(booking) {
  try {
    return { booking: await api('/bookings', { method: 'POST', body: booking }), queued: false };
  } catch (e) {
    if (e.status) throw e; // server answered with an error
    await queueBooking(booking);
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg.sync) reg.sync.register('sync-bookings').catch(() => {});
    }
    return { booking: null, queued: true };
  }
}

export async function flushPending() {
  let sent = 0; let rejected = 0; let reason = '';
  for (const b of await pendingBookings()) {
    const { localId, ...payload } = b;
    try {
      await api('/bookings', { method: 'POST', body: payload });
      await removePending(localId);
      sent++;
    } catch (e) {
      if (e.status === 401 || e.status === 408 || e.status === 429 || e.status >= 500) break; else if (e.status) { await removePending(localId); rejected++; reason = e.message; } // 4xx: declined by the server (e.g. dates taken)
      else break; // still offline
    }
  }
  flushPending.rejected = rejected; flushPending.reason = reason; return sent;
}