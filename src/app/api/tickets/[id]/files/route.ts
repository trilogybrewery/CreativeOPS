import { NextRequest } from 'next/server';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { afterFaUpload, canUpload, canView, getTicket } from '@/lib/tickets';
import { CATEGORY_DIR, mimeOf, newFilePath } from '@/lib/files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  let host = '';
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const own = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0].trim();
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return host === own || extra.includes(host);
}

/** Upload satu file. Isi file dikirim mentah di body dan langsung dialirkan ke disk, jadi file besar tidak memenuhi memori. */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return Response.json({ error: 'Origin tidak dikenal.' }, { status: 403 });
  const u = await currentUser();
  if (!u) return Response.json({ error: 'Sesi habis. Login lagi.' }, { status: 401 });
  const { id } = await ctx.params;
  const t = getTicket(Number(id));
  if (!t || !canView(u, t)) return Response.json({ error: 'Ticket tidak ditemukan.' }, { status: 404 });
  const category = req.nextUrl.searchParams.get('category') || '';
  const name = req.nextUrl.searchParams.get('name') || 'file';
  if (!CATEGORY_DIR[category] || !canUpload(u, t, category)) {
    return Response.json({ error: 'Kamu tidak bisa upload di bagian ini pada tahap sekarang.' }, { status: 403 });
  }
  const maxMb = Number(process.env.MAX_UPLOAD_MB) || 5120;
  const max = maxMb * 1048576;
  if (Number(req.headers.get('content-length') || 0) > max) {
    return Response.json({ error: `File lebih besar dari batas ${maxMb} MB.` }, { status: 413 });
  }
  if (!req.body) return Response.json({ error: 'File kosong.' }, { status: 400 });

  const { abs, rel } = newFilePath(t, category, name);
  let size = 0;
  try {
    const src = Readable.fromWeb(req.body as any);
    src.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) src.destroy(new Error('too-big'));
    });
    await pipeline(src, fs.createWriteStream(abs));
  } catch (e: any) {
    fs.rmSync(abs, { force: true });
    const tooBig = e && e.message === 'too-big';
    return Response.json({ error: tooBig ? `File lebih besar dari batas ${maxMb} MB.` : 'Upload terputus. Coba lagi.' }, { status: tooBig ? 413 : 500 });
  }
  if (!size) {
    fs.rmSync(abs, { force: true });
    return Response.json({ error: 'File kosong.' }, { status: 400 });
  }
  db()
    .prepare('INSERT INTO files(ticket_id, category, name, path, size, mime, round, user_id, at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(t.id, category, rel.split(/[\\/]/).pop(), rel, size, mimeOf(name), (t.rev_count || 0) + 1, u.id, new Date().toISOString());
  if (category === 'fa') afterFaUpload(t, u);
  return Response.json({ ok: true });
}
