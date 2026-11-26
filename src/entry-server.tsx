import { renderToString } from 'react-dom/server';
import { App, resolve } from './App';

/**
 * Build-time prerender of the first screen (scripts/prerender.mjs). The HTML is what a
 * first-time visitor sees before any data arrives — header, hero and skeletons — so the
 * browser paints real content immediately and the client render replaces it in place.
 */
export async function render(path = '/') {
  await resolve(path).page.preload();
  return renderToString(<App />);
}
