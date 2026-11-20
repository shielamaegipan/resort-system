import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { api, getToken } from '../api.js';

export function NotificationSession({ user }) {
  useEffect(() => {
    const refresh = () => {
      window.dispatchEvent(new Event('resort:notifications-changed'));
      window.dispatchEvent(new Event('resort:data-changed'));
    };
    const socket = io('/notifications', { auth: { token: getToken() }, reconnection: true, reconnectionDelayMax: 5000 });
    socket.on('connect', refresh);
    socket.on('notification:change', refresh);
    socket.on('notification:read', refresh);
    return () => socket.disconnect();
  }, [user.id]);
  return null;
}

export function useNotifications() {
  const [inbox, setInbox] = useState({ items: [], unread: 0 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try { setInbox(await api('/notifications')); setError(''); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    load();
    window.addEventListener('resort:notifications-changed', load);
    window.addEventListener('focus', load);
    const timer = setInterval(load, 30000);
    return () => { clearInterval(timer); window.removeEventListener('resort:notifications-changed', load); window.removeEventListener('focus', load); };
  }, [load]);
  const markRead = async id => {
    await api('/notifications/read', { method: 'PATCH', body: id ? { id } : {} });
    await load();
    window.dispatchEvent(new Event('resort:notifications-changed'));
  };
  return { ...inbox, error, loading, load, markRead };
}

export function GuestNotificationBell({ onClick }) {
  const { unread } = useNotifications();
  return <button className="guest-notification-bell" onClick={onClick} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21h4"/></svg>
    {unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}
  </button>;
}
