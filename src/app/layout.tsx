import './globals.css';
import type { Metadata, Viewport } from 'next';
import SwRegister from '@/components/SwRegister';
import { APP_NAME } from '@/lib/config';

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: 'Workflow, ticket, dan report tim creative Trilogy Artisan.',
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1f2328' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
