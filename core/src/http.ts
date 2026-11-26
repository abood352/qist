import { API_URL, USE_MOCK } from './env';
import type { MockServer } from './mock';
import { tokenStore } from './auth';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Query = Record<string, string | number | boolean | undefined | null | (string | number)[]>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
}

/** Every failure, mock or real, arrives as this shape (see docs/api-contract.md → Errors). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string>,
  ) {
    super(message);
  }
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export function toSearch(query?: Query) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)));
    else params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

let mockServer: Promise<MockServer> | null = null;

/**
 * Apps register their mock routes once at startup (a promise is fine: the first screen can
 * render while the mock database seeds; requests simply wait for it). Ignored when VITE_USE_MOCK=false.
 */
export function useMockServer(server: MockServer | Promise<MockServer>) {
  mockServer = Promise.resolve(server);
}

async function viaFetch<T>(method: Method, path: string, opts: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(API_URL + path + toSearch(opts.query), {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK', 'Network unreachable');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: Record<string, string> } } | null)?.error;
    if (res.status === 401) tokenStore.set(null);
    throw new ApiError(res.status, err?.code ?? 'HTTP_' + res.status, err?.message ?? res.statusText, err?.details);
  }
  return data as T;
}

export function request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
  if (USE_MOCK) {
    if (!mockServer) throw new Error('Mock server not registered — call useMockServer() in main.tsx');
    return mockServer.then((server) => server.handle<T>(method, path, opts, tokenStore.get()));
  }
  return viaFetch<T>(method, path, opts);
}

export const http = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  del: <T>(path: string) => request<T>('DELETE', path, {}),
};
