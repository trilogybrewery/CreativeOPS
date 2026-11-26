import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { STAGE_COLORS } from '@/lib/config';
import { availableMonths, dashboard, pickMonth } from '@/lib/reports';
import { seesReports } from '@/lib/tickets';
import { daysLate, fmtDate, fmtYm } from '@/lib/time';
import { n1, Pill, Tile, Topbar } from '@/components/ui';
import MonthSelect from '@/components/MonthSelect';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const u = await requireUser();
  if (!seesReports(u)) redirect('/board');
  const ym = pickMonth((await searchParams).m);
  const d = dashboard(ym);

  // Chart planned vs actual per minggu.
  const W = 560, H = 220, L = 34, B = 30, Tp = 10;
  const pw = W - L - 10, ph = H - B - Tp;
  const max = Math.max(1, ...d.weekRows.map((r) => Math.max(r.planned, r.actual)));
  const step = max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : max <= 100 ? 20 : 50;
  const top = Math.ceil(max / step) * step;
  const band = pw / d.weekRows.length;
  const ticks: number[] = [];
  for (let y = 0; y <= top; y += step) ticks.push(y);
  const bar = (x: number, v: number, bw: number) => {
    const bh = (v / top) * ph, yT = Tp + ph - bh, r = Math.min(4, bh);
    return `M${x} ${Tp + ph}V${yT + r}q0 -${r} ${r} -${r}h${bw - 2 * r}q${r} 0 ${r} ${r}V${Tp + ph}z`;
  };
  const wmax = Math.max(...d.people.map((p) => p.total), (d.people[0]?.ideal || 1) * 1.15);
  const ideal = d.people[0]?.ideal || 0;

  return (
    <>
      <Topbar title={`Dashboard ${fmtYm(ym)}`} desc="Dihitung langsung dari ticket. Angka berubah begitu status ticket berubah.">
        <MonthSelect months={availableMonths().map((m) => ({ value: m, label: fmtYm(m) }))} value={ym} />
      </Topbar>
      <div className="content">
        <div className="tiles">
          <Tile label="Total intake" value={d.total.intake} sub="ticket dengan deadline di bulan ini" />
          <Tile label="Planned output" value={n1(d.total.planned)} sub="jumlah asset diminta" />
          <Tile label="Actual output" value={n1(d.total.actual)} sub="jumlah asset selesai" />
          <Tile label="Achievement" value={`${Math.round(d.total.ach * 100)}%`} sub="actual ÷ planned" hl />
          <Tile label="Masih berjalan" value={d.open} sub={`${d.late.length} lewat deadline · ${d.slaLate} lewat SLA tahap`} />
        </div>
        <div className="grid2">
          <section className="panel">
            <div className="panel-h">
              <h3>Planned vs actual per minggu</h3>
              <div className="legend"><span><i style={{ background: '#2a78d6' }} />Planned</span><span><i style={{ background: '#eb6834' }} />Actual</span></div>
            </div>
            <div className="viz">
              <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Planned dan actual output per minggu, ${fmtYm(ym)}`}>
                {ticks.map((y) => {
                  const yy = Tp + ph - (y / top) * ph;
                  return <g key={y}><line className="gl" x1={L} x2={W - 10} y1={yy} y2={yy} /><text x={L - 6} y={yy + 4} textAnchor="end">{y}</text></g>;
                })}
                {d.weekRows.map((r, i) => {
                  const cx = L + band * i + band / 2, bw = Math.min(22, band / 3);
                  return (
                    <g key={r.name}>
                      <path d={bar(cx - bw - 1, r.planned, bw)} fill="#2a78d6"><title>{`${r.name} (${fmtDate(r.start)}–${fmtDate(r.end)}) · Planned: ${n1(r.planned)}`}</title></path>
                      <path d={bar(cx + 1, r.actual, bw)} fill="#eb6834"><title>{`${r.name} (${fmtDate(r.start)}–${fmtDate(r.end)}) · Actual: ${n1(r.actual)}`}</title></path>
                      <text x={cx} y={H - 10} textAnchor="middle">{r.name}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <Link className="small link" href={`/weekly?m=${ym}`}>Lihat tabel lengkap di Weekly AD</Link>
          </section>
          <section className="panel">
            <div className="panel-h"><h3>Jam produksi per orang</h3><span className="small muted">garis hitam = ideal {n1(ideal)} jam ({d.workdays} hari kerja × 7,2 jam)</span></div>
            <div className="wl">
              {d.people.map((p) => [
                <b key={p.name + 'n'}>{p.name}</b>,
                <div className="track" key={p.name + 't'} title={`${p.name}: ${n1(p.total)} jam dari ideal ${n1(p.ideal)} jam`}>
                  <div className="fill" style={{ width: `${(p.total / wmax) * 100}%` }} />
                  <div className="ideal" style={{ left: `${(p.ideal / wmax) * 100}%` }} />
                </div>,
                <div className="row" key={p.name + 's'}><span className="small muted num">{n1(p.total)} jam</span><Pill tone={p.status.tone}>{p.status.label}</Pill></div>,
              ])}
            </div>
            <span className="small muted">Jam = jumlah × durasi production type + revisi.</span>
          </section>
        </div>
        <section className="panel">
          <div className="panel-h"><h3>Posisi ticket di workflow</h3><span className="small muted">yang masih berjalan, semua periode</span></div>
          <div className="pipe">
            {d.pipeline.map((p, i) => (
              <Link key={p.name} href={`/tracker?stage=${i + 1}`} style={{ borderTopColor: STAGE_COLORS[i] }}>
                <b className="num">{p.n}</b><span>{i + 1}. {p.name}</span>
              </Link>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-h"><h3>Perlu perhatian</h3><span className="small muted">{d.late.length} ticket lewat deadline</span></div>
          {d.late.length ? (
            <ul className="plain">
              {d.late.slice(0, 10).map((t) => (
                <li key={t.id}>
                  <span><Link className="link" href={`/tickets/${t.id}`}>#{t.id} {t.title}</Link><br /><span className="small muted">{t.pic_name || 'belum ada PIC'} · deadline {fmtDate(t.deadline)}</span></span>
                  <Pill tone="crit">telat {daysLate(t.deadline)} hari</Pill>
                </li>
              ))}
            </ul>
          ) : <div className="empty">Tidak ada ticket yang telat.</div>}
          {d.late.length > 10 ? <Link className="small link" href="/tracker?status=late">Lihat semua {d.late.length}</Link> : null}
        </section>
      </div>
    </>
  );
}
