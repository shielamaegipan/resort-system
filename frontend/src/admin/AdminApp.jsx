import { lazy, Suspense, useEffect, useState } from 'react';
import { AdminProvider, useAdmin, useData, useWrite } from './data.jsx';
import { AdminBoundary, Dialog, Empty, Icon, QueryState } from './ui.jsx';
import './admin.css';
import './classic.css';
import { ClassicReports, ClassicStaff } from './ClassicViews.jsx';
import LiveDashboard from './LiveDashboard.jsx';
import Payments from './Payments.jsx';
import Operations from './Operations.jsx';
import Chat from '../pages/Chat.jsx';
import { BookingDetail } from './Calendar.jsx';
import { RoomGallery } from './RoomExtras.jsx';
import { money } from './data.jsx';

const Rooms = lazy(() => import('./Rooms.jsx'));
const Bookings = lazy(() => import('./Bookings.jsx'));
const allPages = [['dashboard', 'Dashboard', 'Your resort at a glance','dashboard.view'], ['rooms', 'Rooms', 'Thoughtful spaces. Effortless management.','rooms.view'], ['bookings', 'Bookings', 'Every stay, from arrival to departure.','bookings.view'], ['payments','Payments','Payments, verification and receipts','payments.view'], ['operations','Housekeeping','Room readiness and maintenance','maintenance.manage'], ['users', 'Staff Accounts', 'The people behind a great guest experience.','staff.manage'], ['reports', 'Reports', 'A clear view of your resort’s performance.','reports.view'], ['settings','Settings','Resort details for payment acknowledgments','settings.manage']];

