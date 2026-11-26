'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import fs from 'node:fs';
import { db, hashPassword, verifyPassword, Row } from '@/lib/db';
import { createSession, destroySession, LOGIN_REQUIRED, loginBlocked, loginFailed, loginOk, requireUser, setActingUser, User } from '@/lib/auth';
import * as T from '@/lib/tickets';
import { DIVISIONS, ROLES } from '@/lib/config';
import { resolveStored } from '@/lib/files';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
function safeBack(fd: FormData, fallback: string) {
  const b = str(fd, 'back');
  return b.startsWith('/') && !b.startsWith('//') ? b : fallback;
}

/* ---------- login ---------- */
export async function loginAction(fd: FormData) {
  const username = str(fd, 'username').toLowerCase();
  const password = String(fd.get('password') ?? '');
  if (loginBlocked(username)) redirect('/login?e=locked');
  const u = db().prepare('SELECT id, pass FROM users WHERE username = ? AND active = 1').get(username) as Row | undefined;
  if (!u || !verifyPassword(password, u.pass)) {
    loginFailed(username);
    redirect('/login?e=wrong');
  }
  loginOk(username);
  await createSession(u.id);
  redirect('/board');
}
export async function switchUserAction(fd: FormData) {
  if (LOGIN_REQUIRED) redirect('/login');
  const username = str(fd, 'username').toLowerCase();
  const u = db().prepare('SELECT id FROM users WHERE username = ? AND active = 1').get(username) as Row | undefined;
  if (u) await setActingUser(username);
  redirect('/board');
}
export async function logoutAction() {
  await destroySession();
  redirect('/login');
}
export async function changePasswordAction(fd: FormData) {
  const u = await requireUser();
  const current = String(fd.get('current') ?? '');
  const next = String(fd.get('next') ?? '');
  const row = db().prepare('SELECT pass FROM users WHERE id = ?').get(u.id) as Row;
  if (!verifyPassword(current, row.pass)) redirect('/account?e=wrong');
  if (next.length < 8) redirect('/account?e=short');
  if (next === current) redirect('/account?e=same');
  db().prepare('UPDATE users SET pass = ?, must_change = 0 WHERE id = ?').run(hashPassword(next), u.id);
  revalidatePath('/', 'layout');
  redirect('/account?ok=1');
}

/* ---------- ticket ---------- */
async function onTicket(fd: FormData, fn: (u: User, t: T.Ticket) => void) {
  const u = await requireUser();
  const id = Number(fd.get('id'));
  const t = T.getTicket(id);
  if (!t || !T.canView(u, t)) redirect('/board');
  let err = '';
  try {
    fn(u, t);
  } catch (e) {
    if (e instanceof T.Refused) err = e.message;
    else throw e;
  }
  revalidatePath('/', 'layout');
  redirect(err ? `/tickets/${id}?err=${encodeURIComponent(err)}` : safeBack(fd, `/tickets/${id}`));
}

