import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    setError('');
    try {
      const data = await api(`/auth/${mode}`, { method: 'POST', body: f });
      onLogin(data);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="login">
      <div className="panel">
        <h1>{mode === 'login' ? 'Log in' : 'Create account'}</h1>
        {mode === 'register' && <input placeholder="Name" value={f.name} onChange={set('name')} />}
        <input placeholder="Email" type="email" value={f.email} onChange={set('email')} />
        <input placeholder="Password" type="password" value={f.password} onChange={set('password')} />
        {error && <p className="error">{error}</p>}
        <button onClick={submit}>{mode === 'login' ? 'Log in' : 'Create account'}</button>
        <button className="ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
        </button>
      </div>
    </div>
  );
}
