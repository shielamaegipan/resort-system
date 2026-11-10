import { api } from './api.js';

const toKey = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Notifications are not supported on this browser');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission was not allowed');
  const { publicKey } = await api('/push/key');
  const key = publicKey || import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!key) throw new Error('VAPID public key is not set on the server');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
  await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
}
