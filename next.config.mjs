/** @type {import('next').NextConfig} */
const allowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig = {
  serverExternalPackages: ['better-sqlite3', 'web-push'],
  experimental: {
    serverActions: {
      // Nilai ini hanya terbaca saat build. Untuk runtime (Docker) lihat src/proxy.ts.
      allowedOrigins: allowed,
    },
  },
};

export default nextConfig;
