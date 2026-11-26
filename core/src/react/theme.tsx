import { useCallback, useSyncExternalStore } from 'react';

/**
 * Light/dark theme on <html data-theme>. Each app ships a tiny public/theme.js that sets the
 * attribute before first paint (the site CSP forbids inline scripts), using the same key.
 */
export type Theme = 'light' | 'dark';

const listeners = new Set<() => void>();
const current = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

export function useTheme(storageKey: string, themeColor?: Record<Theme, string>) {
  const theme = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    current,
    () => 'light' as Theme,
  );
  const setTheme = useCallback(
    (next: Theme) => {
      const apply = () => {
        document.documentElement.dataset.theme = next;
        if (themeColor) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor[next]);
        listeners.forEach((l) => l());
      };
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* ignore */
      }
      // a soft cross-fade where the browser supports view transitions
      const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
      if (doc.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(apply);
      else apply();
    },
    [storageKey, themeColor],
  );
  return { theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}
