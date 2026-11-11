import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { peso } from './Bookings.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import './staff.css';

const empty = { id: null, name: '', price: '', description: '' };

export default function Services({ notice }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [bookings, setBookings] = useState([]);
  const [add, setAdd] = useState({ booking_id: '', service_id: '', quantity: 1 });
  const [ask, dialog] = useConfirm();

  const load = useCallback(() => api('/services').then(setRows).catch((e) => notice(e.message)), [notice]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api('/bookings').then((r) => setBookings(r.filter((b) => ['confirmed', 'checked_in'].includes(b.status)))).catch((e) => notice(e.message));
  }, [notice]);

  const save = async (e) => {
    e.preventDefault();
    const body = { name: form.name, price: Number(form.price), description: form.description };
    try {
      if (form.id) await api('/services/' + form.id, { method: 'PUT', body });
      else await api('/services', { method: 'POST', body });
      setForm(empty); load();
    } catch (err) { notice(err.message); }
  };
  const remove = async (s) => {
    const ok = await ask({ title: 'Delete this service?', message: `Delete "${s.name}" from the catalog? Past bills are not changed.`, confirmText: 'Yes, delete', danger: true });
    if (!ok) return;
    try { await api('/services/' + s.id, { method: 'DELETE' }); load(); } catch (err) { notice(err.message); }
  };
  const addToBill = async (e) => {
    e.preventDefault();
    try {
      await api(`/bookings/${add.booking_id}/services`, { method: 'POST', body: { service_id: Number(add.service_id), quantity: Number(add.quantity) } });
      notice('Service added to the bill'); setAdd({ ...add, service_id: '', quantity: 1 });
    } catch (err) { notice(err.message); }
  };

  return (
    <>
      <div className="card pad">
        <h3>Add a service to a guest's bill</h3>
        <form className="formrow" onSubmit={addToBill}>
          <label>Booking
            <select required value={add.booking_id} onChange={(e) => setAdd({ ...add, booking_id: e.target.value })}>
              <option value="">Choose…</option>
              {bookings.map((b) => <option key={b.id} value={b.id}>#{b.id} · {b.guest_name} · {b.room_name}</option>)}
            </select>
          </label>
          <label>Service
            <select required value={add.service_id} onChange={(e) => setAdd({ ...add, service_id: e.target.value })}>
              <option value="">Choose…</option>
              {rows.map((s) => <option key={s.id} value={s.id}>{s.name} ({peso(s.price)})</option>)}
            </select>
          </label>
          <label>Qty<input type="number" min="1" style={{ width: 70 }} value={add.quantity} onChange={(e) => setAdd({ ...add, quantity: e.target.value })} /></label>
          <button className="primary">Add to bill</button>
        </form>
      </div>

      <div className="card pad">
        <h3>{form.id ? 'Edit service' : 'New service'}</h3>
        <form className="formrow" onSubmit={save}>
          <label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Price (₱)<input required type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
          <label>Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <button className="primary">{form.id ? 'Save' : 'Add'}</button>
          {form.id && <button type="button" onClick={() => setForm(empty)}>Cancel</button>}
        </form>
      </div>

      <div className="card table-wrap">
        <table>
          <thead><tr><th>Service</th><th>Price</th><th>Description</th><th></th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.name}</strong></td><td>{peso(s.price)}</td><td>{s.description || '—'}</td>
                <td className="actions">
                  <button onClick={() => setForm({ id: s.id, name: s.name, price: String(Math.round(s.price)), description: s.description || '' })}>Edit</button>
                  <button className="danger" onClick={() => remove(s)}>Delete</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="4" className="muted">No services yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {dialog}
    </>
  );
}
