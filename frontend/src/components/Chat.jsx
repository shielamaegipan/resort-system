import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, getToken } from '../api';

export default function Chat({ user }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const sock = useRef(null);
  const end = useRef(null);

  useEffect(() => {
    api('/messages').then(setMsgs).catch(() => {});
    const s = io({ auth: { token: getToken() } });
    sock.current = s;
    s.on('chat:receive', (m) => setMsgs((prev) => [...prev, m]));
    return () => s.disconnect();
  }, []);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    sock.current.emit('chat:send', text);
    setText('');
  };

  return (
    <>
      <h2 className="title">Chat</h2>
      <div className="card chat">
        <div className="msgs">
          {msgs.map((m) => (
            <div key={m.id} className={'msg ' + (m.sender_id === user.id ? 'mine' : '')}>
              <small>{m.sender_name}</small>
              <div>{m.content}</div>
            </div>
          ))}
          <div ref={end} />
        </div>
        <form className="row" onSubmit={send}>
          <input style={{ flex: 1 }} placeholder="Type a message..." value={text} onChange={(e) => setText(e.target.value)} />
          <button className="primary">Send</button>
        </form>
      </div>
    </>
  );
}
