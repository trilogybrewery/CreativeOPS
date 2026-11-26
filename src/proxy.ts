import { NextRequest, NextResponse } from 'next/server';

/*
 * Next.js menolak Server Action (termasuk form login) kalau header Origin tidak sama
 * dengan Host. Di belakang reverse proxy / tunnel, Host yang sampai ke aplikasi sering
 * berupa localhost:3000 atau IP NAS, sehingga login gagal tanpa pesan.
 *
 * `serverActions.allowedOrigins` di next.config hanya dibaca saat build, padahal di
 * Docker ALLOWED_ORIGINS dan APP_URL baru diisi saat container jalan. Di sini daftar itu
 * dibaca saat runtime: kalau Origin request ada di daftar, header x-forwarded-host
 * diselaraskan supaya pengecekan Next.js lolos. Origin lain tetap ditolak seperti biasa.
 */
function allowedHosts() {
  const list = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => s.replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
  try {
    if (process.env.APP_URL) list.push(new URL(process.env.APP_URL).host.toLowerCase());
  } catch {}
  return new Set(list);
}

export function proxy(req: NextRequest) {
  if (req.method !== 'POST' || !req.headers.get('next-action')) return NextResponse.next();
  const origin = req.headers.get('origin');
  if (!origin) return NextResponse.next();
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return NextResponse.next();
  }
  if (!allowedHosts().has(originHost)) return NextResponse.next();
  const headers = new Headers(req.headers);
  headers.set('x-forwarded-host', originHost);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
