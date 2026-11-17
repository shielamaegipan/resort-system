import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { StaffTools } from '../features/Pages.jsx';
import { useLiveRefresh } from '../features/live.js';
import { useConfirm } from '../components/Confirm.jsx';

// Admin page: the admin creates and removes STAFF accounts here.
export default function Users({ notice,user }) {
  const [rows, setRows] = useState([]);
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [ask, dialog] = useConfirm();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const load = useCallback(() => api('/users').then(data=>{setRows(data);setError('');}).catch(e=>{setError(e.message);notice(e.message);}).finally(()=>setLoading(false)), [notice]);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const add = async (e) => {
    e.preventDefault();if(saving)return;setSaving(true);
    try {
      await api('/users', { method: 'POST', body: f });
      setF({ name: '', email: '', password: '' });
      notice('Staff account created');
      load();
    } catch (err) { notice(err.message); }finally{setSaving(false);}
  };

  const remove = async (u) => {
    const ok = await ask({ title: 'Delete this staff account?', message: `Are you sure you want to delete ${u.name} (${u.email})? They will no longer be able to log in.`, confirmText: 'Yes, delete', danger: true });
    if (!ok) return;
    try { if(u.permission_role&&u.permission_role!=='receptionist')await api('/ops/staff/'+u.id,{method:'PUT',body:{name:u.name,email:u.email,permission_role:u.permission_role,active:false}});else await api('/users/' + u.id, { method: 'DELETE' }); notice('Staff account deleted'); load(); } catch (e) { notice(e.message); }
  };

  return (
    <div className="stack">
      <form className="card pad searchbar" onSubmit={add} autoComplete="off">
        <label>Name<input value={f.name} onChange={set('name')} autoComplete="off" required /></label>
        <label>Email<input type="email" value={f.email} onChange={set('email')} autoComplete="off" required /></label>
        <label>Password<input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" minLength={12} maxLength={72} required /></label>
        <button className="primary" disabled={saving}>Add staff</button>
      </form>
      {error&&<p className="error" role="alert">{error} <button onClick={load}>Retry</button></p>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Staff name</th><th>Email</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.name}</strong></td>
                <td>{u.email}</td>
                <td>{String(u.created_at).slice(0, 10)}</td>
                <td className="actions">{(!u.permission_role||u.permission_role==='receptionist'||user.permissions?.includes('roles.manage'))&&<button className="danger" onClick={() => remove(u)}>Delete</button>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="4" className="muted">{loading?'Loading staff...':'No staff accounts yet.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <StaffTools user={user}/>
      {dialog}
    </div>
  );
}
