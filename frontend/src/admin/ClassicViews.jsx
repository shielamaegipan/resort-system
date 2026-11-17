import { lazy, useState } from 'react';
import { money, useData, useWrite } from './data.jsx';
import { Confirm, QueryState } from './ui.jsx';
import Staff from './Staff.jsx';
import LiveDashboard from './LiveDashboard.jsx';
const Overview = lazy(() => import('./Overview.jsx'));

export function ClassicReports({ user, go }) {
  const query = useData('dashboard', '/ops/dashboard');
  const reports = useData('reports', '/admin/reports');
  return <div className="stack"><QueryState query={query}>{d => <>
    <div className="stats">{[
      ['Revenue (verified payments)', money(d.revenue)], ['Bookings', d.bookings],
      ['Occupied today', `${d.rooms.occupied} / ${d.rooms.total} (${d.rooms.total ? Math.round(d.rooms.occupied / d.rooms.total * 100) : 0}%)`],
      ['Rooms available', d.rooms.available], ['Staff accounts', reports.data?.users.staff ?? '...'], ['Guest accounts', d.guests],
    ].map(([label, value]) => <div className="card stat" key={label}><span className="muted">{label}</span><strong>{value}</strong></div>)}</div>
    <div className="two-col"><div className="card pad"><h3>Bookings by status</h3>{d.byStatus.map(s => <div className="line" key={s.status}><span className={`pill s-${s.status}`}>{s.status.replaceAll('_', ' ')}</span><strong>{s.n}</strong></div>)}</div>
      <div className="card pad"><h3>Monthly</h3>{d.monthly.some(m => m.revenue) ? d.monthly.filter(m => m.revenue).map(m => <div className="line" key={m.month}><span>{m.month}</span><strong>{money(m.revenue)}</strong></div>) : <p className="muted">No data yet.</p>}</div></div>
  </>}</QueryState>
    <details className="classic-advanced"><summary>Charts and detailed reports</summary>
      <div className="actions">
        {user.permissions.includes('dashboard.view') && <button onClick={() => go('dashboard')}>Open dashboard</button>}
        {user.permissions.includes('payments.view') && <button onClick={() => go('payments')}>Payments</button>}
        {user.permissions.includes('settings.manage') && <button onClick={() => go('settings')}>Resort settings</button>}
      </div>
      <LiveDashboard user={user} go={go}/><Overview reports go={go}/>
    </details>
  </div>;
}

export function ClassicStaff({ user }) {
  const query = useData('staff', '/ops/staff');
  const write = useWrite();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [removing, setRemoving] = useState(null);
  const field = key => ({ value: form[key], onChange: e => setForm({ ...form, [key]: e.target.value }) });
  return <div className="stack">
    <form className="card pad searchbar" autoComplete="off" onSubmit={e => {
      e.preventDefault();
      if (write.isPending) return;
      write.mutate({ path: '/ops/staff', body: { ...form, permission_role: 'receptionist' }, message: 'Staff account created' }, { onSuccess: () => setForm({ name: '', email: '', password: '' }) });
    }}>
      <label>Name<input required maxLength={100} disabled={write.isPending} {...field('name')}/></label>
      <label>Email<input type="email" required maxLength={150} disabled={write.isPending} {...field('email')}/></label>
      <label>Password<input type="password" autoComplete="new-password" required minLength={12} maxLength={72} disabled={write.isPending} {...field('password')}/></label>
      <button className="primary" disabled={write.isPending}>Add staff</button>
      {write.error && <p className="error" role="alert">{write.error.message}</p>}
    </form>
    <QueryState query={query}>{rows => <div className="card table-wrap"><table><thead><tr><th>Staff name</th><th>Email</th><th>Added</th><th/></tr></thead><tbody>
      {rows.filter(u => u.role === 'staff' && !u.deleted_at).map(u => <tr key={u.id}><td><strong>{u.name}</strong></td><td>{u.email}</td><td>{String(u.created_at).slice(0, 10)}</td><td>{(user.permissions.includes('roles.manage') || u.permission_role === 'receptionist') && <button className="danger" onClick={() => setRemoving(u)}>Delete</button>}</td></tr>)}
      {!rows.some(u => u.role === 'staff' && !u.deleted_at) && <tr><td colSpan="4" className="muted">No staff accounts yet.</td></tr>}
    </tbody></table></div>}</QueryState>
    <details className="classic-advanced"><summary>Roles, permissions and advanced staff management</summary><Staff user={user}/></details>
    {removing && <Confirm title="Delete this staff account?" text={`${removing.name} will lose access. Their account history will be preserved.`} action="Yes, delete" busy={write.isPending} onClose={() => setRemoving(null)} onConfirm={() => write.mutate({ path: `/ops/staff/${removing.id}`, method: 'PUT', body: { name: removing.name, email: removing.email, permission_role: removing.permission_role, active: false }, message: 'Staff account deactivated' }, { onSuccess: () => setRemoving(null) })}/>}
  </div>;
}
