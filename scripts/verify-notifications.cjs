// Local delivery logic tests: no real browser or external recipient is notified.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const backend = createRequire(path.resolve(__dirname, '../backend/package.json'));

async function main() {
  const keys = backend('web-push').generateVAPIDKeys();
  const sends = [], queries = [], warnings = [], handlers = {};
  const subscriptions = [
    { id: 1, endpoint: 'https://push.example.test/live', p256dh: 'public', auth: 'secret' },
    { id: 2, endpoint: 'https://push.example.test/expired', p256dh: 'public', auth: 'secret' },
  ];
  const routes = {};
  const router = { get() {}, post: (name, ...handlers) => { routes[name] = handlers.at(-1); }, delete() {} };
  const context = {
    module: { exports: {} }, process: { env: { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey } },
    console: { warn: (...args) => warnings.push(args) },
    require(name) {
      if (name === 'express') return { Router: () => router };
      if (name === '../middleware/auth') return { auth() {} };
      if (name === '../db') return { query: async (sql, params) => {
        queries.push({ sql, params });
        if (sql.startsWith('SELECT COUNT')) return [[{ subscriptions: params[0] === 7 && params[1] === subscriptions[0].endpoint ? 1 : 0 }]];
        if (sql.startsWith('SELECT * FROM push_subscriptions WHERE user_id')) return [params[0] === 7 && params[1] === subscriptions[0].endpoint ? [subscriptions[0]] : params[0] === 8 && params[1] === subscriptions[1].endpoint ? [subscriptions[1]] : []];
        return sql.startsWith('SELECT') ? [subscriptions] : [{ affectedRows: 1 }];
      } };
      if (name === 'web-push') return {
        setVapidDetails: (...args) => backend('web-push').setVapidDetails(...args),
        sendNotification: async (...args) => {
          sends.push(args);
          if (args[0].endpoint.endsWith('/expired')) throw { statusCode: 410 };
        },
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../backend/routes/push.js'), 'utf8'), context);
  await context.module.exports.notify({ userIds: [7], title: 'Booking confirmed', body: 'Your stay is confirmed', tag: 'event-1' });
  assert.match(queries[0].sql, /ps\.user_id IN \(\?\)/);
  assert.deepEqual(Array.from(queries[0].params), [0, 7]);
  assert.equal(sends.length, 2);
  assert.equal(sends[0][2].timeout, 5000);
  assert.equal(JSON.parse(sends[0][1]).tag, 'event-1');
  assert(queries.some(query => query.sql.startsWith('DELETE') && query.params[0] === 2));
  await context.module.exports.notify({ userIds: [], title: 'Nobody', body: 'No delivery' });
  assert.equal(sends.length, 2, 'Empty recipient list must not broadcast');
  assert.equal(warnings.length, 0);
  console.log('PASS scoped push recipients, empty-recipient isolation, payload tags, timeout, and expired-subscription removal');
  const request = async (route, userId, endpoint) => {
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await routes[route]({ user: { id: userId }, body: { endpoint } }, response);
    return response;
  };
  assert.equal((await request('/status', 7, subscriptions[0].endpoint)).body.subscribed, true);
  assert.equal((await request('/status', 99, subscriptions[0].endpoint)).body.subscribed, false);
  assert.equal((await request('/test', 99, subscriptions[0].endpoint)).statusCode, 404);
  assert.equal(sends.length, 2, 'Another user must not send a test to this endpoint');
  const accepted = await request('/test', 7, subscriptions[0].endpoint);
  assert.equal(accepted.statusCode, 202);
  assert.equal(accepted.body.accepted, true);
  assert.equal(sends.length, 3);
  assert.equal(JSON.parse(sends.at(-1)[1]).url, '/?notifications=1');
  assert.equal((await request('/test', 7, subscriptions[0].endpoint)).statusCode, 429);
  assert.equal((await request('/test', 8, subscriptions[1].endpoint)).statusCode, 410);
  assert(queries.some(query => query.sql === 'DELETE FROM push_subscriptions WHERE id=? AND user_id=?' && query.params[0] === 2 && query.params[1] === 8));
  console.log('PASS per-device push status, test acceptance, owner isolation, rate limit, and expired test subscription');


  const shown = [];
  const worker = { URL, self: {
    location: { origin: 'https://resort.example.test', href: 'https://resort.example.test/sw.js' },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    registration: { showNotification: async (...args) => shown.push(args) },
  } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../frontend/public/sw.js'), 'utf8'), worker);
  let completed;
  handlers.push({ data: { json: () => ({ title: 'Confirmed', body: 'Room ready', tag: 'event-2', url: '/' }) }, waitUntil: promise => { completed = promise; } });
  await completed;
  assert.equal(shown[0][0], 'Confirmed');
  assert.equal(shown[0][1].body, 'Room ready');
  assert.equal(shown[0][1].tag, 'event-2');
  assert.equal(shown[0][1].data.url, '/');
  handlers.push({ data: { json: () => { throw Error('Malformed payload'); } }, waitUntil: promise => { completed = promise; } });
  await completed;
  assert.equal(shown[1][0], 'Resort');
  console.log('PASS Service Worker notification display, event tagging, and malformed-payload fallback');
  let focused = 0, target, clicked, closed = 0;
  worker.self.clients = { matchAll: async () => [{url:'https://resort.example.test/',postMessage: data => { clicked=data; },focus: async () => { focused++; }}],openWindow: async url => {target=url;} };
  handlers.notificationclick({notification:{close:()=>closed++},waitUntil:promise=>{completed=promise;}});
  await completed;
  assert.equal(focused,1);assert.equal(clicked.type,'open-notifications');assert.equal(closed,1);
  worker.self.clients.matchAll=async()=>[];
  handlers.notificationclick({notification:{close(){}},waitUntil:promise=>{completed=promise;}});
  await completed;assert.equal(target,'https://resort.example.test/?notifications=1');
  worker.self.location.href='https://resort.example.test/sw.js?mode=development';
  let intercepted=false;
  handlers.fetch({respondWith(){intercepted=true;}});
  assert.equal(intercepted,false,'Development worker must not cache Vite requests');
  console.log('PASS push click focuses existing app or opens inbox link; dev worker bypasses caching');

}
main().catch(error => { console.error(error); process.exitCode = 1; });
