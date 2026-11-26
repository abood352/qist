import { useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

/**
 * Hash router (≈1 KB): every screen is a real URL like `#/shop?cat=pottery`, so back/forward,
 * deep links and new tabs work on any static host with no server rewrite rules.
 * Navigations run inside a View Transition when the browser supports it.
 */
export interface Location {
  path: string;
  query: URLSearchParams;
}

const listeners = new Set<() => void>();
let snapshot: { hash: string; loc: Location } | null = null;

const SERVER: Location = { path: '/', query: new URLSearchParams() };

function read(): Location {
  // build-time prerender has no location: render the home route
  if (typeof location === 'undefined') return SERVER;
  const hash = location.hash;
  if (snapshot?.hash === hash) return snapshot.loc;
  const raw = hash.replace(/^#/, '') || '/';
  const [path, search = ''] = raw.split('?');
  const loc = { path: path.startsWith('/') ? path : '/' + path, query: new URLSearchParams(search) };
  snapshot = { hash, loc };
  return loc;
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => listeners.forEach((l) => l()));
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

type VTDoc = Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };

export function navigate(to: string, opts: { replace?: boolean; transition?: boolean; keepScroll?: boolean } = {}) {
  const target = '#' + (to.startsWith('/') ? to : '/' + to);
  if (target === location.hash) return;
  const go = () => {
    if (opts.replace) history.replaceState(null, '', target);
    else history.pushState(null, '', target);
    listeners.forEach((l) => l());
    if (!opts.keepScroll) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };
  const doc = document as VTDoc;
  if (opts.transition !== false && doc.startViewTransition && !reduced()) {
    const vt = doc.startViewTransition(go);
    // a newer navigation skips this one; that rejection is expected, not an error
    vt.ready.catch(() => {});
    vt.finished.catch(() => {});
  } else go();
}

/** Update query params in place (filters, pagination) without a page transition. */
export function setQuery(patch: Record<string, string | number | null | undefined>, opts: { replace?: boolean } = { replace: true }) {
  const { path, query } = read();
  const next = new URLSearchParams(query);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === '') next.delete(k);
    else next.set(k, String(v));
  }
  const s = next.toString();
  navigate(path + (s ? '?' + s : ''), { replace: opts.replace, transition: false, keepScroll: true });
}

export function useLocation() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      window.addEventListener('popstate', l);
      return () => {
        listeners.delete(l);
        window.removeEventListener('popstate', l);
      };
    },
    read,
    read,
  );
}

/** `/p/:slug` against `/p/clay-vase` → { slug: 'clay-vase' } */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean);
  const b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={'#' + to} onClick={handle} {...rest} />;
}

/** Sets document.title and moves focus to the page heading for screen readers. */
export function usePageMeta(title: string, appName: string) {
  useEffect(() => {
    document.title = title ? `${title} — ${appName}` : appName;
  }, [title, appName]);
}
