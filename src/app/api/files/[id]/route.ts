import { NextRequest } from 'next/server';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { currentUser } from '@/lib/auth';
import { db, Row } from '@/lib/db';
import { canView, getTicket } from '@/lib/tickets';
import { kindOf, mimeOf, resolveStored } from '@/lib/files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Kirim file ke browser. Hanya untuk user yang boleh melihat ticket-nya. Mendukung Range supaya video bisa di-scrub. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response('Belum login', { status: 401 });
  const { id } = await ctx.params;
  const f = db().prepare('SELECT * FROM files WHERE id = ?').get(Number(id)) as Row | undefined;
  if (!f || !f.path) return new Response('Tidak ditemukan', { status: 404 });
  const t = getTicket(f.ticket_id);
  if (!t || !canView(u, t)) return new Response('Tidak ditemukan', { status: 404 });
  const abs = resolveStored(f.path);
  if (!abs || !fs.existsSync(abs)) return new Response('File tidak ada di penyimpanan', { status: 404 });

  const total = fs.statSync(abs).size;
  const inline = kindOf(f.name) !== 'file' && !req.nextUrl.searchParams.has('dl');
  const headers: Record<string, string> = {
    'Content-Type': inline ? mimeOf(f.name) : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=3600',
  };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2]));
    let end = m[1] && m[2] ? Number(m[2]) : total - 1;
    if (start >= total || end < start) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    }
    end = Math.min(end, total - 1);
    headers['Content-Range'] = `bytes ${start}-${end}/${total}`;
    headers['Content-Length'] = String(end - start + 1);
    return new Response(Readable.toWeb(fs.createReadStream(abs, { start, end })) as any, { status: 206, headers });
  }
  headers['Content-Length'] = String(total);
  return new Response(Readable.toWeb(fs.createReadStream(abs)) as any, { status: 200, headers });
}
