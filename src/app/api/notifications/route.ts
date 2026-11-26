import { currentUser } from '@/lib/auth';
import { db, Row } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const u = await currentUser();
  if (!u) return Response.json({ unread: 0 }, { status: 401 });
  const r = db().prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(u.id) as Row;
  return Response.json({ unread: r.n });
}
