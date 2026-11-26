import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR, getSetting, setSetting, Row } from './db';
import { STAGES, WORK } from './config';
import { notify } from './notify';
import { adIds, brandIds, cdIds, ownersOf, requesterIds } from './tickets';
import { lastWorkdayOfMonth, today, fmtYm, ymd } from './time';

const g = globalThis as unknown as { __coSched?: NodeJS.Timeout };

/** Reminder terjadwal. Jalan tiap menit di dalam proses server; aman dipanggil berulang karena tiap pesan punya kunci dedupe. */
function tick() {
  const d = db();
  const now = new Date();
  const iso = now.toISOString();
  const day = today();
  const workday = WORK.days.includes(now.getDay());
  const hm = now.getHours() * 60 + now.getMinutes();

  // 1. Lewat SLA tahap: ke pemegang tahapnya (sekali per tahap per ticket).
  const overdue = d.prepare('SELECT * FROM tickets WHERE done = 0 AND stage_due IS NOT NULL AND stage_due < ?').all(iso) as Row[];
  for (const t of overdue) {
    const who = t.stage === 1 && t.returned ? requesterIds(t) : ownersOf(t, t.stage);
    notify(who, `Lewat SLA ${STAGES[t.stage - 1]}: #${t.id} ${t.title}`, t.id, `sla:${t.id}:${t.stage}:${t.stage_due}`);
  }
  // Backup database tiap malam ke folder data/backups (simpan 14 hari terakhir).
  if (now.getHours() >= 1 && getSetting('last_backup') !== day) {
    setSetting('last_backup', day);
    const dir = path.join(/*turbopackIgnore: true*/ DATA_DIR, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    d.backup(path.join(/*turbopackIgnore: true*/ dir, `creative-ops-${day}.db`))
      .then(() => {
        const old = fs.readdirSync(dir).filter((f) => /^creative-ops-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -14);
        for (const f of old) fs.rmSync(path.join(/*turbopackIgnore: true*/ dir, f), { force: true });
      })
      .catch((e) => console.error('[backup]', e));
  }
  if (!workday) return;

  // 2. Ringkasan pagi (jam masuk kerja).
  if (hm >= WORK.startHour * 60) {
    const prod = d.prepare('SELECT id, name FROM users WHERE producer = 1 AND active = 1').all() as Row[];
    for (const p of prod) {
      const mine = d.prepare('SELECT stage_due, deadline FROM tickets WHERE done = 0 AND stage = 5 AND pic_id = ?').all(p.id) as Row[];
      const dueToday = mine.filter((t) => (t.stage_due && ymd(new Date(t.stage_due)) === day) || t.deadline === day).length;
      const late = mine.filter((t) => (t.stage_due && t.stage_due < iso) || (t.deadline && t.deadline < day)).length;
      if (mine.length) {
        notify([p.id], `Pagi ${p.name}. Kamu pegang ${mine.length} ticket di Production: ${dueToday} jatuh tempo hari ini, ${late} sudah lewat.`, null, `digest:${day}`);
      }
    }
    const count = (sql: string) => (d.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE done = 0 AND ${sql}`).get() as Row).n;
    const cd = count('stage <= 3 AND returned = 0');
    if (cd) notify(cdIds(), `${cd} ticket nunggu kamu di Request, Alignment, dan Creative Brief.`, null, `digest:${day}`);
    const setup = count('stage = 4');
    const qc = count('stage = 6');
    if (setup || qc) notify(adIds(), `${setup} ticket nunggu Production Setup, ${qc} nunggu QC.`, null, `digest:${day}`);
    const fa = count('stage = 7 AND approve_brand_at IS NULL');
    const pub = count('stage = 8');
    if (fa || pub) notify(brandIds(), `${fa} ticket nunggu approval Brand, ${pub} siap publish.`, null, `digest:${day}`);
  }

  // 3. Kamis siang: pengingat batas request 15.00.
  if (now.getDay() === 4 && hm >= 13 * 60 && hm < 15 * 60) {
    const req = (d.prepare("SELECT id FROM users WHERE active = 1 AND role = 'requester'").all() as Row[]).map((r) => r.id);
    notify(req, 'Batas request minggu ini hari ini jam 15.00. Setelah itu masuk siklus minggu depan, kecuali urgent yang di-approve CD.', null, `cutoff:${day}`);
  }

  // 4. Jumat sore: weekly report siap.
  if (now.getDay() === 5 && hm >= 16 * 60) {
    notify([...adIds(), ...cdIds()], 'Weekly report minggu ini sudah tersusun. Buka menu Weekly AD.', null, `weekly:${day}`);
  }

  // 5. Hari kerja terakhir bulan ini: monthly report siap.
  if (day === lastWorkdayOfMonth(now) && hm >= 16 * 60) {
    notify(cdIds(), `Draft monthly report ${fmtYm(day.slice(0, 7))} siap. Tinggal isi key decisions, risiko, dan next period.`, null, `monthly:${day.slice(0, 7)}`);
  }

  // 6. Bersih-bersih sesi kedaluwarsa.
  if (now.getMinutes() === 0) d.prepare('DELETE FROM sessions WHERE expires_at < ?').run(iso);
}

export function startScheduler() {
  if (g.__coSched) return;
  const safe = () => {
    try {
      tick();
    } catch (e) {
      console.error('[scheduler]', e);
    }
  };
  g.__coSched = setInterval(safe, 60_000);
  setTimeout(safe, 5_000);
}
