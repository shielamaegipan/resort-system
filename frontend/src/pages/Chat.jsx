import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, getToken } from '../api.js';

export default function Chat({ user, notice }) {
  const isGuest = user.role === 'guest';
  const [guests, setGuests] = useState([]);
  const [guestId, setGuestId] = useState('');
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const sock = useRef(null);
  const end = useRef(null);
  const selected = useRef('');
  selected.current = guestId;

  // Staff/admin: load the guests they can talk to
  useEffect(() => {
    if (isGuest) return;
    api('/chat/guests')
      .then((list) => {
        setGuests(list);
        if (list.length) setGuestId((g) => g || String(list[0].id));
      })
      .catch((e) => notice(e.message));
  }, [isGuest, notice]);

  // Load the conversation (a guest has one; staff load the chosen guest)
  useEffect(() => {
    if (!isGuest && !guestId) { setMsgs([]); return; }
    api(isGuest ? '/messages' : `/messages?guest=${guestId}`)
      .then(setMsgs)
      .catch((e) => notice(e.message));
  }, [isGuest, guestId, notice]);

  // Real-time connection
  useEffect(() => {
    const s = io({ auth: { token: getToken() } });
    sock.current = s;
    s.on('chat:receive', (m) => {
      if (!isGuest && Number(m.guest_id) !== Number(selected.current)) return;
      setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    });
    s.on('chat:error', (msg) => notice(msg));
    s.on('connect_error', (e) => notice(e.message));
    return () => s.disconnect();
  }, [isGuest, notice]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (!isGuest && !guestId) { notice('Choose a guest to message'); return; }
    sock.current.emit('chat:send', { content: text, guestId: isGuest ? undefined : Number(guestId) });
    setText('');
  };

  return (
    <div className="card chat">
      {!isGuest && (
        <div style={{ padding: '8px 12px' }}>
          <select value={guestId} onChange={(e) => setGuestId(e.target.value)} style={{ width: '100%' }}>
            {!guests.length && <option value="">No guests yet</option>}
            {guests.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.email})</option>)}
          </select>
        </div>
      )}
      <div className="messages">
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.sender_id === user.id ? 'mine' : ''}`}>
            {m.sender_id !== user.id && <b>{m.sender_name}</b>}
            <span>{m.content}</span>
            <small>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
          </div>
        ))}
        {!msgs.length && <p className="muted">No messages yet. Say hello!</p>}
        <div ref={end} />
      </div>
      <form className="composer" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" />
        <button className="primary">Send</button>
      </form>
    </div>
  );
}