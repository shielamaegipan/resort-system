require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const db = require('./db');
const { auth, verifyToken } = require('./middleware/auth');
const { router: pushRouter, notify } = require('./routes/push');

const app = express();
const server = http.createServer(app);
const origin = process.env.CLIENT_ORIGIN || '*';

app.use(cors({ origin }));
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/items', require('./routes/items'));
app.use('/api/push', pushRouter);

// Chat history
app.get('/api/messages', auth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT m.id, m.content, m.created_at, m.sender_id, u.name AS sender_name
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.room = 'general' ORDER BY m.id DESC LIMIT 50`
  );
  res.json(rows.reverse());
});

// WebSocket real-time chat
const io = new Server(server, { cors: { origin } });

io.use((socket, next) => {
  try {
    socket.user = verifyToken(socket.handshake.auth.token);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  socket.on('chat:send', async (content) => {
    const text = String(content || '').trim();
    if (!text) return;
    const [r] = await db.query(
      'INSERT INTO messages (sender_id, content) VALUES (?, ?)',
      [socket.user.id, text]
    );
    io.emit('chat:receive', {
      id: r.insertId,
      content: text,
      created_at: new Date().toISOString(),
      sender_id: socket.user.id,
      sender_name: socket.user.name,
    });
    notify({ exceptUserId: socket.user.id, title: socket.user.name, body: text }).catch(console.error);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
