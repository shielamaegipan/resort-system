import { useEffect, useState } from 'react';
import { adminFetch, peso, styles as s } from './adminApi';

export default function Reports() {
  const [r, setR] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminFetch('/api/reports/summary').then(setR).catch((e) => setError(e.message));
  }, []);

  if (error) return <div style={s.error}>{error}</div>;
  if (!r) return <p>Loading...</p>;

  const totalRooms = Number(r.rooms.total) || 0;
  const occupancy = totalRooms ? Math.round((r.occupied_today / totalRooms) * 100) : 0;
  const maxRevenue = Math.max(1, ...r.monthly.map((m) => Number(m.revenue)));

  return (
    <div style={s.page}>
      <h1 style={s.title}>Reports</h1>

      <div style={s.grid}>
        <div style={s.card}><p style={s.label}>Total revenue</p><p style={s.value}>{peso(r.revenue)}</p></div>
        <div style={s.card}><p style={s.label}>Paid / confirmed bookings</p><p style={s.value}>{r.bookings}</p></div>
        <div style={s.card}><p style={s.label}>Occupancy today</p><p style={s.value}>{occupancy}%</p></div>
        <div style={s.card}><p style={s.label}>Rooms available</p><p style={s.value}>{r.rooms.available ?? 0} / {totalRooms}</p></div>
      </div>

      <div style={s.panel}>
        <h2 style={{ marginTop: 0 }}>Bookings by status</h2>
        <table style={s.table}>
          <thead><tr><th style={s.th}>Status</th><th style={s.th}>Bookings</th></tr></thead>
          <tbody>
            {r.byStatus.length === 0 && <tr><td style={s.td} colSpan={2}>No data yet.</td></tr>}
            {r.byStatus.map((b) => (
              <tr key={b.status}>
                <td style={s.td}>{String(b.status).replace('_', ' ')}</td>
                <td style={s.td}>{b.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={s.panel}>
        <h2 style={{ marginTop: 0 }}>Bookings and revenue per month</h2>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Month</th>
              <th style={s.th}>Bookings</th>
              <th style={s.th}>Revenue</th>
              <th style={s.th} />
            </tr>
          </thead>
          <tbody>
            {r.monthly.length === 0 && <tr><td style={s.td} colSpan={4}>No data yet.</td></tr>}
            {r.monthly.map((m) => (
              <tr key={m.month}>
                <td style={s.td}>{m.month}</td>
                <td style={s.td}>{m.bookings}</td>
                <td style={s.td}>{peso(m.revenue)}</td>
                <td style={{ ...s.td, width: '40%' }}>
                  <div style={{ height: 10, borderRadius: 6, background: '#0b5560', width: `${(Number(m.revenue) / maxRevenue) * 100}%` }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
