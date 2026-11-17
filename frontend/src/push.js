import { api } from './api.js';

const toKey = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export async function enablePush() {
  if (!window.isSecureContext) throw new Error('Use localhost or HTTPS to enable notifications');
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Notifications are not supported on this browser');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission was not allowed');
  const { publicKey } = await api('/push/key');
  const key = publicKey || import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!key) throw new Error('VAPID public key is not set on the server');
  await navigator.serviceWorker.register('/sw.js');
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Notification setup timed out. Reload and try again.')), 10000))]);
  let sub = await reg.pushManager.getSubscription();
  const applicationServerKey = toKey(key);
  if (sub?.options.applicationServerKey && String(new Uint8Array(sub.options.applicationServerKey)) !== String(applicationServerKey)) {
    await sub.unsubscribe(); sub = null;
  }
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
}

export async function disablePushForSession() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager?.getSubscription();
  if (sub) {
    await sub.unsubscribe();
    // An expired session or offline API must not keep a user signed in after
    // their browser subscription has already been invalidated.
    try { await api('/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } }); } catch {}
  }
}
