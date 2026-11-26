import { db, Row } from './db';
import { ISSUES, SLA, STAGES, STAGE_OWNER_LABEL } from './config';
import { addWorkHours, standardDue, requestCutoff, mondayOf, nextMonday, ymd, parseYmd, fmtDateTime, fmtDate } from './time';
import { notify } from './notify';
import type { User } from './auth';

export type Ticket = Row;
export class Refused extends Error {}

const SELECT = `SELECT t.*, p.name AS pic_name, r.name AS requester_name
  FROM tickets t LEFT JOIN users p ON p.id = t.pic_id LEFT JOIN users r ON r.id = t.requester_id`;

/* ---------- production type & jam ---------- */
export type TypeMap = Record<string, { base: number; rev: number; track: string }>;
export function typesMap(): TypeMap {
  const out: TypeMap = {};
  for (const r of db().prepare('SELECT * FROM production_types ORDER BY sort').all() as Row[]) {
    out[r.name] = { base: r.base_hours, rev: r.rev_hours, track: r.track };
  }
  return out;
}
export function hoursOf(t: Row, types: TypeMap) {
  const ty = types[t.type];
  return ty ? (Number(t.qty) || 0) * ty.base + (Number(t.rev_count) || 0) * ty.rev : 0;
}

/* ---------- siapa boleh lihat apa ---------- */
export const isStaff = (u: User) => u.role === 'admin' || u.role === 'cd' || u.role === 'ad';
export const isBrand = (u: User) => u.role === 'requester' && u.division === 'Brand';
export const seesAll = (u: User) => isStaff(u) || u.role === 'viewer' || isBrand(u);
export const seesReports = (u: User) => isStaff(u) || u.role === 'viewer';
/**
 * Pemegang tahap 1–3 (boleh meneruskan ticket):
 * 1 Request: CD + requester divisi ticket itu (Brand, Sales, Digital Marketing)
 * 2 Alignment: CD + Brand
 * 3 Creative Brief: CD + AD
 */
export function holdsStage(u: User, t: Ticket, stage = t.stage) {
  if (u.role === 'admin' || u.role === 'cd') return stage >= 1 && stage <= 3;
  if (stage === 1) return u.role === 'requester' && u.division === t.division;
  if (stage === 2) return isBrand(u);
  if (stage === 3) return u.role === 'ad';
  return false;
}
export const canCreate = (u: User) => u.role === 'requester' || u.role === 'cd' || u.role === 'admin';

export function visibility(u: User): { where: string; params: any[] } {
  if (seesAll(u)) return { where: '1=1', params: [] };
  if (u.role === 'requester') return { where: '(t.division = ? OR t.requester_id = ?)', params: [u.division, u.id] };
  return { where: 't.pic_id = ?', params: [u.id] }; // tim produksi: hanya ticket miliknya
}
export function canView(u: User, t: Ticket) {
  if (seesAll(u)) return true;
  if (u.role === 'requester') return t.division === u.division || t.requester_id === u.id;
  return t.pic_id === u.id;
}
export function getTicket(id: number): Ticket | undefined {
  return db().prepare(`${SELECT} WHERE t.id = ?`).get(id) as Ticket | undefined;
}
export function listTickets(u: User, extra = '', params: any[] = []): Ticket[] {
  const v = visibility(u);
  return db().prepare(`${SELECT} WHERE ${v.where} ${extra}`).all(...v.params, ...params) as Ticket[];
}

