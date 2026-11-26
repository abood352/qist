import { lazy, type ComponentType } from 'react';

/**
 * React.lazy that can be preloaded. Once preloaded, the lazy component resolves
 * synchronously (React reads a sync thenable), so the first render shows the real page
 * instead of a fallback that is then replaced — no layout jump, better LCP and CLS.
 */
const RELOAD_KEY = 'pf-chunk-reload';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(loader: () => Promise<{ default: T }>) {
  let mod: { default: T } | undefined;
  let pending: Promise<{ default: T }> | undefined;
  const preload = () =>
    (pending ??= loader()
      .then((m) => {
        try {
          sessionStorage.removeItem(RELOAD_KEY);
        } catch {
          /* ignore */
        }
        return (mod = m);
      })
      .catch((err) => {
        // a new deploy removed this chunk while the tab was open: reload once to get the new build
        let reloaded = false;
        try {
          reloaded = !!sessionStorage.getItem(RELOAD_KEY);
          if (!reloaded) sessionStorage.setItem(RELOAD_KEY, '1');
        } catch {
          reloaded = true;
        }
        if (!reloaded) location.reload();
        pending = undefined;
        throw err;
      }));
  const Component = lazy(() => (mod ? ({ then: (resolve: (m: { default: T }) => void) => resolve(mod!) } as unknown as Promise<{ default: T }>) : preload()));
  return Object.assign(Component, { preload });
}
