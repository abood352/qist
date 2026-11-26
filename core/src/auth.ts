/**
 * Token storage shared by the HTTP client and the mock server.
 * The real backend issues a JWT; the mock issues a look-alike (`mock.<base64 payload>.sig`)
 * so the frontend code path — store token, send Bearer header, decode claims — is identical.
 */
export interface Claims {
  sub: string;
  role: string;
  name: string;
  exp: number;
}

type Listener = (token: string | null) => void;

export function createTokenStore(key: string) {
  const listeners = new Set<Listener>();
  let memory: string | null = null;
  const read = () => {
    try {
      return localStorage.getItem(key);
    } catch {
      return memory;
    }
  };
  return {
    get: read,
    set(token: string | null) {
      memory = token;
      try {
        if (token) localStorage.setItem(key, token);
        else localStorage.removeItem(key);
      } catch {
        /* private mode: token lives in memory for this tab */
      }
      listeners.forEach((l) => l(token));
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}

let current = createTokenStore('pf-token');
export const tokenStore = {
  get: () => current.get(),
  set: (t: string | null) => current.set(t),
  subscribe: (l: Listener) => current.subscribe(l),
};

/** Each app keeps its own session (different localStorage key). Call once before rendering. */
export function configureTokenKey(key: string) {
  current = createTokenStore(key);
}

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

export function signMockToken(claims: Omit<Claims, 'exp'>, ttlHours = 24 * 7) {
  const payload: Claims = { ...claims, exp: Math.floor(Date.now() / 1000) + ttlHours * 3600 };
  return `mock.${b64(JSON.stringify(payload))}.sig`;
}

export function decodeToken(token: string | null): Claims | null {
  if (!token) return null;
  try {
    const claims = JSON.parse(unb64(token.split('.')[1])) as Claims;
    return claims.exp * 1000 > Date.now() ? claims : null;
  } catch {
    return null;
  }
}