export async function createTicketAction(fd: FormData) {
  const u = await requireUser();
  let id = 0;
  let err = '';
  try {
    id = T.createTicket(u, {
      title: str(fd, 'title'),
      brief: str(fd, 'brief'),
      division: DIVISIONS.includes(str(fd, 'division')) ? str(fd, 'division') : 'Brand',
      project: str(fd, 'project'),
      type: str(fd, 'type'),
      qty: Number(fd.get('qty')) || 1,
      deadline: str(fd, 'deadline'),
      priority: str(fd, 'priority'),
      late: str(fd, 'late'),
    });
  } catch (e) {
    if (e instanceof T.Refused) err = e.message;
    else throw e;
  }
  revalidatePath('/', 'layout');
  redirect(err ? `/tickets/new?err=${encodeURIComponent(err)}` : `/tickets/${id}?new=1`);
}
export async function updateTicketAction(fd: FormData) {
  await onTicket(fd, (u, t) => {
    const x: Record<string, string> = {};
    for (const k of ['title', 'brief', 'creative_brief', 'project', 'deadline', 'priority', 'qty', 'type']) {
      if (fd.has(k)) x[k] = String(fd.get(k) ?? '');
    }
    T.updateTicket(u, t, x);
  });
}
export async function advanceAction(fd: FormData) {
  await onTicket(fd, (u, t) => T.advance(u, t));
}
export async function backToAlignmentAction(fd: FormData) {
  await onTicket(fd, (u, t) => T.backToAlignment(u, t));
}
export async function returnAction(fd: FormData) {
  await onTicket(fd, (u, t) => T.returnToRequester(u, t, str(fd, 'note') || str(fd, 'reason')));
}
export async function resubmitAction(fd: FormData) {
  await onTicket(fd, (u, t) => T.resubmit(u, t));
}
export async function urgentAction(fd: FormData) {
  await onTicket(fd, (u, t) => T.decideUrgent(u, t, str(fd, 'decision') === 'approve'));
}
export async function setupAction(fd: FormData) {
  await onTicket(fd, (u, t) =>
    T.setup(u, t, {
      picId: Number(fd.get('pic')),
      type: str(fd, 'type'),
      qty: Number(fd.get('qty')) || 0,
      due: str(fd, 'due'),
      go: str(fd, 'go') === '1',
    })
  );
}
export async function submitQCAction(fd: FormData) {
  await onTicket(fd, (u, t) => T.submitToQC(u, t));
}
export async function qcPassAction(fd: FormData) {
  await onTicket(fd, (u, t) => T.qcPass(u, t));
}
export async function reviseAction(fd: FormData) {
  await onTicket(fd, (u, t) => T.revise(u, t, str(fd, 'issue'), str(fd, 'note')));
}
export async function approveAction(fd: FormData) {
  await onTicket(fd, (u, t) => T.approve(u, t, str(fd, 'side')));
}
export async function publishDateAction(fd: FormData) {
  await onTicket(fd, (u, t) => T.setPublishDate(u, t, str(fd, 'date')));
}
export async function publishAction(fd: FormData) {
  await onTicket(fd, (u, t) => T.publish(u, t, Number(fd.get('actual')) || 0));
}
export async function commentAction(fd: FormData) {
  await onTicket(fd, (u, t) => T.addComment(u, t, str(fd, 'text')));
}
export async function addLinkAction(fd: FormData) {
  await onTicket(fd, (u, t) => {
    const category = str(fd, 'category');
    const url = str(fd, 'url');
    if (!T.canUpload(u, t, category)) throw new T.Refused('Kamu tidak bisa menambah file di bagian ini.');
    if (!/^https?:\/\/\S+$/i.test(url)) throw new T.Refused('Link harus diawali http:// atau https://');
    db()
      .prepare('INSERT INTO files(ticket_id, category, name, url, round, user_id, at) VALUES (?,?,?,?,?,?,?)')
      .run(t.id, category, url, url, (t.rev_count || 0) + 1, u.id, new Date().toISOString());
    if (category === 'fa') T.afterFaUpload(t, u);
  });
}
export async function deleteFileAction(fd: FormData) {
  await onTicket(fd, (u, t) => {
    const f = db().prepare('SELECT * FROM files WHERE id = ? AND ticket_id = ?').get(Number(fd.get('file')), t.id) as Row | undefined;
    if (!f) return;
    if (!T.canDeleteFile(u, t, f)) throw new T.Refused('Kamu tidak bisa menghapus file ini.');
    if (f.path) {
      const abs = resolveStored(f.path);
      if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
    }
    db().prepare('DELETE FROM files WHERE id = ?').run(f.id);
  });
}

/* ---------- notifikasi ---------- */
export async function markAllReadAction() {
  const u = await requireUser();
  db().prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(new Date().toISOString(), u.id);
  revalidatePath('/', 'layout');
}

