/**
 * F10 (RNF-06): medición R5a (vista Web del resumen colectivo) y R5b (API del
 * resumen) con el dataset sintético DS-V Central.
 *
 *   node r5.mjs r5b <salida>           # API, Node fetch a localhost
 *   node r5.mjs r5a <salida>           # Web compilada, navegador headless
 *
 * Entorno (sólo en el proceso; nada de esto se escribe en la salida):
 *   API_URL, WEB_URL, EVAL_EMAIL, EVAL_PASSWORD, CAMPAIGN_ID, BROWSER_PATH,
 *   BROWSER_LABEL, VIEWPORT (p. ej. 1920x1080), REPS (10), SPACING_MS,
 *   WARMUPS (1), SERIES_LABEL.
 *
 * Salida: CSV crudo por repetición (`<serie>.csv`) y resumen JSON
 * (`<serie>.json`) con mediana, p90 por rango más cercano, máximo y errores.
 * Los calentamientos se registran aparte y no entran en la serie. Una
 * repetición fallida (código distinto de 200, 429, tiempo agotado) se conserva
 * como error; no se repite ni se descarta.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const [mode, outArg = '.'] = process.argv.slice(2);
const env = process.env;
const out = resolve(outArg);
mkdirSync(out, { recursive: true });
const REPS = Number(env.REPS ?? 10);
const WARMUPS = Number(env.WARMUPS ?? 1);
const SPACING_MS = Number(env.SPACING_MS ?? 5000);
const TIMEOUT_MS = 30000;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const iso = () => new Date().toISOString();

for (const key of ['API_URL', 'EVAL_EMAIL', 'EVAL_PASSWORD', 'CAMPAIGN_ID']) {
  if (!env[key]) throw new Error(`Missing ${key}`);
}

/** p90 por rango más cercano: el valor en la posición ceil(0,9·n) de la serie ordenada. */
export function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return { n: 0, median: null, p90: null, max: null };
  const nearest = (p) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  const mid = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { n: sorted.length, median, p90: nearest(0.9), max: sorted[sorted.length - 1] };
}

function writeSeries(name, header, rows, extra) {
  const csv = [header.join(','), ...rows.map((row) => header.map((key) => row[key] ?? '').join(','))].join('\n');
  writeFileSync(join(out, `${name}.csv`), `${csv}\n`);
  writeFileSync(join(out, `${name}.json`), `${JSON.stringify(extra, null, 2)}\n`);
}

