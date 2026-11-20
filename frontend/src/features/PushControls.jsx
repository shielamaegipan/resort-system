import { useCallback, useEffect, useState } from 'react';
import { getPushStatus } from '../push.js';

export default function PushControls() {
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');
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
    {message && <p role="status">{message}</p>}
  </section>;
}
