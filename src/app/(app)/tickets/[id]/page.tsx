import Link from 'next/link';
import { notFound } from 'next/navigation';
import * as A from '../../../actions';
import { requireUser, User } from '@/lib/auth';
import { db, Row } from '@/lib/db';
import { ISSUES, PRIORITIES, RETURN_REASONS, SLA, STAGES, STAGE_COLORS, STAGE_OWNER_LABEL } from '@/lib/config';
import * as T from '@/lib/tickets';
import { CATEGORY_LABEL, fmtSize, kindOf } from '@/lib/files';
import { daysLate, fmtDate, fmtDateTime, today } from '@/lib/time';
import { Avatar, n1, Pill, StageTag, Topbar } from '@/components/ui';
import Uploader from '@/components/Uploader';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Ticket #${id}` };
}

const Id = ({ t }: { t: Row }) => <input type="hidden" name="id" value={t.id} />;

function ReturnForm({ t }: { t: Row }) {
  return (
    <details className="more">
      <summary className="btn">Kembalikan ke requester…</summary>
      <form action={A.returnAction} className="stack" style={{ marginTop: 10, gap: 8 }}>
        <Id t={t} />
        {RETURN_REASONS.map((r) => (
          <label className="row" key={r}>
            <input type="radio" name="reason" value={r} /> {r}
          </label>
        ))}
        <input className="field" name="note" placeholder="Atau tulis alasan lain" aria-label="Alasan lain" />
        <div><button className="btn">Kembalikan</button></div>
      </form>
    </details>
  );
}
function ReviseForm({ t }: { t: Row }) {
  return (
    <details className="more">
      <summary className="btn danger">Minta revisi…</summary>
      <form action={A.reviseAction} className="stack" style={{ marginTop: 10, gap: 8 }}>
        <Id t={t} />
        {Object.entries(ISSUES).map(([k, v], i) => (
          <label className="row" key={k} style={{ alignItems: 'flex-start' }}>
            <input type="radio" name="issue" value={k} required defaultChecked={i === 1} style={{ marginTop: 3 }} />
            <span><b>{v.label}</b><br /><span className="small muted">{v.hint}</span></span>
          </label>
        ))}
        <textarea className="field" name="note" placeholder="Catatan revisi: apa yang harus diubah" style={{ minHeight: 70 }} aria-label="Catatan revisi" />
        <div><button className="btn danger">Kirim revisi</button></div>
      </form>
    </details>
  );
}
function SetupForm({ t, go }: { t: Row; go: boolean }) {
  const prod = T.producers().filter((p) => p.active);
  const types = Object.keys(T.typesMap());
  const load: Record<number, number> = {};
  for (const r of db().prepare('SELECT pic_id, COUNT(*) AS n FROM tickets WHERE done = 0 AND stage = 5 GROUP BY pic_id').all() as Row[]) load[r.pic_id] = r.n;
  const exp: Record<number, number> = {};
  if (t.type) for (const r of db().prepare('SELECT pic_id, COUNT(*) AS n FROM tickets WHERE type = ? GROUP BY pic_id').all(t.type) as Row[]) exp[r.pic_id] = r.n;
  return (
    <form action={A.setupAction} className="form">
      <Id t={t} />
      <input type="hidden" name="go" value={go ? '1' : '0'} />
      <label className="f full">
        Kasih ke siapa (PIC)
        <select className="field" name="pic" defaultValue={t.pic_id || ''} required>
          <option value="">Pilih orang</option>
          {prod.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {load[p.id] || 0} ticket di produksi{t.type ? ` · ${exp[p.id] || 0}× ${t.type}` : ''} · {p.job}
            </option>
          ))}
        </select>
      </label>
      <label className="f">
        Production type
        <select className="field" name="type" defaultValue={t.type || ''} required>
          <option value="">Pilih</option>
          {types.map((x) => <option key={x}>{x}</option>)}
        </select>
      </label>
      <label className="f">
        Jumlah
        <input className="field" name="qty" type="number" min={1} step={1} defaultValue={t.qty || 1} required />
      </label>
      <label className="f full">
        Target selesai produksi (opsional)
        <input className="field" name="due" type="datetime-local" />
        <span className="small muted" style={{ fontWeight: 400 }}>Kalau dikosongkan, dihitung otomatis dari estimasi production type ditambah antrean ticket PIC itu, dalam jam kerja.</span>
      </label>
      <div className="full"><button className="btn pri">{go ? 'Assign & mulai produksi →' : 'Simpan perubahan'}</button></div>
    </form>
  );
}

