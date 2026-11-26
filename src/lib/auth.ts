import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import crypto from 'node:crypto';
import { db, Row } from './db';

const COOKIE = 'co_session';
const DAYS = 30;

export type User = {
  id: number;
  username: string;
  name: string;
  role: string;
  division: string;
  job: string;
  must_change: number;
  producer: number;
};

function sha(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + DAYS * 864e5);
  db().prepare('INSERT INTO sessions(token, user_id, expires_at) VALUES (?,?,?)').run(sha(token), userId, expires.toISOString());
  const h = await headers();
  const secure = (h.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https';
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, path: '/', expires });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db().prepare('DELETE FROM sessions WHERE token = ?').run(sha(token));
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const r = db()
    .prepare(
      `SELECT u.id, u.username, u.name, u.role, u.division, u.job, u.must_change, u.producer
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`
    )
    .get(sha(token), new Date().toISOString()) as Row | undefined;
  return (r as User) || null;
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect('/login');
  return u;
}

/* Pembatas percobaan login sederhana: 5 kali gagal, kunci 10 menit. */
const attempts = new Map<string, { n: number; until: number }>();
export function loginBlocked(key: string) {
  const a = attempts.get(key);
  return !!a && a.n >= 5 && a.until > Date.now();
}
export function loginFailed(key: string) {
  const a = attempts.get(key);
  if (!a || a.until < Date.now()) attempts.set(key, { n: 1, until: Date.now() + 10 * 60000 });
  else a.n++;
}
export function loginOk(key: string) {
  attempts.delete(key);
}
