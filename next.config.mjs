/** @type {import('next').NextConfig} */
const allowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig = {
  serverExternalPackages: ['better-sqlite3', 'web-push'],
  experimental: {
    serverActions: {
      // Isi ALLOWED_ORIGINS kalau aplikasi dibuka lewat reverse proxy / subdomain.
      allowedOrigins: allowed,
    },
  },
};

export default nextConfig;
