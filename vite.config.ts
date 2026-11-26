import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Preloads what the first screen needs but Vite can't see statically: the two font files it
 * paints with (Arabic display + body), the lazily imported chunks it always requests, and those
 * chunks' stylesheets — the prerendered HTML must not paint before its CSS (that was a layout shift).
 */
function preloadFirstScreen(patterns: RegExp[], chunks: RegExp[]): Plugin {
  return {
    name: 'preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle ?? {};
        const fonts = Object.keys(bundle).filter((f) => f.endsWith('.woff2') && patterns.some((p) => p.test(f)));
        const js = Object.values(bundle).filter((c) => c.type === 'chunk' && !!c.facadeModuleId && chunks.some((p) => p.test(c.facadeModuleId!.replace(/\\/g, '/'))));
        // CSS of the first-screen chunks and of the shared chunks they import
        const css = new Set<string>();
        const seen = new Set<string>();
        const walk = (name: string) => {
          const c = bundle[name];
          if (!c || c.type !== 'chunk' || seen.has(name)) return;
          seen.add(name);
          c.viteMetadata?.importedCss.forEach((f) => css.add(f));
          c.imports.forEach(walk);
        };
        js.forEach((c) => walk(c.fileName));
        return [
          // small chunk stylesheets are inlined: one less render-blocking request on slow networks
          ...[...css]
            .filter((f) => !html.includes(f))
            .map((f) => {
              const a = bundle[f];
              const src = a && a.type === 'asset' ? String(a.source) : '';
              return src && src.length < 12_000
                ? { tag: 'style', children: src, injectTo: 'head' as const }
                : { tag: 'link', attrs: { rel: 'stylesheet', crossorigin: '', href: `/projects/qist/${f}` }, injectTo: 'head' as const };
            }),
          ...fonts.map((f) => ({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: `/projects/qist/${f}` }, injectTo: 'head' as const })),
          ...js.map((c) => ({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: '', href: `/projects/qist/${c.fileName}` }, injectTo: 'head' as const })),
        ];
      },
    },
  };
}

/**
 * Qist is served from https://abdulhadi.review/projects/qist/ as a static build.
 * Routing is hash-based (#/doctors, #/doctor/<slug>) so the host needs no rewrite rules.
 * `@backend` resolves to the in-browser mock server, or to an empty module when
 * VITE_USE_MOCK=false — so a real-API build ships none of the mock code or seed data.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here('.'), '');
  const mock = env.VITE_USE_MOCK !== 'false';
  return {
    base: '/projects/qist/',
    plugins: [react(), preloadFirstScreen([/tajawal-arabic-400-normal/], [/src\/mock\/server\.ts$/, /src\/pages\/Home\.tsx$/])],
    resolve: { alias: { '@backend': here(mock ? './src/mock/server.ts' : './src/mock/none.ts') } },
    esbuild: { legalComments: 'none' },
    server: { port: 5189, strictPort: true },
    preview: { port: 4179 },
    build: {
      target: 'es2022',
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      cssCodeSplit: true,
    },
  };
});
