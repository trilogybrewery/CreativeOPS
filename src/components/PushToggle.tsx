'use client';

import { useEffect, useState } from 'react';

function b64ToBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Tombol nyalakan / matikan push notif untuk perangkat ini. */
export default function PushToggle() {
  const [state, setState] = useState<'loading' | 'unsupported' | 'off' | 'on' | 'denied'>('loading');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, []);

  async function enable() {
    setMsg('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch('/api/push')).json();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      const r = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      if (!r.ok) throw new Error();
      setState('on');
    } catch {
      setMsg('Gagal menyalakan notifikasi. Pastikan web dibuka lewat https, dan di iPhone sudah ditambah ke Home Screen dulu.');
    }
  }
  async function disable() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState('off');
  }

  if (state === 'loading') return <span className="small muted">Memeriksa…</span>;
  if (state === 'unsupported') return <span className="small muted">Browser ini belum mendukung push notif. Di iPhone, tambah web ini ke Home Screen lewat Safari dulu, lalu buka dari ikonnya.</span>;
  if (state === 'denied') return <span className="small muted">Notifikasi diblokir di browser ini. Buka pengaturan situs di browser, izinkan notifikasi, lalu muat ulang.</span>;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        {state === 'on' ? (
          <>
            <span className="pill good"><i />Push notif nyala di perangkat ini</span>
            <button className="btn sm" onClick={disable}>Matikan</button>
          </>
        ) : (
          <button className="btn pri" onClick={enable}>Nyalakan push notif di perangkat ini</button>
        )}
      </div>
      {msg ? <span className="small" style={{ color: 'var(--crit)' }}>{msg}</span> : null}
    </div>
  );
}
