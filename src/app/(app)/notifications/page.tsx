import Link from 'next/link';
import { markAllReadAction } from '../../actions';
import { requireUser } from '@/lib/auth';
import { db, Row } from '@/lib/db';
import { fmtDateTime } from '@/lib/time';
import { Topbar } from '@/components/ui';

export const metadata = { title: 'Notifikasi' };

export default async function NotificationsPage() {
  const u = await requireUser();
  const list = db().prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 150').all(u.id) as Row[];
  const unread = list.filter((n) => !n.read_at).length;
  return (
    <>
      <Topbar title="Notifikasi" desc="Semua reminder untuk kamu. Yang sama juga dikirim sebagai push notif kalau sudah dinyalakan di menu Akun.">
        {unread ? <form action={markAllReadAction}><button className="btn">Tandai semua sudah dibaca ({unread})</button></form> : null}
      </Topbar>
      <div className="content">
        <section className="panel">
          {list.length ? (
            <ul className="plain">
              {list.map((n) => (
                <li key={n.id}>
                  <span style={{ fontWeight: n.read_at ? 400 : 650 }}>
                    {n.ticket_id ? <Link className="link" href={`/tickets/${n.ticket_id}`}>{n.text}</Link> : n.text}
                    <br /><span className="small muted" style={{ fontWeight: 400 }}>{fmtDateTime(n.at)}</span>
                  </span>
                  {!n.read_at ? <span className="pill info"><i />baru</span> : null}
                </li>
              ))}
            </ul>
          ) : <div className="empty">Belum ada notifikasi.</div>}
        </section>
      </div>
    </>
  );
}
