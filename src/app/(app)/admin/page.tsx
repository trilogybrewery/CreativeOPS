import { redirect } from 'next/navigation';
import { mergeProjectAction, resetPasswordAction, saveTypeAction, saveUserAction } from '../../actions';
import { requireUser } from '@/lib/auth';
import { db, Row } from '@/lib/db';
import { DIVISIONS, ROLES } from '@/lib/config';
import { projectNames } from '@/lib/tickets';
import { Topbar } from '@/components/ui';

export const metadata = { title: 'Admin' };

const ERR: Record<string, string> = {
  invalid: 'Data belum lengkap atau tidak valid. Username hanya huruf kecil, angka, titik, strip. Requester wajib punya divisi.',
  taken: 'Username itu sudah dipakai.',
  short: 'Password minimal 8 karakter.',
};

function UserFields({ x, f }: { x?: Row; f: string }) {
  return (
    <>
      <td><input form={f} className="field" style={{ minWidth: 120 }} name="name" defaultValue={x?.name || ''} placeholder="Nama" required aria-label="Nama" /></td>
      <td><input form={f} className="field" style={{ minWidth: 100 }} name="username" defaultValue={x?.username || ''} placeholder="username" required aria-label="Username" /></td>
      <td>
        <select form={f} className="field" style={{ minWidth: 150 }} name="role" defaultValue={x?.role || 'requester'} aria-label="Peran">
          {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </td>
      <td>
        <select form={f} className="field" style={{ minWidth: 150 }} name="division" defaultValue={x?.division || ''} aria-label="Divisi">
          <option value="">(bukan requester)</option>
          {DIVISIONS.map((d) => <option key={d}>{d}</option>)}
        </select>
      </td>
      <td><input form={f} className="field" style={{ minWidth: 140 }} name="job" defaultValue={x?.job || ''} placeholder="Jabatan / skill" aria-label="Jabatan" /></td>
      <td><label className="row small" style={{ flexWrap: 'nowrap' }}><input form={f} type="checkbox" name="producer" defaultChecked={!!x?.producer} /> PIC</label></td>
    </>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const u = await requireUser();
  if (u.role !== 'admin') redirect('/board');
  const sp = await searchParams;
  const users = db().prepare('SELECT * FROM users ORDER BY active DESC, id').all() as Row[];
  const types = db().prepare('SELECT * FROM production_types ORDER BY sort').all() as Row[];
  const names = projectNames();
  return (
    <>
      <Topbar title="Admin" desc="Kelola akun, production type, dan nama project." />
      <div className="content">
        {sp.ok ? <div className="alert good">Tersimpan.</div> : null}
        {sp.e && ERR[sp.e] ? <div className="alert crit">{ERR[sp.e]}</div> : null}
        <section className="panel">
          <div className="panel-h"><h3>Akun</h3><span className="small muted">Akun baru dan hasil reset wajib ganti password saat login pertama.</span></div>
          <div className="tw">
            <table>
              <thead><tr><th>Nama</th><th>Username</th><th>Peran</th><th>Divisi</th><th>Jabatan</th><th>PIC</th><th>Aktif</th><th></th><th>Reset password</th></tr></thead>
              <tbody>
                {users.map((x) => (
                  <tr key={x.id}>
                    <UserFields x={x} f={`u${x.id}`} />
                    <td><label className="row small" style={{ flexWrap: 'nowrap' }}><input form={`u${x.id}`} type="checkbox" name="active" defaultChecked={!!x.active} /> aktif</label></td>
                    <td>
                      <form id={`u${x.id}`} action={saveUserAction}>
                        <input type="hidden" name="uid" value={x.id} />
                        <button className="btn sm">Simpan</button>
                      </form>
                    </td>
                    <td>
                      <form action={resetPasswordAction} className="row" style={{ flexWrap: 'nowrap' }}>
                        <input type="hidden" name="uid" value={x.id} />
                        <input className="field" style={{ width: 150 }} name="password" type="text" minLength={8} placeholder="password sementara" aria-label={`Password sementara untuk ${x.name}`} required />
                        <button className="btn sm">Reset</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Tambah akun</h3>
          <div className="tw"><table><tbody><tr>
            <UserFields f="unew" />
            <td><input form="unew" className="field" style={{ width: 160 }} name="password" type="text" minLength={8} placeholder="password awal" aria-label="Password awal" required /></td>
            <td><form id="unew" action={saveUserAction}><button className="btn pri sm">Tambah</button></form></td>
          </tr></tbody></table></div>
        </section>
        <section className="panel">
          <div className="panel-h"><h3>Production type</h3><span className="small muted">Durasi dalam jam. Dipakai untuk estimasi, workload, dan SLA produksi.</span></div>
          <div className="tw">
            <table>
              <thead><tr><th>Nama</th><th>Track</th><th>Durasi per unit (jam)</th><th>Revisi per round (jam)</th><th></th></tr></thead>
              <tbody>
                {types.map((x, i) => (
                  <tr key={x.name}>
                    <td><b>{x.name}</b></td>
                    <td><select form={`t${i}`} className="field" name="track" defaultValue={x.track} aria-label="Track"><option>Production</option><option>Craft</option></select></td>
                    <td><input form={`t${i}`} className="field num" name="base" type="number" step="0.01" min="0.01" defaultValue={Math.round(x.base_hours * 100) / 100} aria-label="Durasi" /></td>
                    <td><input form={`t${i}`} className="field num" name="rev" type="number" step="0.01" min="0" defaultValue={x.rev_hours} aria-label="Revisi" /></td>
                    <td><form id={`t${i}`} action={saveTypeAction}><input type="hidden" name="name" value={x.name} /><button className="btn sm">Simpan</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Tambah production type</h3>
          <form action={saveTypeAction} className="row">
            <input className="field" style={{ width: 220 }} name="name" placeholder="Nama, mis. Motion Easy" required aria-label="Nama type" />
            <select className="field" style={{ width: 'auto' }} name="track" aria-label="Track"><option>Production</option><option>Craft</option></select>
            <input className="field num" style={{ width: 150 }} name="base" type="number" step="0.01" min="0.01" placeholder="jam per unit" required aria-label="Jam per unit" />
            <input className="field num" style={{ width: 170 }} name="rev" type="number" step="0.01" min="0" placeholder="jam revisi per round" required aria-label="Jam revisi" />
            <button className="btn pri sm">Tambah</button>
          </form>
        </section>
        <section className="panel">
          <div className="panel-h"><h3>Gabungkan nama project</h3><span className="small muted">Karena nama project diketik bebas, ejaan yang dobel bisa disatukan di sini.</span></div>
          <form action={mergeProjectAction} className="row">
            <select className="field" style={{ width: 'auto' }} name="from" required aria-label="Nama yang dihapus">{names.map((n) => <option key={n}>{n}</option>)}</select>
            <span className="muted">digabung ke</span>
            <select className="field" style={{ width: 'auto' }} name="to" required aria-label="Nama yang dipertahankan">{names.map((n) => <option key={n}>{n}</option>)}</select>
            <button className="btn sm">Gabungkan</button>
          </form>
        </section>
      </div>
    </>
  );
}
