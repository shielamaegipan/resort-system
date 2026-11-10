import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useConfirm } from '../components/Confirm.jsx';

// Admin page: the admin creates and removes STAFF accounts here.
export default function Users({ notice }) {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [ask, dialog] = useConfirm();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const load = useCallback(() => api('/users').then(setRows).catch((e) => notice(e.message)), [notice]);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    try {
      await api('/users', { method: 'POST', body: f });
      setF({ name: '', email: '', password: '' });
      notice('Staff account created');
      load();
    } catch (err) { notice(err.message); }
  };

  const remove = async (u) => {
    const ok = await ask({ title: 'Delete this staff account?', message: `Are you sure you want to delete ${u.name} (${u.email})? They will no longer be able to log in.`, confirmText: 'Yes, delete', danger: true });
    if (!ok) return;
    try { await api('/users/' + u.id, { method: 'DELETE' }); notice('Staff account deleted'); load(); } catch (e) { notice(e.message); }
  };

  return (
    <div className="stack">
      <form className="card pad searchbar" onSubmit={add} autoComplete="off">
        <label>Name<input value={f.name} onChange={set('name')} autoComplete="off" required /></label>
        <label>Email<input type="email" value={f.email} onChange={set('email')} autoComplete="off" required /></label>
        <label>Password<input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" minLength={6} required /></label>
        <button className="primary">Add staff</button>
      </form>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Staff name</th><th>Email</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.name}</strong></td>
                <td>{u.email}</td>
                <td>{String(u.created_at).slice(0, 10)}</td>
                <td className="actions"><button className="danger" onClick={() => remove(u)}>Delete</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="4" className="muted">No staff accounts yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {dialog}
    </div>
  );
}
