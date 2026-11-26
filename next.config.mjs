/** @type {import('next').NextConfig} */
const allowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig = {
  serverExternalPackages: ['better-sqlite3', 'web-push'],
  // Pastikan data histori dan binary SQLite ikut ter-deploy (dibaca lewat path dinamis).
  outputFileTracingIncludes: {
    '/**': ['./seed/**', './node_modules/better-sqlite3/prebuilds/linux-x64.node'],
  },
  experimental: {
    serverActions: {
      // Nilai ini hanya terbaca saat build. Untuk runtime (Docker) lihat src/proxy.ts.
      allowedOrigins: allowed,
    },
  },
};

export default nextConfig;
