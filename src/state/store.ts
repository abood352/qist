import { useSyncExternalStore } from 'react';

/**
 * A tiny persisted store (localStorage) with a constant server snapshot, so prerendered
 * HTML hydrates cleanly. Other tabs' writes are adopted through the storage event.
 */
export function persisted<T extends object>(key: string, initial: T) {
  let state: T = initial;
  try {
    const raw = localStorage.getItem(key);
    if (raw) state = { ...initial, ...JSON.parse(raw) };
  } catch {
    /* private mode / prerender */
  }
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  if (typeof window !== 'undefined')
    window.addEventListener('storage', (e) => {
      if (e.key !== key || !e.newValue) return;
      try {
        state = { ...initial, ...JSON.parse(e.newValue) };
        emit();
      } catch {
        /* ignore */
      }
    });
  return {
    get: () => state,
    set(patch: Partial<T>, persist = true) {
      state = { ...state, ...patch };
      if (persist)
        try {
          localStorage.setItem(key, JSON.stringify(state));
        } catch {
          /* ignore */
        }
      emit();
    },
    use(): T {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useSyncExternalStore(
        (l) => {
          listeners.add(l);
          return () => listeners.delete(l);
        },
        () => state,
        () => initial,
      );
    },
  };
}
