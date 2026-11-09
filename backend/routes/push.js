const router = require('express').Router();
const webpush = require('web-push');
const db = require('../db');
const { auth } = require('../middleware/auth');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.warn('[push] Walang VAPID keys sa .env, naka-disable ang push.');
}

router.get('/public-key', (req, res) => res.json({ key: process.env.VAPID_PUBLIC_KEY || '' }));

router.post('/subscribe', auth, async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys) return res.status(400).json({ error: 'Invalid subscription' });
  await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
    [req.user.id, endpoint, keys.p256dh, keys.auth]
  );
  res.status(201).json({ message: 'Subscribed' });
});

// Magpadala ng push. userIds = array, o null para sa lahat; exceptUserId = hindi isasama
async function notify({ userIds = null, exceptUserId = null, title, body }) {
  if (!process.env.VAPID_PUBLIC_KEY) return;
  let sql = 'SELECT * FROM push_subscriptions WHERE 1=1';
  const params = [];
  if (userIds) { sql += ' AND user_id IN (?)'; params.push(userIds); }
  if (exceptUserId) { sql += ' AND user_id <> ?'; params.push(exceptUserId); }
  const [subs] = await db.query(sql, params);
  const payload = JSON.stringify({ title, body });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410)
          await db.query('DELETE FROM push_subscriptions WHERE id = ?', [s.id]);
      }
    })
  );
}

module.exports = { router, notify };
