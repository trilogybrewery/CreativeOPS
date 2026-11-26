import { STAGES, STAGE_COLORS } from '@/lib/config';

const AV = ['#4f46e5', '#0ea5e9', '#16a34a', '#d97706', '#db2777', '#7c3aed', '#0d9488', '#dc2626'];

export function n1(x: number) {
  return (Math.round((Number(x) || 0) * 10) / 10).toLocaleString('id-ID');
}
export function Pill({ tone = '', children }: { tone?: string; children: React.ReactNode }) {
  return (
    <span className={`pill ${tone}`}>
      <i />
      {children}
    </span>
  );
}
export function Avatar({ name, lg }: { name?: string | null; lg?: boolean }) {
  const n = (name || '?').trim();
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  const initials = n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className={`avatar${lg ? ' lg' : ''}`} style={{ background: name ? AV[h % AV.length] : '#9ca3af' }} title={name || 'Belum ada PIC'}>
      {name ? initials : '–'}
    </span>
  );
}
export function StageTag({ stage, done }: { stage: number; done?: number | boolean }) {
  if (done) return <span className="stage" style={{ background: '#16a34a' }}>Selesai</span>;
  return (
    <span className="stage" style={{ background: STAGE_COLORS[stage - 1] }}>
      {stage}. {STAGES[stage - 1]}
    </span>
  );
}
export function Tile({ label, value, sub, hl }: { label: string; value: React.ReactNode; sub?: string; hl?: boolean }) {
  return (
    <div className={`tile${hl ? ' hl' : ''}`}>
      <span className="l">{label}</span>
      <span className="v num">{value}</span>
      {sub ? <span className="s">{sub}</span> : null}
    </div>
  );
}
export function Topbar({ title, desc, children }: { title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="topbar">
      <div>
        <h1>{title}</h1>
        {desc ? <p>{desc}</p> : null}
      </div>
      <div className="row">{children}</div>
    </div>
  );
}
