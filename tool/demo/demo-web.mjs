/**
 * DEMO de Agrocuentas (OE3, 2026-11-03): recorrido de la Web institucional contra
 * el Backend REAL de la DEMO, con datos SINTÉTICOS y Edge sin interfaz mediante
 * puppeteer-core (instalado aparte, no es dependencia del proyecto).
 *
 *   node tool/demo/demo-web.mjs <fase> <salida>
 *     consolidado   resumen de la campaña actual (tras la publicación del teléfono)
 *     propuesta     genera una propuesta conjunta (borrador) y exporta su CSV
 *     estimacion    pide la estimación con el trabajador real y descarga la copia de la Web
 *     sin-conexion  DESCONEXIÓN SIMULADA DEL NAVEGADOR (setOfflineMode): abre la copia guardada
 *
 * Entorno: BROWSER_PATH, PUPPETEER_HOME y, opcionales, WEB_URL (http://127.0.0.1:5190)
 * y DEMO_API. La contraseña de la Directiva DEMO es nueva y de un solo uso: llega
 * por una tubería desde `demo-central.cjs password-pipe` y no se imprime ni se guarda.
 * Escribe capturas PNG, `web-<fase>.json` (comprobaciones) y los CSV descargados.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [phase = 'consolidado', outDir = '.'] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const back = resolve(here, '../../Back');
const WEB_URL = process.env.WEB_URL ?? 'http://127.0.0.1:5190';
const API = process.env.DEMO_API ?? 'http://127.0.0.1:3330/api/v1';
const puppeteer = createRequire(join(process.env.PUPPETEER_HOME, 'package.json'))('puppeteer-core');
const out = resolve(outDir);
mkdirSync(out, { recursive: true });
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 300) });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const password = () =>
  execFileSync(process.execPath, [join(here, 'demo-central.cjs'), 'password-pipe', 'directiva'], {
    cwd: back,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER_PATH,
  headless: true,
  userDataDir: join(out, `perfil-${process.env.DEMO_PROFILE ?? 'directiva'}`),
  defaultViewport: { width: 1366, height: 900 },
  args: ['--lang=es-BO'],
});
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out });
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
const body = () => page.$eval('body', (el) => el.innerText);
async function clickButton(text) {
  const [button] = await page.$$(`xpath/.//button[normalize-space(.)="${text}"]`);
  if (!button) throw new Error(`no hay botón «${text}»`);
  await button.click();
}

async function login() {
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
  if (!page.url().endsWith('/login')) return;
  await page.type('#email', 'directiva.demo@example.test');
  await page.type('#password', password());
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/auth/login'), { timeout: 20000 }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 20000 });
}

try {
  if (phase === 'sin-conexion') {
    // Desconexión SIMULADA del navegador (no del Backend ni del emulador).
    await page.goto(`${WEB_URL}/colectivo/estimacion`, { waitUntil: 'networkidle0' }).catch(() => {});
    await login();
    await page.setOfflineMode(true);
    await page.goto(`${WEB_URL}/estimacion/copia-sin-conexion`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(2500);
    const text = await body();
    check('Sin conexión simulada en el navegador: la copia guardada se consulta', /Herbicida DEMO/.test(text) && /111/.test(text), text.slice(0, 200));
    await shot('web-08-copia-sin-conexion-simulada');
    await page.setOfflineMode(false);
  } else {
    await login();
    // Sin ?campaign=, cada pantalla elige la campaña activa (useSelectedCampaign).
    if (phase === 'consolidado') {
      await page.goto(`${WEB_URL}/colectivo/resumen`, { waitUntil: 'networkidle0' });
      await sleep(1500);
      const text = await body();
      check('Campaña activa de la DEMO en pantalla', /Invierno \d{4} \(DEMO\)/.test(text), '');
      const row = async (name) =>
        page.$eval(`[data-testid="cell-DECLARED_NEED-${name}-ML"]`, (el) => el.innerText.replace(/\s+/g, ' ')).catch(() => '');
      const fung = await row('Fungicida DEMO');
      const herb = await row('Herbicida DEMO');
      const ins = await row('Insecticida DEMO');
      check('Fungicida: 3 aportantes tras la publicación del teléfono → 53 L', /53/.test(fung) && /3/.test(fung), fung);
      check('Herbicida: 250 L de 5 aportantes', /250/.test(herb), herb);
      check('Insecticida: sin cifra (bajo el umbral)', !/\d+(,\d+)? L/.test(ins), ins);
      check('Aviso de modo provisional con datos sintéticos', /sint[eé]tic/i.test(text), '');
      check('Sin datos individuales en la Web institucional', !/Ana Quispe|Beto Mamani|agricultor\d\.demo/.test(text), '');
      await shot('web-01-consolidado');
    } else if (phase === 'propuesta') {
      await page.goto(`${WEB_URL}/colectivo/propuestas`, { waitUntil: 'networkidle0' });
      await clickButton('Generar propuesta (borrador)');
      await page.waitForSelector('[aria-label="Detalle del borrador"]', { timeout: 20000 });
      await sleep(1000);
      const text = await page.$eval('[aria-label="Detalle del borrador"]', (el) => el.innerText);
      check('Propuesta conjunta: Herbicida 250 L y Fungicida 53 L', /250/.test(text) && /53/.test(text), text.slice(0, 300));
      check('Propuesta: Insecticida no aparece con cifra', !/Insecticida DEMO[^\n]*\d+ L/.test(text), '');
      await shot('web-02-propuesta');
      await clickButton('Exportar CSV');
      await sleep(2500);
      check('CSV de la propuesta descargado', readdirSync(out).some((f) => f.endsWith('.csv')), readdirSync(out).filter((f) => f.endsWith('.csv')).join(', '));
    } else if (phase === 'estimacion') {
      await page.goto(`${WEB_URL}/colectivo/estimacion`, { waitUntil: 'networkidle0' });
      await clickButton('Generar estimación');
      await page.waitForFunction(() => /^(Terminado|No se ejecutó)$/.test(document.querySelector('[data-testid="job-status"]')?.textContent?.trim() ?? ''), { timeout: 60000, polling: 500 });
      await sleep(1500);
      const status = await page.$eval('[data-testid="job-status"]', (el) => el.textContent.trim());
      const text = await body();
      check('Trabajo real terminado', status === 'Terminado', status);
      check('Herbicida DEMO: SES 111 L y naive 116 L', /111/.test(text) && /116/.test(text), '');
      check('Fungicida DEMO: datos insuficientes, sin cifra', /insuficiente/i.test(text), '');
      await shot('web-03-estimacion');
      await clickButton('Descargar copia para consultar sin conexión');
      await sleep(2000);
      check('Copia institucional guardada en el navegador', /guardad|descargad/i.test(await page.$eval('[data-testid="copy-status"]', (el) => el.innerText).catch(() => '')), '');
      await shot('web-04-copia-guardada');
      // DESCONEXIÓN SIMULADA DEL NAVEGADOR (setOfflineMode), en la misma sesión: la copia
      // sólo la lee la sesión que la descargó. No desconecta el Backend ni el emulador.
      await page.setOfflineMode(true);
      // En la misma pantalla, como en F12-EST-07: se vuelve a elegir la campaña y, sin red,
      // la pantalla muestra el aviso y la copia guardada de esa campaña.
      const current = await page.$eval('#campaign-picker', (el) => el.value);
      const other = await page.$$eval('#campaign-picker option', (os, cur) => os.map((o) => o.value).find((v) => v && v !== cur), current);
      await page.select('#campaign-picker', other);
      await sleep(1000);
      await page.select('#campaign-picker', current);
      await page.waitForSelector('[data-testid="error-offline"]', { timeout: 15000 }).catch(() => {});
      await page.waitForSelector(`[data-testid="copy-${current}"]`, { timeout: 10000 }).catch(() => {});
      await sleep(1000);
      const offline = await body();
      check('Sin conexión simulada en el navegador: la copia guardada se consulta (111 L)', /Herbicida DEMO/.test(offline) && /111/.test(offline), offline.slice(0, 200));
      await shot('web-05-copia-sin-conexion-simulada');
      await page.setOfflineMode(false);
    }
  }
} catch (error) {
  check(`error en la fase ${phase}`, false, error.message);
  await shot(`web-error-${phase}`).catch(() => {});
} finally {
  writeFileSync(join(out, `web-${phase}.json`), `${JSON.stringify({ phase, at: new Date().toISOString(), checks }, null, 2)}\n`);
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name}${c.detail && !c.ok ? ` — ${c.detail}` : ''}`);
  await browser.close();
}
