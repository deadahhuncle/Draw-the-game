// Screenshot harness. Serves the built game (or a running dev server) and captures phone-sized shots.
// Usage:
//   node scripts/shoot.mjs [--base=http://localhost:5173] [--out=shots] [--w=844 --h=390 --dpr=3] "name|?level=1-1&solve&go|wait_ms|actions" ...
// Actions (optional, comma-separated): draw:x1:y1:x2:y2 (world coords, via page.mouse), click:selector, wait:ms, shot:name
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=').slice(1).join('=');
const out = opt('out', 'shots');
const W = +opt('w', 844);
const H = +opt('h', 390);
const DPR = +opt('dpr', 3);
const specs = args.filter((a) => !a.startsWith('--'));
fs.mkdirSync(out, { recursive: true });

let server = null;
let base = opt('base', '');
if (!base) {
  server = await createServer({ server: { port: 5199, strictPort: false, host: '127.0.0.1' }, logLevel: 'error' });
  await server.listen();
  base = server.resolvedUrls.local[0].replace(/\/$/, '');
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
const errors = [];
for (const spec of specs.length ? specs : ['title|/|1500']) {
  const [name, url, wait = '1500', actions = ''] = spec.split('|');
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: console: ${m.text()}`));
  await page.goto(base + (url.startsWith('/') ? url : '/' + url));
  await page.waitForTimeout(+wait);
  for (const act of actions.split(',').filter(Boolean)) {
    const [kind, ...rest] = act.split(':');
    if (kind === 'wait') await page.waitForTimeout(+rest[0]);
    else if (kind === 'click') await page.click(rest.join(':'));
    else if (kind === 'shot') await page.screenshot({ path: path.join(out, `${rest[0]}.png`) });
    else if (kind === 'draw') {
      const [x1, y1, x2, y2] = rest.map(Number);
      const toScreen = await page.evaluate(() => {
        const s = getComputedStyle(document.getElementById('app'));
        return { x: parseFloat(s.getPropertyValue('--lvl-x')), y: parseFloat(s.getPropertyValue('--lvl-y')), w: parseFloat(s.getPropertyValue('--lvl-w')) };
      });
      const k = toScreen.w / 1280;
      await page.mouse.move(toScreen.x + x1 * k, toScreen.y + y1 * k);
      await page.mouse.down();
      const steps = 20;
      for (let i = 1; i <= steps; i++) await page.mouse.move(toScreen.x + (x1 + ((x2 - x1) * i) / steps) * k, toScreen.y + (y1 + ((y2 - y1) * i) / steps) * k);
      await page.mouse.up();
    }
  }
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  await page.close();
  console.log(`shot ${name}`);
}
await browser.close();
if (server) await server.close();
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'));
  process.exitCode = 1;
}
