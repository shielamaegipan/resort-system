import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { peso } from './Bookings.jsx';
import './staff.css';

const today = () => new Date().toLocaleDateString('en-CA');

export default function CashPayments({ notice }) {
  const [date, setDate] = useState(today());
  const [list, setList] = useState({ total: 0, count: 0, payments: [] });
  const [bookings, setBookings] = useState([]);
  const [bid, setBid] = useState('');
  const [bill, setBill] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const loadList = useCallback(() => api('/payments?date=' + date).then(setList).catch((e) => notice(e.message)), [date, notice]);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => {
    api('/bookings').then((r) => setBookings(r.filter((b) => ['confirmed', 'checked_in', 'checked_out'].includes(b.status)))).catch((e) => notice(e.message));
  }, [notice]);
  useEffect(() => {
    if (!bid) { setBill(null); return; }
    api(`/bookings/${bid}/bill`).then(setBill).catch((e) => notice(e.message));
  }, [bid, notice]);

  const pay = async (e) => {
    e.preventDefault();
    try {
      await api(`/bookings/${bid}/payments`, { method: 'POST', body: { amount: Number(amount), note } });
      setAmount(''); setNote(''); notice('Cash payment saved');
      setBill(await api(`/bookings/${bid}/bill`)); loadList();
    } catch (err) { notice(err.message); }
  };
  const removeService = async (rowId) => {
    try { await api(`/bookings/${bid}/services/${rowId}`, { method: 'DELETE' }); setBill(await api(`/bookings/${bid}/bill`)); } catch (err) { notice(err.message); }
  };

  return (
    <>
      <div className="card pad">
        <h3>Receive cash</h3>
        <label>Booking{' '}
          <select value={bid} onChange={(e) => setBid(e.target.value)}>
            <option value="">Choose a booking…</option>
            {bookings.map((b) => <option key={b.id} value={b.id}>#{b.id} · {b.guest_name} · {b.room_name}</option>)}
          </select>
        </label>
        {bill && (
          <>
            <div style={{ marginTop: 12 }}>
              <div className="billrow"><span>Room</span><span>{peso(bill.room_total)}</span></div>
              {bill.services.map((s) => (
                <div key={s.id} className="billrow">
                  <span>{s.name} × {s.quantity} <button className="danger" onClick={() => removeService(s.id)}>Remove</button></span>
                  <span>{peso(s.price * s.quantity)}</span>
                </div>
              ))}
              <div className="billrow"><span>Cash paid</span><span>− {peso(bill.paid)}</span></div>
              <div className="billrow total"><span>Balance</span><span>{peso(bill.balance)}</span></div>
            </div>
            {bill.balance > 0 && (
              <form className="formrow" onSubmit={pay}>
                <label>Amount (₱)<input type="number" min="1" step="0.01" max={bill.balance} required value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
                <label>Note<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
                <button className="primary" type="button" onClick={() => setAmount(String(bill.balance))}>Full balance</button>
                <button className="primary">Save payment</button>
              </form>
            )}
          </>
        )}
      </div>

      <div className="toolbar">
        <label>Date <input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} /></label>
        <strong>Total: {peso(list.total)}</strong><span className="muted">{list.count} payment(s)</span>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Guest</th><th>Room</th><th>Amount</th><th>Note</th><th>Received by</th></tr></thead>
          <tbody>
            {list.payments.map((p) => (
              <tr key={p.id}><td>{String(p.created_at).replace('T', ' ').slice(0, 16)}</td><td><strong>{p.guest_name}</strong></td><td>{p.room_name}</td><td>{peso(p.amount)}</td><td>{p.note || '—'}</td><td>{p.received_by_name}</td></tr>
            ))}
            {!list.payments.length && <tr><td colSpan="6" className="muted">No cash payments on this date.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
