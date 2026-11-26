'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { moveTicketAction } from '@/app/actions';

/*
 * Lapisan drag & drop untuk Board. Markup board tetap dirender di server; komponen ini
 * hanya membaca atribut data:
 *   [data-tid]   kartu ticket yang bisa diseret (data-stage, data-pic)
 *   [data-drop]  area tujuan, berisi nomor tahap (data-pic untuk lajur PIC di tahap 5)
 * Aturan perpindahan dicek di server (moveOnBoard), pesan penolakan tampil sebagai toast.
 */
export default function BoardDnd({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<{ text: string; tone: 'crit' | 'good'; n: number } | null>(null);
  const count = useRef(0);
  const drag = useRef<{ id: string; stage: string; pic: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(h);
  }, [toast]);

  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return;

    const target = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>('[data-drop]');
    const clear = () => root.querySelectorAll('.drop-over').forEach((el) => el.classList.remove('drop-over'));

    const onStart = (e: DragEvent) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-tid]');
      if (!card) return;
      drag.current = { id: card.dataset.tid!, stage: card.dataset.stage!, pic: card.dataset.pic || '' };
      e.dataTransfer?.setData('text/plain', card.dataset.tid!);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    };
    const onEnd = (e: DragEvent) => {
      (e.target as HTMLElement).closest('[data-tid]')?.classList.remove('dragging');
      clear();
      drag.current = null;
    };
    // Auto-scroll board horizontal saat kartu diseret ke dekat atau melewati tepi kiri/kanan.
    // Dipasang di document supaya tetap jalan walau kursor sudah keluar dari area board.
    const onAutoScroll = (e: DragEvent) => {
      const board = root.querySelector<HTMLElement>('.board');
      if (!board || !drag.current) return;
      const r = board.getBoundingClientRect();
      const edge = 100;
      if (e.clientX > r.right - edge) board.scrollLeft += 20;
      else if (e.clientX < r.left + edge) board.scrollLeft -= 20;
    };
    const onOver = (e: DragEvent) => {
      const zone = target(e);
      if (!zone || !drag.current) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      if (!zone.classList.contains('drop-over')) {
        clear();
        zone.classList.add('drop-over');
      }
    };
    const onLeave = (e: DragEvent) => {
      const zone = target(e);
      if (zone && !zone.contains(e.relatedTarget as Node)) zone.classList.remove('drop-over');
    };
    const onDrop = (e: DragEvent) => {
      const zone = target(e);
      const d = drag.current;
      clear();
      if (!zone || !d) return;
      e.preventDefault();
      const stage = zone.dataset.drop!;
      const pic = zone.dataset.pic || '';
      if (stage === d.stage && pic === d.pic) return;
      start(async () => {
        const r = await moveTicketAction(Number(d.id), Number(stage), pic ? Number(pic) : null);
        count.current++;
        setToast(r.error ? { text: r.error, tone: 'crit', n: count.current } : { text: `Ticket #${d.id} dipindahkan.`, tone: 'good', n: count.current });
        router.refresh();
      });
    };

    document.addEventListener('dragover', onAutoScroll);
    root.addEventListener('dragstart', onStart);
    root.addEventListener('dragend', onEnd);
    root.addEventListener('dragover', onOver);
    root.addEventListener('dragleave', onLeave);
    root.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragover', onAutoScroll);
      root.removeEventListener('dragstart', onStart);
      root.removeEventListener('dragend', onEnd);
      root.removeEventListener('dragover', onOver);
      root.removeEventListener('dragleave', onLeave);
      root.removeEventListener('drop', onDrop);
    };
  }, [enabled, router]);

  return (
    <div ref={ref} className={pending ? 'board-busy' : undefined}>
      {children}
      {toast ? (
        <div key={toast.n} data-n={toast.n} className={`alert ${toast.tone} board-toast`} role="status">
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
