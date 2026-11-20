import { useEffect, useState } from 'react';
import { api } from '../api.js';

function PasswordField({ label, value, onChange, autoComplete, minLength }) {
  const [show, setShow] = useState(false);
  return (
    <label>{label}
      <span style={{ position: 'relative', display: 'block' }}>
        <input required type={show ? 'text' : 'password'} minLength={minLength} maxLength={128} autoComplete={autoComplete} value={value} onChange={onChange} style={{ width: '100%', boxSizing: 'border-box', paddingRight: 44 }} />
        <button type="button" aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 6, cursor: 'pointer', display: 'flex', color: 'inherit' }}>
          {show ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.5 10.5 0 0 1 12 19c-6.5 0-10-7-10-7a18 18 0 0 1 4.06-5.06M9.9 4.24A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="M2 2l20 20" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
          )}
        </button>
      </span>
    </label>
  );
}

export default function GuestProfile({ user, notice, onUser }) {
  const [f, setF] = useState({ name: '', email: '', phone: '' });
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    api('/auth/profile')
      .then((r) => setF({ name: r.name || '', email: r.email || '', phone: r.phone || '' }))
      .catch((e) => notice(e.message))
      .finally(() => setLoading(false));
  }, [notice]);

  const saveProfile = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const r = await api('/auth/profile', { method: 'PUT', body: f });
      setF({ name: r.name, email: r.email, phone: r.phone || '' });
      if (onUser) onUser({ ...user, name: r.name, email: r.email });
      notice('Profile updated');
    } catch (err) { notice(err.message); }
    setSaving(false);
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (savingPw) return;
    if (pw.new_password !== pw.confirm) { notice('New passwords do not match'); return; }
    setSavingPw(true);
    try {
      await api('/auth/password', { method: 'PUT', body: { current_password: pw.current_password, new_password: pw.new_password } });
      setPw({ current_password: '', new_password: '', confirm: '' });
      notice('Password changed');
    } catch (err) { notice(err.message); }
    setSavingPw(false);
  };

  const box = { display: 'grid', gap: 12, maxWidth: 480, marginBottom: 20 };

  return (
    <>
      <form className="card pad" style={box} onSubmit={saveProfile}>
        <h2>My Profile</h2>
        <label>Full name<input required maxLength={100} disabled={loading} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>Email<input required type="email" maxLength={150} disabled={loading} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Contact number<input type="tel" inputMode="numeric" pattern="[0-9]{11}" maxLength={11} placeholder="09XXXXXXXXX" title="11-digit number, numbers only" disabled={loading} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 11) })} /></label>
        <div className="actions"><button className="primary" disabled={saving || loading}>{saving ? 'Saving...' : 'Save changes'}</button></div>
      </form>

      <form className="card pad" style={box} onSubmit={savePassword}>
        <h2>Change password</h2>
        <PasswordField label="Current password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
        <PasswordField label="New password (at least 12 characters)" minLength={12} autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
        <PasswordField label="Confirm new password" minLength={12} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
        <div className="actions"><button className="primary" disabled={savingPw}>{savingPw ? 'Saving...' : 'Change password'}</button></div>
      </form>
    </>
  );
}