async function login() {
  const res = await fetch(`${env.API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.EVAL_EMAIL, password: env.EVAL_PASSWORD }),
  });
  if (res.status !== 200 && res.status !== 201) throw new Error(`login ${res.status}`);
  return (await res.json()).accessToken;
}

/** R5b: desde el envío hasta recibir el cuerpo completo. */
async function r5b() {
  const token = await login();
  const url = `${env.API_URL}/api/v1/collective/campaigns/${env.CAMPAIGN_ID}/summary`;
  const once = async (kind, index) => {
    const started = performance.now();
    const at = iso();
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      const body = await res.text();
      const ms = performance.now() - started;
      let cells = '';
      let mode = '';
      try {
        const json = JSON.parse(body);
        cells = Array.isArray(json.cells) ? json.cells.length : '';
        mode = json.disclosure?.mode ?? '';
      } catch { /* cuerpo no JSON: se registra el código */ }
      return { kind, index, at, status: res.status, ms: ms.toFixed(1), bytes: Buffer.byteLength(body), cells, mode, error: res.status === 200 ? '' : `HTTP ${res.status}` };
    } catch (error) {
      return { kind, index, at, status: '', ms: (performance.now() - started).toFixed(1), bytes: '', cells: '', mode: '', error: String(error.name ?? error) };
    }
  };
  const rows = [];
  for (let i = 1; i <= WARMUPS; i += 1) {
    rows.push(await once('warmup', i));
    await sleep(SPACING_MS);
  }
  for (let i = 1; i <= REPS; i += 1) {
    rows.push(await once('measure', i));
    if (i < REPS) await sleep(SPACING_MS);
  }
  const measured = rows.filter((r) => r.kind === 'measure');
  const ok = measured.filter((r) => !r.error).map((r) => Number(r.ms));
  const name = env.SERIES_LABEL ?? 'r5b';
  writeSeries(name, ['kind', 'index', 'at', 'status', 'ms', 'bytes', 'cells', 'mode', 'error'], rows, {
    series: name, mode: 'r5b', reps: REPS, warmups: WARMUPS, spacing_ms: SPACING_MS,
    start: rows[0]?.at, end: measured.at(-1)?.at,
    errors: measured.filter((r) => r.error).length,
    // Las repeticiones con error no aportan tiempo; se cuentan aparte.
    stats_ms: summarize(ok),
    all_ms: measured.map((r) => Number(r.ms)),
  });
  process.stdout.write(`${name}: ${ok.length}/${REPS} sin error\n`);
}

/** R5a: navegación a /colectivo/resumen hasta ver las dos tablas con filas. */
async function r5a() {
  const { default: puppeteer } = await import('puppeteer-core');
  for (const key of ['WEB_URL', 'BROWSER_PATH']) if (!env[key]) throw new Error(`Missing ${key}`);
  const [width, height] = (env.VIEWPORT ?? '1920x1080').split('x').map(Number);
  const profile = join(tmpdir(), `f10-r5a-${Date.now()}`);
  const browser = await puppeteer.launch({
    executablePath: env.BROWSER_PATH,
    headless: true,
    userDataDir: profile,
    args: ['--lang=es-BO', `--window-size=${width},${height}`],
    defaultViewport: { width, height },
  });
  const version = await browser.version();
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  const origin = new URL(env.WEB_URL).origin;
  const target = `${env.WEB_URL}/colectivo/resumen?campaign=${env.CAMPAIGN_ID}`;

  // Inicio de sesión por la interfaz (no se mide).
  await page.goto(`${env.WEB_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', env.EVAL_EMAIL);
  await page.type('#password', env.EVAL_PASSWORD);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => location.pathname === '/colectivo/resumen', { timeout: TIMEOUT_MS });

  const ready = () => {
    const rows = (label) => document.querySelectorAll(`[aria-label="${label}"] tbody tr`).length;
    return rows('Necesidad declarada') > 0 && rows('Consumo') > 0 ? performance.now() : false;
  };

  const once = async (kind, index, cold) => {
    if (cold) {
      // Frío: caché HTTP, service worker y Cache Storage del sitio borrados;
      // la cookie de sesión se conserva (el inicio de sesión no se mide).
      await cdp.send('Network.clearBrowserCache');
      await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'service_workers,cache_storage' });
    }
    const at = iso();
    const status = { summary: '', throttled: 0 };
    const onResponse = (res) => {
      if (res.url().includes('/collective/campaigns/') && res.url().endsWith('/summary')) status.summary = res.status();
      if (res.status() === 429) status.throttled += 1;
    };
    page.on('response', onResponse);
    try {
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
      const handle = await page.waitForFunction(ready, { polling: 'raf', timeout: TIMEOUT_MS });
      const ms = await handle.jsonValue();
      const timing = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const api = performance.getEntriesByType('resource').filter((e) => e.name.endsWith('/summary')).at(-1);
        return {
          response_end: nav?.responseEnd, dcl: nav?.domContentLoadedEventEnd,
          api_start: api?.startTime, api_end: api?.responseEnd,
          controlled: Boolean(navigator.serviceWorker?.controller),
        };
      });
      const error = status.throttled ? `429 x${status.throttled}` : status.summary !== 200 ? `summary ${status.summary}` : '';
      return {
        kind, index, at, ms: ms.toFixed(1), summary_status: status.summary,
        response_end_ms: timing.response_end?.toFixed(1), dcl_ms: timing.dcl?.toFixed(1),
        api_start_ms: timing.api_start?.toFixed(1), api_end_ms: timing.api_end?.toFixed(1),
        sw_controlled: timing.controlled, error,
      };
    } catch (error) {
      return { kind, index, at, ms: '', summary_status: status.summary, error: String(error.name ?? error) };
    } finally {
      page.off('response', onResponse);
    }
  };

  const header = ['kind', 'index', 'at', 'ms', 'summary_status', 'response_end_ms', 'dcl_ms', 'api_start_ms', 'api_end_ms', 'sw_controlled', 'error'];
  const label = env.SERIES_LABEL ?? `r5a-${env.BROWSER_LABEL ?? 'browser'}`;
  const result = { series: label, mode: 'r5a', browser: version, browser_label: env.BROWSER_LABEL, viewport: `${width}x${height}`, reps: REPS, warmups: WARMUPS, spacing_ms: SPACING_MS };
  for (const [phase, cold] of [['cold', true], ['warm', false]]) {
    const rows = [];
    for (let i = 1; i <= WARMUPS; i += 1) {
      rows.push(await once('warmup', i, cold));
      await sleep(SPACING_MS);
    }
    for (let i = 1; i <= REPS; i += 1) {
      rows.push(await once('measure', i, cold));
      await sleep(SPACING_MS);
    }
    const measured = rows.filter((r) => r.kind === 'measure');
    const ok = measured.filter((r) => !r.error).map((r) => Number(r.ms));
    writeSeries(`${label}-${phase}`, header, rows, {
      ...result, phase, start: rows[0]?.at, end: measured.at(-1)?.at,
      errors: measured.filter((r) => r.error).length,
      stats_ms: summarize(ok), all_ms: measured.map((r) => (r.ms === '' ? null : Number(r.ms))),
    });
    process.stdout.write(`${label}-${phase}: ${ok.length}/${REPS} sin error\n`);
    // Ventana del limitador (20/min por ruta) antes de la serie siguiente.
    await sleep(61000);
  }
  await browser.close();
}

if (mode === 'r5b') await r5b();
else if (mode === 'r5a') await r5a();
else throw new Error('mode: r5a | r5b');
