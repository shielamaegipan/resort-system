import { useCallback, useEffect, useState } from 'react';
import { api, createItemOfflineAware, pendingCount } from '../api.js';

export default function Items() {
  const [items, setItems] = useState([]);
  const [archived, setArchived] = useState([]);
  const [view, setView] = useState('active');
  const [form, setForm] = useState({ title: '', description: '' });
  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState(0);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(await api('/items'));
      if (navigator.onLine) setArchived(await api('/items/archived'));
    } catch (e) {
      setMsg(e.message);
    }
    setPending(await pendingCount());
  }, []);

  useEffect(() => {
    load();
    const onMsg = (e) => e.data?.type === 'synced' && load();
    navigator.serviceWorker?.addEventListener('message', onMsg);
    window.addEventListener('online', load);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMsg);
      window.removeEventListener('online', load);
    };
  }, [load]);

  async function save() {
    if (!form.title.trim()) return;
    setMsg('');
    try {
      if (editing) {
        await api(`/items/${editing}`, { method: 'PUT', body: form });
        setEditing(null);
      } else {
        const { queued } = await createItemOfflineAware(form);
        if (queued) setMsg('Offline: saved on this device. It will sync when you are back online.');
      }
      setForm({ title: '', description: '' });
      load();
    } catch (e) {
      setMsg(e.message);
    }
  }

  const archive = async (id) => { await api(`/items/${id}`, { method: 'DELETE' }); load(); };
  const restore = async (id) => { await api(`/items/${id}/restore`, { method: 'PATCH' }); load(); };
  const startEdit = (it) => { setEditing(it.id); setForm({ title: it.title, description: it.description || '' }); };

  const list = view === 'active' ? items : archived;

  return (
    <section>
      <h2>Items</h2>
      <div className="panel form">
        <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="row">
          <button onClick={save}>{editing ? 'Save changes' : 'Add item'}</button>
          {editing && <button className="ghost" onClick={() => { setEditing(null); setForm({ title: '', description: '' }); }}>Cancel</button>}
        </div>
        {pending > 0 && <small>{pending} item(s) waiting to sync</small>}
        {msg && <small>{msg}</small>}
      </div>

      <div className="tabs">
        <button className={view === 'active' ? 'active' : ''} onClick={() => setView('active')}>Active ({items.length})</button>
        <button className={view === 'archived' ? 'active' : ''} onClick={() => setView('archived')}>Archived ({archived.length})</button>
      </div>

      {list.length === 0 && <p className="empty">{view === 'active' ? 'No items yet. Add your first one above.' : 'Nothing archived.'}</p>}
      <ul className="list">
        {list.map((it) => (
          <li key={it.id}>
            <div>
              <strong>{it.title}</strong>
              {it.description && <p>{it.description}</p>}
            </div>
            <div className="row">
              {view === 'active' ? (
                <>
                  <button className="ghost" onClick={() => startEdit(it)}>Edit</button>
                  <button className="ghost" onClick={() => archive(it.id)}>Archive</button>
                </>
              ) : (
                <button className="ghost" onClick={() => restore(it.id)}>Restore</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
