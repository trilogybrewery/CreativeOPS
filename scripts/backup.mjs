// Backup manual: `npm run backup`. Aman dijalankan saat aplikasi sedang hidup.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const src = path.join(dataDir, 'creative-ops.db');
if (!fs.existsSync(src)) {
  console.error('Database tidak ditemukan di', src);
  process.exit(1);
}
const dir = path.join(dataDir, 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const out = path.join(dir, `creative-ops-manual-${stamp}.db`);
const db = new Database(src, { readonly: true });
await db.backup(out);
db.close();
console.log('Backup tersimpan di', out);
