/**
 * F12-EST-06 (#179): recorrido de la pantalla «Estimación del consumo» contra el
 * backend REAL (`node dist/main.js` con su trabajador) y PostgreSQL desechable,
 * con datos SINTÉTICOS. Navegador Edge/Chrome sin interfaz mediante
 * puppeteer-core, instalado aparte (no es dependencia del proyecto).
 *
 *   node recorrido-web.mjs <fase: admin|provisional|pending> <salida>
 *
 * Entorno: WEB_URL, WALK_PASSWORD (sólo en el proceso), BROWSER_PATH,
 * PUPPETEER_HOME (carpeta con node_modules/puppeteer-core), IDS (ids.json de
 * control-sintetico.cjs), BACK_DIR y PG_ADMIN_URL (para las órdenes de control).
 * Escribe capturas PNG, `recorrido-<fase>.json` y `respuestas-<fase>.json`: cada
 * respuesta real de `/api/v1/estimation/*` (método, ruta sin el host, estado y
 * los campos que se comprueban). No imprime contraseñas ni tokens.
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
/** Respuestas reales del servidor, resumidas: nunca cabeceras ni tokens. */
const served = [];
const pick = (body, keys) => (body && typeof body === 'object' ? Object.fromEntries(keys.filter((k) => k in body).map((k) => [k, body[k]])) : null);
page.on('response', async (response) => {
  const url = new URL(response.url());
  if (!url.pathname.startsWith('/api/v1/estimation/')) return;
  const method = response.request().method();
  const body = await response.json().catch(() => null);
  if (url.pathname === '/api/v1/estimation/results' && method === 'GET' && response.ok()) lastResults = body;
  let summary = pick(body, ['message', 'statusCode']);
  if (response.ok() && url.pathname.startsWith('/api/v1/estimation/jobs')) {
    summary = pick(body, ['job_ref', 'status', 'requested_by_role', 'attempts', 'stop_code', 'run_ref']);
  } else if (response.ok() && url.pathname === '/api/v1/estimation/results') {
    summary = {
      profile: body?.profile,
      results: (body?.results ?? []).map((r) => pick(r, ['status', 'reason_code', 'run_ref', 'estimate_base', 'naive_base', 'validity', 'validity_reason'])),
    };
  } else if (response.ok() && url.pathname === '/api/v1/estimation/runs') {
    summary = { items: (body?.items ?? []).map((r) => pick(r, ['run_ref', 'outcome', 'requested_by_role', 'counts'])) };
  } else if (response.ok() && url.pathname.startsWith('/api/v1/estimation/runs/')) {
    summary = {
      ...pick(body, ['run_ref', 'outcome', 'requested_by_role', 'method_version']),
      results: (body?.results ?? []).map((r) => ({
        ...pick(r, ['alpha', 'estimate_base', 'naive_base', 'validity']),
        points: (r.points ?? []).map((point) => [point.kind, point.quantity_base]),
      })),
    };
  }
  served.push({ at: new Date().toISOString(), method, path: url.pathname + url.search, status: response.status(), body: summary });
});
const isRunDetail = (r) => r.method === 'GET' && r.path.startsWith('/api/v1/estimation/runs/');

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
  await clickButton('Generar estimación');
  await waitText('job-status', /^(Terminado|No se ejecutó)$/, 40000);
  // La PWA mantiene su service worker: se espera a la recarga de resultados, no a la red en reposo.
  await sleep(1500);
  return textOf('job-status');
}