/* ---------- siapa pemegang tiap tahap ---------- */
function idsWhere(where: string, ...p: any[]): number[] {
  return (db().prepare(`SELECT id FROM users WHERE active = 1 AND ${where}`).all(...p) as Row[]).map((r) => r.id);
}
export const cdIds = () => idsWhere("role = 'cd'");
export const adIds = () => idsWhere("role = 'ad'");
export const brandIds = () => idsWhere("role = 'requester' AND division = 'Brand'");
export function requesterIds(t: Ticket): number[] {
  if (t.requester_id) return [t.requester_id];
  return idsWhere("role = 'requester' AND division = ?", t.division);
}
export function ownersOf(t: Ticket, stage: number): number[] {
  if (stage === 1) return [...cdIds(), ...requesterIds(t)];
  if (stage === 2) return [...cdIds(), ...brandIds()];
  if (stage === 3) return [...cdIds(), ...adIds()];
  if (stage === 4 || stage === 6) return adIds();
  if (stage === 5) return t.pic_id ? [t.pic_id] : adIds();
  if (stage === 7) return [...cdIds(), ...brandIds()];
  return brandIds();
}

/* ---------- SLA ---------- */
export function estimateProductionDue(t: Ticket, picId: number | null, now: Date) {
  const types = typesMap();
  let total = hoursOf(t, types);
  if (picId) {
    const queue = db()
      .prepare('SELECT qty, type, rev_count FROM tickets WHERE stage = 5 AND done = 0 AND imported = 0 AND pic_id = ? AND id <> ?')
      .all(picId, t.id) as Row[];
    for (const q of queue) total += hoursOf(q, types);
  }
  return addWorkHours(now, Math.max(total, 1));
}
function computeDue(t: Ticket, stage: number, now: Date, given?: Date | null): Date | null {
  if (stage <= 4) {
    if (!t.cycle) return null;
    const std = standardDue(t.cycle, stage)!;
    return std.getTime() > now.getTime() ? std : addWorkHours(now, SLA.lateStageWorkHours);
  }
  if (stage === 5) return given || estimateProductionDue(t, t.pic_id, now);
  if (stage === 6) return addWorkHours(now, SLA.qcWorkHours);
  if (stage === 7) return addWorkHours(now, SLA.approvalWorkHours);
  if (t.publish_date) {
    const d = parseYmd(t.publish_date);
    d.setHours(19, 0, 0, 0);
    return d;
  }
  return null;
}
function logEvent(ticketId: number, userId: number | null, kind: string, text = '', issue = '') {
  db().prepare('INSERT INTO events(ticket_id, user_id, kind, issue, text, at) VALUES (?,?,?,?,?,?)').run(ticketId, userId, kind, issue, text, new Date().toISOString());
}
function enterStage(t: Ticket, stage: number, u: User | null, opts: { due?: Date | null; forward?: boolean } = {}) {
  const now = new Date();
  const iso = now.toISOString();
  const forward = opts.forward ?? stage > t.stage;
  const d = db();
  d.prepare('UPDATE stage_log SET left_at = ?, forward = ? WHERE ticket_id = ? AND left_at IS NULL').run(iso, forward ? 1 : 0, t.id);
  const fresh = getTicket(t.id)!;
  const due = computeDue(fresh, stage, now, opts.due);
  d.prepare('UPDATE tickets SET stage = ?, stage_at = ?, stage_due = ? WHERE id = ?').run(stage, iso, due ? due.toISOString() : null, t.id);
  d.prepare('INSERT INTO stage_log(ticket_id, stage, entered_at, due_at) VALUES (?,?,?,?)').run(t.id, stage, iso, due ? due.toISOString() : null);
  logEvent(t.id, u ? u.id : null, 'move', `${forward ? 'Lanjut' : 'Balik'} ke ${stage}. ${STAGES[stage - 1]}`);
}
function refreshDue(t: Ticket) {
  const fresh = getTicket(t.id)!;
  const due = computeDue(fresh, fresh.stage, new Date());
  const iso = due ? due.toISOString() : null;
  db().prepare('UPDATE tickets SET stage_due = ? WHERE id = ?').run(iso, t.id);
  db().prepare('UPDATE stage_log SET due_at = ? WHERE ticket_id = ? AND left_at IS NULL').run(iso, t.id);
}
const label = (t: Ticket) => `#${t.id} ${t.title}`;
function need(cond: any, msg: string): asserts cond {
  if (!cond) throw new Refused(msg);
}

