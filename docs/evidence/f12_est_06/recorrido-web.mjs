/**
 * F12-EST-06 (#179): recorrido de la pantalla «Estimación del consumo» contra el
 * backend REAL (`node dist/main.js` con su trabajador) y PostgreSQL desechable,
 * con datos SINTÉTICOS. Navegador Edge/Chrome sin interfaz mediante
 * puppeteer-core, instalado aparte (no es dependencia del proyecto).
 *
 *   node recorrido-web.mjs <fase: provisional|pending> <salida>
 *
 * Entorno: WEB_URL, WALK_PASSWORD (sólo en el proceso), BROWSER_PATH,
 * PUPPETEER_HOME (carpeta con node_modules/puppeteer-core), IDS (ids.json de
 * control-sintetico.cjs), BACK_DIR y PG_ADMIN_URL (para las órdenes de control).
 * Escribe capturas PNG y `recorrido-<fase>.json`. No imprime contraseñas ni tokens.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [phase = 'provisional', outDir = '.'] = process.argv.slice(2);
const { WEB_URL, WALK_PASSWORD, BROWSER_PATH, PUPPETEER_HOME, IDS, BACK_DIR } = process.env;
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
const ids = JSON.parse(readFileSync(IDS, 'utf8'));
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(outDir);
mkdirSync(out, { recursive: true });
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 400) });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const control = (order) =>
  execFileSync(process.execPath, [join(here, 'control-sintetico.cjs'), order, IDS], { cwd: BACK_DIR, env: process.env, encoding: 'utf8' }).trim();

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: true,
  args: ['--lang=es-BO', '--window-size=1440,1100'],
  defaultViewport: { width: 1440, height: 1100 },
});
const page = await browser.newPage();
const downloads = join(out, `downloads-${phase}`);
rmSync(downloads, { recursive: true, force: true });
mkdirSync(downloads, { recursive: true });
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
let lastResults = null;
page.on('response', async (response) => {
  if (response.url().includes('/api/v1/estimation/results') && response.request().method() === 'GET' && response.ok()) {
    lastResults = await response.json().catch(() => null);
  }
});

async function shot(name) {
  await sleep(500);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
}
async function login(email) {
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', email);
  await page.type('#password', WALK_PASSWORD);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 15000 });
}
const open = (campaign) => page.goto(`${WEB_URL}/colectivo/estimacion?campaign=${campaign}`, { waitUntil: 'networkidle0' });
const textOf = (testId) => page.$eval(`[data-testid="${testId}"]`, (el) => el.textContent.trim()).catch(() => null);
const rowCell = (product, cell) =>
  page.$eval(`[data-testid="result-${product}"] [data-testid="${cell}"]`, (el) => el.textContent.trim()).catch(() => null);
async function waitText(testId, pattern, timeout = 30000) {
  const source = pattern.source;
  await page.waitForFunction(
    (id, src) => new RegExp(src).test(document.querySelector(`[data-testid="${id}"]`)?.textContent ?? ''),
    { timeout, polling: 250 },
    testId,
    source,
  );
}
async function clickButton(text) {
  const [button] = await page.$$(`xpath/.//button[normalize-space(.)="${text}"]`);
  if (!button) throw new Error(`No hay botón "${text}"`);
  await button.click();
}
/** Pide la estimación y espera a que el trabajador del proceso real la termine. */
async function requestAndWait() {
  await clickButton('Solicitar estimación');
  await waitText('job-status', /^(Terminado|No se ejecutó)$/, 40000);
  // La PWA mantiene su service worker: se espera a la recarga de resultados, no a la red en reposo.
  await sleep(1500);
  return textOf('job-status');
}

