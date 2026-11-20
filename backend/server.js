// ---------- Chat (private: one conversation per guest) ----------
const chatRoom = (guestId) => `guest-${guestId}`;

// Staff/admin: list of guests they can talk to
app.get('/api/chat/guests', auth, async (req, res) => {
  if (req.user.role === 'guest' || !canChat(req.user)) return res.status(403).json({ error: 'Guest communication permission required' });
  const [guests] = await db.query("SELECT id, name, email FROM users WHERE role='guest' AND deleted_at IS NULL ORDER BY name LIMIT 500");
  const [last] = await db.query("SELECT room, MAX(id) AS last_id FROM messages WHERE room LIKE 'guest-%' GROUP BY room");
  const lastBy = new Map(last.map((r) => [r.room, r.last_id]));
  guests.forEach((g) => { g.last_id = lastBy.get(chatRoom(g.id)) || 0; });
  guests.sort((a, b) => b.last_id - a.last_id || a.name.localeCompare(b.name));
  res.json(guests);
});

// History of ONE conversation: a guest sees only their own, staff pick a guest (?guest=ID)
app.get('/api/messages', auth, async (req, res) => {
  if (!canChat(req.user)) return res.status(403).json({ error: 'Guest communication permission required' });
  const guestId = req.user.role === 'guest' ? req.user.id : Number(req.query.guest);
  if (!Number.isInteger(guestId) || guestId < 1) return res.json([]);
  const [rows] = await db.query(
    `SELECT m.id, m.content, m.created_at, m.sender_id, u.name AS sender_name
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.room = ? ORDER BY m.id DESC LIMIT 50`,
    [chatRoom(guestId)]
  );
  res.json(rows.reverse());
});

// ---------- WebSocket real-time chat ----------
const io = new Server(server, { cors: { origin } });
realtime.attach(io);

io.use(async (socket, next) => {
  try {
    socket.user = verifyToken(socket.handshake.auth.token);
    const [[u]] = await db.query('SELECT role,permission_role,token_version FROM users WHERE id = ? AND deleted_at IS NULL', [socket.user.id]);
    if (!u || !canChat(u)) return next(new Error('Guest communication access required'));
    if ((socket.user.version || 0) !== u.token_version) return next(new Error('Communication access denied'));
    socket.user.role = u.role;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  const expiry = setTimeout(() => socket.disconnect(true), Math.max(0, socket.user.exp * 1000 - Date.now()));
  socket.on('disconnect', () => clearTimeout(expiry));
  // A guest only joins their own room; staff join the staff room
  if (socket.user.role === 'guest') socket.join(chatRoom(socket.user.id));
  else socket.join('staff-chat');

  socket.on('chat:send', async (payload) => {
    try {
      const [[current]] = await db.query('SELECT * FROM users WHERE id=? AND deleted_at IS NULL', [socket.user.id]);
      if (!current || (socket.user.version || 0) !== current.token_version || !canChat(current)) return socket.disconnect(true);
      const raw = payload && typeof payload === 'object' ? payload.content : payload;
      const text = String(raw || '').trim();
      if (!text || text.length > 2000) return socket.emit('chat:error', 'Messages must contain 1-2000 characters');

      let guestId = current.id;
      if (current.role !== 'guest') {
        guestId = Number(payload && payload.guestId);
        const [[g]] = await db.query("SELECT id FROM users WHERE id=? AND role='guest' AND deleted_at IS NULL", [guestId]);
        if (!g) return socket.emit('chat:error', 'Choose a guest to message');
      }

      const [r] = await db.query('INSERT INTO messages (sender_id, room, content) VALUES (?, ?, ?)', [current.id, chatRoom(guestId), text]);
      io.to(chatRoom(guestId)).to('staff-chat').emit('chat:receive', {
        id: r.insertId,
        guest_id: guestId,
        content: text,
        created_at: new Date().toISOString(),
        sender_id: current.id,
        sender_name: socket.user.name,
      });
      realtime.publishChat(current, text, r.insertId, guestId).catch((error) => console.error('Chat notification failed:', error.message));
    } catch (error) {
      console.error('Chat delivery failed:', error.message);
      socket.emit('chat:error', 'Message could not be sent');
    }
  });
});