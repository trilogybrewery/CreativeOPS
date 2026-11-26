import { redirect } from 'next/navigation';
import { loginAction } from '../actions';
import { currentUser } from '@/lib/auth';
import { APP_NAME } from '@/lib/config';

export const metadata = { title: 'Masuk' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
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
