import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { STAGES } from '@/lib/config';
import { availableMonths, pickMonth, weeklyReport } from '@/lib/reports';
import { seesReports } from '@/lib/tickets';
import { daysLate, fmtDate, fmtYm, today } from '@/lib/time';
import { n1, Pill, Tile, Topbar } from '@/components/ui';
import MonthSelect from '@/components/MonthSelect';

export const metadata = { title: 'Weekly AD' };

export default async function WeeklyPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const u = await requireUser();
  if (!seesReports(u)) redirect('/board');
  const ym = pickMonth((await searchParams).m);
  const r = weeklyReport(ym);
  return (
    <>
      <Topbar title={`Weekly report AD · ${fmtYm(ym)}`} desc="Tersusun otomatis dari ticket. Laporan bulanan adalah gabungan semua minggu di bawah.">
        <MonthSelect months={availableMonths().map((m) => ({ value: m, label: fmtYm(m) }))} value={ym} />
      </Topbar>
      <div className="content">
        <div className="tiles">
          <Tile label="Total intake" value={r.total.intake} />
          <Tile label="Planned output" value={n1(r.total.planned)} />
          <Tile label="Actual output" value={n1(r.total.actual)} />
          <Tile label="Achievement" value={`${Math.round(r.total.ach * 100)}%`} hl />
        </div>
        <section className="panel">
          <h3>Weekly output &amp; capacity</h3>
          <div className="tw">
            <table>
              <thead><tr><th>Week</th><th>Start</th><th>End</th><th className="r">Workdays</th><th className="r">Intake</th><th className="r">Planned</th><th className="r">Actual</th><th className="r">Achievement</th><th className="r">Actual hrs / team</th><th className="r">Ideal hrs / team</th></tr></thead>
              <tbody>
                {r.weekRows.map((w) => (
                  <tr key={w.name} className={w.current ? 'now' : ''}>
                    <td><b>{w.name}</b>{w.current ? <> <span className="tag">minggu ini</span></> : null}</td>
                    <td className="num">{fmtDate(w.start)}</td><td className="num">{fmtDate(w.end)}</td>
                    <td className="r num">{w.workdays}</td><td className="r num">{w.intake}</td>
                    <td className="r num">{n1(w.planned)}</td><td className="r num">{n1(w.actual)}</td>
                    <td className="r num">{w.planned ? `${Math.round(w.ach * 100)}%` : '—'}</td>
                    <td className="r num">{n1(w.hours)}</td><td className="r num">{n1(w.ideal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="small muted">Minggu dihitung otomatis dari kalender (Senin sampai Minggu). Ideal tim = 8 jam × 90% × hari kerja × {r.teamSize} orang aktif.</span>
        </section>
        <section className="panel">
          <h3>Production hours vs ideal per person</h3>
          <div className="tw">
            <table>
              <thead><tr><th>Person</th>{r.weekRows.map((w) => <th className="r" key={w.name}>{w.name}</th>)}<th className="r">Total</th><th className="r">Ideal bulan ini</th><th className="r">Terpakai</th><th>Overall status</th></tr></thead>
              <tbody>
                {r.people.map((p) => (
                  <tr key={p.name}>
                    <td><b>{p.name}</b></td>
                    {p.perWeek.map((x, i) => <td className="r num" key={i}>{n1(x)}</td>)}
                    <td className="r num"><b>{n1(p.total)}</b></td><td className="r num">{n1(p.ideal)}</td>
                    <td className="r num">{Math.round(p.ratio * 100)}%</td><td><Pill tone={p.status.tone}>{p.status.label}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row"><Pill tone="info">Low Load &lt;80%</Pill><Pill tone="good">Healthy 80–110%</Pill><Pill tone="warn">High Load 110–130%</Pill><Pill tone="crit">Overload Risk &gt;130%</Pill></div>
        </section>
        <section className="panel">
          <div className="panel-h"><h3>Belum selesai di periode ini</h3><span className="small muted">otomatis jadi carry-over</span></div>
          {r.carry.length ? (
            <ul className="plain">
              {r.carry.map((t) => (
                <li key={t.id}>
                  <span><Link className="link" href={`/tickets/${t.id}`}>#{t.id} {t.title}</Link><br /><span className="small muted">{t.pic_name || 'belum ada PIC'} · {STAGES[t.stage - 1]} · deadline {fmtDate(t.deadline)}</span></span>
                  {t.deadline < today() ? <Pill tone="crit">telat {daysLate(t.deadline)} hari</Pill> : <Pill>berjalan</Pill>}
                </li>
              ))}
            </ul>
          ) : <div className="empty">Semua ticket periode ini sudah selesai.</div>}
        </section>
      </div>
    </>
  );
}
