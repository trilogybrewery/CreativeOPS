import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import crypto from 'node:crypto';
import { db, Row } from './db';

const COOKIE = 'co_session';
const AS_COOKIE = 'co_as';

/*
 * Mode tanpa login (sementara). Aktif kecuali env LOGIN_REQUIRED=true.
 * Tanpa login, pengunjung memilih akun dulu di halaman /login (tanpa password) dan bisa
 * ganti akun kapan saja, supaya alur tiap peran tetap bisa dicoba. Akun disimpan di cookie
 * (username), bukan di tabel sessions, jadi tetap jalan di server tanpa disk tetap.
 */
export const LOGIN_REQUIRED = process.env.LOGIN_REQUIRED === 'true';
const USER_COLS = 'u.id, u.username, u.name, u.role, u.division, u.job, u.must_change, u.producer';

export async function setActingUser(username: string) {
  // Cookie sesi (tanpa masa berlaku): setelah browser ditutup, pilih akun lagi.
  (await cookies()).set(AS_COOKIE, username, { httpOnly: true, sameSite: 'lax', path: '/' });
}
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
  jar.delete(AS_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  if (!LOGIN_REQUIRED) {
    // Belum memilih akun: arahkan ke halaman pilih akun (lewat requireUser).
    const as = (await cookies()).get(AS_COOKIE)?.value;
    if (!as) return null;
    const r = db().prepare(`SELECT ${USER_COLS} FROM users u WHERE u.username = ? AND u.active = 1`).get(as) as Row | undefined;
    return r ? ({ ...(r as User), must_change: 0 }) : null;
  }
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
