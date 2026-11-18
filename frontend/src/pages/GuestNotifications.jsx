import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { enablePush } from '../push.js';
import './staff.css';
import './guest.css';

export default function GuestNotifications({ notice }) {
  const [data, setData] = useState({ items: [], unread: 0 });

  const load = useCallback(() => {
    api('/my-notifications').then(setData).catch((e) => notice(e.message));
  }, [notice]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    window.addEventListener('focus', load);
    return () => { clearInterval(timer); window.removeEventListener('focus', load); };
  }, [load]);

  const markRead = async (id) => {
    try {
      await api('/my-notifications/read', { method: 'PATCH', body: id ? { id } : {} });
      window.dispatchEvent(new CustomEvent('resort:guest-notifications-read'));
      load();
    } catch (e) { notice(e.message); }
  };
  const enable = async () => { try { await enablePush(); notice('Notifications enabled'); } catch (e) { notice(e.message); } };

  return (
    <>
      <div className="toolbar">
        <button className="primary" onClick={enable}>Enable push notifications</button>
        <button onClick={() => markRead()} disabled={!data.unread}>Mark all as read</button>
        <span className="muted">Get alerts for chat messages and booking updates on this device.</span>
      </div>
      <div className="card">
        {data.items.map((n) => (
          <div key={n.id} className="note-item" style={{ opacity: n.read_at ? 0.65 : 1, cursor: n.read_at ? 'default' : 'pointer' }} onClick={() => !n.read_at && markRead(n.id)}>
            <div><strong>{n.title}</strong>{!n.read_at && <span className="pill s-pending" style={{ marginLeft: 8 }}>New</span>}</div>
            <div>{n.body}</div>
            <div className="t">{String(n.created_at).replace('T', ' ').slice(0, 16)}</div>
          </div>
        ))}
        {!data.items.length && <div className="note-item muted">No notifications yet.</div>}
      </div>
    </>
  );
}
