import { useEffect, useState } from 'react';
import { api } from '../api.js';
import './Dashboard.css';

const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 });
const STATUS_LABEL = {
  pending: 'Pending', confirmed: 'Confirmed', checked_in: 'Checked in',
  checked_out: 'Checked out', cancelled: 'Cancelled',
};
const STATUS_ORDER = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'];

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en', { month: 'short' });
}

// Last 6 months, filling months that have no bookings with 0
function lastSixMonths(monthly) {
  const byMonth = Object.fromEntries((monthly || []).map((m) => [m.month, Number(m.revenue)]));
  const out = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ month: key, revenue: byMonth[key] || 0 });
  }
  return out;
}

export default function Dashboard({ notice, goTo }) {
  const [d, setD] = useState(null);
  const [rep, setRep] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    Promise.all([api('/dashboard'), api('/reports/summary')])
      .then(([dash, report]) => { setD(dash); setRep(report); })
      .catch((e) => { setError(e.message || 'Could not load the dashboard'); notice?.(e.message); });
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="dash-state">{error} <button onClick={load}>Try again</button></div>;
  if (!d || !rep) return <div className="dash-state">Loading dashboard…</div>;

  const totalRooms = d.rooms.total || 0;
  const occPct = totalRooms ? Math.round((d.occupied_today / totalRooms) * 100) : 0;
  const months = lastSixMonths(rep.monthly);
  const maxRev = Math.max(...months.map((m) => m.revenue), 1);
  const statusCount = Object.fromEntries((rep.byStatus || []).map((s) => [s.status, s.n]));
  const maxStatus = Math.max(...STATUS_ORDER.map((s) => statusCount[s] || 0), 1);

  return (
    <div className="dash">
      {/* Headline: occupancy is what an owner checks first */}
      <section className="dash-hero">
        <div className="dash-occ">
          <p className="dash-label">Rooms in use today</p>
          <p className="dash-big">{d.occupied_today}<span> of {totalRooms}</span></p>
          <div className="dash-bar" role="img" aria-label={`${occPct}% occupied`}>
            <i style={{ width: `${occPct}%` }} />
          </div>
          <p className="dash-sub">
            {occPct}% occupied · {d.rooms.available} available · {d.rooms.maintenance} under maintenance
          </p>
        </div>
        <dl className="dash-facts">
          <div><dt>Revenue this month</dt><dd>{peso(d.month_revenue)}</dd><small>{d.month_bookings} bookings</small></div>
          <div><dt>Arrivals today</dt><dd>{d.arrivals_today}</dd></div>
          <div><dt>Departures today</dt><dd>{d.departures_today}</dd></div>
          <div><dt>Staff / Guests</dt><dd>{d.users.staff} / {d.users.guests}</dd></div>
        </dl>
      </section>

      {d.pending_bookings > 0 && (
        <div className="dash-alert">
          <span><strong>{d.pending_bookings}</strong> booking{d.pending_bookings > 1 ? 's are' : ' is'} waiting for staff confirmation.</span>
          {goTo && <button onClick={() => goTo('bookings')}>View bookings</button>}
        </div>
      )}

      <div className="dash-grid">
        <section className="dash-panel">
          <h2>Revenue, last 6 months</h2>
          <div className="dash-chart">
            {months.map((m) => (
              <div key={m.month} className="dash-col" title={`${monthLabel(m.month)}: ${peso(m.revenue)}`}>
                <span className="dash-val">{m.revenue ? peso(m.revenue) : ''}</span>
                <i style={{ height: `${Math.max((m.revenue / maxRev) * 100, m.revenue ? 4 : 0)}%` }} />
                <span className="dash-mon">{monthLabel(m.month)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="dash-panel">
          <h2>Bookings by status</h2>
          <ul className="dash-status">
            {STATUS_ORDER.map((s) => (
              <li key={s}>
                <span>{STATUS_LABEL[s]}</span>
                <div><i className={`st-${s}`} style={{ width: `${((statusCount[s] || 0) / maxStatus) * 100}%` }} /></div>
                <b>{statusCount[s] || 0}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="dash-panel">
        <div className="dash-panel-head">
          <h2>Latest bookings</h2>
          {goTo && <button className="dash-link" onClick={() => goTo('bookings')}>See all</button>}
        </div>
        {d.recent_bookings.length === 0 ? (
          <p className="dash-empty">No bookings yet. They will show up here as guests book rooms.</p>
        ) : (
          <div className="dash-scroll">
            <table className="dash-table">
              <thead><tr><th>Guest</th><th>Room</th><th>Stay</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {d.recent_bookings.map((b) => (
                  <tr key={b.id}>
                    <td>{b.guest_name}</td>
                    <td>{b.room_name}</td>
                    <td>{b.check_in} → {b.check_out}</td>
                    <td>{peso(b.total_price)}</td>
                    <td><span className={`dash-pill st-${b.status}`}>{STATUS_LABEL[b.status] || b.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
