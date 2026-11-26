import { NextRequest } from 'next/server';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { vapidKeys } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const u = await currentUser();
  if (!u) return Response.json({}, { status: 401 });
  return Response.json({ publicKey: vapidKeys().publicKey });
}

/** Simpan langganan push dari browser / HP user ini. */
export async function POST(req: NextRequest) {
  const u = await currentUser();
  if (!u) return Response.json({}, { status: 401 });
  const body = await req.json().catch(() => null);
  const sub = body && body.subscription;
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys) {
    return Response.json({ error: 'Langganan tidak valid.' }, { status: 400 });
  }
  db()
    .prepare('INSERT INTO push_subs(endpoint, user_id, data, at) VALUES (?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, data = excluded.data')
    .run(sub.endpoint, u.id, JSON.stringify(sub), new Date().toISOString());
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const u = await currentUser();
  if (!u) return Response.json({}, { status: 401 });
  const body = await req.json().catch(() => null);
  if (body && typeof body.endpoint === 'string') {
    db().prepare('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?').run(body.endpoint, u.id);
  }
  return Response.json({ ok: true });
}
