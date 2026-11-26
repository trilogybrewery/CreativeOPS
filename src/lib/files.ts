import fs from 'node:fs';
import path from 'node:path';
import { FILES_DIR, Row } from './db';

// Nama folder per kategori, supaya enak dibuka langsung dari File Manager NAS.
export const CATEGORY_DIR: Record<string, string> = {
  reference: '1-referensi',
  preview: '2-preview',
  fa: '3-final-artwork',
};
export const CATEGORY_LABEL: Record<string, string> = {
  reference: 'Referensi',
  preview: 'Preview hasil',
  fa: 'File FA (final artwork)',
};

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'ticket'
  );
}
export function safeName(name: string) {
  const base = path.basename(String(name || 'file')).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_').trim();
  return (base || 'file').slice(0, 180);
}

/** Folder sebuah ticket: files/<tahun>/<id>-<judul>/. Dipakai ulang kalau sudah ada. */
export function ticketDir(t: Row): string {
  const year = String(t.created_at || new Date().toISOString()).slice(0, 4);
  const yearDir = path.join(/*turbopackIgnore: true*/ FILES_DIR, year);
  fs.mkdirSync(yearDir, { recursive: true });
  const prefix = `${String(t.id).padStart(5, '0')}-`;
  const existing = fs.readdirSync(yearDir).find((d) => d.startsWith(prefix));
  const dir = path.join(/*turbopackIgnore: true*/ yearDir, existing || prefix + slug(t.title));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Jalur file baru yang belum dipakai, relatif terhadap FILES_DIR. */
export function newFilePath(t: Row, category: string, name: string): { abs: string; rel: string } {
  const dir = path.join(/*turbopackIgnore: true*/ ticketDir(t), CATEGORY_DIR[category]);
  fs.mkdirSync(dir, { recursive: true });
  const clean = safeName(name);
  const ext = path.extname(clean);
  const stem = clean.slice(0, clean.length - ext.length);
  let candidate = clean;
  for (let i = 2; fs.existsSync(path.join(/*turbopackIgnore: true*/ dir, candidate)); i++) candidate = `${stem} (${i})${ext}`;
  const abs = path.join(/*turbopackIgnore: true*/ dir, candidate);
  return { abs, rel: path.relative(FILES_DIR, abs) };
}

/** Ubah jalur relatif dari database jadi jalur absolut, dan pastikan tetap di dalam FILES_DIR. */
export function resolveStored(rel: string): string | null {
  const abs = path.resolve(/*turbopackIgnore: true*/ FILES_DIR, rel);
  if (!abs.startsWith(path.resolve(/*turbopackIgnore: true*/ FILES_DIR) + path.sep)) return null;
  return abs;
}

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v',
  pdf: 'application/pdf',
};
export function mimeOf(name: string) {
  const ext = path.extname(name).slice(1).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}
export function kindOf(name: string): 'image' | 'video' | 'pdf' | 'file' {
  const m = mimeOf(name);
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m === 'application/pdf') return 'pdf';
  return 'file';
}
export function fmtSize(n: number) {
  if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GB';
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  return Math.max(1, Math.round(n / 1024)) + ' KB';
}
