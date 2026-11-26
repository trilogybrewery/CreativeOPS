'use client';

import { useEffect } from 'react';

/** Daftarkan service worker (dipakai untuk push notif dan supaya web bisa dipasang ke layar HP). */
export default function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
