import { useEffect, useState, useCallback } from 'react';
import { setToken, flushPending } from './api.js';
import { enablePush } from './push.js';
import Login from './pages/Login.jsx';
import Rooms from './pages/Rooms.jsx';
import Bookings from './pages/Bookings.jsx';
import Today from './pages/Today.jsx';
import Chat from './pages/Chat.jsx';
import Users from './pages/Users.jsx';
import Reports from './pages/Reports.jsx';
import { AdminProvider } from './admin/data.jsx';
import { FeaturePage } from './features/Pages.jsx';
import Notifications, { EmployeeSync, NotificationRecord } from './features/Notifications.jsx';

// What each role can see in the sidebar
const NAV = {
  admin: [['rooms', 'Rooms'], ['bookings', 'Bookings'], ['users', 'Users'], ['reports', 'Reports']],
  staff: [['rooms', 'Rooms'], ['bookings', 'Bookings'], ['today', 'Check-in / Check-out'], ['chat', 'Chat']],
  guest: [['rooms', 'Rooms'], ['mybookings', 'My Bookings'], ['chat', 'Chat']],
};
const TITLES = {
  rooms: 'Rooms', bookings: 'Bookings', mybookings: 'My Bookings',
  today: "Today's Check-in / Check-out", chat: 'Chat', users: 'Staff Accounts', reports: 'Reports',
};
const EXTRA_NAV = [['dashboard','Dashboard','dashboard.view'],['calendar','Calendar','bookings.view'],['payments','Payments','payments.view'],['guests','Guests','guests.view'],['maintenance','Maintenance','maintenance.manage'],['activity','Activity Logs','activity.view'],['settings','Settings','settings.manage']];
const ROLE_LABEL = { admin: 'Admin', staff: 'Staff', guest: 'Guest' };

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('rooms');
  const [toast, setToast] = useState('');
  const [headerAction, setHeaderAction] = useState(null);
  const [notificationOpen,setNotificationOpen]=useState(false);
  const [related,setRelated]=useState(null);

  const notice = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); }, []);

  // Always start at the login page: forget any saved session when the app is opened
  useEffect(() => { setToken(null); }, []);

  // Send bookings that were saved while offline
  useEffect(() => {
    if (!user || user.role === 'admin') return;
    const run = async () => { const n = await flushPending(); if (n) { notice(`${n} offline booking(s) synced`); setPage(user.role === 'guest' ? 'mybookings' : 'bookings'); } };
    run();
    window.addEventListener('online', run);
    const onMsg = (e) => e.data?.type === 'flush-bookings' && run();
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => { window.removeEventListener('online', run); navigator.serviceWorker?.removeEventListener('message', onMsg); };
  }, [user, notice]);

  if (!user) return <Login onLogin={(u, t) => { setToken(t); setUser(u); setPage('rooms'); }} />;

  const logout = () => { setToken(null); setUser(null); };
  const employee=user.role!=='guest';
  const can=p=>user.permissions?.includes(p);
  const items = employee ? [...(NAV[user.role]||[]).filter(([key])=>key==='rooms'?can('rooms.view'):key==='bookings'||key==='today'?can('bookings.manage'):key==='users'?can('staff.manage'):key==='reports'?can('reports.view'):key==='chat'?user.permission_role==='receptionist':false),...EXTRA_NAV.filter(([, ,permission])=>can(permission))] : NAV.guest;
  const goTo = (key) => { setHeaderAction(null); setPage(user.role === 'guest' && key === 'bookings' ? 'mybookings' : key); };
  const props = { user, notice, setHeaderAction, goTo };
  const isStaff = user.role === 'staff';
  const isGuest = user.role === 'guest';

  const bell = async () => {
    try { await enablePush(); notice('Notifications enabled'); } catch (e) { notice(e.message); }
  };
  const bellLabel = employee?'Notifications':'Enable notifications';

  const layout = (
    <div className={employee?'layout employee-shell':'layout'}>
      <aside className="sidebar">
        <div className="brand"><img src="/icon.svg" alt="" width="34" height="34" /><span>Resort</span></div>
        <nav>
          {items.map(([key, label]) => (
            <button key={key} className={page === key ? 'active' : ''} onClick={() => goTo(key)}>{label}</button>
          ))}
        </nav>
        <div className="me">
          <strong>{user.name}</strong>
          {user.name.toLowerCase() !== ROLE_LABEL[user.role].toLowerCase() && <span>{ROLE_LABEL[user.role]}</span>}
          <button className="ghost-light" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="content">
        <header>
          <h1>{TITLES[page]||EXTRA_NAV.find(([key])=>key===page)?.[1]}</h1>
          <div className="header-actions">
            {headerAction}
            <span className="notification-anchor"><button className="bell" title={bellLabel} onClick={employee?()=>setNotificationOpen(!notificationOpen):bell} aria-label={bellLabel} aria-expanded={employee?notificationOpen:undefined}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>
            </button>{employee&&<Notifications user={user} open={notificationOpen} onClose={()=>setNotificationOpen(false)} onRecord={setRelated} goTo={goTo}/>}</span>
          </div>
        </header>
        {page === 'rooms' && <Rooms {...props} />}
        {(page === 'bookings' || (page === 'mybookings' && isGuest)) && <Bookings {...props} />}
        {page === 'today' && isStaff && <Today {...props} />}
        {page === 'chat' && user.role !== 'admin' && <Chat {...props} />}
        {page === 'users' && user.role === 'admin' && <Users {...props} />}
        {page === 'reports' && user.role === 'admin' && <Reports {...props} />}
        {employee&&EXTRA_NAV.some(([key])=>key===page)&&items.some(([key])=>key===page)&&<FeaturePage page={page} user={user} goTo={goTo}/>}
      </main>
      {related&&employee&&<NotificationRecord record={related} user={user} onClose={()=>setRelated(null)} goTo={goTo}/>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
  return employee?<AdminProvider key={user.id}><EmployeeSync user={user} onUser={u=>{setUser(u);setPage('rooms');}} onLogout={logout}/>{layout}</AdminProvider>:layout;
}
