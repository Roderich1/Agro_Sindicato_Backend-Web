/**
 * Capturas de los prototipos del Resumen (sesión A, rediseño 2026-11-10).
 * Ruta DEV sin sesión ni API: /prototipos/resumen. No inicia sesión ni escribe.
 *
 * Uso (desde Web/, con Vite ya arrancado en WEB_URL):
 *   BROWSER_PATH=... PUPPETEER_HOME=... node ../docs/evidence/web_rediseno/a_capturas-resumen.mjs
 * Entorno: WEB_URL (http://127.0.0.1:5171), BROWSER_PATH, PUPPETEER_HOME, OUT_DIR.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { WEB_URL = 'http://127.0.0.1:5171', BROWSER_PATH, PUPPETEER_HOME, OUT_DIR = 'a_capturas' } = process.env;
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');

const SIZES = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '390x844', width: 390, height: 844, mobile: true },
  { name: '320x568', width: 320, height: 568, mobile: true },
];
const VARIANTS = [
  { v: 1, slug: 'operativa' },
  { v: 2, slug: 'analitica' },
];

mkdirSync(OUT_DIR, { recursive: true });
const browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, args: ['--no-first-run'] });
const results = [];

async function shot({ v, slug, size, datos = null, reduced = false, menu = false }) {
  const page = await browser.newPage();
  const consoleErrors = [];
  const requests = [];
  page.on('console', (msg) => msg.type() === 'error' && consoleErrors.push(msg.text()));
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api/')) requests.push(`${req.method()} ${url.pathname}`);
  });
  await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: 1, isMobile: Boolean(size.mobile), hasTouch: Boolean(size.mobile) });
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const query = new URLSearchParams({ v: String(v) });
  if (datos) query.set('datos', datos);
  await page.goto(`${WEB_URL}/prototipos/resumen?${query}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-variant]');
  if (menu) {
    await page.click('button[aria-label="Abrir menú"]');
    await page.waitForSelector('[role="dialog"]');
  }
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    h1: document.querySelectorAll('h1').length,
    // Borde inferior de la variante (sin desplazar), para «cabe sin desplazarse».
    variantBottom: Math.round(document.querySelector('[data-variant]').getBoundingClientRect().bottom),
  }));
  const base = `${slug}_${size.name}${datos ? `_${datos}` : ''}${reduced ? '_reduced-motion' : ''}${menu ? '_menu' : ''}`;
  await page.screenshot({ path: join(OUT_DIR, `${base}.png`), fullPage: !menu });
  if (size.name === '1366x768' && !datos && !reduced) await page.screenshot({ path: join(OUT_DIR, `${base}_pantalla.png`), fullPage: false });
  results.push({
    file: `${base}.png`,
    horizontalOverflow: metrics.scrollWidth > metrics.innerWidth,
    fitsWithoutScroll: metrics.scrollHeight <= metrics.innerHeight,
    variantFitsInViewport: metrics.variantBottom <= metrics.innerHeight,
    ...metrics,
    consoleErrors,
    apiRequests: requests,
  });
  await page.close();
}

for (const variant of VARIANTS) {
  for (const size of SIZES) await shot({ ...variant, size });
  for (const datos of ['worst', 'empty']) {
    await shot({ ...variant, size: SIZES[0], datos });
    await shot({ ...variant, size: SIZES[2], datos });
  }
  await shot({ ...variant, size: SIZES[0], reduced: true });
}
await shot({ ...VARIANTS[0], size: SIZES[2], menu: true });

await browser.close();
writeFileSync(join(OUT_DIR, 'resultados.json'), `${JSON.stringify({ when: new Date().toISOString(), url: WEB_URL, results }, null, 2)}\n`);
console.log(JSON.stringify(results.map((r) => ({ file: r.file, overflow: r.horizontalOverflow, fits: r.fitsWithoutScroll, variantFits: r.variantFitsInViewport, h: `${r.scrollHeight}/${r.innerHeight}`, vb: r.variantBottom, h1: r.h1, errors: r.consoleErrors.length, api: r.apiRequests.length })), null, 0));
