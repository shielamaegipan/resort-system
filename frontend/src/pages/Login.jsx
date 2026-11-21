import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if(busy)return;
    if (!navigator.onLine) { setErr('You are offline. Log in once while online. After that, you can use the app offline.'); return; }
    setErr(''); setBusy(true);
    try {
      const d = await api(`/auth/${mode}`, { method: 'POST', body: f });
      onLogin(d.user, d.token);
    } catch (e2) { setErr(e2.status ? e2.message : 'Cannot reach the server. Check your internet connection and try again.'); }
    setBusy(false);
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand dark"><img src="/icon.svg" alt="" width="36" height="36" /><span>Resort</span></div>
        {!online && <p className="banner">You are offline. Logging in and registering need internet. If you already logged in on this device, open the app again and you will still be signed in.</p>}<h2>{mode === 'login' ? 'Welcome back' : 'Create a guest account'}</h2>
        {mode === 'register' && <label>Name<input value={f.name} onChange={set('name')} required /></label>}
        <label>Email<input type="email" value={f.email} onChange={set('email')} required /></label>
        <label>Password
          <span style={{ position: 'relative', display: 'block' }}>
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete={mode==='login'?'current-password':'new-password'}
              minLength={mode==='register'?12:undefined}
              maxLength={72}
              value={f.password}
              onChange={set('password')}
              required
              style={{ width: '100%', boxSizing: 'border-box', paddingRight: 64 }}
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: 'inherit' }}
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </span>
        </label>
        {err && <p className="error">{err}</p>}
        <button className="primary" disabled={busy}>{mode === 'login' ? 'Log in' : 'Register'}</button>
        <p className="switch">
          {mode === 'login' ? 'New guest? ' : 'Already have an account? '}
          <a href="#" onClick={(e) => { e.preventDefault(); setErr(''); setShowPw(false); setMode(mode === 'login' ? 'register' : 'login'); }}>{mode === 'login' ? 'Register' : 'Log in'}</a>
        </p>
      </form>
    </div>
  );
}