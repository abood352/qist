import { decodeToken, tokenStore } from '@pf/core/auth';
import { useSyncExternalStore } from 'react';
import { api } from '../api/services';
import type { User } from '../api/types';

const USER_KEY = 'qist-user';
let user: User | null = (() => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw && decodeToken(tokenStore.get()) ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
})();
const listeners = new Set<() => void>();

function setUser(next: User | null) {
  user = next;
  try {
    if (next) localStorage.setItem(USER_KEY, JSON.stringify(next));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

tokenStore.subscribe((t) => {
  if (!t && user) setUser(null);
});

/** Phone + one-time code sign-in (the norm for Saudi booking apps). */
export const session = {
  requestOtp: (phone: string) => api.auth.requestOtp(phone),
  async verify(requestId: string, code: string, name?: string) {
    const res = await api.auth.verify(requestId, code, name);
    tokenStore.set(res.token);
    setUser(res.user);
    return res.user;
  },
  async logout() {
    await api.auth.logout().catch(() => null);
    tokenStore.set(null);
    setUser(null);
  },
  async refresh() {
    if (!tokenStore.get()) return;
    try {
      setUser(await api.auth.me());
    } catch {
      tokenStore.set(null);
      setUser(null);
    }
  },
  get user() {
    return user;
  },
};

export function useUser() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => user,
    () => null,
  );
}
