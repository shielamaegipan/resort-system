import { useMemo, useState } from 'react';
import { money, useAdmin, useData, useDebounced, useWrite } from './data.jsx';
import { Confirm, Dialog, Empty, Icon, Paged, QueryState } from './ui.jsx';
import { resizeImage } from '../utils/resizeImage.js';
import HeaderAction from './HeaderAction.jsx';
import { RoomGallery, ReadOnlyRooms } from './RoomExtras.jsx';
export default function Rooms({user,go}) {
  if (!user.permissions.includes('rooms.manage')) return <ReadOnlyRooms user={user} go={go}/>;
  return <ManagedRooms user={user} go={go}/>;
}
function ManagedRooms({user,go}) {
  const [detail,setDetail]=useState(null);
  const [minPrice,setMinPrice]=useState(''),[maxPrice,setMaxPrice]=useState(''),[capacity,setCapacity]=useState('');
  const [tab, setTab] = useState('active');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [availability, setAvailability] = useState('');
  const [dates, setDates] = useState({ check_in: '', check_out: '' });
  const [range, setRange] = useState('');
  const [editing, setEditing] = useState(null);
  const [archive, setArchive] = useState(null);
  const query = useData('rooms', `/admin/rooms${range}`);
  const write = useWrite();
  const rows = useMemo(() => (query.data || []).filter((r) => (!minPrice||Number(r.price_per_night)>=Number(minPrice))&&(!maxPrice||Number(r.price_per_night)<=Number(maxPrice))&&(!capacity||r.capacity>=Number(capacity))&& Boolean(r.deleted_at) === (tab === 'archived') && `${r.name} ${r.description} ${r.amenities || ''}`.toLowerCase().includes(debounced.toLowerCase()) && (!type || r.type === type) && (!status || r.status === status) && (!availability || Boolean(r.available_for_dates) === (availability === 'available'))), [query.data, tab, debounced, type, status, availability,minPrice,maxPrice,capacity]);
  return <div className="admin-stack"><div className="admin-list-heading"><div className="admin-tabs"><button className={tab === 'active' ? 'selected' : ''} onClick={() => setTab('active')}>Active</button><button className={tab === 'archived' ? 'selected' : ''} onClick={() => setTab('archived')}>Archived ({(query.data || []).filter(r => r.deleted_at).length})</button></div><HeaderAction><button className="primary" onClick={() => setEditing({})}>Add room</button></HeaderAction></div>
    <QueryState query={query}>{() => rows.length ? <Paged rows={rows} size={9}>{(list) => <div className="admin-room-grid">{list.map((r) => <article className="admin-card admin-room" key={r.id}><div className="admin-room-photo">{r.image_url ? <img src={r.image_url} loading="lazy" alt={r.name} /> : <div className="admin-room-placeholder"><span>No photo</span></div>}<span className={`admin-photo-tag ${r.status === 'maintenance' ? 'maintenance' : ''}`}>{r.deleted_at ? 'Archived' : r.status === 'maintenance' ? 'Maintenance' : r.available_for_dates ? 'Available' : 'Reserved'}</span></div><div className="admin-room-body"><div className="classic-room-heading"><h2>{r.name}</h2><span className="price">{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(r.price_per_night))}<small>/night</small></span></div><p className="rtype">{r.type}</p><p className="admin-room-capacity">Up to {r.capacity} guests</p><p className="admin-room-description">{r.description || 'No description added.'}</p>{r.amenities && <p className="admin-amenities">{r.amenities}</p>}<div className="admin-room-actions">{r.deleted_at ? <button disabled={write.isPending} onClick={() => write.mutate({ path: `/rooms/${r.id}/restore`, message: 'Room restored' })}>Restore room</button> : <><button onClick={() => setEditing(r)}>Edit</button><button className="admin-text-button danger" onClick={() => setArchive(r)}>Delete</button></>}<button className="classic-room-details" onClick={()=>setDetail(r)}>Details & photos</button></div></div></article>)}</div>}</Paged> : <Empty title="No rooms match" text="Try another filter, or add a room to your inventory." />}</QueryState>
    <details className="classic-advanced"><summary>Search and filters</summary>{user.permissions.includes('maintenance.manage')&&<div className="actions"><button onClick={()=>go('operations')}>Housekeeping</button></div>}    <section className="admin-card admin-filters"><label>Minimum price<input type="number" min="0" value={minPrice} onChange={e=>setMinPrice(e.target.value)}/></label><label>Maximum price<input type="number" min="0" value={maxPrice} onChange={e=>setMaxPrice(e.target.value)}/></label><label>Minimum capacity<input type="number" min="1" value={capacity} onChange={e=>setCapacity(e.target.value)}/></label><label className="admin-search">Search rooms<input type="search" placeholder="Name, description, amenities…" value={search} onChange={(e) => setSearch(e.target.value)} /></label><label>Room type<select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{[...new Set((query.data || []).map((r) => r.type))].map((t) => <option key={t}>{t}</option>)}</select></label><label>Room status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="available">Open</option><option value="occupied">Occupied</option><option value="maintenance">Maintenance</option><option value="cleaning">Cleaning</option><option value="out_of_service">Out of service</option></select></label><label>Availability<select value={availability} onChange={(e) => setAvailability(e.target.value)}><option value="">Any availability</option><option value="available">Available</option><option value="unavailable">Unavailable</option></select></label>
      <form className="admin-date-filter" onSubmit={(e) => { e.preventDefault(); setRange(`?${new URLSearchParams(dates)}`); }}><label>Check-in<input type="date" required value={dates.check_in} onChange={(e) => setDates({ ...dates, check_in: e.target.value })} /></label><label>Check-out<input type="date" required min={dates.check_in} value={dates.check_out} onChange={(e) => setDates({ ...dates, check_out: e.target.value })} /></label><button>Check dates</button>{range && <button type="button" onClick={() => { setRange(''); setDates({ check_in: '', check_out: '' }); }}>Reset dates</button>}</form>
      <p className="admin-help">Availability is based on {range ? `${dates.check_in} to ${dates.check_out}` : 'tonight'} and active reservations. “Open” is the operational room status.</p>
    </section>
