import { WORK, SLA, TIMEZONE } from './config';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DOW = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function pad(n: number) {
  return n < 10 ? '0' + n : '' + n;
}
export function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function today() {
  return ymd(new Date());
}
export function parseYmd(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function fmtDate(s?: string | null) {
  if (!s) return '—';
  const d = s.length <= 10 ? parseYmd(s) : new Date(s);
  return `${d.getDate()} ${MON[d.getMonth()]}`;
}
export function fmtDateTime(s?: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}, ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}
export function fmtYm(ym: string) {
  const [y, m] = ym.split('-');
  return `${MON[+m - 1]} ${y}`;
}
export function daysLate(dateStr: string) {
  return Math.round((parseYmd(today()).getTime() - parseYmd(dateStr.slice(0, 10)).getTime()) / 864e5);
}

/* ---------- jam kerja ---------- */
function isWorkday(d: Date) {
  return WORK.days.includes(d.getDay());
}
function nextWorkStart(d: Date) {
  const n = new Date(d);
  n.setDate(n.getDate() + 1);
  n.setHours(WORK.startHour, 0, 0, 0);
  while (!isWorkday(n)) n.setDate(n.getDate() + 1);
  return n;
}
function clampToWork(d: Date) {
  const n = new Date(d);
  if (!isWorkday(n)) {
    n.setHours(WORK.startHour, 0, 0, 0);
    while (!isWorkday(n)) n.setDate(n.getDate() + 1);
    return n;
  }
  if (n.getHours() < WORK.startHour) {
    n.setHours(WORK.startHour, 0, 0, 0);
    return n;
  }
  if (n.getHours() >= WORK.endHour) return nextWorkStart(n);
  return n;
}
/** Tambah N jam kerja ke sebuah waktu, melompati malam dan akhir pekan. */
export function addWorkHours(from: Date, hours: number): Date {
  let d = clampToWork(from);
  let left = Math.max(0, hours) * 60;
  for (let guard = 0; guard < 400; guard++) {
    const end = new Date(d);
    end.setHours(WORK.endHour, 0, 0, 0);
    const avail = (end.getTime() - d.getTime()) / 60000;
    if (left <= avail) return new Date(d.getTime() + left * 60000);
    left -= avail;
    d = nextWorkStart(d);
  }
  return d;
}
export function workdaysBetween(a: string, b: string) {
  const d = parseYmd(a);
  const e = parseYmd(b);
  let n = 0;
  while (d <= e) {
    if (isWorkday(d)) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

/* ---------- siklus mingguan ---------- */
export function mondayOf(d: Date) {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  const dow = n.getDay() === 0 ? 7 : n.getDay();
  n.setDate(n.getDate() - (dow - 1));
  return n;
}
function slot(monday: Date, s: { dow: number; hour: number; minute: number }) {
  const n = new Date(monday);
  n.setDate(n.getDate() + (s.dow - 1));
  n.setHours(s.hour, s.minute, 0, 0);
  return n;
}
/** Batas request minggu ini (Kamis 15.00). */
export function requestCutoff(now = new Date()) {
  return slot(mondayOf(now), SLA.request);
}
export function nextMonday(now = new Date()) {
  const m = mondayOf(now);
  m.setDate(m.getDate() + 7);
  return m;
}
/** Jadwal baku tahap 1–4 untuk sebuah siklus (cycle = tanggal Senin, YYYY-MM-DD). */
export function standardDue(cycle: string, stage: number): Date | null {
  const m = parseYmd(cycle);
  if (stage === 1) return slot(m, SLA.request);
  if (stage === 2) return slot(m, SLA.alignment);
  if (stage === 3) return slot(m, SLA.brief);
  if (stage === 4) return slot(m, SLA.setup);
  return null;
}

/* ---------- minggu dalam bulan (untuk report) ---------- */
export type Week = { name: string; start: string; end: string; workdays: number };
export function weeksOf(ym: string): Week[] {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const out: Week[] = [];
  let d = 1;
  while (d <= last) {
    const s = new Date(y, m - 1, d);
    const dow = s.getDay();
    const e = Math.min(last, d + (dow === 0 ? 0 : 7 - dow));
    out.push({ name: '', start: ymd(s), end: ymd(new Date(y, m - 1, e)), workdays: 0 });
    d = e + 1;
  }
  out.forEach((w) => (w.workdays = workdaysBetween(w.start, w.end)));
  for (let i = 0; i < out.length; i++) {
    if (out[i].workdays === 0 && out.length > 1) {
      if (i < out.length - 1) out[i + 1].start = out[i].start;
      else out[i - 1].end = out[i].end;
      out.splice(i, 1);
      i--;
    }
  }
  out.forEach((w, i) => {
    w.workdays = workdaysBetween(w.start, w.end);
    w.name = 'Week ' + (i + 1);
  });
  return out;
}
export function lastWorkdayOfMonth(d: Date) {
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  while (!isWorkday(n)) n.setDate(n.getDate() - 1);
  return ymd(n);
}
export { TIMEZONE };
