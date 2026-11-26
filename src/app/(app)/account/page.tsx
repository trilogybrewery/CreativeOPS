import { changePasswordAction } from '../../actions';
import { requireUser } from '@/lib/auth';
import { ROLES } from '@/lib/config';
import { Topbar } from '@/components/ui';
import PushToggle from '@/components/PushToggle';

export const metadata = { title: 'Akun' };

const ERR: Record<string, string> = {
  wrong: 'Password sekarang salah.',
  short: 'Password baru minimal 8 karakter.',
  same: 'Password baru harus berbeda dari yang sekarang.',
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  return (
    <>
      <Topbar title="Akun & push notif" desc={`${u.name} · ${ROLES[u.role]}${u.division ? ` · ${u.division}` : ''} · username ${u.username}`} />
      <div className="content">
        <section className="panel" style={{ maxWidth: 620 }}>
          <h3>Push notif di perangkat ini</h3>
          <p className="muted">Nyalakan di tiap perangkat yang kamu pakai (laptop dan HP). Di HP, tambahkan dulu web ini ke layar utama lewat menu browser "Add to Home Screen", lalu buka dari ikonnya dan nyalakan di sini.</p>
          <PushToggle />
        </section>
        <section className="panel" style={{ maxWidth: 620 }}>
          <h3>Ganti password</h3>
          {sp.ok ? <div className="alert good">Password berhasil diganti.</div> : null}
          {sp.e && ERR[sp.e] ? <div className="alert crit">{ERR[sp.e]}</div> : null}
          <form action={changePasswordAction} className="form">
            <label className="f">Password sekarang<input className="field" type="password" name="current" autoComplete="current-password" required /></label>
            <label className="f">Password baru<input className="field" type="password" name="next" autoComplete="new-password" minLength={8} required /></label>
            <div className="full"><button className="btn pri">Simpan password</button></div>
          </form>
        </section>
      </div>
    </>
  );
}
