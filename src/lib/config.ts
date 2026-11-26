// Semua aturan main ada di file ini. Ubah di sini, seluruh aplikasi ikut.

// Zona waktu kantor. SLA dan jam kerja dihitung di zona ini.
process.env.TZ = process.env.TZ || 'Asia/Jakarta';
export const TIMEZONE = process.env.TZ;

export const STAGES = [
  'Request',
  'Alignment',
  'Creative Brief',
  'Production Setup',
  'Production',
  'QC & Revision',
  'Final Approval',
  'Output & Publish',
] as const;

// Warna status per tahap (dipakai di header kolom Board dan label tahap).
export const STAGE_COLORS = ['#6b7280', '#8b5cf6', '#3b82f6', '#0ea5e9', '#f59e0b', '#ec4899', '#14b8a6', '#22c55e'];

// Siapa pemegang tiap tahap (yang punya tombol untuk meneruskan ticket).
export const STAGE_OWNER_LABEL = [
  'CD',
  'CD',
  'CD',
  'AD',
  'PIC',
  'AD',
  'CD + Brand',
  'Brand',
];

// Jam kerja: Senin–Jumat 10.00–19.00.
export const WORK = { startHour: 10, endHour: 19, days: [1, 2, 3, 4, 5] };

// Ideal jam produksi per orang per hari kerja: 8 jam x 90%.
export const IDEAL_HOURS_PER_DAY = 8 * 0.9;

// SLA mingguan. dow: 1 = Senin ... 5 = Jumat.
export const SLA = {
  request: { dow: 4, hour: 15, minute: 0 }, // Request paling lambat Kamis 15.00
  alignment: { dow: 5, hour: 11, minute: 0 }, // Alignment Jumat 11.00
  brief: { dow: 5, hour: 16, minute: 0 }, // Creative Brief Jumat 16.00
  setup: { dow: 5, hour: 17, minute: 0 }, // Production Setup Jumat 17.00
  qcWorkHours: 2, // QC maksimal 2 jam kerja sejak submit
  approvalWorkHours: 9, // Final Approval maksimal 1 hari kerja (9 jam kerja)
  // Kalau ticket masuk sebuah tahap padahal jadwal bakunya sudah lewat
  // (ticket urgent, atau ticket yang dikembalikan), tahap itu diberi waktu segini.
  lateStageWorkHours: 4,
};

export const ISSUES: Record<string, { label: string; back: number; hint: string }> = {
  brand: { label: 'Brand issue', back: 3, hint: 'Message, promo, produk, atau arah campaign berubah. Balik ke Creative Brief.' },
  creative: { label: 'Creative issue', back: 5, hint: 'Visual, storytelling, atau tone tidak sesuai brief. Balik ke PIC.' },
  alignment: { label: 'Brand alignment issue', back: 5, hint: 'Hasil tidak sesuai guideline atau karakter brand. Balik ke PIC.' },
  technical: { label: 'Technical issue', back: 5, hint: 'Typo, crop, resolusi, audio. Balik ke PIC.' },
};

export const RETURN_REASONS = ['Brief belum lengkap', 'Deadline tidak realistis', 'Objective / prioritas belum jelas'];

export const DIVISIONS = ['Brand', 'Sales', 'Digital Marketing'];

export const ROLES: Record<string, string> = {
  admin: 'Admin',
  cd: 'Creative Director',
  ad: 'Art Director',
  production: 'Tim Produksi',
  requester: 'Requester',
  viewer: 'Viewer (hanya lihat)',
};

export const PRIORITIES = ['P1', 'P2', 'P3'];

// Batas status beban kerja (jam terpakai dibanding ideal).
export function loadStatus(ratio: number): { label: string; tone: 'info' | 'good' | 'warn' | 'crit' } {
  if (ratio < 0.8) return { label: 'Low Load', tone: 'info' };
  if (ratio <= 1.1) return { label: 'Healthy', tone: 'good' };
  if (ratio <= 1.3) return { label: 'High Load', tone: 'warn' };
  return { label: 'Overload Risk', tone: 'crit' };
}

export const APP_NAME = 'Creative Ops';
