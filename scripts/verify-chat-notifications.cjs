const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const users = [
  { id: 1, role: 'guest' }, { id: 2, role: 'admin', permission_role: 'super_admin' },
  { id: 3, role: 'admin' }, { id: 4, role: 'staff', permission_role: 'receptionist' },
  { id: 5, role: 'staff', permission_role: 'housekeeping' }, { id: 6, role: 'guest' },
];
const permissionsModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../backend/lib/permissions.js'), 'utf8'), {
  module: permissionsModule, require: () => ({}),
});
const { canChat } = permissionsModule.exports;
assert.deepEqual(users.filter(canChat).map(u => u.id), [1, 2, 3, 4, 6]);
const inbox = [], pushes = [], moduleFixture = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../backend/lib/realtime.js'), 'utf8'), {
  module: moduleFixture, console,
  require(name) {
    if (name === 'crypto') return require('node:crypto');
    if (name === './permissions') return { canChat };
    if (name === '../middleware/auth') return {};
    if (name === '../routes/push') return { notify: async payload => pushes.push(payload) };
    if (name === '../db') return { query: async (sql, params) => {
      if (sql.startsWith('SELECT')) return [users.filter(u => u.id !== params[0])];
      inbox.push(params); return [{ affectedRows: 1 }];
    } };
    throw Error(name);
  },
});
(async () => {
  await moduleFixture.exports.publishChat(users[0], 'Guest booking question', 50);
  assert.deepEqual(inbox.map(row => row[1]), [2, 3, 4, 6]);
  assert.deepEqual(Array.from(pushes[0].userIds), [2, 3, 4, 6]);
  inbox.length = 0;
  await moduleFixture.exports.publishChat(users[2], 'Admin reply', 51);
  assert.deepEqual(inbox.map(row => row[1]), [1, 2, 4, 6]);
  assert.deepEqual(Array.from(pushes[1].userIds), [1, 2, 4, 6]);
  console.log('PASS guest/admin chat inbox and push recipients, sender exclusion, and housekeeping exclusion');
})().catch(error => { console.error(error); process.exitCode = 1; });