try {
  await login(ids.directorEmail);
  if (phase === 'provisional') {
    // 1. La pantalla en el menú institucional; la campaña objetivo todavía sin estimación.
    const menu = await page.$$eval('nav[aria-label="Navegación principal"] a', (links) => links.map((a) => a.textContent.trim()));
    check('menú: «Estimación del consumo»', menu.includes('Estimación del consumo'), menu.join(', '));
    await open(ids.t1);
    check('sin ejecuciones: ninguna cifra', (await page.content()).includes('Todavía no hay ninguna estimación'));
    check('organización a la vista', (await textOf('institution')) !== '—', await textOf('institution'));
    await shot('01-sin-estimacion');

    // 2. Solicitud → trabajador real → ejecución guardada → consulta.
    check('el trabajo termina por el trabajador del proceso', (await requestAndWait()) === 'Terminado', await textOf('job-status'));
    await waitText('result-Herbicida de ensayo', /Vigente/);
    const estimate = await rowCell('Herbicida de ensayo', 'estimate');
    const naive = await rowCell('Herbicida de ensayo', 'naive');
    await waitText('result-Herbicida de ensayo', /0\.50/);
    check('SES 111 L (111.000 mL en unidad base)', estimate === '111 L111.000 mL', estimate);
    check('naive 116 L (116.000 mL en unidad base)', naive === '116 L116.000 mL', naive);
    check('α 0.50 del detalle de la ejecución', (await rowCell('Herbicida de ensayo', 'alpha')) === '0.50', await rowCell('Herbicida de ensayo', 'alpha'));
    check('campañas observadas: 4', /^4: /.test((await rowCell('Herbicida de ensayo', 'observed')) ?? ''), await rowCell('Herbicida de ensayo', 'observed'));
    check('vigencia: Vigente', (await rowCell('Herbicida de ensayo', 'validity')) === 'Vigente', await rowCell('Herbicida de ensayo', 'validity'));
    await shot('02-calculado-vigente');

    // 3. La exportación coincide con la respuesta del servicio.
    const served = lastResults;
    await clickButton('Exportar CSV de la consulta');
    let file = null;
    for (let i = 0; i < 40 && !file; i++) {
      file = readdirSync(downloads).find((name) => name.endsWith('.csv'));
      await sleep(250);
    }
    const csv = file ? readFileSync(join(downloads, file), 'utf8') : '';
    const [header, ...rows] = csv.trim().split('\r\n').map((line) => line.split(','));
    const exported = rows.map((row) => Object.fromEntries(header.map((column, i) => [column, row[i]])));
    const matches =
      served !== null &&
      exported.length === served.results.length &&
      served.results.every((r, i) =>
        ['status', 'run_ref', 'generated_at', 'estimate_base', 'naive_base', 'validity'].every((k) => (exported[i][k] ?? '') === String(r[k] ?? '')),
      );
    check('exportación = respuesta de GET /results', matches, `${file}: ${JSON.stringify(exported)}`);

    // 4. Una campaña clasificada después en la temporada: Desactualizado.
    control('classify-extra');
    await open(ids.t1);
    await waitText('result-Herbicida de ensayo', /Desactualizado/);
    check('campaña clasificada después: Desactualizado', /cambiaron desde el cálculo/.test((await rowCell('Herbicida de ensayo', 'validity')) ?? ''), await rowCell('Herbicida de ensayo', 'validity'));
    check('la cifra desactualizada se sigue mostrando (no retirada)', (await rowCell('Herbicida de ensayo', 'estimate')) === '111 L111.000 mL');
    await shot('03-desactualizado');

    // 5. Nueva ejecución: vuelve a Vigente; la anterior queda Sustituida en su detalle.
    check('segunda solicitud termina', (await requestAndWait()) === 'Terminado');
    await waitText('result-Herbicida de ensayo', /Vigente/);
    const history = await page.$$('[data-testid="history-item"]');
    check('historial con 2 ejecuciones', history.length === 2, history.length);
    const [, older] = await page.$$('xpath/.//li[@data-testid="history-item"]//button[normalize-space(.)="Ver detalle"]');
    await older.click();
    await page.waitForSelector('[data-testid="run-detail"]', { timeout: 10000 });
    const detail = await textOf('run-detail');
    check('la ejecución anterior: Sustituido en su detalle', /Sustituido/.test(detail ?? ''), detail?.slice(0, 200));
    check('su serie: 96, 120, 104 y 116 L', ['96 L', '120 L', '104 L', '116 L'].every((q) => detail?.includes(q)), '');
    await shot('04-sustituido');

    // 6. Un trabajo caído en su último intento: FAILED/RETRIES_EXHAUSTED, y no sustituye (EST-D-08).
    const crashed = control('crash-last-attempt');
    let failedShown = false;
    for (let i = 0; i < 30 && !failedShown; i++) {
      await sleep(1000);
      await open(ids.t1);
      failedShown = /agotaron los reintentos/.test((await textOf('history-outcome')) ?? '');
    }
    check('ejecución fallida en el historial (trabajo ' + crashed.slice(0, 8) + '…)', failedShown, await textOf('history-outcome'));
    check('la fallida no sustituye: el resultado sigue Vigente con su cifra', (await rowCell('Herbicida de ensayo', 'validity')) === 'Vigente' && (await rowCell('Herbicida de ensayo', 'estimate')) === '111 L111.000 mL');
    await shot('05-fallida-no-sustituye');

    // 7. Una fuente retirada: ni SES ni naive (EST-D-12).
    control('withdraw');
    await open(ids.t1);
    await waitText('result-Herbicida de ensayo', /Desactualizado/);
    check('fuente retirada: SES oculto', (await rowCell('Herbicida de ensayo', 'estimate')) === 'Cifra retirada', await rowCell('Herbicida de ensayo', 'estimate'));
    check('fuente retirada: naive oculto', (await rowCell('Herbicida de ensayo', 'naive')) === 'Cifra retirada', await rowCell('Herbicida de ensayo', 'naive'));
    check('fuente retirada: motivo', /ya no se divulga/.test((await rowCell('Herbicida de ensayo', 'validity')) ?? ''));
    await shot('06-fuente-retirada');

    // 8. Datos insuficientes: el motivo, sin cifra.
    await open(ids.t2);
    check('datos insuficientes: termina', (await requestAndWait()) === 'Terminado');
    await waitText('result-Fungicida de ensayo', /Datos insuficientes/);
    check('datos insuficientes: motivo', /menos de tres campañas comparables consecutivas/.test((await rowCell('Fungicida de ensayo', 'reason')) ?? ''), await rowCell('Fungicida de ensayo', 'reason'));
    check('datos insuficientes: sin cifra', (await rowCell('Fungicida de ensayo', 'estimate')) === 'Sin cifra' && (await rowCell('Fungicida de ensayo', 'naive')) === 'Sin cifra');
    await shot('07-datos-insuficientes');

    // 9. La Directiva pierde el rol con la pantalla abierta: 403 y nada institucional a la vista.
    await open(ids.t1);
    await page.waitForSelector('[data-testid="history-item"]');
    control('demote');
    await clickButton('Ver detalle');
    await page.waitForSelector('[data-testid="error-forbidden"]', { timeout: 10000 });
    check('permiso perdido: aviso de permiso', /ya no tiene acceso/.test((await textOf('error-forbidden')) ?? ''));
    check('permiso perdido: sin resultados ni historial', (await page.$('[data-testid^="result-"]')) === null && (await page.$('[data-testid="history-item"]')) === null);
    check('permiso perdido: sin solicitud', (await page.$$('xpath/.//button[normalize-space(.)="Solicitar estimación"]')).length === 0);
    await shot('08-permiso-perdido');
    control('promote');
  } else {
    // 10. Política pendiente (proceso sin modo provisional): ni solicitud ni cifras (EST-D-10).
    await open(ids.t1);
    await page.waitForSelector('[data-testid="error-policy"]', { timeout: 15000 });
    check('política pendiente: aviso', /no se solicita ni se muestra ninguna estimación/.test((await textOf('error-policy')) ?? ''));
    check('política pendiente: sin resultados', (await page.$('[data-testid^="result-"]')) === null);
    check('política pendiente: sin solicitud', (await page.$$('xpath/.//button[normalize-space(.)="Solicitar estimación"]')).length === 0);
    await shot('09-politica-pendiente');

    // 11. Sin conexión: un problema de conexión, distinto de permiso o política.
    await page.setOfflineMode(true);
    await page.select('#campaign-picker', ids.t2).catch(() => undefined);
    await page.waitForSelector('[data-testid="error-offline"]', { timeout: 15000 });
    check('sin conexión: aviso de conexión', /Sin conexión|no responde/.test((await textOf('error-offline')) ?? ''));
    await page.setOfflineMode(false);
    await shot('10-sin-conexion');
  }
} catch (error) {
  check('recorrido sin excepción', false, error instanceof Error ? error.message : String(error));
  await shot(`error-${phase}`).catch(() => undefined);
} finally {
  await browser.close();
  writeFileSync(join(out, `recorrido-${phase}.json`), `${JSON.stringify({ phase, at: new Date().toISOString(), checks }, null, 2)}\n`);
  const failed = checks.filter((c) => !c.ok);
  process.stdout.write(`${phase}: ${checks.length - failed.length}/${checks.length} comprobaciones${failed.length ? `; fallan: ${failed.map((c) => c.name).join(' | ')}` : ''}\n`);
  process.exitCode = failed.length ? 1 : 0;
}
