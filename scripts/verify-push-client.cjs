// Browser API test doubles; does not claim real push-provider/device delivery.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const backend = createRequire(path.resolve(__dirname, '../backend/package.json'));
const keys = backend('web-push').generateVAPIDKeys();
const source = fs.readFileSync(path.resolve(__dirname, '../frontend/src/push.js'), 'utf8')
  .replace("import { api } from './api.js';", 'const api = globalThis.testApi;')
  .replaceAll('import.meta.env.DEV', 'true')
  .replaceAll('import.meta.env.VITE_VAPID_PUBLIC_KEY', 'undefined')
  .replaceAll('export async function', 'async function')
  + '\nglobalThis.client = {enablePush,ensurePushEnabled,getPushStatus,sendTestPush,disablePushForSession};';

function fixture() {
  const calls = [];
  let subscription = null;
  let permission = 'granted';
  const reg = { pushManager: {
    getSubscription: async () => subscription,
    subscribe: async options => {
      subscription = { endpoint: 'https://push.example.test/this-device', options,
        toJSON: () => ({ endpoint: 'https://push.example.test/this-device', keys: { p256dh: 'public', auth: 'secret' } }),
        unsubscribe: async () => { subscription = null; return true; } };
      return subscription;
    },
  } };
  const worker = { register: async (...args) => { calls.push({ register: args }); return reg; }, ready: Promise.resolve(reg), getRegistration: async () => reg };
  const notification = { get permission() { return permission; }, requestPermission: async () => permission };
  const context = {
    window: { isSecureContext: true, PushManager: {}, Notification: notification, dispatchEvent() {} },
    navigator: { serviceWorker: worker }, Notification: notification,
    Event,
    Uint8Array, atob: text => Buffer.from(text, 'base64').toString('binary'),
    setTimeout: fn => setTimeout(fn, 30), clearTimeout,
    testApi: async (url, options) => {
      calls.push({ url, options });
      if (url === '/push/key') return { publicKey: keys.publicKey };
      if (url === '/push/status') return { configured: true, subscribed: !!subscription };
      return { accepted: true };
    },
  };
  vm.runInNewContext(source, context);
  return { context, calls, reg, worker, client: context.client, setPermission: value => { permission = value; } };
}

async function main() {
  const f = fixture();
  assert.equal((await f.client.getPushStatus()).subscribed, false);
  await assert.rejects(f.client.sendTestPush(), /Enable push/);
  await f.client.enablePush();
  assert.equal(f.calls.find(call => call.register).register[0], '/sw.js?mode=development');
  assert(f.calls.some(call => call.url === '/push/subscribe'));
  assert.equal((await f.client.getPushStatus()).subscribed, true);
  await f.client.sendTestPush();
  assert.equal(f.calls.find(call => call.url === '/push/test').options.body.endpoint, 'https://push.example.test/this-device');
  await f.client.disablePushForSession();
  assert.equal(await f.reg.pushManager.getSubscription(), null);
  assert(f.calls.some(call => call.url === '/push/subscribe' && call.options.method === 'DELETE'));

  const denied = fixture(); denied.setPermission('denied');
  await assert.rejects(denied.client.enablePush(), /permission was not allowed/);
  assert.equal(denied.calls.length, 0);
  const rejected = fixture();
  rejected.reg.pushManager.subscribe = async () => { const error = new Error('Registration failed - permission denied'); error.name = 'AbortError'; throw error; };
  await assert.rejects(rejected.client.enablePush(), /browser could not register/);
  const pending = fixture(); pending.reg.pushManager.subscribe = () => new Promise(() => {});
  await assert.rejects(pending.client.enablePush(), /push service did not respond/);
  const insecure = fixture(); insecure.context.window.isSecureContext = false;
  await assert.rejects(insecure.client.enablePush(), /localhost or HTTPS/);
  console.log('PASS browser subscription lifecycle, device status/test request, logout cleanup, permission rejection, provider denial, timeout, and secure-origin guard');
  const auto = fixture();
  let prompts = 0;
  auto.context.Notification.requestPermission = async () => { prompts++; return 'granted'; };
  assert.equal(await auto.client.ensurePushEnabled(), true);
  assert.equal(prompts, 0, 'Previously granted permission must not prompt again');
  await auto.client.disablePushForSession();
  assert.equal(await auto.client.ensurePushEnabled(), true, 'Login must recreate the subscription after logout cleanup');
  const firstLogin = fixture(); firstLogin.setPermission('default');
  let firstPrompts = 0;
  firstLogin.context.Notification.requestPermission = async () => { firstPrompts++; firstLogin.setPermission('granted'); return 'granted'; };
  assert.equal(await firstLogin.client.ensurePushEnabled(), false, 'Background retry must not prompt for permission');
  await Promise.all([firstLogin.client.ensurePushEnabled({requestPermission:true}),firstLogin.client.ensurePushEnabled({requestPermission:true})]);
  assert.equal(firstPrompts,1,'Concurrent automatic setup must show only one browser permission prompt');
  assert.equal(firstLogin.calls.filter(call=>call.url==='/push/subscribe').length,1,'Concurrent automatic setup must register only once');
  const blocked = fixture(); blocked.setPermission('denied');
  assert.equal(await blocked.client.ensurePushEnabled({requestPermission:true}),false);
  assert.equal(blocked.calls.length,0,'Blocked permission must not trigger registration or requests');
  const unsupported = fixture(); unsupported.context.window.isSecureContext=false;
  assert.equal(await unsupported.client.ensurePushEnabled({requestPermission:true}),false);
  console.log('PASS automatic first-login permission flow, silent restoration after Allow, resubscription after logout, concurrent setup deduplication, and blocked/unsupported guards');

}
main().catch(error => { console.error(error); process.exitCode = 1; });
