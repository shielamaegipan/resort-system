import { useCallback, useEffect, useState } from 'react';
import { enablePush, getPushStatus, sendTestPush } from '../push.js';

export default function PushControls() {
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (action, success) => {
    setBusy(true); setMessage('');
    try { await action(); setMessage(success); await refresh(); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  const refresh = useCallback(async () => {
    try { setStatus(await getPushStatus()); }
    catch (error) { setMessage(error.message); }
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('resort:push-changed', refresh);
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('resort:push-changed', refresh); };
  }, [refresh]);
  const label = !status ? 'Checking push notifications…'
    : !status.supported ? 'Push needs a supported browser on localhost or HTTPS.'
    : !status.configured ? 'Push is unavailable. Ask the administrator to check the server setup.'
    : status.permission === 'denied' ? 'Notifications are blocked. Allow them in this site’s browser settings.'
    : status.setupError ? status.setupError
    : status.subscribed ? 'Push is enabled on this device and reconnects automatically.' : 'Allow notifications once to enable automatic push alerts on this device.';
  return <section className="push-controls" aria-label="Device push notifications">
    <p className="muted">{label}</p>
    <p className="muted">Enable on each device. On iPhone or iPad, add this app to your Home Screen and open it there first.</p>
    {status?.supported && status.configured && status.permission !== 'denied' && <div className="actions">
      <button disabled={busy} onClick={() => run(enablePush, 'Push enabled on this device.')}>{busy ? 'Please wait...' : 'Enable push notifications'}</button>
      {status.subscribed && <button disabled={busy} onClick={() => run(sendTestPush, 'Test accepted by the push provider. Check your device notifications.')}>Send test notification</button>}
    </div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
