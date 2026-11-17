import { useState } from 'react';
import { enablePush } from '../push.js';
import { useNotifications } from '../features/notification-client.jsx';
import './staff.css';
import './guest.css';

export default function GuestNotifications({ notice, goTo }) {
  const { items, unread, error, loading, load, markRead } = useNotifications();
  const [busy, setBusy] = useState(false);
  const enable = async () => {
    setBusy(true);
    try { await enablePush(); notice('Notifications enabled on this device'); }
    catch (e) { notice(e.message); }
    finally { setBusy(false); }
  };
  const read = async (item, open = false) => {
    try { await markRead(item?.id); if (open) goTo(item.category === 'chat' ? 'chat' : 'mybookings'); }
    catch (e) { notice(e.message); }
  };
  return <>
    <h1>Notifications</h1>
    <div className="toolbar actions">
      <button className="primary" disabled={busy} onClick={enable}>{busy ? 'Enabling...' : 'Enable push notifications'}</button>
      <button disabled={!unread} onClick={() => read()}>Mark all as read</button>
      <span className="muted" role="status">{unread} unread</span>
    </div>
    {error && <p className="error" role="alert">{error} <button onClick={load}>Retry</button></p>}
    <div className="card">
      {items.map(item => <article key={item.id} className={`note-item${item.read_at ? '' : ' unread'}`}>
        <strong>{item.title}</strong><p>{item.body}</p>
        <time className="t">{new Date(item.created_at).toLocaleString('en-PH')}</time>
        <div className="actions"><button onClick={() => read(item, true)}>Open {item.category === 'chat' ? 'chat' : 'bookings'}</button>{!item.read_at && <button onClick={() => read(item)}>Mark as read</button>}</div>
      </article>)}
      {!items.length && <p className="note-item muted">{loading ? 'Loading notifications...' : 'No notifications yet.'}</p>}
    </div>
  </>;
}
