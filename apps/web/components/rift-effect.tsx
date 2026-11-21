'use client';
import { useEffect, useRef } from 'react';
import { usePreferences } from '../lib/state';
export function RiftEffect() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePreferences((s) => s.reduced);
  useEffect(() => {
    if (reduced || window.matchMedia('(prefers-reduced-motion: reduce), (pointer: coarse)').matches)
      return;
    const hero = ref.current?.closest('.hero');
    if (!hero) return;
    const move = (event: Event) => {
      const e = event as PointerEvent;
      const bounds = hero.getBoundingClientRect();
      if (ref.current)
        ref.current.style.transform = `translate3d(${e.clientX - bounds.left - 200}px,${e.clientY - bounds.top - 200}px,0)`;
    };
    hero.addEventListener('pointermove', move);
    return () => hero.removeEventListener('pointermove', move);
  }, [reduced]);
  return <div ref={ref} className="cursor-halo" aria-hidden="true" />;
}
