import { useEffect, useState } from 'react';
import Login from './components/Login.jsx';
import Items from './components/Items.jsx';
import Chat from './components/Chat.jsx';
import { enablePush } from './push.js';

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [page, setPage] = useState('items');
  const [online, setOnline] = useState(navigator.onLine);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  function handleLogin({ token, user }) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
  }

  function logout() {
    localStorage.clear();
    setUser(null);
  }

  async function turnOnPush() {
    try {
      await enablePush();
      setNotice('Notifications enabled');
    } catch (e) {
      setNotice(e.message);
    }
  }

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <h1>Resort System</h1>
        <nav>
          <button className={page === 'items' ? 'active' : ''} onClick={() => setPage('items')}>
            Items
          </button>
          <button className={page === 'chat' ? 'active' : ''} onClick={() => setPage('chat')}>
            Chat
          </button>
        </nav>
        <div className="sidebar-foot">
          <span className={online ? 'dot on' : 'dot off'}>{online ? 'Online' : 'Offline'}</span>
          <button className="ghost" onClick={turnOnPush}>Enable notifications</button>
          <button className="ghost" onClick={logout}>Log out ({user.name})</button>
          {notice && <small>{notice}</small>}
        </div>
      </aside>
      <main>{page === 'items' ? <Items /> : <Chat user={user} />}</main>
    </div>
  );
}
