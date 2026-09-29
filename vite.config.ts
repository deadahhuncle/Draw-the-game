import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build` → multi-file PWA build in dist/ (for static hosting).
// `vite build --mode single` → one self-contained HTML file in dist-single/.
export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2020',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
    cssCodeSplit: mode !== 'single',
    reportCompressedSize: false,
  },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  server: { host: true },
}));
