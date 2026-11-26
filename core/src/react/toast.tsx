import { useSyncExternalStore } from 'react';

/** Global toast queue. Rendering (and styling) is the app's job; this only holds state. */
export interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'err' | 'info';
  action?: { label: string; run: () => void };
}

const NONE: Toast[] = [];
let toasts: Toast[] = NONE;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let seq = 0;

export function toast(text: string, opts: { tone?: Toast['tone']; action?: Toast['action']; ms?: number } = {}) {
  const t: Toast = { id: ++seq, text, tone: opts.tone ?? 'ok', action: opts.action };
  toasts = [...toasts.slice(-2), t];
  emit();
  setTimeout(() => dismiss(t.id), opts.ms ?? (opts.action ? 6000 : 3200));
  return t.id;
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function useToasts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
    () => NONE,
  );
}
