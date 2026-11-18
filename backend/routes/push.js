const express = require('express');
const webpush = require('web-push');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
let enabled = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:you@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    enabled = true;
  } catch (e) {
    // A bad key must not stop the whole server
    console.warn('VAPID keys are invalid, push notifications are disabled:', e.message);
  }
} else {
  console.warn('VAPID keys missing: push notifications are disabled');
}

router.get('/key', (req, res) => res.json({ publicKey: enabled ? VAPID_PUBLIC_KEY : '' }));

router.post('/subscribe', auth, async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: 'Invalid subscription' });
  await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
    [req.user.id, endpoint, keys.p256dh, keys.auth]
  );
  res.json({ ok: true });
});

// Send a push to devices. Optional `roles` / `userIds` limit who receives it.
// The payload carries enough for the service worker to show a useful, clickable alert.
async function notify({ exceptUserId, roles, userIds, title, body, category, entityId, url, audience }) {
  const result = { sent: 0, failed: 0, subscriptions: 0 };
  if (!enabled) return result;
  let sql = `SELECT ps.* FROM push_subscriptions ps JOIN users u ON u.id = ps.user_id
             WHERE u.deleted_at IS NULL AND ps.user_id <> ?`;
  const params = [exceptUserId || 0];
  if (roles && roles.length) { sql += ` AND u.role IN (${roles.map(() => '?').join(',')})`; params.push(...roles); }
  if (Array.isArray(userIds)) {
    if (!userIds.length) return result;
    sql += ` AND ps.user_id IN (${userIds.map(() => '?').join(',')})`; params.push(...userIds);
  }
  const [subs] = await db.query(sql, params);
  result.subscriptions = subs.length;
  const payload = JSON.stringify({
    title, body: String(body || '').slice(0, 300),
    category: category || null, entityId: entityId || null, audience: audience || 'admin',
    url: url || '/', tag: category && entityId ? `${category}-${entityId}` : undefined
  });
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 60 * 60 * 24, urgency: 'high' }
      );
      result.sent++;
    } catch (e) {
      result.failed++;
      if (e.statusCode === 404 || e.statusCode === 410) {
        await db.query('DELETE FROM push_subscriptions WHERE id = ?', [s.id]); // device unsubscribed
      } else {
        // Do not hide delivery problems: 401/403 = bad VAPID key or subject, 413 = payload too large.
        console.warn(`Push failed for user ${s.user_id} (${e.statusCode || e.code || 'error'}): ${e.body || e.message}`);
      }
    }
  }));
  return result;
}

// Sends a test alert to the logged-in user's own devices, to check the device setup.
router.post('/test', auth, async (req, res) => {
  if (!enabled) return res.status(503).json({ error: 'Push is disabled: check VAPID keys in backend/.env' });
  const result = await notify({ userIds: [req.user.id], title: 'Test notification', body: 'Device notifications are working.', category: 'test', audience: req.user.role === 'guest' ? 'guest' : 'admin' });
  res.json(result);
});

module.exports = { router, notify };