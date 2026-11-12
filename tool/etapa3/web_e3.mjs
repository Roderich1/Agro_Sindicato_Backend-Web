/**
 * Recorrido Web de la etapa 3 (consumo estimado en el borrador) contra el entorno aislado
 * (Web 5175 → API 3350). Edge sin interfaz (puppeteer-core). Contraseña de un solo uso por
 * `password-pipe`, nunca impresa. Datos sintéticos. Cada paso es una invocación:
 *   node web_e3.mjs <outDir> abrir                 carga la vista (sólo lecturas) y recarga dos veces
 *   node web_e3.mjs <outDir> generar               «Generar borrador»
 *   node web_e3.mjs <outDir> obtener               «Obtener referencia» y espera a que deje de calcular
 *   node web_e3.mjs <outDir> calculo               despliega «Ver cálculo»
 *   node web_e3.mjs <outDir> actualizar            «Actualizar referencia» y espera
 *   node web_e3.mjs <outDir> preparar <prod|prod> <nombre> <minutos>
 *        marca productos, guarda la selección, «Preparar convocatoria» y crea el borrador de convocatoria
 * Entorno: WEB_URL, BROWSER_PATH, PUPPETEER_HOME, BE_DIR.
 * Escribe <outDir>/<paso>.json con las llamadas a la API (método y ruta, ids sustituidos) y el
 * texto de la franja de referencia y de cada línea.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = '.', action = 'abrir', arg3 = '', arg4 = '', arg5 = ''] = process.argv.slice(2);
const { WEB_URL = 'http://127.0.0.1:5175', BROWSER_PATH, PUPPETEER_HOME, BE_DIR } = process.env;
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (l) => console.log(l);

const browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, args: ['--lang=es-BO'], protocolTimeout: 90000 });
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
await page.setViewport({ width: 1366, height: 900 });
const api = [];
const errors = [];
page.on('request', (req) => {
  const u = new URL(req.url());
  if (u.pathname.startsWith('/api/')) api.push(`${req.method()} ${u.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>')}`);
});
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = async (n) => { await page.screenshot({ path: join(outDir, `${action}_${n}.png`), fullPage: true }); say(`captura ${action}_${n}.png`); };
const textOf = (sel) => page.$eval(sel, (e) => e.innerText).catch(() => null);
async function clickButton(re) {
  for (const h of await page.$$('button')) {
    const t = (await h.evaluate((e) => e.textContent ?? '')).trim();
    if (re.test(t) && !(await h.evaluate((e) => e.disabled))) { await h.click(); await sleep(1200); return t; }
  }
  throw new Error(`no hay botón habilitado ${re}`);
}
async function login() {
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', 'directiva.demo@example.test');
  const pw = execFileSync(process.execPath, [join(BE_DIR, 'tool/demo-rica/demo-rica.cjs'), 'password-pipe', 'directiva'], {
    cwd: join(BE_DIR, 'Back'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  });
  await page.type('#password', pw);
  await Promise.all([page.waitForResponse((r) => /\/auth\/(v2\/)?login$/.test(r.url()), { timeout: 20000 }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 20000 });
  say('sesión iniciada como directiva');
}
async function openProposals() {
  await page.goto(`${WEB_URL}/colectivo/propuestas`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="link-banner"]', { timeout: 30000 }).catch(() => {});
  await sleep(1500);
}
async function waitNotCalculating(limitMs = 120000) {
  const start = Date.now();
  for (;;) {
    const state = await page.$eval('[data-testid="link-banner"]', (e) => e.getAttribute('data-state')).catch(() => null);
    if (state && state !== 'CALCULATING') return state;
    if (Date.now() - start > limitMs) return state;
    await sleep(2000);
  }
}
async function snapshot() {
  return {
    banner: await textOf('[data-testid="link-banner"]'),
    comparison_note: await textOf('[data-testid="comparison-note"]'),
    lines: await page.$$eval('tr[data-testid^="line-"]', (rows) => rows.map((r) => ({
      id: r.getAttribute('data-testid'),
      need: r.querySelector('[data-testid="need"]')?.innerText ?? null,
      estimate: r.querySelector('[data-testid="reference"]')?.innerText ?? null,
      selected: r.querySelector('[data-testid="select-product"]')?.checked ?? null,
    }))),
    selection: await textOf('[data-testid="selection-bar"]'),
  };
}

const result = { action, at: new Date().toISOString() };
try {
  await login();
  await openProposals();
  if (action === 'abrir') {
    await shot('01_vista');
    await page.reload({ waitUntil: 'networkidle0' }); await sleep(1500);
    await page.reload({ waitUntil: 'networkidle0' }); await sleep(1500);
    await shot('02_tras_recargar');
  } else if (action === 'generar') {
    await clickButton(/^Generar borrador$/);
    await page.waitForResponse((r) => /\/collective\/campaigns\/.+\/proposals$/.test(r.url()) && r.request().method() === 'POST', { timeout: 30000 }).catch(() => {});
    await sleep(2500);
    await shot('01_borrador_nuevo');
  } else if (action === 'obtener' || action === 'actualizar') {
    await shot('01_antes');
    const t0 = Date.now();
    const answered = page.waitForResponse((r) => /estimation-link\/prepare$/.test(r.url()), { timeout: 120000 });
    await clickButton(action === 'obtener' ? /^Obtener referencia$/ : /^Actualizar referencia$/);
    const response = await answered;
    result.prepare = { status: response.status(), ms: Date.now() - t0, outcome: (await response.json().catch(() => ({}))).outcome ?? null };
    await sleep(1500);
    await shot('02_tras_pulsar');
    result.final_state = await waitNotCalculating();
    await sleep(1500);
    await shot('03_resultado');
  } else if (action === 'calculo') {
    await page.$eval('[data-testid="calculation"] summary', (s) => s.click());
    await sleep(3000);
    await shot('01_ver_calculo');
    result.calculation = await textOf('[data-testid="calculation"]');
  } else if (action === 'preparar') {
    const wanted = arg3.split('|').filter(Boolean);
    for (const row of await page.$$('tr[data-testid^="line-"]')) {
      const id = await row.evaluate((r) => r.getAttribute('data-testid'));
      const box = await row.$('[data-testid="select-product"]');
      if (!box) continue;
      const checked = await box.evaluate((b) => b.checked);
      const want = wanted.some((w) => id.includes(w));
      if (checked !== want) { await box.click(); await sleep(300); }
    }
    await clickButton(/^Guardar selección$/);
    await sleep(1500);
    await shot('01_seleccion_guardada');
    await clickButton(/^Preparar convocatoria/);
    await page.waitForSelector('#call-name', { timeout: 20000 });
    await sleep(2500);
    result.form_url = await page.evaluate(() => location.pathname + location.search);
    result.form_text = await page.evaluate(() => document.querySelector('form')?.innerText ?? null);
    await shot('02_formulario_prellenado');
    await page.type('#call-name', arg4 || 'Convocatoria desde propuesta (sintética)');
    const d = new Date(Date.now() + Number(arg5 || 60) * 60_000);
    const pad = (n) => String(n).padStart(2, '0');
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    await page.$eval('#call-deadline', (el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, local);
    const options = await page.$$eval('#call-responsible option', (os) => os.map((o) => ({ v: o.value, t: o.textContent })));
    const responsible = options.find((o) => /Directiva DEMO/.test(o.t ?? ''));
    if (!responsible) throw new Error('sin responsable elegible Directiva DEMO');
    await page.select('#call-responsible', responsible.v);
    await clickButton(/^Crear borrador$/);
    await sleep(3500);
    result.detail_url = await page.evaluate(() => location.pathname);
    result.detail_text = await page.evaluate(() => document.querySelector('main')?.innerText ?? null);
    await shot('03_convocatoria_creada');
  } else throw new Error(`acción desconocida ${action}`);
  Object.assign(result, await snapshot());
} catch (e) {
  result.error = e.message;
  await shot('error').catch(() => {});
  say(`ERROR ${e.message}`);
} finally {
  result.api = api;
  result.console_errors = errors;
  writeFileSync(join(outDir, `${action}.json`), JSON.stringify(result, null, 2));
  await browser.close();
}
