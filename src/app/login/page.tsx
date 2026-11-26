import { redirect } from 'next/navigation';
import { loginAction, switchUserAction } from '../actions';
import { currentUser, LOGIN_REQUIRED } from '@/lib/auth';
import { APP_NAME, ROLES } from '@/lib/config';
import { db, Row } from '@/lib/db';

export const metadata = { title: 'Masuk' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (!LOGIN_REQUIRED) return <PickUser />;
  if (await currentUser()) redirect('/board');
  const { e } = await searchParams;
  return (
    <main className="login">
      <form className="panel" action={loginAction}>
        <div className="ws" style={{ padding: 0 }}>
          <div className="ws-logo">CO</div>
          <div>
            <b>{APP_NAME}</b>
            <span>Trilogy Artisan</span>
          </div>
        </div>
        {e === 'wrong' ? <div className="alert crit">Username atau password salah.</div> : null}
        {e === 'locked' ? <div className="alert crit">Terlalu banyak percobaan. Coba lagi 10 menit lagi.</div> : null}
        <label className="f">
          Username
          <input className="field" name="username" autoComplete="username" autoCapitalize="none" required autoFocus />
        </label>
        <label className="f">
          Password
          <input className="field" name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="btn pri block">Masuk</button>
      </form>
    </main>
  );
}

/* Mode tanpa login: pilih akun untuk mencoba alur tiap peran. */
async function PickUser() {
  const me = await currentUser();
  const users = db().prepare('SELECT username, name, role FROM users WHERE active = 1 ORDER BY id').all() as Row[];
  return (
    <main className="login">
      <div className="panel">
        <div className="ws" style={{ padding: 0 }}>
          <div className="ws-logo">CO</div>
          <div>
            <b>{APP_NAME}</b>
            <span>Trilogy Artisan</span>
          </div>
        </div>
        <p className="muted">Mode tanpa login. Pilih akun untuk masuk.</p>
        {users.map((u) => (
          <form key={u.username} action={switchUserAction}>
            <input type="hidden" name="username" value={u.username} />
            <button className={'btn block' + (me?.username === u.username ? ' pri' : '')}>
              {u.name} · {ROLES[u.role] ?? u.role}
            </button>
          </form>
        ))}
      </div>
    </main>
  );
}
