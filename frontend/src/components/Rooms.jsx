import { useEffect, useState } from 'react';
import { api, peso } from '../api';

function resize(file, max = 1000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}

const empty = { name: '', type: 'Standard', capacity: 2, price_per_night: '', description: '', status: 'available' };

export default function Rooms({ user }) {
  const staff = user.role === 'admin' || user.role === 'staff';
  const admin = user.role === 'admin';
  const [rooms, setRooms] = useState([]);
  const [archived, setArchived] = useState([]);
  const [tab, setTab] = useState('active');
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState('');
  const [photo, setPhoto] = useState(null);
  const [fileKey, setFileKey] = useState(0);

  const load = async () => {
    try {
      setRooms(await api('/rooms'));
      if (staff) setArchived(await api('/rooms/archived'));
    } catch (e) { setMsg(e.message); }
  };
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      let id = editId;
      if (editId) await api('/rooms/' + editId, { method: 'PUT', body: form });
      else id = (await api('/rooms', { method: 'POST', body: form })).id;
      if (photo) await api(`/rooms/${id}/image`, { method: 'POST', body: { image: photo } });
      setForm(empty); setEditId(null); setPhoto(null); setFileKey((k) => k + 1); load();
    } catch (e2) { setMsg(e2.message); }
  };

  const pick = async (e) => {
    const file = e.target.files[0];
    if (!file) return setPhoto(null);
    try { setPhoto(await resize(file)); } catch { setMsg('Could not read the image'); }
  };

  const edit = (r) => {
    setEditId(r.id);
    setPhoto(null);
    setForm({ name: r.name, type: r.type, capacity: r.capacity, price_per_night: r.price_per_night, description: r.description || '', status: r.status });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const act = async (path, method) => {
    try { await api(path, { method }); load(); } catch (e) { setMsg(e.message); }
  };

  const list = tab === 'active' ? rooms : archived;

  return (
    <>
      <h2 className="title">Rooms</h2>
      {msg && <p className="err">{msg}</p>}

      {staff && (
        <form className="card grid" onSubmit={save}>
          <input placeholder="Room name" value={form.name} onChange={set('name')} required />
          <select value={form.type} onChange={set('type')}>
            {['Standard', 'Deluxe', 'Family Suite', 'Villa', 'Cottage'].map((t) => <option key={t}>{t}</option>)}
          </select>
          <input type="number" min="1" placeholder="Capacity" value={form.capacity} onChange={set('capacity')} required />
          <input type="number" min="0" step="0.01" placeholder="Price per night" value={form.price_per_night} onChange={set('price_per_night')} required />
          <select value={form.status} onChange={set('status')}>
            <option value="available">Available</option>
            <option value="maintenance">Maintenance</option>
          </select>
          <textarea className="span" placeholder="Description" value={form.description} onChange={set('description')} />
          <label className="span">
            Room photo {editId && '(leave empty to keep the current one)'}
            <input key={fileKey} type="file" accept="image/*" onChange={pick} />
          </label>
          {photo && <img className="span preview" src={photo} alt="Preview" />}
          <div className="span row">
            <button className="primary">{editId ? 'Save changes' : 'Add room'}</button>
            {editId && <button type="button" className="ghost" onClick={() => { setEditId(null); setForm(empty); setPhoto(null); setFileKey((k) => k + 1); }}>Cancel</button>}
          </div>
        </form>
      )}

      {staff && (
        <div className="tabs">
          <button className={tab === 'active' ? 'primary' : 'ghost'} onClick={() => setTab('active')}>Active ({rooms.length})</button>
          <button className={tab === 'archived' ? 'primary' : 'ghost'} onClick={() => setTab('archived')}>Archived ({archived.length})</button>
        </div>
      )}

      <div className="cards">
        {list.map((r) => (
          <div className="card room" key={r.id}>
            <div className="photo">
              {r.image_url ? <img src={r.image_url} alt={r.name} loading="lazy" /> : <div className="ph">🏝️<small>No photo yet</small></div>}
            </div>
            <div className="row between">
              <h3>{r.name}</h3>
              <span className={'pill ' + r.status}>{r.status}</span>
            </div>
            <p className="muted">{r.type} · up to {r.capacity} guests</p>
            <p>{r.description}</p>
            <p className="price">{peso(r.price_per_night)} <small>/ night</small></p>
            {staff && tab === 'active' && (
              <div className="row">
                <button className="ghost" onClick={() => edit(r)}>Edit</button>
                {admin && <button className="ghost danger" onClick={() => act('/rooms/' + r.id, 'DELETE')}>Archive</button>}
              </div>
            )}
            {admin && tab === 'archived' && <button className="ghost" onClick={() => act(`/rooms/${r.id}/restore`, 'POST')}>Restore</button>}
          </div>
        ))}
        {!list.length && <p className="muted">No rooms here.</p>}
      </div>
    </>
  );
}
