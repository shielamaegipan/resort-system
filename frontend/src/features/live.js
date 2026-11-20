import { useEffect } from 'react';
export function useLiveRefresh(load) {
  useEffect(() => {
    let timer;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(load, 150); };
    window.addEventListener('resort:data-changed', refresh);
    window.addEventListener('focus', refresh);
    const fallback = setInterval(refresh, 30000);
    return () => { clearTimeout(timer);clearInterval(fallback);window.removeEventListener('resort:data-changed',refresh);window.removeEventListener('focus',refresh); };
  }, [load]);
}
