'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Upload file ke ticket, satu per satu, dengan progress. File dialirkan langsung ke penyimpanan server. */
export default function Uploader({ ticketId, category, label, accept, primary }: { ticketId: number; category: string; label: string; accept?: string; primary?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState('');

  function send(file: File) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/api/tickets/${ticketId}/files?category=${category}&name=${encodeURIComponent(file.name)}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && setPct(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        let msg = 'Upload gagal.';
        try {
          msg = JSON.parse(xhr.responseText).error || msg;
        } catch {}
        reject(new Error(msg));
      };
      xhr.onerror = () => reject(new Error('Koneksi terputus saat upload. Coba lagi.'));
      xhr.send(file);
    });
  }
  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    setErr('');
    for (let i = 0; i < files.length; i++) {
      setPct(0);
      setBusy(`Mengunggah ${files[i].name} (${i + 1}/${files.length})`);
      try {
        await send(files[i]);
      } catch (ex: any) {
        setErr(`${files[i].name}: ${ex.message}`);
        break;
      }
    }
    setBusy('');
    router.refresh();
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <label className={`btn sm up${primary ? ' pri' : ''}`} style={{ alignSelf: 'flex-start' }}>
        {label}
        <input type="file" multiple accept={accept} onChange={onPick} disabled={!!busy} />
      </label>
      {busy ? (
        <div className="stack" style={{ gap: 4 }}>
          <span className="small muted">{busy} · {pct}%</span>
          <div className="bar"><i style={{ width: pct + '%' }} /></div>
        </div>
      ) : null}
      {err ? <span className="small" style={{ color: 'var(--crit)' }}>{err}</span> : null}
    </div>
  );
}
