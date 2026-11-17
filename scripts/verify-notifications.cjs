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
  const router = { get() {}, post() {}, delete() {} };
  const context = {
    module: { exports: {} }, process: { env: { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey } },
    console: { warn: (...args) => warnings.push(args) },
    require(name) {
      if (name === 'express') return { Router: () => router };
      if (name === '../middleware/auth') return { auth() {} };
      if (name === '../db') return { query: async (sql, params) => {
        queries.push({ sql, params });
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

  const shown = [];
  const worker = { self: {
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
}
main().catch(error => { console.error(error); process.exitCode = 1; });