/* ---------- aksi ---------- */
export type NewTicket = {
  title: string; brief: string; division: string; project: string; type: string;
  qty: number; deadline: string; priority: string; late?: string;
};
export function createTicket(u: User, x: NewTicket): number {
  need(canCreate(u), 'Kamu tidak punya akses membuat ticket.');
  need(x.title.trim(), 'Judul wajib diisi.');
  need(x.brief.trim(), 'Brief wajib diisi.');
  need(/^\d{4}-\d{2}-\d{2}$/.test(x.deadline), 'Deadline wajib diisi.');
  const now = new Date();
  const late = now.getTime() > requestCutoff(now).getTime();
  let cycle = ymd(mondayOf(now));
  let urgent = '';
  if (late) {
    if (x.late === 'urgent') urgent = u.role === 'cd' || u.role === 'admin' ? 'approved' : 'pending';
    else cycle = ymd(nextMonday(now));
  }
  const division = u.role === 'requester' ? u.division : x.division;
  const iso = now.toISOString();
  const r = db()
    .prepare(`INSERT INTO tickets(title, brief, division, requester_id, project, type, qty, priority, deadline, stage, cycle, urgent, created_at, stage_at)
      VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?)`)
    .run(x.title.trim(), x.brief.trim(), division, u.id, x.project.trim(), x.type, x.qty || 1, x.priority, x.deadline, cycle, urgent, iso, iso);
  const id = Number(r.lastInsertRowid);
  const t = getTicket(id)!;
  const due = computeDue(t, 1, now);
  db().prepare('UPDATE tickets SET stage_due = ? WHERE id = ?').run(due ? due.toISOString() : null, id);
  db().prepare('INSERT INTO stage_log(ticket_id, stage, entered_at, due_at) VALUES (?,1,?,?)').run(id, iso, due ? due.toISOString() : null);
  logEvent(id, u.id, 'create', urgent ? 'Request urgent (lewat batas Kamis 15.00)' : 'Request dibuat');
  notify(cdIds(), `${urgent === 'pending' ? 'Request URGENT perlu approve' : 'Request baru'} dari ${division}: ${label(t)}`, id);
  return id;
}

export function updateTicket(u: User, t: Ticket, x: Record<string, string>) {
  need(!t.done, 'Ticket sudah selesai.');
  const staff = isStaff(u);
  const mine = u.role === 'requester' && canView(u, t) && t.stage <= 2;
  need(staff || mine, 'Kamu tidak bisa mengubah ticket ini di tahap sekarang.');
  const set: string[] = [];
  const val: any[] = [];
  const put = (k: string, v: any) => { set.push(`${k} = ?`); val.push(v); };
  if (x.title !== undefined && x.title.trim()) put('title', x.title.trim());
  if (x.brief !== undefined) put('brief', x.brief.trim());
  if (x.project !== undefined) put('project', x.project.trim());
  if (x.deadline !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(x.deadline)) put('deadline', x.deadline);
  if (x.priority !== undefined) put('priority', x.priority);
  if (x.qty !== undefined && Number(x.qty) > 0) put('qty', Number(x.qty));
  if (staff && x.creative_brief !== undefined) put('creative_brief', x.creative_brief.trim());
  if (staff && x.type !== undefined && x.type) put('type', x.type);
  if (!set.length) return;
  db().prepare(`UPDATE tickets SET ${set.join(', ')} WHERE id = ?`).run(...val, t.id);
  logEvent(t.id, u.id, 'edit', 'Brief / detail diperbarui');
}