</details>
    {detail&&<RoomGallery room={(query.data||[]).find(r=>r.id===detail.id)||detail} editable onClose={()=>setDetail(null)}/>}
    {editing && <RoomForm room={editing} onClose={() => setEditing(null)} />}
    {archive && <Confirm title="Archive this room?" text={`${archive.name} will be hidden from new bookings. Existing history is preserved. Rooms with active reservations cannot be archived.`} action="Archive room" busy={write.isPending} onClose={() => setArchive(null)} onConfirm={() => write.mutate({ path: `/rooms/${archive.id}`, method: 'DELETE', message: 'Room archived' }, { onSuccess: () => setArchive(null) })} />}
  </div>;
}
function RoomForm({ room, onClose }) {
  const [form, setForm] = useState({ name: room.name || '', type: room.type || 'Standard', capacity: room.capacity || 2, price_per_night: room.price_per_night ?? '', description: room.description || '', amenities: room.amenities || '', status: room.status || 'available' });
  const [image, setImage] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState(room.id);
  const { notify } = useAdmin();
  const write = useWrite();
  const field = (key) => ({ value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }) });
  const choose = async (file) => {
    if (!file) { setImage(''); return; }
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) { setError('Choose a JPG, PNG, or WebP image under 15 MB.'); return; }
    setProcessing(true);
    try { setImage(await resizeImage(file)); } catch (e) { setError(e.message); } finally { setProcessing(false); }
  };
  const save = async (event) => {
    event.preventDefault(); setError('');
    // Retain the newly created ID if uploading fails, so retry never duplicates a room.
    let id = savedId;
    try {
      await write.mutateAsync({ path: savedId ? `/rooms/${savedId}` : '/rooms', method: savedId ? 'PUT' : 'POST', body: form }).then((saved) => { id = saved.id; setSavedId(id); });
      if (image) {
        setProcessing(true);
        await write.mutateAsync({ path: `/rooms/${id}/image`, body: { image } });
      }
      notify('Room and photo saved'); onClose();
    } catch (e) { setError(id && image ? `Room information is saved. Photo upload may need retrying: ${e.message}` : e.message); }
    finally { setProcessing(false); }
  };
  const busy = write.isPending || processing;
  return <Dialog title={room.id ? 'Edit room' : 'Add a room'} onClose={onClose} busy={busy}><form className="admin-form" onSubmit={save}><fieldset disabled={busy}><label>Room name<input required maxLength={100} {...field('name')} /></label><div className="admin-form-grid"><label>Room type<input required maxLength={50} {...field('type')} /></label><label>Capacity<input required type="number" min="1" max="1000" step="1" {...field('capacity')} /></label><label>Price per night (PHP)<input required type="number" min="0" max="99999999.99" step="0.01" {...field('price_per_night')} /></label><label>Operational status<select {...field('status')}><option value="available">Open</option><option value="occupied">Occupied</option><option value="maintenance">Maintenance</option><option value="cleaning">Cleaning</option><option value="out_of_service">Out of service</option></select></label></div><label>Description<textarea rows="3" maxLength={5000} {...field('description')} /></label><label>Amenities<textarea rows="2" placeholder="Air conditioning, Wi-Fi, private balcony…" maxLength={2000} {...field('amenities')} /></label><label>Room photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => choose(e.target.files[0])} /></label>{(image || room.image_url) && <img className="admin-image-preview" src={image || room.image_url} alt="Room photo preview" />}</fieldset>{error && <p className="admin-form-error" role="alert">{error}</p>}<div className="admin-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save room'}</button></div></form></Dialog>;
}
