'use client';

import { usePathname, useRouter } from 'next/navigation';

export default function MonthSelect({ months, value }: { months: { value: string; label: string }[]; value: string }) {
  const router = useRouter();
  const path = usePathname();
  return (
    <label className="row small muted">
      Periode
      <select className="field" style={{ width: 'auto' }} value={value} onChange={(e) => router.push(`${path}?m=${e.target.value}`)}>
        {months.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}
