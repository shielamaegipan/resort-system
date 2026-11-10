import { useEffect, useState } from 'react';
import { adminFetch, styles as s } from './adminApi';

export default function StaffAccounts() {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    adminFetch('/api/users').then(setStaff).catch((e) => setError(e.message));

  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function create(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await adminFetch('/api/users', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', email: '', password: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(u) {
    if (!window.confirm(`Delete staff account "${u.name}"?`)) return;
    setError('');
    try {
      await adminFetch(`/api/users/${u.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={s.page}>
      <h1 style={s.title}>Staff Accounts</h1>
      {error && <div style={s.error}>{error}</div>}

      <form onSubmit={create} style={{ ...s.panel, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <input style={s.input} placeholder="Name" value={form.name} onChange={set('name')} required />
        <input style={s.input} type="email" placeholder="Email" value={form.email} onChange={set('email')} required />
        <input style={s.input} type="password" placeholder="Password (min 6)" value={form.password} onChange={set('password')} required minLength={6} />
        <button style={s.btn} disabled={busy}>{busy ? 'Adding...' : 'Add staff'}</button>
      </form>

      <div style={s.panel}>
        <table style={s.table}>
          <thead>
            <tr>
              {['Name', 'Email', 'Created', ''].map((h) => <th key={h} style={s.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 && <tr><td style={s.td} colSpan={4}>No staff accounts yet.</td></tr>}
            {staff.map((u) => (
              <tr key={u.id}>
                <td style={s.td}>{u.name}</td>
                <td style={s.td}>{u.email}</td>
                <td style={s.td}>{String(u.created_at).slice(0, 10)}</td>
                <td style={{ ...s.td, textAlign: 'right' }}>
                  <button style={s.btnDanger} onClick={() => remove(u)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
