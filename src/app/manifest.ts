import type { MetadataRoute } from 'next';
import { APP_NAME } from '@/lib/config';

// Membuat web ini bisa dipasang ke layar HP ("Add to Home Screen") dan tampil seperti aplikasi.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} Trilogy`,
    short_name: APP_NAME,
    description: 'Workflow, ticket, dan report tim creative.',
    start_url: '/board',
    display: 'standalone',
    background_color: '#f6f7f9',
    theme_color: '#1f2328',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
