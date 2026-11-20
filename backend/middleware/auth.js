const jwt = require('jsonwebtoken');

const SECRET = () => { if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be configured'); return process.env.JWT_SECRET; };

function signToken(user) {
  return jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role, version: user.token_version || 0 }, SECRET(), { expiresIn: '8h' });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET());
}

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in' });
  try { req.user=verifyToken(token); } catch { return res.status(401).json({error:'Session expired. Please log in again.'}); }
  try {
    const [[user]] = await require('../db').query('SELECT id,name,email,role,permission_role,token_version FROM users WHERE id=? AND deleted_at IS NULL', [req.user.id]);
    if (!user) return res.status(401).json({ error: 'This account is inactive. Please contact the administrator.' });
    if ((req.user.version || 0) !== user.token_version) return res.status(401).json({ error: 'Access changed. Please log in again.' });
    req.user = user;
    next();
  } catch(error) { next(error); }
}

module.exports = { auth, signToken, verifyToken };