/* ---------- report CD ---------- */
export async function saveNotesAction(fd: FormData) {
  const u = await requireUser();
  if (u.role !== 'cd' && u.role !== 'admin') redirect('/monthly');
  const period = str(fd, 'period');
  if (!/^\d{4}-\d{2}$/.test(period)) redirect('/monthly');
  const up = db().prepare('INSERT INTO notes(period, k, v) VALUES (?,?,?) ON CONFLICT(period, k) DO UPDATE SET v = excluded.v');
  for (const k of ['decisions', 'risks', 'next']) up.run(period, k, str(fd, k));
  revalidatePath('/monthly');
  redirect(`/monthly?m=${period}&saved=1`);
}

/* ---------- admin ---------- */
async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== 'admin') redirect('/board');
  return u;
}
export async function saveUserAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get('uid')) || 0;
  const username = str(fd, 'username').toLowerCase();
  const name = str(fd, 'name');
  const role = str(fd, 'role');
  const division = role === 'requester' ? str(fd, 'division') : '';
  const job = str(fd, 'job');
  const producer = fd.get('producer') ? 1 : 0;
  const active = fd.get('active') ? 1 : 0;
  if (!/^[a-z0-9._-]{2,30}$/.test(username) || !name || !ROLES[role] || (role === 'requester' && !DIVISIONS.includes(division))) {
    redirect('/admin?e=invalid');
  }
  const clash = db().prepare('SELECT id FROM users WHERE username = ? AND id <> ?').get(username, id);
  if (clash) redirect('/admin?e=taken');
  if (id) {
    db().prepare('UPDATE users SET username = ?, name = ?, role = ?, division = ?, job = ?, producer = ?, active = ? WHERE id = ?')
      .run(username, name, role, division, job, producer, active, id);
    if (!active) db().prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  } else {
    const pw = String(fd.get('password') ?? '');
    if (pw.length < 8) redirect('/admin?e=short');
    db().prepare('INSERT INTO users(username, name, role, division, job, pass, must_change, active, producer, created_at) VALUES (?,?,?,?,?,?,1,1,?,?)')
      .run(username, name, role, division, job, hashPassword(pw), producer, new Date().toISOString());
  }
  revalidatePath('/', 'layout');
  redirect('/admin?ok=1');
}
export async function resetPasswordAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get('uid'));
  const pw = String(fd.get('password') ?? '');
  if (pw.length < 8) redirect('/admin?e=short');
  db().prepare('UPDATE users SET pass = ?, must_change = 1 WHERE id = ?').run(hashPassword(pw), id);
  db().prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  redirect('/admin?ok=1');
}
export async function saveTypeAction(fd: FormData) {
  await requireAdmin();
  const name = str(fd, 'name');
  const base = Number(fd.get('base'));
  const rev = Number(fd.get('rev'));
  if (!name || !(base > 0) || !(rev >= 0)) redirect('/admin?e=invalid');
  db()
    .prepare(`INSERT INTO production_types(name, track, base_hours, rev_hours, sort) VALUES (?,?,?,?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM production_types))
              ON CONFLICT(name) DO UPDATE SET track = excluded.track, base_hours = excluded.base_hours, rev_hours = excluded.rev_hours`)
    .run(name, str(fd, 'track') || 'Production', base, rev);
  revalidatePath('/', 'layout');
  redirect('/admin?ok=1');
}
export async function mergeProjectAction(fd: FormData) {
  const u = await requireUser();
  if (u.role !== 'admin' && u.role !== 'cd') redirect('/board');
  const from = str(fd, 'from');
  const to = str(fd, 'to');
  if (from && to && from !== to) db().prepare('UPDATE tickets SET project = ? WHERE project = ?').run(to, from);
  revalidatePath('/', 'layout');
  redirect(u.role === 'admin' ? '/admin?ok=1' : '/monthly');
}
