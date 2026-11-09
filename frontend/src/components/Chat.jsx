import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, getToken } from '../api.js';

export default function Chat({ user }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const socketRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    api('/messages').then(setMessages).catch(() => {});
    const socket = io({ auth: { token: getToken() } });
    socketRef.current = socket;
    socket.on('chat:receive', (m) => setMessages((prev) => [...prev, m]));
    return () => socket.disconnect();
  }, []);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  function send() {
    if (!text.trim()) return;
    socketRef.current.emit('chat:send', text);
    setText('');
  }

  return (
    <section className="chat">
      <h2>Chat</h2>
      <div className="messages">
        {messages.map((m) => (
          <div key={m.id} className={m.sender_id === user.id ? 'msg mine' : 'msg'}>
            <small>{m.sender_name}</small>
            <p>{m.content}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="row">
        <input
          placeholder="Write a message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button onClick={send}>Send</button>
      </div>
    </section>
  );
}
