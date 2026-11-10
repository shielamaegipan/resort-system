import { useState } from 'react';
import { api } from '../api';

export default function Login({ onLogin }) {
  const [register, setRegister] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      onLogin(await api(register ? '/auth/register' : '/auth/login', { method: 'POST', body: f }));
    } catch (e2) {
      setErr(e2.message === 'Failed to fetch' ? 'Cannot reach the server. Is the backend running?' : e2.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="center">
      <form className="card auth" onSubmit={submit}>
        <h2>{register ? 'Register' : 'Log in'}</h2>
        {register && <input placeholder="Full name" value={f.name} onChange={set('name')} required />}
        <input type="email" placeholder="Email" value={f.email} onChange={set('email')} required />
        <input type="password" placeholder="Password" value={f.password} onChange={set('password')} required />
        {err && <p className="err">{err}</p>}
        <button className="primary" disabled={busy}>{register ? 'Create account' : 'Log in'}</button>
        <button type="button" className="ghost" onClick={() => { setRegister(!register); setErr(''); }}>
          {register ? 'Already have an account? Log in' : 'Need an account? Register'}
        </button>
      </form>
    </div>
  );
}