try {
  await login(phase === 'admin' ? ids.adminEmail : ids.directorEmail);
  if (phase === 'admin') {
    // A. El Administrador (con funciones de Directiva) genera, espera, consulta y revisa el historial de su objetivo T3.
    const menu = await page.$$eval('nav[aria-label="Navegación principal"] a', (links) => links.map((a) => a.textContent.trim()));
    check('Administrador: «Estimación del consumo» en el menú', menu.includes('Estimación del consumo'), menu.join(', '));
    await open(ids.t3);
    check('Administrador: sin ejecuciones, ninguna cifra', (await page.content()).includes('Todavía no hay ninguna estimación'));
    check('Administrador: el trabajo termina', (await requestAndWait()) === 'Terminado', await textOf('job-status'));
    await waitText('result-Herbicida de ensayo', /Vigente/);
    await waitText('result-Herbicida de ensayo', /0,50/);
    const post = served.find((r) => r.method === 'POST' && r.path === '/api/v1/estimation/jobs');
    check(
      'servidor: POST /jobs → 202, en cola, rol ADMINISTRADOR',
      post?.status === 202 && post.body?.status === 'QUEUED' && post.body?.requested_by_role === 'ADMINISTRADOR',
      JSON.stringify(post),
    );
    const polled = served.filter((r) => r.method === 'GET' && r.path.startsWith('/api/v1/estimation/jobs/'));
    const finished = polled.at(-1);
    check(
      'servidor: GET /jobs/{id} → 200 hasta COMPLETED con su ejecución',
      polled.length > 0 && polled.every((r) => r.status === 200) && finished?.body?.status === 'COMPLETED' && Boolean(finished.body.run_ref),
      polled.map((r) => r.body?.status).join(' → '),
    );
    const read = served.filter((r) => r.path.startsWith('/api/v1/estimation/results')).at(-1);
    const herbicide = read?.body?.results?.[0];
    check(
      'servidor: GET /results → 200, perfil institucional, 111000.000000 y 116000, CURRENT',
      read?.status === 200 && read.body.profile === 'INSTITUTIONAL' && herbicide?.estimate_base === '111000.000000' && herbicide?.naive_base === '116000' && herbicide?.validity === 'CURRENT',
      JSON.stringify(read?.body),
    );
    check('pantalla = servidor: SES 111 L (111.000 mL)', (await rowCell('Herbicida de ensayo', 'estimate')) === '111 L111.000 mL', await rowCell('Herbicida de ensayo', 'estimate'));
    check('pantalla = servidor: naive 116 L (116.000 mL)', (await rowCell('Herbicida de ensayo', 'naive')) === '116 L116.000 mL', await rowCell('Herbicida de ensayo', 'naive'));
    const detailRead = served.filter(isRunDetail).at(-1);
    check(
      'servidor: GET /runs/{id} → 200, α 0.50, rol ADMINISTRADOR',
      detailRead?.status === 200 && detailRead.body?.results?.[0]?.alpha === '0.50' && detailRead.body?.requested_by_role === 'ADMINISTRADOR',
      JSON.stringify(detailRead?.body?.results?.[0]?.points),
    );
    check('pantalla: α 0,50', (await rowCell('Herbicida de ensayo', 'alpha')) === '0,50', await rowCell('Herbicida de ensayo', 'alpha'));
    check('pantalla: lo observado como W4, 96 · 120 · 104 · 116 L', (await rowCell('Herbicida de ensayo', 'observed-values')) === '96 · 120 · 104 · 116 L', await rowCell('Herbicida de ensayo', 'observed-values'));
    const list = served.filter((r) => r.method === 'GET' && r.path.startsWith('/api/v1/estimation/runs?')).at(-1);
    check(
      'servidor: GET /runs → 200 con 1 ejecución calculada del Administrador',
      list?.status === 200 && list.body.items.length === 1 && list.body.items[0].outcome === 'CALCULATED' && list.body.items[0].requested_by_role === 'ADMINISTRADOR',
      JSON.stringify(list?.body),
    );
    check('pantalla: historial con 1 ejecución', (await page.$$('[data-testid="history-item"]')).length === 1);
    await shot('11-administrador-generado');
    await clickButton('Ver detalle');
    await page.waitForSelector('[data-testid="run-detail"]', { timeout: 10000 });
    const detail = await textOf('run-detail');
    check('detalle: serie 96, 120, 104 y 116 L de esa ejecución, Vigente', ['96 L', '120 L', '104 L', '116 L', 'Vigente'].every((q) => detail?.includes(q)), detail?.slice(0, 200));
    check('servidor: ningún 4xx ni 5xx en el recorrido del Administrador', served.every((r) => r.status < 400), served.filter((r) => r.status >= 400).map((r) => `${r.status} ${r.path}`).join(', '));
    await shot('12-administrador-detalle');
  } else if (phase === 'provisional') {
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
    await waitText('result-Herbicida de ensayo', /0,50/);
    check('SES 111 L (111.000 mL en unidad base)', estimate === '111 L111.000 mL', estimate);
    check('naive 116 L (116.000 mL en unidad base)', naive === '116 L116.000 mL', naive);
    check('α 0,50 del detalle de la ejecución', (await rowCell('Herbicida de ensayo', 'alpha')) === '0,50', await rowCell('Herbicida de ensayo', 'alpha'));
    check('campañas observadas: 4', /^4: /.test((await rowCell('Herbicida de ensayo', 'observed-span')) ?? ''), await rowCell('Herbicida de ensayo', 'observed-span'));
    check('lo observado como W4: 96 · 120 · 104 · 116 L', (await rowCell('Herbicida de ensayo', 'observed-values')) === '96 · 120 · 104 · 116 L', await rowCell('Herbicida de ensayo', 'observed-values'));
    check('vigencia: Vigente', (await rowCell('Herbicida de ensayo', 'validity')) === 'Vigente', await rowCell('Herbicida de ensayo', 'validity'));
    await shot('02-calculado-vigente');

    // 3. La exportación coincide con la respuesta del servicio.
    const servedResults = lastResults;
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
      servedResults !== null &&
      exported.length === servedResults.results.length &&
      servedResults.results.every((r, i) =>
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
    check('fuente retirada: la campaña aparece «oculto» en lo observado', (await rowCell('Herbicida de ensayo', 'observed-values')) === '96 · 120 · 104 · oculto L', await rowCell('Herbicida de ensayo', 'observed-values'));
    await shot('06-fuente-retirada');

    // 8. Datos insuficientes: el motivo, sin cifra.
    await open(ids.t2);
    check('datos insuficientes: termina', (await requestAndWait()) === 'Terminado');
    await waitText('result-Fungicida de ensayo', /Datos insuficientes/);
    check('datos insuficientes: motivo', /menos de tres campañas comparables consecutivas/.test((await rowCell('Fungicida de ensayo', 'reason')) ?? ''), await rowCell('Fungicida de ensayo', 'reason'));
    check('datos insuficientes: sin cifra', (await rowCell('Fungicida de ensayo', 'estimate')) === 'Sin cifra' && (await rowCell('Fungicida de ensayo', 'naive')) === 'Sin cifra');
    await shot('07-datos-insuficientes');

    // 8b. Sin conexión con cifras a la vista: se conservan marcadas y no se exportan (el CSV no es la copia sin conexión).
    await page.setOfflineMode(true);
    await clickButton('Ver detalle');
    await page.waitForSelector('[data-testid="error-offline"]', { timeout: 15000 });
    check('sin conexión con cifras: se conservan marcadas como no actualizadas', (await page.$('[data-testid="stale"]')) !== null && (await page.$('[data-testid="result-Fungicida de ensayo"]')) !== null);
    const [exportButton] = await page.$$('xpath/.//button[normalize-space(.)="Exportar CSV de la consulta"]');
    const exportDisabled = exportButton ? await exportButton.evaluate((b) => b.disabled) : null;
    check('sin conexión con cifras: «Exportar CSV de la consulta» desactivado', exportDisabled === true, exportDisabled);
    await shot('13-sin-conexion-sin-exportar');
    await page.setOfflineMode(false);

    // 9. La Directiva pierde el rol con la pantalla abierta: 403 y nada institucional a la vista.
    await open(ids.t1);
    await page.waitForSelector('[data-testid="history-item"]');
    await waitText('result-Herbicida de ensayo', /Desactualizado/);
    control('demote');
    // El cliente no recibe avisos del servidor: hasta su siguiente consulta, lo mostrado sigue a la vista.
    await sleep(1500);
    check(
      'permiso perdido: sin consulta nueva, la pantalla todavía no lo sabe',
      (await page.$('[data-testid="result-Herbicida de ensayo"]')) !== null && (await page.$('[data-testid="error-forbidden"]')) === null,
    );
    const [firstDetail] = await page.$$('xpath/.//li[@data-testid="history-item"]//button[normalize-space(.)="Ver detalle"]');
    await firstDetail.click();
    await page.waitForSelector('[data-testid="error-forbidden"]', { timeout: 10000 });
    check('permiso perdido: aviso de permiso', /ya no tiene acceso/.test((await textOf('error-forbidden')) ?? ''));
    check('permiso perdido: sin resultados ni historial', (await page.$('[data-testid^="result-"]')) === null && (await page.$('[data-testid="history-item"]')) === null);
    check('permiso perdido: sin solicitud', (await page.$$('xpath/.//button[normalize-space(.)="Generar estimación"]')).length === 0);
    const rejected = served.filter((r) => r.status === 403).at(-1);
    check('permiso perdido: la consulta siguiente recibe 403 del servidor', Boolean(rejected), rejected ? `${rejected.method} ${rejected.path}` : '');
    await shot('08-permiso-perdido');
    control('promote');
  } else {
    // 10. Política pendiente (proceso sin modo provisional): ni solicitud ni cifras (EST-D-10).
    await open(ids.t1);
    await page.waitForSelector('[data-testid="error-policy"]', { timeout: 15000 });
    check('política pendiente: aviso', /no se solicita ni se muestra ninguna estimación/.test((await textOf('error-policy')) ?? ''));
    check('política pendiente: sin resultados', (await page.$('[data-testid^="result-"]')) === null);
    check('política pendiente: sin solicitud', (await page.$$('xpath/.//button[normalize-space(.)="Generar estimación"]')).length === 0);
    check('política pendiente: el servidor responde 409 POLICY_PENDING', served.some((r) => r.status === 409 && r.body?.message === 'POLICY_PENDING'));
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
  writeFileSync(join(out, `respuestas-${phase}.json`), `${JSON.stringify(served, null, 2)}\n`);
  const failed = checks.filter((c) => !c.ok);
  process.stdout.write(`${phase}: ${checks.length - failed.length}/${checks.length} comprobaciones${failed.length ? `; fallan: ${failed.map((c) => c.name).join(' | ')}` : ''}\n`);
  process.exitCode = failed.length ? 1 : 0;
}
