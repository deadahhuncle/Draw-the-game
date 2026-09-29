import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const PUBLIC = path.resolve(__dirname, 'public');

function listFiles(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

/**
 * Emits `sw.js` for the multi-file build: a cache-first, offline-capable service worker that
 * precaches every emitted asset plus the public files. The cache name is a hash of the asset list,
 * so each deploy swaps caches cleanly. (Registered from src/ui/pwa.ts in production only.)
 */
function serviceWorker(): Plugin {
  return {
    name: 'inklight-service-worker',
    apply: 'build',
    generateBundle(_opts, bundle) {
      // Non-Latin font subsets are only fetched by browsers that need them; cache those lazily.
      const lazy = /(cyrillic|vietnamese|greek)|\.woff$/;
      const files = [...Object.keys(bundle), ...listFiles(PUBLIC)].filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !lazy.test(f)).sort();
      const version = createHash('sha1').update(files.join('\n')).digest('hex').slice(0, 10);
      const assets = ['./', './index.html', ...files.filter((f) => f !== 'index.html').map((f) => `./${f}`)];
      const source = `// Inklight service worker — generated at build time. Cache-first, works offline.
const CACHE = 'inklight-${version}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('inklight-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const nav = req.mode === 'navigate';
  e.respondWith(
    caches.match(nav ? './index.html' : req, { ignoreSearch: nav }).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res.ok && res.type === 'basic') {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => (nav ? caches.match('./index.html') : Response.error())),
    ),
  );
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

/**
 * The single-file build has no neighbouring files: drop the manifest link and inline the icons as
 * data URIs so the one HTML file is self-contained.
 */
function singleFileHead(): Plugin {
  const dataUri = (file: string, mime: string) => `data:${mime};base64,${fs.readFileSync(path.join(PUBLIC, file)).toString('base64')}`;
  return {
    name: 'inklight-single-head',
    apply: 'build',
    transformIndexHtml(html) {
      return html
        .replace(/\s*<link rel="manifest"[^>]*>/, '')
        .replace('/icons/icon.svg', dataUri('icons/icon.svg', 'image/svg+xml'))
        .replace(/\s*<link rel="icon" href="\/icons\/favicon-32.png"[^>]*>/, '')
        .replace('/icons/apple-touch-icon.png', dataUri('icons/apple-touch-icon.png', 'image/png'));
    },
  };
}

// `vite build` → multi-file PWA build in dist/ (for static hosting, with an offline service worker).
// `vite build --mode single` → one self-contained HTML file in dist-single/.
export default defineConfig(({ mode }) => ({
  base: './',
  publicDir: mode === 'single' ? false : 'public',
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2020',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
    cssCodeSplit: mode !== 'single',
    reportCompressedSize: false,
  },
  plugins: mode === 'single' ? [singleFileHead(), viteSingleFile()] : [serviceWorker()],
  server: { host: true },
}));
