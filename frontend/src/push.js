import { api } from './api.js';

let pendingSetup;
let setupError = '';

export async function enablePush() {
  if (pendingSetup) return pendingSetup;
  setupError = '';
  pendingSetup = registerPush();
  try { return await pendingSetup; }
  catch (error) { setupError = error.message; throw error; }
  finally {
    pendingSetup = null;
    window.dispatchEvent(new Event('resort:push-changed'));
  }
}

export async function ensurePushEnabled({ requestPermission = false } = {}) {
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
  if (Notification.permission === 'denied') return false;
  if (Notification.permission !== 'granted' && !requestPermission) return false;
  await enablePush();
  return true;
}

const toKey = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

async function registerPush() {
  if (!window.isSecureContext) throw new Error('Use localhost or HTTPS to enable notifications');
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Notifications are not supported on this browser');
  const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (perm !== 'granted') throw new Error('Notification permission was not allowed');
  const { publicKey } = await api('/push/key');
  const key = publicKey || import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!key) throw new Error('VAPID public key is not set on the server');
  await navigator.serviceWorker.register(import.meta.env.DEV ? '/sw.js?mode=development' : '/sw.js', { updateViaCache: 'none' });
  let timer;
  let reg;
  try { reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Notification setup timed out. Reload and try again.')), 10000); })]); }
  finally { clearTimeout(timer); }
  let sub = await reg.pushManager.getSubscription();
  const applicationServerKey = toKey(key);
  if (sub?.options.applicationServerKey && String(new Uint8Array(sub.options.applicationServerKey)) !== String(applicationServerKey)) {
    await sub.unsubscribe(); sub = null;
  }
  if (!sub) {
    let subscriptionTimer;
    try {
      sub = await Promise.race([
        reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }),
        new Promise((_, reject) => { subscriptionTimer = setTimeout(() => reject(new Error('The browser push service did not respond. Check your connection and try again.')), 20000); }),
      ]);
    } catch (error) {
      if (error.name === 'NotAllowedError' || /permission denied/i.test(error.message)) throw new Error('The browser could not register this device for push. Check site notification permissions and your browser or operating-system notification settings.');
      throw error;
    } finally { clearTimeout(subscriptionTimer); }
  }
  await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
}

export async function getPushStatus() {
  const supported = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) return { supported: false, subscribed: false, configured: false };
  const reg = await navigator.serviceWorker.getRegistration();
  const subscription = await reg?.pushManager?.getSubscription();
  const status = await api('/push/status', { method: 'POST', body: { endpoint: subscription?.endpoint } });
  return { ...status, supported: true, permission: Notification.permission, subscribed: !!subscription && status.subscribed, setupError };
}

export async function sendTestPush() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const subscription = await reg?.pushManager?.getSubscription();
  if (!subscription) throw new Error('Enable push notifications on this device first');
  return api('/push/test', { method: 'POST', body: { endpoint: subscription.endpoint } });
}

export async function disablePushForSession() {
  // Finish any subscription setup before invalidating it, so a late setup
  // cannot re-enable notifications after this account logs out.
  if (pendingSetup) { try { await pendingSetup; } catch {} }
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager?.getSubscription();
  if (sub) {
    await sub.unsubscribe();
    // An expired session or offline API must not keep a user signed in after
    // their browser subscription has already been invalidated.
    try { await api('/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } }); } catch {}
  }
}
