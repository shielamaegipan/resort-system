import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, getToken } from '../api.js';

export default function Chat({ user, notice }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const sock = useRef(null);
  const end = useRef(null);

  useEffect(() => {
    api('/messages').then(setMsgs).catch((e) => notice(e.message));
    const s = io({ auth: { token: getToken() } });
    sock.current = s;
    s.on('chat:receive', (m) => setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])));
    s.on('connect_error', (e) => notice(e.message));
    return () => s.disconnect();
  }, [notice]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    sock.current.emit('chat:send', text);
    setText('');
  };

  return (
    <div className="card chat">
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
