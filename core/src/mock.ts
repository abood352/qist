import { decodeToken, type Claims } from './auth';
import { ApiError, type Method, type Page, type Query, type RequestOptions } from './http';

/**
 * An in-browser stand-in for the backend. Routes are declared exactly as the real API
 * (`'GET /products/:slug'`), so docs/api-contract.md can be written straight from them.
 * Each response is delayed like a real network call and can be made to fail on purpose
 * from the dev panel, so loading, error and retry states are always reachable.
 */
export interface MockRequest<B = any> {
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  body: B;
  user: Claims | null;
}

export type Handler = (req: MockRequest) => unknown | Promise<unknown>;

export interface MockSettings {
  /** median latency in ms; each call jitters ±40% */
  latency: number;
  /** 0..1 probability that any call fails with a simulated 503 */
  failRate: number;
}

const SETTINGS_KEY = 'pf-mock-settings';
const defaults: MockSettings = { latency: 420, failRate: 0 };

export function readMockSettings(): MockSettings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}
export function writeMockSettings(s: Partial<MockSettings>) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readMockSettings(), ...s }));
  } catch {
    /* ignore */
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

interface Route {
  method: Method;
  parts: string[];
  handler: Handler;
  auth?: readonly string[] | true;
}

export interface MockServer {
  handle<T>(method: Method, path: string, opts: RequestOptions, token: string | null): Promise<T>;
}

/** Route options: `auth: true` needs any signed-in user, `auth: ['admin']` needs that role. */
export function createMockServer(defs: Record<string, Handler | readonly [Handler, { auth: true | readonly string[] }]>): MockServer {
  const routes: Route[] = Object.entries(defs).map(([key, def]) => {
    const [method, pattern] = key.split(' ') as [Method, string];
    const [handler, opts] = Array.isArray(def) ? def : [def, undefined];
    return { method, parts: pattern.split('/').filter(Boolean), handler, auth: opts?.auth };
  });

  const match = (method: Method, path: string) => {
    const parts = path.split('/').filter(Boolean);
    for (const r of routes) {
      if (r.method !== method || r.parts.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < parts.length; i++) {
        if (r.parts[i].startsWith(':')) params[r.parts[i].slice(1)] = decodeURIComponent(parts[i]);
        else if (r.parts[i] !== parts[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { route: r, params };
    }
    return null;
  };

  return {
    async handle<T>(method: Method, path: string, opts: RequestOptions, token: string | null) {
      const { latency, failRate } = readMockSettings();
      await sleep(latency * (0.6 + Math.random() * 0.8), opts.signal);
      if (failRate > 0 && Math.random() < failRate) {
        throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Simulated network failure (dev panel)');
      }
      const found = match(method, path);
      if (!found) throw new ApiError(404, 'ROUTE_NOT_FOUND', `${method} ${path} is not part of the API`);
      const user = decodeToken(token);
      const { auth } = found.route;
      if (auth && !user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required');
      if (Array.isArray(auth) && user && !auth.includes(user.role)) throw new ApiError(403, 'FORBIDDEN', 'Not allowed for this role');
      const query: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries((opts.query ?? {}) as Query)) {
        if (v === undefined || v === null || v === '') continue;
        query[k] = Array.isArray(v) ? v.map(String) : String(v);
      }
      // structuredClone: callers must never hold references into the mock database
      const result = await found.route.handler({ params: found.params, query, body: structuredClone(opts.body), user });
      return (result === undefined ? null : structuredClone(result)) as T;
    },
  };
}

/* ───────── helpers for handlers ───────── */

export const fail = (status: number, code: string, message: string, details?: Record<string, string>): never => {
  throw new ApiError(status, code, message, details);
};

export function paginate<T>(items: T[], query: Record<string, string | string[]>, defaultLimit = 12): Page<T> {
  const limit = Math.min(100, Math.max(1, Number(query.limit) || defaultLimit));
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(pages, Math.max(1, Number(query.page) || 1));
  return { items: items.slice((page - 1) * limit, page * limit), page, limit, total, pages };
}

export const q1 = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
export const qAll = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : v.split(','));