function Actions({ u, t, files }: { u: User; t: Row; files: Row[] }) {
  const admin = u.role === 'admin';
  const isCD = u.role === 'cd' || admin;
  const isAD = u.role === 'ad' || admin;
  const isPic = t.pic_id === u.id;
  const brand = T.isBrand(u) || admin;
  const round = (t.rev_count || 0) + 1;
  const hasPreview = files.some((f) => f.category === 'preview' && f.round === round);
  const hasFa = files.some((f) => f.category === 'fa');
  const wait = (who: string) => <p className="muted">Menunggu {who}.</p>;
  const holds = T.holdsStage(u, t);
  const owner = STAGE_OWNER_LABEL[t.stage - 1];

  if (t.done) return <div className="alert good">Selesai dan published pada {fmtDateTime(t.done_at)}.</div>;
  if (u.role === 'viewer') return wait('pemegang tahap ini');

  if (t.stage === 1) {
    if (t.returned) {
      const canResubmit = (u.role === 'requester' && T.canView(u, t)) || admin;
      return (
        <div className="stack">
          <div className="alert warn"><b>Dikembalikan ke requester.</b> Alasan: {t.return_reason}</div>
          {canResubmit ? (
            <form action={A.resubmitAction} className="row">
              <Id t={t} />
              <button className="btn pri">Kirim ulang ke CD</button>
              <span className="small muted">Lengkapi brief di bawah dulu, lalu kirim ulang.</span>
            </form>
          ) : wait('requester melengkapi dan mengirim ulang')}
        </div>
      );
    }
    if (t.urgent === 'pending') {
      return (
        <div className="stack">
          <div className="alert crit"><b>Request urgent.</b> Masuk setelah batas Kamis 15.00 dan minta diproses minggu ini.</div>
          {isCD ? (
            <div className="row">
              <form action={A.urgentAction}><Id t={t} /><input type="hidden" name="decision" value="approve" /><button className="btn pri">Approve urgent</button></form>
              <form action={A.urgentAction}><Id t={t} /><input type="hidden" name="decision" value="reject" /><button className="btn">Tolak, masuk minggu depan</button></form>
            </div>
          ) : wait('keputusan CD')}
        </div>
      );
    }
    if (!holds) return wait(`${owner} meneruskan request ini`);
    return (
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <form action={A.advanceAction}><Id t={t} /><button className="btn pri">Terima → Alignment</button></form>
        {u.role !== 'requester' ? <ReturnForm t={t} /> : null}
      </div>
    );
  }
  if (t.stage === 2 || t.stage === 3) {
    if (!holds) return wait(`${owner} menyelesaikan ${t.stage === 2 ? 'Alignment' : 'Creative Brief'}`);
    return (
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <form action={A.advanceAction}><Id t={t} /><button className="btn pri">{t.stage === 2 ? 'Lanjut → Creative Brief' : 'Assign ke Production Setup →'}</button></form>
        {t.stage === 3 ? <form action={A.backToAlignmentAction}><Id t={t} /><button className="btn">← Balik ke Alignment</button></form> : null}
        {u.role !== 'requester' ? <ReturnForm t={t} /> : null}
      </div>
    );
  }
  if (t.stage === 4) return isAD ? <SetupForm t={t} go /> : wait('AD meng-assign PIC');
  if (t.stage === 5) {
    if (!isPic && !isAD) return wait('PIC menyelesaikan produksi');
    return (
      <div className="stack">
        {t.rev_count ? <div className="alert warn">Revisi ke-{t.rev_count}. Upload hasil revisi di bagian Preview hasil, lalu submit lagi.</div> : null}
        <form action={A.submitQCAction} className="row">
          <Id t={t} />
          <button className="btn pri" disabled={!hasPreview}>Submit ke QC →</button>
          <span className="small muted">{hasPreview ? 'AD langsung dapat notifikasi.' : 'Upload dulu preview hasilnya di bagian Preview hasil.'}</span>
        </form>
        {isAD ? (
          <details className="more">
            <summary className="btn">Ubah PIC / target…</summary>
            <div style={{ marginTop: 10 }}><SetupForm t={t} go={false} /></div>
          </details>
        ) : null}
      </div>
    );
  }
  if (t.stage === 6) {
    if (!isAD) return wait(`QC dari AD (maksimal ${SLA.qcWorkHours} jam kerja)`);
    return (
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <form action={A.qcPassAction}><Id t={t} /><button className="btn pri">Lolos QC → Final Approval</button></form>
        <ReviseForm t={t} />
      </div>
    );
  }
  if (t.stage === 7) {
    const both = t.approve_cd_at && t.approve_brand_at;
    return (
      <div className="stack">
        <div className="row">
          <Pill tone={t.approve_cd_at ? 'good' : ''}>CD: {t.approve_cd_at ? `approve ${fmtDateTime(t.approve_cd_at)}` : 'menunggu'}</Pill>
          <Pill tone={t.approve_brand_at ? 'good' : ''}>Brand: {t.approve_brand_at ? `approve ${fmtDateTime(t.approve_brand_at)}` : 'menunggu'}</Pill>
          <Pill tone={hasFa ? 'good' : 'warn'}>File FA: {hasFa ? 'ada' : 'belum ada'}</Pill>
        </div>
        {both && !hasFa ? <div className="alert warn">Sudah di-approve dua pihak. Ticket lanjut otomatis begitu PIC atau AD meng-upload file FA.</div> : null}
        <div className="row" style={{ alignItems: 'flex-start' }}>
          {isCD && !t.approve_cd_at ? <form action={A.approveAction}><Id t={t} /><input type="hidden" name="side" value="cd" /><button className="btn pri">Approve sebagai CD</button></form> : null}
          {brand && !t.approve_brand_at ? <form action={A.approveAction}><Id t={t} /><input type="hidden" name="side" value="brand" /><button className="btn pri">Approve sebagai Brand</button></form> : null}
          {isCD || brand ? <ReviseForm t={t} /> : null}
        </div>
        {!isCD && !brand ? wait('approval CD dan Brand') : null}
      </div>
    );
  }
  // tahap 8
  if (!brand && !isCD) return wait('Brand mem-publish');
  return (
    <div className="stack">
      <form action={A.publishDateAction} className="row">
        <Id t={t} />
        <label className="row small muted">Jadwal publish <input className="field" style={{ width: 'auto' }} type="date" name="date" defaultValue={t.publish_date || ''} required /></label>
        <button className="btn sm">Simpan jadwal</button>
      </form>
      <form action={A.publishAction} className="row">
        <Id t={t} />
        <label className="row small muted">Jumlah aktual <input className="field num" style={{ width: 90 }} type="number" name="actual" min={0} step={1} defaultValue={t.qty} /></label>
        <button className="btn pri">Tandai selesai / published</button>
      </form>
    </div>
  );
}

