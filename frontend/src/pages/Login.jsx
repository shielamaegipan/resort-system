import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const d = await api(`/auth/${mode}`, { method: 'POST', body: f });
      onLogin(d.user, d.token);
    } catch (e2) { setErr(e2.message === 'Failed to fetch' ? 'Cannot reach the server' : e2.message); }
    setBusy(false);
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand dark"><img src="/icon.svg" alt="" width="36" height="36" /><span>Resort</span></div>
        <h2>{mode === 'login' ? 'Welcome back' : 'Create a guest account'}</h2>
        {mode === 'register' && <label>Name<input value={f.name} onChange={set('name')} required /></label>}
        <label>Email<input type="email" value={f.email} onChange={set('email')} required /></label>
        <label>Password<input type="password" value={f.password} onChange={set('password')} required /></label>
        {err && <p className="error">{err}</p>}
        <button className="primary" disabled={busy}>{mode === 'login' ? 'Log in' : 'Register'}</button>
        <p className="switch">
          {mode === 'login' ? 'New guest? ' : 'Already have an account? '}
          <a href="#" onClick={(e) => { e.preventDefault(); setErr(''); setMode(mode === 'login' ? 'register' : 'login'); }}>{mode === 'login' ? 'Register' : 'Log in'}</a>
        </p>
      </form>
    </div>
  );
}
