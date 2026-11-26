// Injects the prerendered first screen into the built index.html (see src/entry-server.tsx).
import { readFile, rm, writeFile } from 'node:fs/promises';

const ssrDir = new URL('../.ssr/', import.meta.url);
const target = new URL('../dist/index.html', import.meta.url);
const { render } = await import(new URL('entry-server.js', ssrDir).href);
const app = await render('/');
const html = await readFile(target, 'utf8');
if (!html.includes('<div id="root"></div>')) throw new Error('root container not found in index.html');
await writeFile(target, html.replace('<div id="root"></div>', `<div id="root">${app}</div>`));
await rm(ssrDir, { recursive: true, force: true });
console.log(`prerendered first screen: ${(app.length / 1024).toFixed(1)} KB of HTML`);