export function decideUrgent(u: User, t: Ticket, approve: boolean) {
  need(u.role === 'cd' || u.role === 'admin', 'Hanya CD yang bisa memutuskan request urgent.');
  need(t.urgent === 'pending', 'Tidak ada permintaan urgent yang menunggu.');
  if (approve) {
    db().prepare("UPDATE tickets SET urgent = 'approved' WHERE id = ?").run(t.id);
    logEvent(t.id, u.id, 'urgent', 'Urgent disetujui, masuk siklus minggu ini');
    notify(requesterIds(t), `Request urgent disetujui: ${label(t)}`, t.id);
  } else {
    const next = parseYmd(t.cycle);
    next.setDate(next.getDate() + 7);
    db().prepare("UPDATE tickets SET urgent = 'rejected', cycle = ? WHERE id = ?").run(ymd(next), t.id);
    logEvent(t.id, u.id, 'urgent', 'Urgent ditolak, masuk siklus minggu depan');
    notify(requesterIds(t), `Request urgent ditolak, masuk siklus minggu depan: ${label(t)}`, t.id);
  }
  refreshDue(t);
}

/** CD meneruskan ticket di tahap 1–3. */
export function advance(u: User, t: Ticket) {
  need(t.stage >= 1 && t.stage <= 3 && !t.done, 'Ticket tidak berada di tahap 1–3.');
  need(holdsStage(u, t), `Tahap ini dipegang ${STAGE_OWNER_LABEL[t.stage - 1]}.`);
  need(!t.returned, 'Ticket sedang dikembalikan ke requester. Tunggu dikirim ulang.');
  need(t.urgent !== 'pending', 'Putuskan dulu permintaan urgent-nya.');
  const next = t.stage + 1;
  enterStage(t, next, u);
  const to = (ids: number[]) => [...new Set(ids)].filter((id) => id !== u.id);
  if (next === 2) notify(to([...ownersOf(t, 2), ...requesterIds(t)]), `Masuk Alignment: ${label(t)}`, t.id);
  if (next === 3) notify(to(ownersOf(t, 3)), `Masuk Creative Brief: ${label(t)}`, t.id);
  if (next === 4) notify(to(adIds()), `Siap Production Setup, assign PIC-nya: ${label(t)}`, t.id);
}
export function backToAlignment(u: User, t: Ticket) {
  need(t.stage === 3, 'Hanya dari Creative Brief.');
  need(holdsStage(u, t), `Tahap ini dipegang ${STAGE_OWNER_LABEL[2]}.`);
  enterStage(t, 2, u, { forward: false });
}
export function returnToRequester(u: User, t: Ticket, reason: string) {
  need(holdsStage(u, t) && u.role !== 'requester', 'Hanya pemegang tahap ini (selain requester) yang bisa mengembalikan request.');
  need(t.stage <= 3 && !t.done, 'Hanya bisa dikembalikan dari tahap 1–3.');
  need(reason.trim(), 'Alasan wajib diisi.');
  db().prepare('UPDATE tickets SET returned = 1, return_reason = ? WHERE id = ?').run(reason.trim(), t.id);
  if (t.stage !== 1) enterStage(t, 1, u, { forward: false });
  logEvent(t.id, u.id, 'return', reason.trim());
  notify(requesterIds(t), `Request dikembalikan (${reason.trim()}): ${label(t)}. Lengkapi lalu kirim ulang.`, t.id);
}
export function resubmit(u: User, t: Ticket) {
  need((u.role === 'requester' && canView(u, t)) || u.role === 'admin' || u.role === 'cd', 'Hanya requester yang bisa mengirim ulang.');
  need(t.stage === 1 && t.returned, 'Ticket tidak sedang dikembalikan.');
  db().prepare("UPDATE tickets SET returned = 0, return_reason = '' WHERE id = ?").run(t.id);
  logEvent(t.id, u.id, 'resubmit', 'Request dikirim ulang');
  refreshDue(t);
  notify(cdIds(), `Request dikirim ulang: ${label(t)}`, t.id);
}

