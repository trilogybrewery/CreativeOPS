import Link from 'next/link';
import { changePasswordAction, logoutAction } from '../actions';
import { requireUser } from '@/lib/auth';
import { db, Row } from '@/lib/db';
import { canCreate, seesReports } from '@/lib/tickets';
import { APP_NAME, ROLES } from '@/lib/config';
import NavLinks from '@/components/NavLinks';
import { Avatar } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();

  // Login pertama: wajib ganti password awal sebelum bisa memakai aplikasi.
  if (u.must_change) {
    return (
      <main className="login">
        <form className="panel" action={changePasswordAction}>
          <h1>Ganti password dulu</h1>
          <p className="muted">Halo {u.name}. Password awal harus diganti sebelum lanjut. Minimal 8 karakter dan berbeda dari password awal.</p>
          <label className="f">
            Password awal
            <input className="field" type="password" name="current" autoComplete="current-password" required />
          </label>
          <label className="f">
            Password baru
            <input className="field" type="password" name="next" autoComplete="new-password" minLength={8} required />
          </label>
          <button className="btn pri block">Simpan password</button>
        </form>
      </main>
    );
  }

  const unread = (db().prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(u.id) as Row).n;
  const items = [
    { href: '/board', label: 'Board', group: 'Kerja' },
    { href: '/tracker', label: 'Tracker', group: 'Kerja' },
    ...(seesReports(u)
      ? [
          { href: '/dashboard', label: 'Dashboard', group: 'Report' },
          { href: '/weekly', label: 'Weekly AD', group: 'Report' },
          { href: '/monthly', label: 'Monthly CD', group: 'Report' },
        ]
      : []),
    { href: '/notifications', label: 'Notifikasi', group: 'Lainnya' },
    ...(u.role === 'admin' ? [{ href: '/admin', label: 'Admin', group: 'Lainnya' }] : []),
    { href: '/account', label: 'Akun & push notif', group: 'Lainnya' },
  ];
  return (
    <div className="shell">
      <aside className="side">
        <div className="ws">
          <div className="ws-logo">CO</div>
          <div>
            <b>{APP_NAME}</b>
            <span>Trilogy Artisan</span>
          </div>
        </div>
        {canCreate(u) ? (
          <Link className="btn pri block" href="/tickets/new">
            + Ticket baru
          </Link>
        ) : null}
        <NavLinks items={items} unread={unread} />
        <div className="me">
          <Avatar name={u.name} lg />
          <div className="grow">
            <b>{u.name}</b>
            <span>{ROLES[u.role]}{u.division ? ` · ${u.division}` : ''}</span>
          </div>
          <form action={logoutAction}>
            <button className="btn sm" title="Keluar">Keluar</button>
          </form>
        </div>
      </aside>
      <div className="main">{children}</div>
    </div>
  );
}
