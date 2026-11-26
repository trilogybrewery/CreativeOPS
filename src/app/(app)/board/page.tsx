import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db, Row } from '@/lib/db';
import { STAGES, STAGE_COLORS, STAGE_OWNER_LABEL } from '@/lib/config';
import { hoursOf, listTickets, producers, seesAll, typesMap, Ticket } from '@/lib/tickets';
import { daysLate, fmtDate, fmtDateTime, today } from '@/lib/time';
import { Avatar, n1, Pill, Topbar } from '@/components/ui';
import BoardDnd from '@/components/BoardDnd';

export const metadata = { title: 'Board' };

function Card({ t, nowIso, drag }: { t: Ticket; nowIso: string; drag: boolean }) {
  const slaLate = t.stage_due && t.stage_due < nowIso;
  const late = t.deadline && t.deadline < today();
  return (
    <Link className="tk" href={`/tickets/${t.id}`} data-tid={t.id} data-stage={t.stage} data-pic={t.pic_id ?? ''} draggable={drag || undefined}>
      <div className="tk-t">
        <span className="tk-id">#{t.id}</span> {t.title}
      </div>
      <div className="tk-m">
        {t.project ? <span className="tag">{t.project}</span> : null}
        {t.type ? <span>{t.type} × {n1(t.qty)}</span> : null}
        {t.priority ? <span className="tag">{t.priority}</span> : null}
      </div>
      <div className="tk-m">
        {t.urgent === 'pending' ? <Pill tone="crit">Urgent · nunggu CD</Pill> : null}
        {t.urgent === 'approved' ? <Pill tone="warn">Urgent</Pill> : null}
        {t.returned ? <Pill tone="warn">Dikembalikan</Pill> : null}
        {t.rev_count ? <span className="tag">revisi {t.rev_count}×</span> : null}
        {t.stage === 7 ? (
          <span className="tag">
            CD {t.approve_cd_at ? '✓' : '…'} · Brand {t.approve_brand_at ? '✓' : '…'}
          </span>
        ) : null}
      </div>
      <div className="tk-f">
        <div className="tk-m">
          {t.stage_due ? (
            <Pill tone={slaLate ? 'crit' : ''}>{slaLate ? 'Lewat SLA ' : 'SLA '}{fmtDateTime(t.stage_due)}</Pill>
          ) : t.deadline ? (
            <Pill tone={late ? 'crit' : ''}>{late ? `Telat ${daysLate(t.deadline)} hari` : `Deadline ${fmtDate(t.deadline)}`}</Pill>
          ) : (
            <Pill tone="warn">Tanpa deadline</Pill>
          )}
        </div>
        <Avatar name={t.pic_name} />
      </div>
    </Link>
  );
}

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await requireUser();
  const { q = '' } = await searchParams;
  const like = `%${q.trim()}%`;
  const tickets = listTickets(u, q.trim() ? 'AND t.done = 0 AND (t.title LIKE ? OR t.brief LIKE ? OR t.project LIKE ?)' : 'AND t.done = 0', q.trim() ? [like, like, like] : []);
  tickets.sort((a, b) => ((a.stage_due || a.deadline || '9') < (b.stage_due || b.deadline || '9') ? -1 : 1));
  const nowIso = new Date().toISOString();
  const canDrag = u.role !== 'viewer';
  const types = typesMap();
  const lanes = seesAll(u) ? producers().filter((p) => p.active || tickets.some((t) => t.stage === 5 && t.pic_id === p.id)) : [];
  const doneCount = (db().prepare('SELECT COUNT(*) AS n FROM tickets WHERE done = 1').get() as Row).n;

  return (
    <>
      <Topbar title="Board" desc={seesAll(u) ? 'Semua ticket yang masih berjalan, per tahap.' : 'Ticket milik kamu yang masih berjalan.'}>
        <form className="row" action="/board">
          <input className="field" style={{ width: 220 }} type="search" name="q" defaultValue={q} placeholder="Cari judul, brief, project" aria-label="Cari ticket" />
          <button className="btn">Cari</button>
        </form>
      </Topbar>
      <div className="content">
        <BoardDnd enabled={canDrag}>
        <div className="board">
          {STAGES.map((name, i) => {
            const stage = i + 1;
            const list = tickets.filter((t) => t.stage === stage);
            const head = (
              <>
                <div className="col-h">
                  <span className="stage" style={{ background: STAGE_COLORS[i] }}>{stage}. {name}</span>
                  <span className="n num">{list.length}</span>
                </div>
                <div className="col-sub">Pemegang: {STAGE_OWNER_LABEL[i]}</div>
              </>
            );
            if (stage === 5 && lanes.length) {
              const noPic = list.filter((t) => !t.pic_id);
              // Lebar dikunci dari jumlah lajur. Safari menghitung lebar kolom dari isi kartu,
              // sehingga kolom bisa jauh lebih lebar dari lajurnya dan menyisakan ruang kosong.
              const nLanes = lanes.length + (noPic.length ? 1 : 0);
              return (
                <section className="col wide" key={stage} aria-label={name} data-drop={5} style={{ width: nLanes * 256 + (nLanes - 1) * 8 + 22 }}>
                  {head}
                  <div className="lanes">
                    {lanes.map((p: Row) => {
                      const mine = list.filter((t) => t.pic_id === p.id);
                      const hrs = mine.reduce((s, t) => s + hoursOf(t, types), 0);
                      return (
                        <div className="lane" key={p.id} data-drop={5} data-pic={p.id}>
                          <div className="lane-h">
                            <Avatar name={p.name} />
                            <b>{p.name}</b>
                            <span className="num">{mine.length} ticket · {n1(hrs)} jam</span>
                          </div>
                          <div className="col-sub" style={{ marginTop: 0 }}>{p.job}</div>
                          {mine.length ? mine.map((t) => <Card key={t.id} t={t} nowIso={nowIso} drag={canDrag} />) : <div className="empty">Lagi kosong</div>}
                        </div>
                      );
                    })}
                    {noPic.length ? (
                      <div className="lane" data-drop={5}>
                        <div className="lane-h"><Avatar /><b>Belum ada PIC</b><span className="num">{noPic.length} ticket</span></div>
                        {noPic.map((t) => <Card key={t.id} t={t} nowIso={nowIso} drag={canDrag} />)}
                      </div>
                    ) : null}
                  </div>
                </section>
              );
            }
            return (
              <section className="col" key={stage} aria-label={name} data-drop={stage}>
                {head}
                {list.length ? list.map((t) => <Card key={t.id} t={t} nowIso={nowIso} drag={canDrag} />) : <div className="empty">Kosong</div>}
                {stage === 8 && seesAll(u) ? (
                  <Link className="small link" href="/tracker?status=done">{doneCount} ticket selesai ada di Tracker</Link>
                ) : null}
              </section>
            );
          })}
        </div>
        </BoardDnd>
      </div>
    </>
  );
}
