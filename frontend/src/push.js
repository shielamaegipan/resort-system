import { api } from './api.js';

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window))
    throw new Error('Hindi suportado ng browser ang push');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Hindi pinayagan ang notifications');

  const { key } = await api('/push/public-key');
  const publicKey = key || import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error('Walang VAPID public key');

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
  await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
}