/** AD: assign PIC di Production Setup, opsional langsung mulai produksi. */
export function setup(u: User, t: Ticket, x: { picId: number; type: string; qty: number; due: string; go: boolean }) {
  need(u.role === 'ad' || u.role === 'admin', 'Production Setup teritori AD.');
  need(t.stage === 4 || t.stage === 5, 'Ticket tidak berada di Production Setup / Production.');
  const pic = db().prepare('SELECT id, name FROM users WHERE id = ? AND active = 1 AND producer = 1').get(x.picId) as Row | undefined;
  need(pic, 'Pilih PIC dari tim produksi.');
  need(typesMap()[x.type], 'Pilih production type.');
  need(x.qty > 0, 'Jumlah harus lebih dari 0.');
  const changedPic = t.pic_id !== pic.id;
  db().prepare('UPDATE tickets SET pic_id = ?, type = ?, qty = ? WHERE id = ?').run(pic.id, x.type, x.qty, t.id);
  if (changedPic) logEvent(t.id, u.id, 'assign', `Di-assign ke ${pic.name}`);
  const given = x.due ? new Date(x.due) : null;
  if (t.stage === 4 && x.go) {
    enterStage(getTicket(t.id)!, 5, u, { due: given && !isNaN(given.getTime()) ? given : null });
    const fresh = getTicket(t.id)!;
    notify([pic.id], `Ticket baru untuk kamu: ${label(t)}. Target selesai ${fmtDateTime(fresh.stage_due)}.`, t.id);
  } else if (t.stage === 5) {
    if (given && !isNaN(given.getTime())) {
      db().prepare('UPDATE tickets SET stage_due = ? WHERE id = ?').run(given.toISOString(), t.id);
      db().prepare('UPDATE stage_log SET due_at = ? WHERE ticket_id = ? AND left_at IS NULL').run(given.toISOString(), t.id);
    }
    if (changedPic) notify([pic.id], `Ticket dipindahkan ke kamu: ${label(t)}`, t.id);
  }
}

export function submitToQC(u: User, t: Ticket) {
  need(t.stage === 5 && !t.done, 'Ticket tidak berada di Production.');
  need(t.pic_id === u.id || u.role === 'ad' || u.role === 'admin', 'Hanya PIC ticket ini yang bisa submit.');
  const round = (t.rev_count || 0) + 1;
  const n = db().prepare("SELECT COUNT(*) AS n FROM files WHERE ticket_id = ? AND category = 'preview' AND round = ?").get(t.id, round) as Row;
  need(n.n > 0, round > 1 ? 'Upload dulu hasil revisinya sebelum submit ke QC.' : 'Upload dulu preview hasilnya sebelum submit ke QC.');
  enterStage(t, 6, u);
  notify(adIds(), `Nunggu QC (maksimal ${SLA.qcWorkHours} jam kerja): ${label(t)}`, t.id);
}
export function qcPass(u: User, t: Ticket) {
  need(u.role === 'ad' || u.role === 'admin', 'QC teritori AD.');
  need(t.stage === 6, 'Ticket tidak berada di QC.');
  db().prepare('UPDATE tickets SET approve_cd_at = NULL, approve_brand_at = NULL, approve_brand_by = NULL WHERE id = ?').run(t.id);
  enterStage(t, 7, u);
  notify([...cdIds(), ...brandIds()], `Lolos QC, nunggu Final Approval: ${label(t)}`, t.id);
}
export function revise(u: User, t: Ticket, issue: string, note: string) {
  const def = ISSUES[issue];
  need(def, 'Pilih jenis revisi.');
  const okQC = t.stage === 6 && (u.role === 'ad' || u.role === 'admin');
  const okFA = t.stage === 7 && (u.role === 'cd' || u.role === 'admin' || isBrand(u));
  need(okQC || okFA, 'Kamu tidak bisa meminta revisi di tahap ini.');
  db().prepare('UPDATE tickets SET rev_count = rev_count + 1, approve_cd_at = NULL, approve_brand_at = NULL, approve_brand_by = NULL WHERE id = ?').run(t.id);
  logEvent(t.id, u.id, 'revision', note.trim(), issue);
  enterStage(getTicket(t.id)!, def.back, u, { forward: false });
  const fresh = getTicket(t.id)!;
  const who = def.back === 5 ? [fresh.pic_id, ...adIds()] : cdIds();
  notify(who.filter((id) => id !== u.id), `${def.label}, revisi ke-${fresh.rev_count}${note.trim() ? ` (${note.trim()})` : ''}: ${label(t)}`, t.id);
}

