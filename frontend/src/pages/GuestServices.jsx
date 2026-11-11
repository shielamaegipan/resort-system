import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { peso } from './Bookings.jsx';
import './staff.css';

export default function GuestServices({ notice }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/services').then(setRows).catch((e) => notice(e.message)); }, [notice]);
  return (
    <>
      <p className="muted">Ask the front desk to add any of these to your bill during your stay.</p>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Service</th><th>Price</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((s) => <tr key={s.id}><td><strong>{s.name}</strong></td><td>{peso(s.price)}</td><td>{s.description || '—'}</td></tr>)}
            {!rows.length && <tr><td colSpan="3" className="muted">No services available.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
