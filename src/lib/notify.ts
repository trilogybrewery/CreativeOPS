import webpush from 'web-push';
import { db, getSetting, setSetting, Row } from './db';
import { APP_NAME } from './config';

export function vapidKeys() {
  let pub = getSetting('vapid_public');
  let priv = getSetting('vapid_private');
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    pub = k.publicKey;
    priv = k.privateKey;
    setSetting('vapid_public', pub);
    setSetting('vapid_private', priv);
  }
  return { publicKey: pub, privateKey: priv };
}

function pushTo(userId: number, text: string, ticketId?: number | null) {
  const subs = db().prepare('SELECT endpoint, data FROM push_subs WHERE user_id = ?').all(userId) as Row[];
  if (!subs.length) return;
  const keys = vapidKeys();
  const subject = process.env.VAPID_SUBJECT || process.env.APP_URL || 'mailto:admin@localhost.localdomain';
  const payload = JSON.stringify({ title: APP_NAME, body: text, url: ticketId ? `/tickets/${ticketId}` : '/notifications' });
  for (const s of subs) {
    webpush
      .sendNotification(JSON.parse(s.data), payload, { vapidDetails: { subject, ...keys }, TTL: 3600 })
      .catch((e: any) => {
        // Langganan sudah mati (izin dicabut / aplikasi dihapus): buang.
        if (e && (e.statusCode === 404 || e.statusCode === 410)) {
          db().prepare('DELETE FROM push_subs WHERE endpoint = ?').run(s.endpoint);
        }
      });
  }
}

/**
 * Kirim notifikasi ke daftar user: masuk ke lonceng di aplikasi dan, kalau user
 * sudah mengizinkan, jadi push notif. `dedupe` mencegah pesan terjadwal terkirim dua kali.
 */
export function notify(userIds: (number | null | undefined)[], text: string, ticketId?: number | null, dedupe?: string | null) {
  const ids = Array.from(new Set(userIds.filter((x): x is number => !!x)));
  const ins = db().prepare('INSERT OR IGNORE INTO notifications(user_id, ticket_id, text, at, dedupe) VALUES (?,?,?,?,?)');
  const at = new Date().toISOString();
  for (const id of ids) {
    const r = ins.run(id, ticketId ?? null, text, at, dedupe ?? null);
    if (r.changes) pushTo(id, text, ticketId);
  }
}