function finishApproval(t: Ticket, u: User | null) {
  const f = getTicket(t.id)!;
  if (f.stage !== 7 || !f.approve_cd_at || !f.approve_brand_at) return;
  const fa = db().prepare("SELECT COUNT(*) AS n FROM files WHERE ticket_id = ? AND category = 'fa'").get(t.id) as Row;
  if (fa.n > 0) {
    enterStage(f, 8, u);
    notify([...requesterIds(f), ...brandIds()], `Disetujui dan file FA sudah ada, siap publish: ${label(f)}`, f.id);
  } else {
    notify([f.pic_id, ...adIds()], `Sudah di-approve CD dan Brand. Upload file FA-nya: ${label(f)}`, f.id, `needfa:${f.id}:${f.rev_count}`);
  }
}
export function approve(u: User, t: Ticket, side: string) {
  need(t.stage === 7, 'Ticket tidak berada di Final Approval.');
  if (side === 'cd') {
    need(u.role === 'cd' || u.role === 'admin', 'Approval ini milik CD.');
    db().prepare('UPDATE tickets SET approve_cd_at = ? WHERE id = ?').run(new Date().toISOString(), t.id);
    logEvent(t.id, u.id, 'approve', 'Approve dari CD');
  } else {
    need(isBrand(u) || u.role === 'admin', 'Approval ini milik Brand.');
    db().prepare('UPDATE tickets SET approve_brand_at = ?, approve_brand_by = ? WHERE id = ?').run(new Date().toISOString(), u.id, t.id);
    logEvent(t.id, u.id, 'approve', 'Approve dari Brand');
  }
  finishApproval(t, u);
}
/** Dipanggil setelah file FA di-upload: kalau dua approval sudah ada, ticket lanjut. */
export function afterFaUpload(t: Ticket, u: User) {
  finishApproval(t, u);
}

export function setPublishDate(u: User, t: Ticket, date: string) {
  need(isBrand(u) || isStaff(u), 'Hanya Brand yang bisa mengatur jadwal publish.');
  need(/^\d{4}-\d{2}-\d{2}$/.test(date), 'Tanggal tidak valid.');
  db().prepare('UPDATE tickets SET publish_date = ? WHERE id = ?').run(date, t.id);
  if (t.stage === 8) refreshDue(t);
}
export function publish(u: User, t: Ticket, actual: number) {
  need(t.stage === 8 && !t.done, 'Ticket tidak berada di Output & Publish.');
  need(isBrand(u) || u.role === 'cd' || u.role === 'admin', 'Output & Publish teritori Brand.');
  const iso = new Date().toISOString();
  db().prepare('UPDATE tickets SET done = 1, done_at = ?, actual_qty = ? WHERE id = ?').run(iso, actual > 0 ? actual : t.qty, t.id);
  db().prepare('UPDATE stage_log SET left_at = ?, forward = 1 WHERE ticket_id = ? AND left_at IS NULL').run(iso, t.id);
  logEvent(t.id, u.id, 'done', 'Selesai / published');
  notify([...requesterIds(t), t.pic_id].filter((id) => id !== u.id), `Selesai dan published: ${label(t)}`, t.id);
}
export function addComment(u: User, t: Ticket, text: string) {
  need(u.role !== 'viewer', 'Viewer hanya bisa melihat.');
  need(canView(u, t), 'Tidak ada akses.');
  need(text.trim(), 'Komentar kosong.');
  logEvent(t.id, u.id, 'comment', text.trim());
  const who = new Set<number>([...ownersOf(t, t.stage), ...requesterIds(t)]);
  if (t.pic_id) who.add(t.pic_id);
  who.delete(u.id);
  notify([...who], `${u.name} berkomentar di ${label(t)}: ${text.trim().slice(0, 120)}`, t.id);
}

