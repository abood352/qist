/**
 * The one switch between the simulated backend and a real one.
 *
 *   VITE_USE_MOCK=true   (default) every request is answered in the browser by the mock server
 *   VITE_USE_MOCK=false  every request goes to VITE_API_URL over fetch
 *
 * Nothing else in an app needs to change: pages call the service layer, the service layer calls `http`.
 */
const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;

export const USE_MOCK = env.VITE_USE_MOCK !== 'false';
export const API_URL = (env.VITE_API_URL ?? '/api').replace(/\/$/, '');
