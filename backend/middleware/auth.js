const jwt = require('jsonwebtoken');

const SECRET = () => process.env.JWT_SECRET || 'dev-secret-change-me';

function signToken(user) {
  return jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, SECRET(), { expiresIn: '7d' });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET());
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in' });
  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    console.warn('[auth] 401:', req.method, req.originalUrl, '-', err.name, '-', err.message);
    const error = err.name === 'TokenExpiredError'
      ? 'Session expired. Please log in again.'
      : 'Invalid session. Please log in again.';
    res.status(401).json({ error });
  }
}

module.exports = { auth, signToken, verifyToken };