/* ---------- file ---------- */
export function canUpload(u: User, t: Ticket, category: string) {
  if (u.role === 'viewer' || !canView(u, t) || t.done) return false;
  if (category === 'reference') return true;
  const maker = t.pic_id === u.id || u.role === 'ad' || u.role === 'admin';
  if (category === 'preview') return maker && (t.stage === 5 || t.stage === 6);
  if (category === 'fa') return maker && t.stage >= 6;
  return false;
}
export function canDeleteFile(u: User, t: Ticket, f: Row) {
  if (u.role === 'viewer' || t.done) return false;
  return f.user_id === u.id || isStaff(u);
}
export function ticketFiles(id: number): Row[] {
  return db().prepare('SELECT f.*, u.name AS user_name FROM files f LEFT JOIN users u ON u.id = f.user_id WHERE f.ticket_id = ? ORDER BY f.id').all(id) as Row[];
}
export function ticketEvents(id: number): Row[] {
  return db().prepare('SELECT e.*, u.name AS user_name FROM events e LEFT JOIN users u ON u.id = e.user_id WHERE e.ticket_id = ? ORDER BY e.id DESC').all(id) as Row[];
}
export function producers(): Row[] {
  return db().prepare('SELECT id, name, job, active FROM users WHERE producer = 1 ORDER BY active DESC, id').all() as Row[];
}
export function projectNames(): string[] {
  return (db().prepare("SELECT project, COUNT(*) AS n FROM tickets WHERE project <> '' GROUP BY project ORDER BY n DESC").all() as Row[]).map((r) => r.project);
}
export { fmtDate };

/**
 * Drag & drop di Board. Tiap perpindahan diterjemahkan ke aksi workflow yang sudah ada,
 * jadi hak akses, SLA, log, dan notifikasi tetap sama dengan tombol di halaman ticket.
 * Perpindahan yang butuh isian (alasan, jenis revisi, approval) ditolak dengan petunjuk.
 */
export function moveOnBoard(u: User, t: Ticket, to: number, picId: number | null) {
  need(!t.done, 'Ticket sudah selesai.');
  need(u.role !== 'viewer', 'Viewer hanya bisa melihat.');
  const from = t.stage;
  if (from === to) {
    need(to === 5 && picId && picId !== t.pic_id, 'Ticket sudah di tahap ini.');
    need(t.type, 'Isi production type dulu di halaman ticket.');
    return setup(u, t, { picId: picId!, type: t.type, qty: Number(t.qty) || 1, due: '', go: false });
  }
  if (to === from + 1 && from <= 3) return advance(u, t);
  if (from === 3 && to === 2) return backToAlignment(u, t);
  if (from === 4 && to === 5) {
    const pic = picId || t.pic_id;
    need(pic, 'Taruh ticket di lajur PIC yang dituju.');
    need(t.type, 'Isi production type dulu di halaman ticket (Production Setup).');
    return setup(u, t, { picId: pic, type: t.type, qty: Number(t.qty) || 1, due: '', go: true });
  }
  if (from === 5 && to === 6) return submitToQC(u, t);
  if (from === 6 && to === 7) return qcPass(u, t);
  if (from === 7 && to === 8) throw new Refused('Final Approval lanjut otomatis setelah CD dan Brand approve dan file FA di-upload. Buka ticket untuk approve.');
  if (from <= 3 && to < from) throw new Refused('Untuk mengembalikan ke requester, buka ticket dan isi alasannya.');
  if ((from === 6 || from === 7) && to < from) throw new Refused('Revisi butuh jenis revisi. Buka ticket lalu pilih Minta revisi.');
  throw new Refused(`Ticket tidak bisa dipindah dari tahap ${from} ke tahap ${to}. Tahap tidak boleh dilompati.`);
}
