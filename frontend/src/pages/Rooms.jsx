import { useEffect, useState, useCallback } from 'react';
import { api, createBooking } from '../api.js';
import { cacheGet, cacheSet } from '../db.js';
import { resizeImage } from '../utils/resizeImage.js';
import { useLiveRefresh } from '../features/live.js';
import { RoomGallery } from '../admin/RoomExtras.jsx';
import { useConfirm } from '../components/Confirm.jsx';

const peso = n => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(n));
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

export default function Rooms({ user, notice, setHeaderAction }) {
  const [rooms, setRooms] = useState([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const [archived, setArchived] = useState([]);
  const [tab, setTab] = useState('active');
  const [editing, setEditing] = useState(null); // room object, {} for new
  const [booking, setBooking] = useState(null);
  const [search, setSearch] = useState({ check_in: '', check_out: '', guests: 1 });
  const [searched, setSearched] = useState(false);
  const [ask, dialog] = useConfirm();
  const isGuest = user.role === 'guest';
  const canManage = !isGuest && user.permissions?.includes('rooms.manage');
  const [details,setDetails]=useState(null);
  const [filters,setFilters]=useState({name:'',type:'',status:'',min:'',max:'',sort:'id'});
  const [roomPage,setRoomPage]=useState(1);

  const load = useCallback(async () => {
    try {
      const r = await api('/rooms');
      setRooms(r);setError(''); cacheSet('rooms', r);
      if (user.role === 'admin') setArchived(await api('/rooms/archived'));
    } catch (e) {
      setError(e.message);
      if (!e.status) setRooms((await cacheGet('rooms')) || []);
      else notice(e.message);
    }finally{setLoading(false);}
  }, [user.role, notice]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);
  useEffect(() => {
    setHeaderAction(canManage ? <button className="primary" onClick={() => setEditing({})}>Add room</button> : null);
    return () => setHeaderAction(null);
  }, [canManage, setHeaderAction]);

  const doSearch = async (e) => {
    e.preventDefault();
    if (!search.check_in || !search.check_out) return notice('Choose check-in and check-out dates');
    try {
      const q = new URLSearchParams(search).toString();
      setRooms(await api('/rooms/available?' + q)); setSearched(true);
    } catch (err) { notice(err.message); }
  };
  const clearSearch = () => { setSearch({ check_in: '', check_out: '', guests: 1 }); setSearched(false); load(); };

  const remove = async (room) => {
    const ok = await ask({ title: 'Delete this room?', message: `Are you sure you want to delete ${room.name}? Only the admin can restore it afterwards.`, confirmText: 'Yes, delete', danger: true });
    if (!ok) return;
    try { await api('/rooms/' + room.id, { method: 'DELETE' }); notice('Room deleted'); load(); } catch (e) { notice(e.message); }
  };
  const markReady=async room=>{
    const ok=await ask({title:'Mark room ready?',message:`Confirm ${room.name} has been cleaned and inspected.`,confirmText:'Mark ready'});
    if(!ok)return;
    try{await api(`/ops/rooms/${room.id}/operation`,{method:'PATCH',body:{status:'available'}});notice('Room marked ready');load();}catch(e){notice(e.message);}
  };
  const restore = async (room) => {
    try { await api(`/rooms/${room.id}/restore`, { method: 'POST' }); load(); } catch (e) { notice(e.message); }
  };

  const source=(tab==='archived'?archived:rooms).filter(r=>(!filters.name||r.name.toLowerCase().includes(filters.name.toLowerCase()))&&(!filters.type||r.type===filters.type)&&(!filters.status||r.status===filters.status)&&(!filters.min||Number(r.price_per_night)>=Number(filters.min))&&(!filters.max||Number(r.price_per_night)<=Number(filters.max))).sort((a,b)=>filters.sort==='name'?a.name.localeCompare(b.name):filters.sort==='price_asc'?Number(a.price_per_night)-Number(b.price_per_night):filters.sort==='price_desc'?Number(b.price_per_night)-Number(a.price_per_night):a.id-b.id);
  const page=Math.min(roomPage,Math.max(1,Math.ceil(source.length/12)));
  const list=source.slice((page-1)*12,page*12);
  const filterField=k=>({value:filters[k],onChange:e=>{setFilters({...filters,[k]:e.target.value});setRoomPage(1);}});

  return (
    <>
      {user.role === 'admin' && (
        <div className="tabs">
          <button className={tab === 'active' ? 'on' : ''} onClick={() => setTab('active')}>Active</button>
          <button className={tab === 'archived' ? 'on' : ''} onClick={() => setTab('archived')}>Archived ({archived.length})</button>
        </div>
      )}
      {isGuest && (
        <form className="searchbar" onSubmit={doSearch}>
          <label>Check-in<input type="date" min={today()} value={search.check_in} onChange={(e) => setSearch({ ...search, check_in: e.target.value })} /></label>
          <label>Check-out<input type="date" min={search.check_in || today()} value={search.check_out} onChange={(e) => setSearch({ ...search, check_out: e.target.value })} /></label>
          <label>Guests<input type="number" min="1" value={search.guests} onChange={(e) => setSearch({ ...search, guests: e.target.value })} /></label>
          <button className="primary">Search rooms</button>
          {searched && <button type="button" className="ghost" onClick={clearSearch}>Show all</button>}
        </form>
      )}
      {error&&<p role="alert" className="error">{error} <button onClick={load}>Retry</button></p>}
      <div className="grid">
        {list.map((r) => (
          <div className="card room" key={r.id}>
            {r.image_url ? <img src={r.image_url} alt={r.name} /> : <div className="nophoto">No photo</div>}
            <div className="body">
              <div className="row"><h3>{r.name}</h3><span className="price">{peso(r.price_per_night)}<small>/night</small></span></div>
              <p className="rtype">{r.type}{!['available','occupied'].includes(r.status)&&<b className="pill warn">{r.status.replaceAll('_',' ')}</b>}</p>
              <p className="muted rcap">Up to {r.capacity} {Number(r.capacity) === 1 ? 'guest' : 'guests'}</p>
              <RoomDesc text={r.description} />
              <div className="actions">
                {tab === 'archived' ? <button onClick={() => restore(r)}>Restore</button> : canManage ? (
                  <>
                    <button onClick={() => setEditing(r)}>Edit</button>
                    <button className="danger" onClick={() => remove(r)}>Delete</button><button onClick={()=>setDetails(r)}>Details</button>
                  </>
                ) : isGuest && !['maintenance','out_of_service'].includes(r.status) && (
                  <button className="primary" onClick={() => setBooking(r)}>Book now</button>
                )}
                {!isGuest&&!canManage&&r.status==='cleaning'&&user.permissions?.includes('rooms.operation')&&<button onClick={()=>markReady(r)}>Mark cleaned / ready</button>}
              </div>
            </div>
          </div>
        ))}
        {loading&&!list.length&&<p className="muted" role="status">Loading rooms...</p>}
        {!loading&&!list.length && <p className="muted">{searched ? 'No rooms are free for those dates.' : 'No rooms yet.'}</p>}
      </div>
      {source.length>12&&<div className="feature-pagination"><button disabled={page<=1} onClick={()=>setRoomPage(page-1)}>Previous</button><span>Page {page} of {Math.ceil(source.length/12)}</span><button disabled={page>=Math.ceil(source.length/12)} onClick={()=>setRoomPage(page+1)}>Next</button></div>}
      {!isGuest&&<details className="feature-options"><summary>Search and filter rooms</summary><div className="card pad searchbar"><label>Room name<input type="search" {...filterField('name')}/></label><label>Room type<select {...filterField('type')}><option value="">All types</option>{[...new Set([...rooms,...archived].map(r=>r.type))].map(t=><option key={t}>{t}</option>)}</select></label><label>Status<select {...filterField('status')}><option value="">All statuses</option>{['available','occupied','cleaning','maintenance','out_of_service'].map(t=><option key={t}>{t}</option>)}</select></label><label>Minimum price<input type="number" min="0" {...filterField('min')}/></label><label>Maximum price<input type="number" min="0" {...filterField('max')}/></label><label>Sort<select {...filterField('sort')}><option value="id">Room order</option><option value="name">Name</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select></label></div><form className="searchbar" onSubmit={doSearch}><label>Available from<input type="date" required value={search.check_in} onChange={e=>setSearch({...search,check_in:e.target.value})}/></label><label>Until<input type="date" required min={search.check_in} value={search.check_out} onChange={e=>setSearch({...search,check_out:e.target.value})}/></label><button>Check availability</button><button type="button" onClick={clearSearch}>Reset dates</button></form></details>}
      {details&&<section className="feature-panel"><RoomGallery room={rooms.find(r=>r.id===details.id)||details} editable={canManage} onClose={()=>setDetails(null)}/></section>}
      {editing && <RoomForm room={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} notice={notice} />}
      {booking && <BookForm room={booking} user={user} dates={search} onClose={() => setBooking(null)} notice={notice} />}
      {dialog}
    </>
  );
}

// Long descriptions are cut short; the "…" is a button that shows the full text
function RoomDesc({ text = '' }) {
  const [open, setOpen] = useState(false);
  const LIMIT = 85;
  if (text.length <= LIMIT) return <p className="rdesc">{text}</p>;
  return (
    <p className="rdesc">
      {open ? text : text.slice(0, LIMIT).trimEnd()}
      {open ? (
        <button type="button" className="dots less" onClick={() => setOpen(false)}> Show less</button>
      ) : (
        <button type="button" className="dots" title="Show full description" aria-label="Show full description" onClick={() => setOpen(true)}>…</button>
      )}
    </p>
  );
}

function RoomForm({ room, onClose, onSaved, notice }) {
  const [f, setF] = useState({ name: room.name || '', type: room.type || 'Standard', capacity: room.capacity || 2, price_per_night: room.price_per_night ?? '', description: room.description || '', room_number:room.room_number||'', amenities:room.amenities||'', status: room.status || 'available' });
  const [file, setFile] = useState(null);
  const [savedId,setSavedId]=useState(room.id);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault(); if(busy)return;setBusy(true);
    try {
      const saved = savedId ? await api('/rooms/' + savedId, { method: 'PUT', body: f }) : await api('/rooms', { method: 'POST', body: f });setSavedId(saved.id);
      if (file) await api(`/rooms/${saved.id}/image`, { method: 'POST', body: { image: await resizeImage(file) } });
      notice('Room saved'); onSaved();
    } catch (err) { notice(err.message); setBusy(false); }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>{room.id ? 'Edit room' : 'Add room'}</h2>
        <label>Name<input value={f.name} onChange={set('name')} required /></label>
        <div className="two">
          <label>Type<input value={f.type} onChange={set('type')} /></label>
          <label>Capacity<input type="number" min="1" value={f.capacity} onChange={set('capacity')} /></label>
        </div>
        <div className="two">
          <label>Price per night<input type="number" min="0" step="0.01" value={f.price_per_night} onChange={set('price_per_night')} required /></label>
          <label>Status<select value={f.status} onChange={set('status')}><option value="available">Available</option><option value="occupied" disabled={room.status!=='occupied'}>Occupied</option><option value="cleaning">Cleaning</option><option value="maintenance">Maintenance</option><option value="out_of_service">Out of Service</option></select></label>
        </div>
        <label>Room number<input maxLength={30} value={f.room_number} onChange={set('room_number')}/></label><label>Amenities<textarea maxLength={2000} value={f.amenities} onChange={set('amenities')}/></label>
        <label>Description<textarea rows="3" value={f.description} onChange={set('description')} /></label>
        <label>Picture<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
        <div className="actions end"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>Save</button></div>
      </form>
    </div>
  );
}

function BookForm({ room, user, dates, onClose, notice }) {
  const [policies,setPolicies]=useState(null);
  const [ranges,setRanges]=useState([]);useEffect(()=>{api('/advanced/policies').then(setPolicies).catch(()=>{});},[]);useEffect(()=>{api(`/rooms/${room.id}/booked-dates`).then(setRanges).catch(()=>{});},[room.id]);
  const [f, setF] = useState({ guest_name: user.name, guest_contact: '', special_requests:'', guests: dates.guests || 1, check_in: dates.check_in, check_out: dates.check_out });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const nights = f.check_in && f.check_out ? Math.round((new Date(f.check_out) - new Date(f.check_in)) / 86400000) : 0;

  const submit = async (e) => {
    e.preventDefault();
    if(busy)return;
    if (nights <= 0) return notice('Check-out must be after check-in'); if (ranges.some((x) => f.check_in < x.check_out && f.check_out > x.check_in)) return notice('Those dates are already booked. Please choose other dates.');
    setBusy(true);
    try {
      const r = await createBooking({ ...f, room_id: room.id });
      notice(r.queued ? 'You are offline. Booking saved and will sync when you are back online.' : 'Booking sent. Please wait for the staff to confirm.');
      onClose();
    } catch (err) { notice(err.message); setBusy(false); }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Book {room.name}</h2>{ranges.length > 0 && <div className="muted"><strong>Already booked:</strong>{ranges.map((x, i) => <div key={i}>{x.check_in} → {x.check_out}</div>)}<div>You can book any other dates.</div></div>}
        <label>Guest name<input value={f.guest_name} onChange={set('guest_name')} required /></label>
        <label>Contact number<input required type="tel" inputMode="numeric" pattern="[0-9]{11}" minLength={11} maxLength={11} placeholder="09XXXXXXXXX" title="11-digit number, numbers only" value={f.guest_contact} onChange={(e) => setF({ ...f, guest_contact: e.target.value.replace(/\D/g, '').slice(0, 11) })} /></label>
        <div className="two">
          <label>Check-in<input type="date" min={today()} value={f.check_in} onChange={set('check_in')} required /></label>
          <label>Check-out<input type="date" min={f.check_in || today()} value={f.check_out} onChange={set('check_out')} required /></label>
        </div>
        <label>Guests (max {room.capacity})<input type="number" min="1" max={room.capacity} value={f.guests} onChange={set('guests')} /></label>
        <label>Special requests<textarea maxLength={5000} value={f.special_requests} onChange={set('special_requests')}/></label>{policies&&<details><summary>Booking policies</summary><p>Check-in: {policies.check_in_time} ? Check-out: {policies.check_out_time}</p><p>{policies.booking_policy||'Contact reception for booking policies.'}</p><p>{policies.cancellation_policy}</p></details>}
        {nights > 0 && <p className="total">{nights} night(s) · Total {peso(nights * room.price_per_night)}</p>}
        <div className="actions end"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>Confirm booking</button></div>
      </form>
    </div>
  );
}
