import { redirect } from 'next/navigation';
import { mergeProjectAction, saveNotesAction } from '../../actions';
import { requireUser } from '@/lib/auth';
import { availableMonths, monthlyReport, pickMonth } from '@/lib/reports';
import { projectNames, seesReports } from '@/lib/tickets';
import { fmtYm } from '@/lib/time';
import { Pill, Tile, Topbar } from '@/components/ui';
import MonthSelect from '@/components/MonthSelect';

export const metadata = { title: 'Monthly CD' };

export default async function MonthlyPage({ searchParams }: { searchParams: Promise<{ m?: string; saved?: string }> }) {
  const u = await requireUser();
  if (!seesReports(u)) redirect('/board');
  const sp = await searchParams;
  const ym = pickMonth(sp.m);
  const r = monthlyReport(ym);
  const canWrite = u.role === 'cd' || u.role === 'admin';
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const names = canWrite ? projectNames() : [];

  return (
    <>
      <Topbar title={`Monthly report CD · ${fmtYm(ym)}`} desc="Angka diambil dari ticket dan riwayat tahapnya. CD hanya menulis tiga catatan di bagian bawah.">
        <MonthSelect months={availableMonths().map((m) => ({ value: m, label: fmtYm(m) }))} value={ym} />
      </Topbar>
      <div className="content">
        {sp.saved ? <div className="alert good">Catatan tersimpan.</div> : null}
        <div className="tiles">
          <Tile label="Project / brief intake" value={r.projectCount} sub={`${r.intake} ticket${r.noProject ? ` · ${r.noProject} tanpa project` : ''}`} />
          <Tile label="Direction approved" value={r.briefs} sub="creative brief yang diteruskan bulan ini" />
          <Tile label="On-time direction" value={pct(r.briefsOnTime, r.briefs)} sub={r.briefs ? `${r.briefsOnTime} dari ${r.briefs} sebelum Jumat 16.00` : 'belum ada brief lewat sistem'} />
          <Tile label="First-pass approval" value={pct(r.firstPass, r.passed)} sub={r.passed ? `${r.firstPass} dari ${r.passed} lolos tanpa revisi` : 'belum ada ticket lewat QC di sistem'} />
          <Tile label="Projects at risk" value={r.atRisk} sub="punya ticket lewat deadline" hl />
        </div>
        <section className="panel">
          <div className="panel-h"><h3>Project portfolio</h3><span className="small muted">ticket dengan deadline di bulan ini</span></div>
          <div className="tw">
            <table>
              <thead><tr><th>Project / campaign</th><th className="r">Ticket</th><th className="r">Selesai</th><th className="r">Revisi</th><th>Status</th></tr></thead>
              <tbody>
                {r.projects.map((p) => (
                  <tr key={p.name || '-'}>
                    <td>{p.name ? <b>{p.name}</b> : <span className="muted">Tanpa project</span>}</td>
                    <td className="r num">{p.total}</td><td className="r num">{p.done}</td><td className="r num">{p.revisions}</td>
                    <td>{p.late ? <Pill tone="crit">{p.late} telat</Pill> : p.done === p.total ? <Pill tone="good">Selesai</Pill> : <Pill>Berjalan</Pill>}</td>
                  </tr>
                ))}
                {!r.projects.length ? <tr><td colSpan={5} className="muted">Belum ada ticket di periode ini.</td></tr> : null}
              </tbody>
            </table>
          </div>
          {canWrite && names.length > 1 ? (
            <details className="more">
              <summary className="btn sm">Gabungkan nama project yang dobel…</summary>
              <form action={mergeProjectAction} className="row" style={{ marginTop: 10 }}>
                <select className="field" style={{ width: 'auto' }} name="from" required aria-label="Nama yang dihapus">{names.map((n) => <option key={n}>{n}</option>)}</select>
                <span className="muted">digabung ke</span>
                <select className="field" style={{ width: 'auto' }} name="to" required aria-label="Nama yang dipertahankan">{names.map((n) => <option key={n}>{n}</option>)}</select>
                <button className="btn sm">Gabungkan</button>
              </form>
            </details>
          ) : null}
        </section>
        <div className="grid2">
          <section className="panel">
            <h3>Creative quality &amp; revision review</h3>
            <div className="tw">
              <table>
                <thead><tr><th>Review metric</th><th className="r">Result</th></tr></thead>
                <tbody>
                  {r.issues.map((i) => <tr key={i.key}><td><b>{i.label}</b></td><td className="r num">{i.n}</td></tr>)}
                  <tr><td><b>Request dikembalikan ke requester</b></td><td className="r num">{r.returned}</td></tr>
                  <tr><td><b>QC tepat waktu (2 jam kerja)</b></td><td className="r num">{r.qc ? `${r.qcOnTime} dari ${r.qc}` : '—'}</td></tr>
                </tbody>
              </table>
            </div>
            <h3>Request urgent (lewat Kamis 15.00)</h3>
            {r.urgent.length ? (
              <div className="tw">
                <table>
                  <thead><tr><th>Divisi</th><th>Keputusan</th><th className="r">Jumlah</th></tr></thead>
                  <tbody>{r.urgent.map((x: any, i: number) => <tr key={i}><td>{x.division}</td><td>{x.urgent === 'approved' ? 'Disetujui' : x.urgent === 'rejected' ? 'Ditolak' : 'Menunggu'}</td><td className="r num">{x.n}</td></tr>)}</tbody>
                </table>
              </div>
            ) : <div className="empty">Tidak ada request urgent bulan ini.</div>}
          </section>
          <section className="panel">
            <h3>CD monthly review &amp; next actions</h3>
            <form action={saveNotesAction} className="stack">
              <input type="hidden" name="period" value={ym} />
              <label className="f">Key decisions<textarea className="field" name="decisions" defaultValue={r.notes.decisions || ''} placeholder="Arah kreatif / prioritas yang ditetapkan" disabled={!canWrite} /></label>
              <label className="f">Risiko / blocker<textarea className="field" name="risks" defaultValue={r.notes.risks || ''} placeholder="Proyek tertahan, perubahan brief, atau resource" disabled={!canWrite} /></label>
              <label className="f">Next period<textarea className="field" name="next" defaultValue={r.notes.next || ''} placeholder="Fokus kreatif dan tindakan yang perlu dilakukan" disabled={!canWrite} /></label>
              {canWrite ? <div><button className="btn pri">Simpan catatan</button></div> : <span className="small muted">Hanya CD yang bisa mengisi bagian ini.</span>}
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
