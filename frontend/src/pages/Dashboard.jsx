import { useEffect, useState } from 'react';
import { api } from '../api.js';

const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH');

const S = {
  page: { display: 'grid', gap: 20 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 },
  card: { background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,.08)' },
  label: { fontSize: 13, color: '#5b6b6e', margin: 0 },
  value: { fontSize: 28, fontWeight: 600, margin: '6px 0 0', color: '#093e44' },
  panel: { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.08)', overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 15 },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e3e8e8', color: '#5b6b6e', fontWeight: 500 },
  td: { padding: '10px', borderBottom: '1px solid #f0f3f3' },
  error: { background: '#fbe9e7', color: '#b3261e', padding: '12px 16px', borderRadius: 12 },
};

function Stat({ label, value }) {
  return (
    <div style={S.card}>
      <p style={S.label}>{label}</p>
      <p style={S.value}>{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/dashboard').then(setD).catch((e) => setError(e.message));
  }, []);

  if (error) return <div style={S.error}>{error}</div>;
  if (!d) return <p>Loading...</p>;

  return (
    <div style={S.page}>
      <div style={S.grid}>
        <Stat label="Revenue this month" value={peso(d.month_revenue)} />
        <Stat label="Bookings this month" value={d.month_bookings} />
        <Stat label="Pending bookings" value={d.pending_bookings} />
        <Stat label="Arrivals today" value={d.arrivals_today} />
        <Stat label="Departures today" value={d.departures_today} />
        <Stat label="Occupied rooms" value={`${d.occupied_today} / ${d.rooms.total}`} />
        <Stat label="Rooms available" value={d.rooms.available} />
        <Stat label="Rooms in maintenance" value={d.rooms.maintenance} />
        <Stat label="Staff accounts" value={d.users.staff} />
        <Stat label="Guests" value={d.users.guests} />
      </div>

      <div style={S.panel}>
        <h2 style={{ marginTop: 0 }}>Recent bookings</h2>
        <table style={S.table}>
          <thead>
            <tr>
              {['Guest', 'Room', 'Check-in', 'Check-out', 'Total', 'Status'].map((h) => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.recent_bookings.length === 0 && (
              <tr><td style={S.td} colSpan={6}>No bookings yet.</td></tr>
            )}
            {d.recent_bookings.map((b) => (
              <tr key={b.id}>
                <td style={S.td}>{b.guest_name}</td>
                <td style={S.td}>{b.room_name}</td>
                <td style={S.td}>{b.check_in}</td>
                <td style={S.td}>{b.check_out}</td>
                <td style={S.td}>{peso(b.total_price)}</td>
                <td style={S.td}>{String(b.status).replace('_', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
