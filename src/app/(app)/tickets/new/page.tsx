import { redirect } from 'next/navigation';
import { createTicketAction } from '../../../actions';
import { requireUser } from '@/lib/auth';
import { DIVISIONS, PRIORITIES } from '@/lib/config';
import { canCreate, projectNames, typesMap } from '@/lib/tickets';
import { fmtDateTime, requestCutoff, today } from '@/lib/time';
import { Topbar } from '@/components/ui';

export const metadata = { title: 'Ticket baru' };

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const u = await requireUser();
  if (!canCreate(u)) redirect('/board');
  const { err } = await searchParams;
  const now = new Date();
  const cutoff = requestCutoff(now);
  const late = now.getTime() > cutoff.getTime();
  const types = Object.keys(typesMap());
  const projects = projectNames();

  return (
    <>
      <Topbar title="Ticket baru" desc="Tahap 1 (Request). Setelah dikirim, ticket masuk ke CD untuk Alignment." />
      <div className="content">
        <form className="panel" action={createTicketAction} style={{ maxWidth: 760 }}>
          {err ? <div className="alert crit">{err}</div> : null}
          {late ? (
            <div className="alert warn stack" style={{ gap: 8 }}>
              <span>Batas request minggu ini ({fmtDateTime(cutoff.toISOString())}) sudah lewat. Pilih salah satu:</span>
              <label className="row"><input type="radio" name="late" value="next" defaultChecked /> Masuk siklus minggu depan</label>
              <label className="row"><input type="radio" name="late" value="urgent" /> Ajukan sebagai urgent untuk minggu ini (perlu approve CD)</label>
            </div>
          ) : (
            <div className="alert info">Request yang masuk sebelum {fmtDateTime(cutoff.toISOString())} diproses di siklus minggu ini.</div>
          )}
          <div className="form">
            <label className="f full">
              Judul
              <input className="field" name="title" required maxLength={140} placeholder="Contoh: Feed launch Icy Pop varian baru" />
            </label>
            <label className="f full">
              Brief
              <textarea className="field" name="brief" required style={{ minHeight: 150 }} placeholder="Objective, audience, deliverables, channel, key message" />
            </label>
            {u.role === 'requester' ? (
              <label className="f">
                Divisi
                <input className="field" value={u.division} disabled />
              </label>
            ) : (
              <label className="f">
                Divisi peminta
                <select className="field" name="division">{DIVISIONS.map((d) => <option key={d}>{d}</option>)}</select>
              </label>
            )}
            <label className="f">
              Project / campaign
              <input className="field" name="project" list="projects" placeholder="Ketik, atau pilih yang sudah ada" />
              <datalist id="projects">{projects.map((p) => <option key={p} value={p} />)}</datalist>
            </label>
            <label className="f">
              Jenis materi
              <select className="field" name="type" defaultValue="">
                <option value="">Belum tahu (ditentukan AD)</option>
                {types.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="f">
              Jumlah
              <input className="field" name="qty" type="number" min={1} step={1} defaultValue={1} required />
            </label>
            <label className="f">
              Deadline tayang / dipakai
              <input className="field" name="deadline" type="date" min={today()} required />
            </label>
            <label className="f">
              Prioritas
              <select className="field" name="priority" defaultValue="">
                <option value="">Normal</option>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
          </div>
          <p className="small muted">Gambar referensi bisa di-upload setelah ticket dibuat, di halaman ticket-nya.</p>
          <div className="row">
            <button className="btn pri">Kirim request</button>
          </div>
        </form>
      </div>
    </>
  );
}
