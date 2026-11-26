import { db, Row } from './db';
import { IDEAL_HOURS_PER_DAY, ISSUES, STAGES, loadStatus } from './config';
import { hoursOf, typesMap } from './tickets';
import { today, weeksOf, Week } from './time';

export function availableMonths(): string[] {
  const rows = db().prepare("SELECT DISTINCT substr(deadline, 1, 7) AS m FROM tickets WHERE deadline <> '' ORDER BY m").all() as Row[];
  const out = rows.map((r) => r.m);
  const cur = today().slice(0, 7);
  if (!out.includes(cur)) out.push(cur);
  return out.sort();
}
export function pickMonth(q?: string) {
  const months = availableMonths();
  return q && months.includes(q) ? q : today().slice(0, 7);
}

function monthTickets(ym: string): Row[] {
  return db()
    .prepare(`SELECT t.*, p.name AS pic_name FROM tickets t LEFT JOIN users p ON p.id = t.pic_id WHERE substr(t.deadline, 1, 7) = ?`)
    .all(ym) as Row[];
}
function agg(list: Row[]) {
  let planned = 0;
  let actual = 0;
  for (const t of list) {
    planned += Number(t.qty) || 0;
    actual += Number(t.actual_qty) || 0;
  }
  return { intake: list.length, planned, actual, ach: planned ? Math.min(1, actual / planned) : 0 };
}
const isLate = (t: Row) => !t.done && t.deadline && t.deadline < today();

export type WeekRow = Week & { intake: number; planned: number; actual: number; ach: number; hours: number; ideal: number; current: boolean };
export type PersonRow = { name: string; perWeek: number[]; total: number; ideal: number; ratio: number; status: ReturnType<typeof loadStatus> };

export function weeklyReport(ym: string) {
  const types = typesMap();
  const list = monthTickets(ym);
  const weeks = weeksOf(ym);
  const team = db().prepare('SELECT id, name FROM users WHERE producer = 1 AND active = 1 ORDER BY id').all() as Row[];
  const per: Record<string, number[]> = {};
  team.forEach((m) => (per[m.name] = weeks.map(() => 0)));
  const now = today();
  const weekRows: WeekRow[] = weeks.map((w, i) => {
    const l = list.filter((t) => t.deadline >= w.start && t.deadline <= w.end);
    let hours = 0;
    for (const t of l) {
      const h = hoursOf(t, types);
      hours += h;
      if (t.pic_name) {
        if (!per[t.pic_name]) per[t.pic_name] = weeks.map(() => 0);
        per[t.pic_name][i] += h;
      }
    }
    return { ...w, ...agg(l), hours, ideal: IDEAL_HOURS_PER_DAY * w.workdays * team.length, current: now >= w.start && now <= w.end };
  });
  const totalWd = weeks.reduce((s, w) => s + w.workdays, 0);
  const idealPerson = IDEAL_HOURS_PER_DAY * totalWd;
  const people: PersonRow[] = Object.keys(per).map((name) => {
    const total = per[name].reduce((s, x) => s + x, 0);
    const ratio = idealPerson ? total / idealPerson : 0;
    return { name, perWeek: per[name], total, ideal: idealPerson, ratio, status: loadStatus(ratio) };
  });
  const carry = list.filter((t) => !t.done).sort((a, b) => (a.deadline < b.deadline ? -1 : 1));
  return { total: agg(list), weekRows, people, carry, teamSize: team.length, workdays: totalWd };
}

export function dashboard(ym: string) {
  const w = weeklyReport(ym);
  const open = db().prepare(`SELECT t.*, p.name AS pic_name FROM tickets t LEFT JOIN users p ON p.id = t.pic_id WHERE t.done = 0`).all() as Row[];
  const late = open.filter(isLate).sort((a, b) => (a.deadline < b.deadline ? -1 : 1));
  const pipeline = STAGES.map((name, i) => ({ name, n: open.filter((t) => t.stage === i + 1).length }));
  const doneCount = (db().prepare('SELECT COUNT(*) AS n FROM tickets WHERE done = 1').get() as Row).n;
  const nowIso = new Date().toISOString();
  const slaLate = open.filter((t) => t.stage_due && t.stage_due < nowIso).length;
  return { ...w, open: open.length, late, pipeline, doneCount, slaLate };
}

export function monthlyReport(ym: string) {
  const d = db();
  const list = monthTickets(ym);
  const byProject = new Map<string, Row[]>();
  for (const t of list) {
    const k = t.project || '';
    if (!byProject.has(k)) byProject.set(k, []);
    byProject.get(k)!.push(t);
  }
  const projects = [...byProject.entries()]
    .map(([name, l]) => ({
      name,
      total: l.length,
      done: l.filter((t) => t.done).length,
      late: l.filter(isLate).length,
      revisions: l.reduce((s, t) => s + (t.rev_count || 0), 0),
    }))
    .sort((a, b) => (a.name === '' ? 1 : b.name === '' ? -1 : b.total - a.total));
  const named = projects.filter((p) => p.name);

  // Direction: creative brief (tahap 3) yang diteruskan di bulan ini, dan berapa yang tepat waktu.
  const briefs = d.prepare("SELECT due_at, left_at FROM stage_log WHERE stage = 3 AND forward = 1 AND substr(left_at, 1, 7) = ?").all(ym) as Row[];
  const briefsOnTime = briefs.filter((b) => !b.due_at || b.left_at <= b.due_at).length;

  // First-pass approval: ticket yang lolos QC di bulan ini tanpa pernah direvisi.
  const passed = d
    .prepare(`SELECT DISTINCT s.ticket_id, t.rev_count FROM stage_log s JOIN tickets t ON t.id = s.ticket_id
              WHERE s.stage = 7 AND s.forward = 1 AND substr(s.left_at, 1, 7) = ?`)
    .all(ym) as Row[];
  const firstPass = passed.filter((p) => !p.rev_count).length;

  // QC tepat waktu (2 jam kerja).
  const qc = d.prepare("SELECT due_at, left_at FROM stage_log WHERE stage = 6 AND left_at IS NOT NULL AND substr(left_at, 1, 7) = ?").all(ym) as Row[];
  const qcOnTime = qc.filter((q) => !q.due_at || q.left_at <= q.due_at).length;

  const issues = Object.keys(ISSUES).map((k) => ({
    key: k,
    label: ISSUES[k].label,
    n: (d.prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'revision' AND issue = ? AND substr(at, 1, 7) = ?").get(k, ym) as Row).n,
  }));
  const returned = (d.prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'return' AND substr(at, 1, 7) = ?").get(ym) as Row).n;
  const urgent = d
    .prepare("SELECT division, urgent, COUNT(*) AS n FROM tickets WHERE urgent <> '' AND substr(created_at, 1, 7) = ? GROUP BY division, urgent")
    .all(ym) as Row[];
  const notes: Record<string, string> = {};
  for (const r of d.prepare('SELECT k, v FROM notes WHERE period = ?').all(ym) as Row[]) notes[r.k] = r.v;

  return {
    intake: list.length,
    projects,
    projectCount: named.length,
    noProject: byProject.get('')?.length || 0,
    atRisk: named.filter((p) => p.late > 0).length,
    briefs: briefs.length,
    briefsOnTime,
    passed: passed.length,
    firstPass,
    qc: qc.length,
    qcOnTime,
    issues,
    returned,
    urgent,
    notes,
  };
}
