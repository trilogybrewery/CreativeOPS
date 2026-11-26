'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type Item = { href: string; label: string; group?: string };

export default function NavLinks({ items, unread }: { items: Item[]; unread: number }) {
  const path = usePathname();
  const [count, setCount] = useState(unread);
  useEffect(() => setCount(unread), [unread]);
  // Angka lonceng disegarkan tiap 45 detik tanpa perlu reload halaman.
  useEffect(() => {
    const id = setInterval(() => {
      fetch('/api/notifications')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j && setCount(j.unread))
        .catch(() => {});
    }, 45000);
    return () => clearInterval(id);
  }, []);
  let lastGroup = '';
  return (
    <nav className="nav" aria-label="Menu utama">
      {items.map((it) => {
        const head = it.group && it.group !== lastGroup ? <div className="nav-label" key={'g' + it.group}>{it.group}</div> : null;
        if (it.group) lastGroup = it.group;
        const active = path === it.href || (it.href !== '/' && path.startsWith(it.href + '/'));
        return [
          head,
          <Link key={it.href} href={it.href} aria-current={active ? 'page' : undefined}>
            <span>{it.label}</span>
            {it.href === '/notifications' && count > 0 ? <span className="badge">{count > 99 ? '99+' : count}</span> : null}
          </Link>,
        ];
      })}
    </nav>
  );
}
