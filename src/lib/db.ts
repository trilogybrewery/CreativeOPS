import './config';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type Row = Record<string, any>;

// Di Vercel disk aplikasi read-only, jadi data ditaruh di /tmp. Isinya TIDAK permanen:
// bisa hilang kapan saja dan tiap instance punya salinan sendiri. Hanya untuk demo.
export const DATA_DIR =
  process.env.DATA_DIR ||
  (process.env.VERCEL ? '/tmp/creative-ops' : path.join(/*turbopackIgnore: true*/ process.cwd(), 'data'));
export const FILES_DIR = path.join(/*turbopackIgnore: true*/ DATA_DIR, 'files');

const g = globalThis as unknown as { __coDb?: Database.Database };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL, division TEXT DEFAULT '', job TEXT DEFAULT '',
  pass TEXT NOT NULL, must_change INTEGER DEFAULT 1, active INTEGER DEFAULT 1,
  producer INTEGER DEFAULT 0, created_at TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS production_types(name TEXT PRIMARY KEY, track TEXT, base_hours REAL, rev_hours REAL, sort INTEGER);
CREATE TABLE IF NOT EXISTS tickets(
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, brief TEXT DEFAULT '', creative_brief TEXT DEFAULT '',
  division TEXT DEFAULT '', requester_id INTEGER, project TEXT DEFAULT '', type TEXT DEFAULT '', type_raw TEXT DEFAULT '',
  qty REAL DEFAULT 1, actual_qty REAL, priority TEXT DEFAULT '', deadline TEXT DEFAULT '',
  stage INTEGER NOT NULL DEFAULT 1, done INTEGER DEFAULT 0, pic_id INTEGER,
  cycle TEXT, urgent TEXT DEFAULT '', returned INTEGER DEFAULT 0, return_reason TEXT DEFAULT '',
  stage_due TEXT, stage_at TEXT, rev_count INTEGER DEFAULT 0,
  approve_cd_at TEXT, approve_brand_at TEXT, approve_brand_by INTEGER, publish_date TEXT DEFAULT '',
  created_at TEXT, done_at TEXT, imported INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS tickets_stage ON tickets(stage, done);
CREATE INDEX IF NOT EXISTS tickets_pic ON tickets(pic_id);
CREATE INDEX IF NOT EXISTS tickets_deadline ON tickets(deadline);
CREATE TABLE IF NOT EXISTS stage_log(
  id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL, stage INTEGER NOT NULL,
  entered_at TEXT NOT NULL, due_at TEXT, left_at TEXT, forward INTEGER);
CREATE INDEX IF NOT EXISTS stage_log_ticket ON stage_log(ticket_id);
CREATE TABLE IF NOT EXISTS events(
  id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL, user_id INTEGER, kind TEXT NOT NULL,
  issue TEXT DEFAULT '', text TEXT DEFAULT '', at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS events_ticket ON events(ticket_id);
CREATE TABLE IF NOT EXISTS files(
  id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL, category TEXT NOT NULL, name TEXT NOT NULL,
  path TEXT, url TEXT, size INTEGER DEFAULT 0, mime TEXT DEFAULT '', round INTEGER DEFAULT 1,
  user_id INTEGER, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS files_ticket ON files(ticket_id);
CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, ticket_id INTEGER, text TEXT NOT NULL,
  at TEXT NOT NULL, read_at TEXT, dedupe TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS notif_dedupe ON notifications(user_id, dedupe) WHERE dedupe IS NOT NULL;
CREATE INDEX IF NOT EXISTS notif_user ON notifications(user_id, read_at);
CREATE TABLE IF NOT EXISTS push_subs(endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL, data TEXT NOT NULL, at TEXT);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS notes(period TEXT NOT NULL, k TEXT NOT NULL, v TEXT, PRIMARY KEY(period, k));
`;

export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
export function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return test.length === ref.length && crypto.timingSafeEqual(test, ref);
}

function seed(d: Database.Database) {
  const now = new Date().toISOString();
  const seedPath = path.join(/*turbopackIgnore: true*/ process.cwd(), 'seed', 'tracker-2026.json');
  const src: any = fs.existsSync(seedPath) ? JSON.parse(fs.readFileSync(seedPath, 'utf8')) : { types: {}, tasks: [] };

  // Production type resmi (durasi dalam jam).
  const insType = d.prepare('INSERT OR IGNORE INTO production_types(name, track, base_hours, rev_hours, sort) VALUES (?,?,?,?,?)');
  const defaults: Record<string, [string, number, number]> = Object.keys(src.types).length
    ? src.types
    : { 'Grafis Easy': ['Production', 1, 0.3], 'Video Easy': ['Craft', 3, 1] };
  Object.entries(defaults).forEach(([name, v], i) => insType.run(name, v[0], v[1], v[2], i));

  // Akun awal. Password awal sama untuk semua dan wajib diganti saat login pertama.
  const initial = process.env.INITIAL_PASSWORD || 'trilogy-2026';
  const insUser = d.prepare(
    'INSERT INTO users(username, name, role, division, job, pass, must_change, active, producer, created_at) VALUES (?,?,?,?,?,?,1,?,?,?)'
  );
  const people: [string, string, string, string, string, number, number][] = [
    ['admin', 'Admin', 'admin', '', 'Admin sistem', 1, 0],
    ['dewa', 'Dewa', 'cd', '', 'Creative Director', 1, 0],
    ['david', 'David', 'ad', '', 'Art Director', 1, 1],
    ['ilham', 'Ilham', 'production', '', 'Multimedia Designer', 1, 1],
    ['ryan', 'Ryan', 'production', '', 'Desainer grafis', 1, 1],
    ['riziq', 'Riziq', 'production', '', 'Multimedia Designer', 1, 1],
    ['deny', 'Deny', 'production', '', 'Editor video & 3D (nonaktif)', 0, 1],
    ['brand', 'Requester Brand', 'requester', 'Brand', 'Brand', 1, 0],
    ['sales', 'Requester Sales', 'requester', 'Sales', 'Sales', 1, 0],
    ['digital', 'Requester Digital', 'requester', 'Digital Marketing', 'Digital Marketing', 1, 0],
    ['bod', 'BOD', 'viewer', '', 'Hanya lihat', 1, 0],
  ];
  const ids: Record<string, number> = {};
  for (const p of people) {
    const r = insUser.run(p[0], p[1], p[2], p[3], p[4], hashPassword(initial), p[5], p[6], now);
    ids[p[1].toLowerCase()] = Number(r.lastInsertRowid);
  }

  // Histori dari TRACKER_CREATIVE_2026.
  const insTicket = d.prepare(`INSERT INTO tickets(title, brief, division, project, type, type_raw, qty, actual_qty, priority, deadline,
    stage, done, pic_id, created_at, done_at, stage_at, imported) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`);
  const divMap: Record<string, string> = { Digital: 'Digital Marketing' };
  for (const t of src.tasks as any[]) {
    const brief = String(t.brief || '');
    const firstLine = brief.split('\n').map((s: string) => s.trim()).filter(Boolean)[0] || t.typeRaw || 'Tanpa judul';
    const title = firstLine.length > 90 ? firstLine.slice(0, 89) + '…' : firstLine;
    const done = t.status === 'Selesai' ? 1 : 0;
    const created = (t.active || t.deadline || now.slice(0, 10)) + 'T10:00:00';
    insTicket.run(
      title, brief, divMap[t.div] || t.div || 'Brand', t.project || '', t.type || '', t.typeRaw || '',
      t.qty || 0, t.actual, t.prio || '', t.deadline || '', done ? 8 : t.stage, done,
      ids[String(t.pic || '').toLowerCase()] || null, created,
      done ? (t.done || t.deadline || now.slice(0, 10)) : null, created
    );
  }
}

export function db(): Database.Database {
  if (g.__coDb) return g.__coDb;
  fs.mkdirSync(FILES_DIR, { recursive: true });
  const d = new Database(path.join(/*turbopackIgnore: true*/ DATA_DIR, 'creative-ops.db'));
  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');
  d.exec(SCHEMA);
  const n = d.prepare('SELECT COUNT(*) AS n FROM users').get() as Row;
  if (!n.n) d.transaction(() => seed(d))();
  g.__coDb = d;
  return d;
}

export function getSetting(k: string): string | null {
  const r = db().prepare('SELECT v FROM settings WHERE k = ?').get(k) as Row | undefined;
  return r ? r.v : null;
}
export function setSetting(k: string, v: string) {
  db().prepare('INSERT INTO settings(k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, v);
}