function FileBlock({ u, t, category, files }: { u: User; t: Row; category: string; files: Row[] }) {
  const list = files.filter((f) => f.category === category);
  const can = T.canUpload(u, t, category);
  const hint: Record<string, string> = {
    reference: 'Gambar, PDF, atau link (Canva, Instagram, Drive).',
    preview: 'Hasil untuk di-QC: image, PDF, atau video.',
    fa: 'File final: image, PDF, video, file mentah design (PSD, AI), atau 3D.',
  };
  return (
    <section className="panel">
      <div className="panel-h">
        <h3>{CATEGORY_LABEL[category]}</h3>
        <span className="small muted">{hint[category]}</span>
      </div>
      {list.length ? (
        <div className="files">
          {list.map((f) => {
            const kind = f.url ? 'link' : kindOf(f.name);
            const src = `/api/files/${f.id}`;
            return (
              <div key={f.id}>
                <div className="file">
                  <span className="th">
                    {kind === 'image' ? <img src={src} alt="" loading="lazy" /> : kind === 'link' ? 'LINK' : kind === 'video' ? 'VIDEO' : kind === 'pdf' ? 'PDF' : (f.name.split('.').pop() || 'FILE').toUpperCase().slice(0, 5)}
                  </span>
                  <div className="nm">
                    {f.url ? (
                      <a className="link" href={f.url} target="_blank" rel="noopener noreferrer">{f.url}</a>
                    ) : (
                      <a className="link" href={kind === 'file' ? `${src}?dl=1` : src} target="_blank" rel="noopener">{f.name}</a>
                    )}
                    <small>
                      {f.url ? 'Link' : fmtSize(f.size)}{category !== 'reference' ? ` · v${f.round}` : ''} · {f.user_name || '—'} · {fmtDateTime(f.at)}
                    </small>
                  </div>
                  {!f.url ? <a className="btn sm" href={`${src}?dl=1`}>Unduh</a> : null}
                  {T.canDeleteFile(u, t, f) ? (
                    <form action={A.deleteFileAction}>
                      <Id t={t} />
                      <input type="hidden" name="file" value={f.id} />
                      <button className="btn sm danger">Hapus</button>
                    </form>
                  ) : null}
                </div>
                {category !== 'reference' && (kind === 'image' || kind === 'video') ? (
                  <details className="more preview" style={{ margin: '6px 0 4px' }}>
                    <summary className="small link">Lihat di sini</summary>
                    <div style={{ marginTop: 6 }}>
                      {kind === 'image' ? <img src={src} alt={f.name} loading="lazy" /> : <video src={src} controls preload="metadata" />}
                    </div>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty">Belum ada.</div>
      )}
      {can ? (
        <div className="stack" style={{ gap: 8 }}>
          <Uploader
            ticketId={t.id}
            category={category}
            label={category === 'reference' ? '+ Upload referensi' : category === 'preview' ? '+ Upload preview' : '+ Upload file FA'}
            accept={category === 'reference' ? 'image/*,application/pdf' : category === 'preview' ? 'image/*,video/*,application/pdf' : undefined}
            primary={category !== 'reference'}
          />
          <form action={A.addLinkAction} className="row">
            <Id t={t} />
            <input type="hidden" name="category" value={category} />
            <input className="field grow" style={{ width: 'auto' }} name="url" type="url" placeholder="atau tempel link (https://…)" aria-label="Link" required />
            <button className="btn sm">Tambah link</button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

const EVENT_LABEL: Record<string, string> = {
  create: 'membuat ticket', move: 'memindahkan ticket', return: 'mengembalikan ke requester', resubmit: 'mengirim ulang',
  urgent: 'memutuskan urgent', assign: 'meng-assign', revision: 'meminta revisi', approve: 'approve', done: 'menandai selesai', edit: 'mengubah detail',
};

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string; new?: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const t = T.getTicket(Number(id));
  if (!t || !T.canView(u, t)) notFound();
  const files = T.ticketFiles(t.id);
  const events = T.ticketEvents(t.id);
  const types = T.typesMap();
  const staff = T.isStaff(u);
  const canEdit = !t.done && (staff || (u.role === 'requester' && t.stage <= 2));
  const nowIso = new Date().toISOString();
  const slaLate = !t.done && t.stage_due && t.stage_due < nowIso;
  const late = !t.done && t.deadline && t.deadline < today();
  const projects = canEdit ? T.projectNames() : [];

  return (
    <>
      <Topbar title={`#${t.id} ${t.title}`}>
        <Link className="btn" href="/board">← Board</Link>
      </Topbar>
      <div className="content">
        {sp.err ? <div className="alert crit">{sp.err}</div> : null}
        {sp.new ? <div className="alert good">Ticket terkirim. Tambahkan gambar referensi di bawah kalau ada.</div> : null}
        <div className="stack" style={{ gap: 6 }}>
          <div className="steps">{STAGES.map((_, i) => <div key={i} className="step" style={i < t.stage || t.done ? { background: STAGE_COLORS[i] } : undefined} />)}</div>
          <div className="step-names">{STAGES.map((s, i) => <span key={s} className={!t.done && i === t.stage - 1 ? 'on' : ''}>{i + 1}. {s}</span>)}</div>
        </div>

        <div className="tgrid">
          <div className="stack" style={{ gap: 16 }}>
            <section className="panel" style={{ borderColor: t.done ? undefined : STAGE_COLORS[t.stage - 1] }}>
              <div className="panel-h">
                <div className="row">
                  <StageTag stage={t.stage} done={t.done} />
                  {t.urgent === 'approved' ? <Pill tone="warn">Urgent</Pill> : null}
                  {t.rev_count ? <span className="tag">revisi {t.rev_count}×</span> : null}
                </div>
                {!t.done && t.stage_due ? <Pill tone={slaLate ? 'crit' : ''}>{slaLate ? 'Lewat SLA' : 'SLA tahap ini'}: {fmtDateTime(t.stage_due)}</Pill> : null}
              </div>
              <Actions u={u} t={t} files={files} />
            </section>

            <section className="panel">
              <div className="panel-h"><h3>Brief</h3></div>
              <div className="prose">{t.brief || <span className="muted">Belum ada brief.</span>}</div>
              <h3 style={{ marginTop: 6 }}>Creative brief dari CD / AD</h3>
              <div className="prose">{t.creative_brief || <span className="muted">Belum diisi. Key message, visual direction, dan copy direction ditulis di sini saat tahap Creative Brief.</span>}</div>
              {canEdit ? (
                <details className="more">
                  <summary className="btn sm">Edit brief & detail…</summary>
                  <form action={A.updateTicketAction} className="form" style={{ marginTop: 12 }}>
                    <Id t={t} />
                    <label className="f full">Judul<input className="field" name="title" defaultValue={t.title} required maxLength={140} /></label>
                    <label className="f full">Brief<textarea className="field" name="brief" defaultValue={t.brief} style={{ minHeight: 140 }} /></label>
                    {staff ? (
                      <label className="f full">Creative brief dari CD / AD<textarea className="field" name="creative_brief" defaultValue={t.creative_brief} placeholder="Key message, visual direction, copy direction, deliverables" style={{ minHeight: 120 }} /></label>
                    ) : null}
                    <label className="f">Project / campaign
                      <input className="field" name="project" list="projects" defaultValue={t.project} />
                      <datalist id="projects">{projects.map((p) => <option key={p} value={p} />)}</datalist>
                    </label>
                    <label className="f">Deadline<input className="field" name="deadline" type="date" defaultValue={t.deadline} /></label>
                    <label className="f">Jumlah<input className="field" name="qty" type="number" min={1} step={1} defaultValue={t.qty} /></label>
                    <label className="f">Prioritas
                      <select className="field" name="priority" defaultValue={t.priority}>
                        <option value="">Normal</option>
                        {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                      </select>
                    </label>
                    {staff ? (
                      <label className="f">Production type
                        <select className="field" name="type" defaultValue={t.type}>
                          <option value="">Belum ditentukan</option>
                          {Object.keys(types).map((x) => <option key={x}>{x}</option>)}
                        </select>
                      </label>
                    ) : null}
                    <div className="full"><button className="btn pri">Simpan</button></div>
                  </form>
                </details>
              ) : null}
            </section>

            <FileBlock u={u} t={t} category="reference" files={files} />
            <FileBlock u={u} t={t} category="preview" files={files} />
            <FileBlock u={u} t={t} category="fa" files={files} />

            <section className="panel">
              <div className="panel-h"><h3>Aktivitas & komentar</h3></div>
              {u.role !== 'viewer' ? (
                <form action={A.commentAction} className="row" style={{ alignItems: 'flex-start' }}>
                  <Id t={t} />
                  <textarea className="field grow" style={{ width: 'auto', minHeight: 44 }} name="text" placeholder="Tulis komentar untuk tim di ticket ini" aria-label="Komentar" required />
                  <button className="btn">Kirim</button>
                </form>
              ) : null}
              <div className="feed">
                {events.map((e) =>
                  e.kind === 'comment' ? (
                    <div className="feed-i c" key={e.id}>
                      <Avatar name={e.user_name} />
                      <div className="b"><b>{e.user_name}</b> <small>{fmtDateTime(e.at)}</small><div className="prose">{e.text}</div></div>
                    </div>
                  ) : (
                    <div className="feed-i" key={e.id}>
                      <Avatar name={e.user_name} />
                      <div className="b">
                        <span><b>{e.user_name || 'Sistem'}</b> {EVENT_LABEL[e.kind] || e.kind}{e.issue ? `: ${ISSUES[e.issue]?.label || e.issue}` : ''}</span>{' '}
                        <small>{fmtDateTime(e.at)}</small>
                        {e.text ? <div className="muted prose">{e.text}</div> : null}
                      </div>
                    </div>
                  )
                )}
                {!events.length ? <div className="empty">{t.imported ? 'Ticket ini diimpor dari tracker lama, belum ada aktivitas.' : 'Belum ada aktivitas.'}</div> : null}
              </div>
            </section>
          </div>

          <aside className="panel">
            <h3>Detail</h3>
            <dl className="kv">
              <dt>PIC</dt><dd className="row" style={{ gap: 6 }}><Avatar name={t.pic_name} /> {t.pic_name || 'Belum ada'}</dd>
              <dt>Deadline akhir</dt><dd>{fmtDate(t.deadline)} {late ? <Pill tone="crit">telat {daysLate(t.deadline)} hari</Pill> : null}</dd>
              <dt>Divisi</dt><dd>{t.division || '—'}</dd>
              <dt>Requester</dt><dd>{t.requester_name || '—'}</dd>
              <dt>Project</dt><dd>{t.project || '—'}</dd>
              <dt>Production type</dt><dd>{t.type || 'Belum ditentukan'}{t.type_raw && t.type_raw !== t.type ? <span className="small muted"><br />di tracker lama: {t.type_raw}</span> : null}</dd>
              <dt>Jumlah</dt><dd className="num">{n1(t.qty)}{t.actual_qty != null ? ` (aktual ${n1(t.actual_qty)})` : ''}</dd>
              <dt>Estimasi jam</dt><dd className="num">{t.type ? n1(T.hoursOf(t, types)) : '—'}</dd>
              <dt>Prioritas</dt><dd>{t.priority || 'Normal'}</dd>
              <dt>Siklus</dt><dd>{t.cycle ? `Minggu ${fmtDate(t.cycle)}` : '—'}</dd>
              <dt>Jadwal publish</dt><dd>{fmtDate(t.publish_date)}</dd>
              <dt>Dibuat</dt><dd>{fmtDateTime(t.created_at)}</dd>
            </dl>
          </aside>
        </div>
      </div>
    </>
  );
}
