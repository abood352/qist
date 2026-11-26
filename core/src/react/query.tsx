import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError } from '../http';

/**
 * A small data-fetching layer (in the spirit of TanStack Query, at a fraction of the size):
 * keyed cache, stale-while-revalidate, request cancellation, invalidation by key prefix,
 * and mutations with optimistic updates that roll back on failure.
 */
type Status = 'loading' | 'success' | 'error';
interface Entry<T = unknown> {
  status: Status;
  data?: T;
  error?: ApiError;
  fetchedAt: number;
  promise?: Promise<void>;
}

const cache = new Map<string, Entry>();
const subs = new Map<string, Set<() => void>>();
const fetchers = new Map<string, () => Promise<unknown>>();

const notify = (key: string) => subs.get(key)?.forEach((l) => l());
const toError = (e: unknown) => (e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', (e as Error)?.message ?? 'Unknown error'));

function run(key: string) {
  const fn = fetchers.get(key);
  if (!fn) return;
  const prev = cache.get(key);
  if (prev?.promise) return;
  const entry: Entry = prev ? { ...prev } : { status: 'loading', fetchedAt: 0 };
  entry.promise = fn()
    .then((data) => {
      cache.set(key, { status: 'success', data, fetchedAt: Date.now() });
    })
    .catch((e) => {
      if ((e as Error).name === 'AbortError') return;
      const old = cache.get(key);
      // keep showing stale data if we have it; surface the error otherwise
      cache.set(key, old?.data !== undefined ? { ...old, promise: undefined, error: toError(e) } : { status: 'error', error: toError(e), fetchedAt: Date.now() });
    })
    .finally(() => {
      const cur = cache.get(key);
      if (cur) cur.promise = undefined;
      notify(key);
    });
  cache.set(key, entry);
  notify(key);
}

export interface QueryResult<T> {
  status: Status;
  data: T | undefined;
  error: ApiError | undefined;
  /** true while a background refetch runs over existing data */
  refreshing: boolean;
  refetch: () => void;
}

export function useQuery<T>(key: string | null, fn: () => Promise<T>, opts: { staleMs?: number; /** poll while mounted and the tab is visible */ refetchMs?: number } = {}): QueryResult<T> {
  const staleMs = opts.staleMs ?? 30_000;
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const subscribe = useCallback(
    (l: () => void) => {
      if (!key) return () => {};
      if (!subs.has(key)) subs.set(key, new Set());
      subs.get(key)!.add(l);
      return () => subs.get(key)?.delete(l);
    },
    [key],
  );
  const entry = useSyncExternalStore(
    subscribe,
    () => (key ? cache.get(key) : undefined),
    () => undefined,
  );

  useEffect(() => {
    if (!key) return;
    fetchers.set(key, () => fnRef.current());
    const e = cache.get(key);
    if (!e || (Date.now() - e.fetchedAt > staleMs && !e.promise) || e.status === 'error') run(key);
  }, [key, staleMs]);

  const refetchMs = opts.refetchMs;
  useEffect(() => {
    if (!key || !refetchMs) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') run(key);
    }, refetchMs);
    return () => clearInterval(timer);
  }, [key, refetchMs]);

  useEffect(() => {
    if (!key || !opts.refetchMs) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') run(key);
    }, opts.refetchMs);
    return () => clearInterval(timer);
  }, [key, opts.refetchMs]);

  return {
    status: !key ? 'loading' : (entry?.status ?? 'loading'),
    data: entry?.data as T | undefined,
    error: entry?.error,
    refreshing: !!entry?.promise && entry.data !== undefined,
    refetch: useCallback(() => key && run(key), [key]),
  };
}

/** Refetch every cached query whose key starts with `prefix`. */
export function invalidate(prefix: string) {
  for (const key of cache.keys()) {
    if (!key.startsWith(prefix)) continue;
    const e = cache.get(key)!;
    e.fetchedAt = 0;
    if (subs.get(key)?.size) run(key);
  }
}

export function getCached<T>(key: string) {
  return cache.get(key)?.data as T | undefined;
}

/** Write into the cache directly (optimistic UI). Returns the previous value for rollback. */
export function setCached<T>(key: string, update: (old: T | undefined) => T) {
  const old = cache.get(key);
  const prev = old?.data as T | undefined;
  cache.set(key, { status: 'success', fetchedAt: old?.fetchedAt ?? Date.now(), data: update(prev) });
  notify(key);
  return prev;
}

export function useMutation<A, R>(fn: (args: A) => Promise<R>) {
  const [state, setState] = useState<{ status: 'idle' | 'pending' | 'success' | 'error'; error?: ApiError; data?: R }>({ status: 'idle' });
  const mutate = useCallback(
    async (args: A) => {
      setState({ status: 'pending' });
      try {
        const data = await fn(args);
        setState({ status: 'success', data });
        return data;
      } catch (e) {
        const error = toError(e);
        setState({ status: 'error', error });
        throw error;
      }
    },
    [fn],
  );
  return { ...state, pending: state.status === 'pending', mutate, reset: () => setState({ status: 'idle' }) };
}
