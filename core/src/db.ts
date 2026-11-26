/**
 * The mock database: one JSON document per app in localStorage, seeded on first visit
 * and re-seeded when the seed version changes. Writes are synchronous and durable,
 * so a refresh shows exactly what the "server" stored.
 */
export interface MockDb<T> {
  data: T;
  /** mutate then persist (other tabs' writes arrive via the storage event before the next commit) */
  commit(fn: (data: T) => void): void;
  reset(): void;
  /** called when another tab changed the database — e.g. to refetch every query */
  onExternalChange(fn: () => void): () => void;
}

export function createDb<T>(key: string, version: number, seed: () => T): MockDb<T> {
  const storageKey = `pf-db:${key}`;
  let data: T;
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? (JSON.parse(raw) as { v: number; data: T }) : null;
    data = parsed && parsed.v === version ? parsed.data : seed();
  } catch {
    data = seed();
  }
  const persist = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ v: version, data }));
    } catch {
      /* quota or private mode: keep working in memory */
    }
  };
  persist();

  // Cross-tab "realtime": the storage event fires in every other tab of the same origin,
  // which is how a restaurant screen in one tab sees an order placed in another.
  const external = new Set<() => void>();
  const reload = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as { v: number; data: T }) : null;
      if (parsed && parsed.v === version) data = parsed.data;
    } catch {
      /* keep memory copy */
    }
  };
  if (typeof window !== 'undefined')
    window.addEventListener('storage', (e) => {
      if (e.key !== storageKey) return;
      reload();
      external.forEach((fn) => fn());
    });

  return {
    get data() {
      return data;
    },
    commit(fn) {
      fn(data);
      persist();
    },
    onExternalChange(fn) {
      external.add(fn);
      return () => void external.delete(fn);
    },
    reset() {
      data = seed();
      persist();
    },
  };
}

export const newId = (prefix = '') => prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

/** Deterministic PRNG so seeded data is the same for every visitor. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
