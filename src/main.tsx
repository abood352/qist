import './boot';
// One family, Tajawal 400/700: friendly, clear Arabic and Latin for a fintech product. Arabic + Latin subsets only.
import '@fontsource/tajawal/arabic-400.css';
import '@fontsource/tajawal/arabic-700.css';
import '@fontsource/tajawal/latin-400.css';
import '@fontsource/tajawal/latin-700.css';
import './styles/tokens.css';
import './styles/base.css';

import { USE_MOCK } from '@pf/core/env';
import { useMockServer } from '@pf/core/http';
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App, resolve } from './App';


async function start() {
  // The mock backend is its own chunk (preloaded in index.html, absent from real-API builds).
  // Its database seeds while the first page renders; early requests just wait for it.
  if (USE_MOCK) useMockServer(import('@backend').then((m) => m.createQistServer!()));
  // the first screen's chunk is loaded before the first render, so there is no fallback flash
  const path = location.hash.replace(/^#/, '').split('?')[0] || '/';
  await resolve(path).page.preload();
  const root = document.getElementById('root')!;
  const app = (
    <StrictMode>
      <App />
    </StrictMode>
  );
  // The prerendered Arabic home screen is reused (hydrated) when it matches what the client
  // would render; for other routes or English, theme.js hid it and it is replaced instead.
  if (root.firstElementChild && !document.documentElement.hasAttribute('data-noboot')) {
    document.documentElement.setAttribute('data-booted', '');
    hydrateRoot(root, app);
  } else {
    root.textContent = '';
    document.documentElement.removeAttribute('data-noboot');
    createRoot(root).render(app);
  }
}

start();
