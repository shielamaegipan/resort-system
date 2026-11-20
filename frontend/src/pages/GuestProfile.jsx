import { useEffect, useState } from 'react';
import { api } from '../api.js';

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
        <label>Current password<input required type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></label>
        <label>New password (at least 12 characters)<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></label>
        <label>Confirm new password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></label>
        <div className="actions"><button className="primary" disabled={savingPw}>{savingPw ? 'Saving...' : 'Change password'}</button></div>
      </form>
    </>
  );
}