import { invalidate } from '@pf/core/react/query';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** A media query; false on the server so prerendered HTML is the mobile-first layout. */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (l) => {
      const m = matchMedia(query);
      m.addEventListener('change', l);
      return () => m.removeEventListener('change', l);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

/**
 * Autopay runs inside the list requests (GET /plans, GET /me/upcoming), so when a list load shows a different
 * "paid" signature, refresh what depends on it. Guarded by the last seen signature, so it never loops.
 */
export function useAutopaySync(sig: number | null) {
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (sig === null || sig === last.current) return;
    const first = last.current === null;
    last.current = sig;
    invalidate('limit');
    invalidate('quote');
    if (!first) invalidate('plan');
  }, [sig]);
}

export const useReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)');

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Counts from 0 up to `target` (ease-out). With reduced motion it jumps straight to the target. */
export function useCountUp(target: number, run = true, ms = 1400) {
  const reduced = useReducedMotion();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (reduced) return setV(target);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, reduced, ms]);
  return run ? v : 0;
}

/** true one frame after mount: lets CSS transitions (rings, bars) animate from their empty state */
export function useMountedFlag() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}

/** Runs `fn` once on the first render where `cond` is true (celebrations on `?new=1`). */
export function useOnce(cond: boolean, fn: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (cond && !done.current) {
      done.current = true;
      fn();
    }
  });
}

/** Arrow-key navigation for role="tablist" (ids must be `tab-<key>`); mirrors in RTL. */
export function tabKeyHandler<T extends string>(order: T[], cur: T, go: (k: T) => void, rtl: boolean) {
  return (e: KeyboardEvent | React.KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = order[(order.indexOf(cur) + (rtl ? -dir : dir) + order.length) % order.length];
    go(next);
    requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
  };
}
