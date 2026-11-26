import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { DIVISIONS, STAGES } from '@/lib/config';
import { hoursOf, listTickets, producers, seesAll, typesMap } from '@/lib/tickets';
import { availableMonths } from '@/lib/reports';
import { fmtDate, fmtYm, today } from '@/lib/time';
import { n1, StageTag, Topbar } from '@/components/ui';

export const metadata = { title: 'Tracker' };

type SP = { q?: string; m?: string; pic?: string; division?: string; status?: string; stage?: string };

export default async function TrackerPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const where: string[] = [];
  const params: any[] = [];
  if (sp.q?.trim()) {
    where.push('(t.title LIKE ? OR t.brief LIKE ? OR t.project LIKE ?)');
    const like = `%${sp.q.trim()}%`;
    params.push(like, like, like);
  }
  if (sp.m) { where.push("substr(t.deadline, 1, 7) = ?"); params.push(sp.m); }
  if (sp.pic) { where.push('t.pic_id = ?'); params.push(Number(sp.pic)); }
  if (sp.division) { where.push('t.division = ?'); params.push(sp.division); }
  if (sp.stage) { where.push('t.stage = ? AND t.done = 0'); params.push(Number(sp.stage)); }
  if (sp.status === 'open') where.push('t.done = 0');
  if (sp.status === 'done') where.push('t.done = 1');
  if (sp.status === 'late') { where.push("t.done = 0 AND t.deadline <> '' AND t.deadline < ?"); params.push(today()); }
  const list = listTickets(u, (where.length ? 'AND ' + where.join(' AND ') : '') + " ORDER BY (t.deadline = '') ASC, t.deadline DESC, t.id DESC LIMIT 600", params);
  const types = typesMap();
  const totalHours = list.reduce((s, t) => s + hoursOf(t, types), 0);
  const all = seesAll(u);

  return (
    <>
      <Topbar title="Tracker" desc="Daftar semua ticket yang boleh kamu lihat, termasuk histori dari tracker lama." />
      <div className="content">
        <form className="row" action="/tracker">
          <input className="field" style={{ width: 220 }} type="search" name="q" defaultValue={sp.q || ''} placeholder="Cari judul, brief, project" aria-label="Cari" />
          <select className="field" style={{ width: 'auto' }} name="m" defaultValue={sp.m || ''} aria-label="Bulan">
            <option value="">Semua bulan</option>
            {availableMonths().map((m) => <option key={m} value={m}>{fmtYm(m)}</option>)}
          </select>
          {all ? (
            <>
              <select className="field" style={{ width: 'auto' }} name="pic" defaultValue={sp.pic || ''} aria-label="PIC">
                <option value="">Semua PIC</option>
                {producers().map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="field" style={{ width: 'auto' }} name="division" defaultValue={sp.division || ''} aria-label="Divisi">
                <option value="">Semua divisi</option>
                {DIVISIONS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </>
          ) : null}
          <select className="field" style={{ width: 'auto' }} name="status" defaultValue={sp.status || ''} aria-label="Status">
            <option value="">Semua status</option>
            <option value="open">Masih berjalan</option>
            <option value="late">Lewat deadline</option>
            <option value="done">Selesai</option>
          </select>
          <select className="field" style={{ width: 'auto' }} name="stage" defaultValue={sp.stage || ''} aria-label="Tahap">
            <option value="">Semua tahap</option>
            {STAGES.map((s, i) => <option key={s} value={i + 1}>{i + 1}. {s}</option>)}
          </select>
          <button className="btn">Terapkan</button>
          <Link className="btn" href="/tracker">Reset</Link>
        </form>
        <div className="small muted num">{list.length} ticket{list.length === 600 ? ' (dibatasi 600, persempit filternya)' : ''} · {n1(totalHours)} jam produksi</div>
        <div className="tw">
          <table>
            <thead>
              <tr><th>No</th><th>Deadline</th><th>Divisi</th><th>Project</th><th>Judul</th><th>Production type</th><th className="r">Jumlah</th><th className="r">Aktual</th><th>PIC</th><th>Tahap</th><th className="r">Jam</th></tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id}>
                  <td className="num">{t.id}</td>
                  <td className="num">{fmtDate(t.deadline)}</td>
                  <td>{t.division}</td>
                  <td>{t.project || <span className="muted">—</span>}</td>
                  <td><Link className="link clamp" href={`/tickets/${t.id}`}>{t.title}</Link></td>
                  <td>{t.type || '—'}</td>
                  <td className="r num">{n1(t.qty)}</td>
                  <td className="r num">{t.actual_qty == null ? '—' : n1(t.actual_qty)}</td>
                  <td>{t.pic_name || '—'}</td>
                  <td><StageTag stage={t.stage} done={t.done} /></td>
                  <td className="r num">{n1(hoursOf(t, types))}</td>
                </tr>
              ))}
              {!list.length ? <tr><td colSpan={11} className="muted">Tidak ada ticket yang cocok dengan filter.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