export default function AdminApp(props) { return <AdminProvider><Shell {...props} /></AdminProvider>; }
function Shell({ user, onLogout }) {
  const pages = allPages.filter(p => user.permissions?.includes(p[3]));
  if (user.role === 'staff' && user.permission_role === 'receptionist') pages.push(['chat', 'Chat', 'Guest communication']);
  const initial = window.location.hash.slice(1);
  const [page, setPage] = useState(pages.some(([id]) => id === initial) ? initial : 'rooms');
  const [notifications, setNotifications] = useState(false);
  const [related, setRelated] = useState(null);
  const { connected, notify } = useAdmin();
  const me = useData('me', '/auth/me');
  useEffect(() => { if (me.error?.status === 401 || me.data && JSON.stringify(me.data.permissions) !== JSON.stringify(user.permissions)) onLogout(); }, [me.data, me.error]);
  const inbox = useData('notifications', '/admin/notifications');
  const [id, title] = pages.find(([key]) => key === page) || pages[0];
  const go = key => {
    if (!pages.some(([allowed]) => allowed === key)) return;
    setPage(key);
    window.history.replaceState(null, '', `#${key}`);
  };
  const primary = ['rooms', 'bookings', 'users', 'reports'];
  const navButton = ([key, label]) => <button key={key} className={id === key ? 'active' : ''} onClick={() => go(key)} aria-current={id === key ? 'page' : undefined}>{key === 'users' ? 'Users' : label}</button>;
  return <div className="admin-app classic-admin layout">
    <a className="admin-skip" href="#admin-main">Skip to content</a>
    <aside className="sidebar classic-sidebar">
      <div className="brand"><img src="/icon.svg" width="34" height="34" alt=""/><span>Resort</span></div>
      <nav aria-label="Admin navigation">
        {primary.map(key => pages.find(p => p[0] === key)).filter(Boolean).map(navButton)}
      </nav>
      <div className="me"><strong>{user.name}</strong><button className="ghost-light" onClick={onLogout}>Log out</button></div>
    </aside>
    <main id="admin-main" className="content classic-content" tabIndex="-1">
      <header><h1>{title}</h1><div className="header-actions"><div id="admin-header-actions"/><button className="bell admin-notification-button" aria-label={`Notifications${inbox.data?.unread ? `, ${inbox.data.unread} unread` : ''}`} onClick={() => setNotifications(true)}><Icon name="bell" size={24}/>{!!inbox.data?.unread && <b>{inbox.data.unread > 99 ? '99+' : inbox.data.unread}</b>}</button></div></header>
      {!connected && <div className="admin-offline" role="status">Live connection interrupted. Reconnecting automatically.</div>}
      <AdminBoundary key={id}><Suspense fallback={<div className="admin-skeleton" role="status">Loading page...</div>}>
        {id === 'dashboard' && <LiveDashboard user={user} go={go}/>}
        {id === 'reports' && <ClassicReports user={user} go={go}/>}
        {id === 'rooms' && <Rooms user={user} go={go}/>}{id === 'bookings' && <Bookings user={user} go={go}/>}{id === 'users' && <ClassicStaff user={user}/>}
        {id === 'payments' && <Payments user={user}/>}{id === 'operations' && <Operations user={user}/>}
        {id === 'settings' && <Operations settings user={user}/>}{id === 'chat' && <Chat user={user} notice={notify}/>}
      </Suspense></AdminBoundary>
    </main>
    {notifications && <Notifications query={inbox} onClose={() => setNotifications(false)} go={(key, entityId) => { setNotifications(false); if (entityId && ['bookings', 'rooms', 'payments'].includes(key)) setRelated({ category: key, id: entityId }); else go(key); }}/ >}
    {related && <NotificationRecord key={`${related.category}-${related.id}`} record={related} user={user} onClose={() => setRelated(null)} go={key => { setRelated(null); go(key); }}/>}
  </div>;
}
function Notifications({ query, onClose, go }) {
  const write = useWrite();
  const [unreadOnly,setUnreadOnly]=useState(false);
  const read = (id) => write.mutate({ path: '/admin/notifications/read', method: 'PATCH', body: id ? { id } : {} });
  return <Dialog title="Notifications" onClose={onClose}><div className="admin-inbox-toolbar"><label><input type="checkbox" checked={unreadOnly} onChange={e=>setUnreadOnly(e.target.checked)}/>Unread only</label><span>{query.data?.unread || 0} unread</span><button disabled={write.isPending || !query.data?.unread} onClick={() => read()}>Mark all as read</button></div><QueryState query={query}>{(data) => data.items.some(n=>!unreadOnly||!n.read_at) ? <div className="admin-inbox">{data.items.filter(n=>!unreadOnly||!n.read_at).map((n) => <article key={n.id} className={n.read_at ? '' : 'unread'}><Icon name={n.category} /><div><strong>{n.title}</strong><p>{n.body}</p><small>{new Date(n.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</small><div className="admin-actions"><button onClick={() => go(n.category === 'users' ? 'users' : n.category,n.entity_id)}>View {n.category}</button>{!n.read_at && <button disabled={write.isPending} onClick={() => read(n.id)}>Mark as read</button>}</div></div></article>)}</div> : <Empty title="You’re all caught up" text="Booking, room, and staff updates will appear here." />}</QueryState></Dialog>;
}

function NotificationRecord({record,user,onClose,go}) {
  if(record.category==='bookings')return <BookingDetail id={record.id} user={user} onClose={onClose}/>;
  return <OtherNotificationRecord record={record} user={user} onClose={onClose} go={go}/>;
}
function OtherNotificationRecord({record,user,onClose,go}) {
  const query=useData('notification-record',record.category==='rooms'?'/admin/rooms':`/ops/payments/${record.id}`);
  if(record.category==='rooms'&&query.data){const room=query.data.find(r=>r.id===record.id);if(room)return <RoomGallery room={room} editable={user.permissions.includes('rooms.manage')} onClose={onClose}/>;}
  return <Dialog title={record.category==='rooms'?'Room details':`Payment #${record.id}`} onClose={onClose}><QueryState query={query}>{p=>record.category==='rooms'?<Empty title="Room no longer available"/>:<><p>{p.guest_name} ? {p.room_name}</p><p>{money(p.amount)} ? {p.method} ? {p.status}</p><p>Reference: {p.transaction_reference||'Cash'}</p><h3>Payment history</h3>{p.history.map((h,i)=><p key={i}>{h.operation} ? {h.reason} ? {h.amount?money(h.amount):''}</p>)}<button onClick={()=>go('payments')}>Open payments</button></>}</QueryState></Dialog>;
}
