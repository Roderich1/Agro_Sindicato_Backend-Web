/**
 * F12-EST-07-WEB (#180): recorrido de la copia de la estimación para consultar
 * sin conexión, contra el backend REAL (`node dist/main.js` con su trabajador) y
 * PostgreSQL desechable, con datos SINTÉTICOS. Navegador Edge/Chrome sin interfaz
 * con puppeteer-core (instalado aparte) y un perfil de navegador persistente
 * entre fases, para que la IndexedDB y la cookie de sesión sean las reales.
 *
 *   node recorrido-copia.mjs <fase: copia|pendiente> <salida>
 *
 * Entorno: WEB_URL, API_URL, WALK_PASSWORD (sólo en el proceso), BROWSER_PATH,
 * PUPPETEER_HOME, PROFILE_DIR, IDS, BACK_DIR y PG_ADMIN_URL (órdenes de control).
 * Escribe capturas, `recorrido-<fase>.json` y `respuestas-<fase>.json` (resúmenes
 * de las respuestas reales de /estimation/*, sin cabeceras ni tokens). Nunca
 * escribe ni imprime contraseñas ni tokens.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [phase = 'copia', outDir = '.'] = process.argv.slice(2);
const { WEB_URL, API_URL, WALK_PASSWORD, BROWSER_PATH, PUPPETEER_HOME, PROFILE_DIR, IDS, BACK_DIR } = process.env;
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
const ids = JSON.parse(readFileSync(IDS, 'utf8'));
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(outDir);
mkdirSync(out, { recursive: true });
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 500) });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const control = (order) => execFileSync(process.execPath, [join(here, 'control-sintetico.cjs'), order, IDS], { cwd: BACK_DIR, env: process.env, encoding: 'utf8' }).trim();
const served = [];
const secrets = new Set();

// El inicio de sesión admite 5 por minuto e IP: el guion no pasa de 4 en cualquier ventana de 61 s.
const logins = [];
async function paceLogin() {
  for (;;) {
    const recent = logins.filter((t) => Date.now() - t < 61000);
    if (recent.length < 4) break;
    await sleep(61000 - (Date.now() - recent[0]) + 250);
  }
  logins.push(Date.now());
}

/** Inicio de sesión por la API, fuera del navegador: el token sólo vive en memoria. */
async function apiSession(email) {
  await paceLogin();
  const res = await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: WALK_PASSWORD }) });
  const body = await res.json();
  if (!res.ok) throw new Error(`login ${res.status}`);
  secrets.add(body.accessToken);
  return (path) => fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${body.accessToken}` } }).then(async (r) => ({ status: r.status, body: await r.json() }));
}

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: true,
  userDataDir: PROFILE_DIR,
  args: ['--lang=es-BO', '--window-size=1440,1100'],
  defaultViewport: { width: 1440, height: 1100 },
});
const page = (await browser.pages())[0] ?? (await browser.newPage());
let lastDownload = null;
page.on('response', async (response) => {
  const url = new URL(response.url());
  if (url.pathname === '/api/v1/auth/login' || url.pathname === '/api/v1/auth/refresh') {
    const body = await response.json().catch(() => null);
    if (body?.accessToken) secrets.add(body.accessToken);
    return;
  }
  if (!url.pathname.startsWith('/api/v1/estimation/')) return;
  const body = await response.json().catch(() => null);
  if (url.pathname === '/api/v1/estimation/download' && response.ok()) lastDownload = body;
  served.push({
    at: new Date().toISOString(), method: response.request().method(), path: url.pathname, status: response.status(),
    profile: body?.profile ?? null, message: response.ok() ? null : body?.message ?? null,
  });
});

async function shot(name) {
  await sleep(500);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
}
/**
 * `inPlace`: rellena el formulario ya abierto, sin recargar. Así se conserva el
 * contexto JS (una descarga retenida sigue esperando) y no se vuelve a pedir el
 * refresh de una sesión anterior.
 */
async function login(email, { inPlace = false } = {}) {
  await paceLogin();
  if (!inPlace) await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.type('#email', email);
  await page.type('#password', WALK_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 15000 });
}
async function open(campaign) {
  await page.goto(`${WEB_URL}/colectivo/estimacion?campaign=${campaign}`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
}
const textOf = (testId) => page.$eval(`[data-testid="${testId}"]`, (el) => el.textContent.trim()).catch(() => null);
const within = (scope, testId) => page.$eval(`[data-testid="${scope}"] [data-testid="${testId}"]`, (el) => el.textContent.trim()).catch(() => null);
async function waitText(testId, pattern, timeout = 30000) {
  await page.waitForFunction((id, src) => new RegExp(src).test(document.querySelector(`[data-testid="${id}"]`)?.textContent ?? ''), { timeout, polling: 250 }, testId, pattern.source);
}
async function clickButton(text) {
  const [button] = await page.$$(`xpath/.//button[normalize-space(.)="${text}"]`);
  if (!button) throw new Error(`No hay botón "${text}"`);
  await button.click();
}
async function logout() {
  // El botón visible (la barra lateral tiene su versión según el ancho).
  const clicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Cerrar sesión') && b.offsetParent !== null);
    button?.click();
    return Boolean(button);
  });
  if (!clicked) throw new Error('No hay botón visible "Cerrar sesión"');
  await page.waitForFunction(() => location.pathname === '/login', { timeout: 15000 });
  await sleep(800);
}
async function generate(campaign) {
  await open(campaign);
  await clickButton('Generar estimación');
  await waitText('job-status', /^(Terminado|No se ejecutó)$/, 40000);
  await sleep(1500);
  return textOf('job-status');
}
async function downloadCopy() {
  lastDownload = null;
  await clickButton('Descargar copia para consultar sin conexión');
  await page.waitForSelector('[data-testid="copy-note"]', { timeout: 15000 });
  return textOf('copy-note');
}
/** Las copias tal como están en la IndexedDB del navegador. */
const copies = () =>
  page.evaluate(
    () =>
      new Promise((resolveCopies, reject) => {
        const req = indexedDB.open('agrocuentas-estimacion', 1);
        req.onupgradeneeded = () => req.result.objectStoreNames.contains('copias') || req.result.createObjectStore('copias', { keyPath: 'key' });
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const all = db.transaction('copias', 'readonly').objectStore('copias').getAll();
          all.onsuccess = () => {
            resolveCopies(all.result);
            db.close();
          };
          all.onerror = () => reject(all.error);
        };
      }),
  );
/** Lo que el service worker tiene en Cache Storage: nunca una respuesta del API. */
const cachedUrls = () =>
  page.evaluate(async () => {
    const urls = [];
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
    return urls;
  });
/** JSON con las claves ordenadas: compara contenido, no el orden de las propiedades. */
const canonical = (value) =>
  JSON.stringify(value, (_key, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v));
const noSecrets = (value) => {
  const text = JSON.stringify(value);
  return ![...secrets].some((s) => s && text.includes(s)) && !/"(access_?token|refresh_?token|password|authorization)"/i.test(text);
};

try {
  if (phase === 'copia') {
    // 1. Directiva A genera dos estimaciones con el trabajador real.
    await login(ids.directorEmail);
    check('genera invierno (trabajador real)', (await generate(ids.t1)) === 'Terminado', await textOf('job-status'));
    check('genera verano (datos insuficientes)', (await generate(ids.t2)) === 'Terminado', await textOf('job-status'));

    // 2. Perfiles de GET /download por la API: Agricultor sin naive, cobertura ni serie.
    const asDirector = await apiSession(ids.directorEmail);
    const asFarmer = await apiSession(ids.farmerEmail);
    const institutional = await asDirector(`/estimation/download?target_campaign_ref=${ids.t1}`);
    const results = await asDirector(`/estimation/results?target_campaign_ref=${ids.t1}`);
    const farmer = await asFarmer(`/estimation/download?target_campaign_ref=${ids.t1}`);
    check('API: Directiva → 200 INSTITUTIONAL con subject, fechas, vigencia al descargar y storage',
      institutional.status === 200 && institutional.body.profile === 'INSTITUTIONAL' && institutional.body.subject.member_ref === ids.directorMember &&
      institutional.body.may_be_outdated === true && institutional.body.storage?.backup === 'EXCLUDED_FROM_PRIVATE_BACKUP' &&
      institutional.body.results[0]?.validity_at_download === 'CURRENT' && institutional.body.results[0]?.naive_base === '116000',
      JSON.stringify(institutional.body.results?.[0]));
    check('API: la copia es la misma selección que /results (salvo la vigencia, que es la de la descarga)',
      canonical(institutional.body.results.map(({ validity_at_download, ...r }) => ({ ...r, validity: validity_at_download }))) === canonical(results.body.results));
    check('API: Agricultor → 200 FARMER sin naive, cobertura, puntos ni serie',
      farmer.status === 200 && farmer.body.profile === 'FARMER' && farmer.body.subject.member_ref === ids.farmerMember &&
      !/"naive_base"|"coverage"|"points"|"series"|"quantity_base"/.test(JSON.stringify(farmer.body)) && farmer.body.results[0]?.estimate_base === '111000.000000',
      JSON.stringify(farmer.body.results?.[0]));
    writeFileSync(join(out, 'download-perfiles.json'), `${JSON.stringify({ institutional: institutional.body, farmer: farmer.body }, null, 2)}\n`);

    // 3. Descarga explícita en la Web: IndexedDB con la respuesta exacta, sin credenciales; el SW no guarda nada del API.
    await open(ids.t1);
    check('descarga invierno: guardada', (await downloadCopy()) === 'Copia guardada en este navegador.');
    await open(ids.t2);
    check('descarga verano: guardada', (await downloadCopy()) === 'Copia guardada en este navegador.');
    const stored = await copies();
    const winterCopy = stored.find((c) => c.download.target.campaign_ref === ids.t1);
    check('IndexedDB: dos copias de la Directiva A en el sindicato A', stored.length === 2 && stored.every((c) => c.owner.userId === ids.directorUser && c.owner.tenantId === ids.tenant), stored.map((c) => c.key).join(', '));
    check('IndexedDB: la copia de verano es la respuesta exacta de GET /download', JSON.stringify(stored.find((c) => c.download.target.campaign_ref === ids.t2)?.download) === JSON.stringify(lastDownload));
    check('IndexedDB: formato v1, identidad y fechas; ninguna credencial', winterCopy?.format_version === 1 && winterCopy.download.downloaded_at && winterCopy.saved_at && noSecrets(stored));
    const cached = await cachedUrls();
    check('Cache Storage: sólo el app-shell, ninguna respuesta /api/', cached.length > 0 && !cached.some((u) => u.includes('/api/')), `${cached.length} entradas`);
    await shot('01-copia-descargada');

    // 4. Sin conexión con sesión en memoria: la copia del contexto, con fechas, vigencia al descargar y actual desconocida.
    await page.setOfflineMode(true);
    await page.select('#campaign-picker', ids.t1);
    await page.waitForSelector('[data-testid="error-offline"]', { timeout: 15000 });
    await page.waitForSelector(`[data-testid="copy-${ids.t1}"]`, { timeout: 10000 });
    const view = `copy-${ids.t1}`;
    check('sin conexión: SES 111 L (111.000 mL) y naive 116 L, como al descargar',
      (await within(view, 'copy-estimate')) === '111 L111.000 mL' && (await within(view, 'copy-naive')) === '116 L116.000 mL', await within(view, 'copy-estimate'));
    check('sin conexión: vigencia al descargar «Vigente» y vigencia actual «Desconocida sin conexión»',
      (await within(view, 'copy-validity')) === 'Vigente' && (await within(view, 'copy-current')) === 'Desconocida sin conexión');
    check('sin conexión: fecha de descarga, período y aviso de posible desactualización',
      /Descargada el .* \(hora del servidor\)/.test((await within(view, 'copy-downloaded')) ?? '') && /Período objetivo/.test((await within(view, 'copy-period')) ?? '') &&
      /Puede estar desactualizada/.test((await within(view, 'copy-outdated')) ?? ''));
    check('sin conexión: fecha de generación de la copia = generated_at de la descarga',
      Boolean(await within(view, 'copy-generated')) && winterCopy.download.results[0].generated_at === institutional.body.results[0].generated_at);
    await shot('02-sin-conexion-con-copia');
    await page.select('#campaign-picker', ids.t3);
    await waitText('copy-status', /No hay una estimación descargada de esta campaña/, 15000);
    check('sin conexión y sin copia de esta campaña: el aviso, ninguna cifra', (await page.$(`[data-testid="copy-${ids.t3}"]`)) === null && !/\d+ L/.test((await textOf('copy-status')) ?? ''));
    await shot('03-sin-conexion-sin-copia');

    // 5. Recarga de la PWA sin conexión: la sesión no puede comprobarse; la copia se lee desde la entrada sin conexión.
    const servedBeforeReload = served.length;
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await page.waitForFunction(() => location.pathname === '/login', { timeout: 20000 });
    await page.waitForSelector('[data-testid="offline-copy-link"]', { timeout: 10000 });
    check('recarga sin conexión: el login ofrece la copia', true);
    const [link] = await page.$$('xpath/.//a[normalize-space(.)="Consultarla sin conexión"]');
    await link.click();
    await page.waitForSelector(`[data-testid="copy-${ids.t1}"]`, { timeout: 10000 });
    check('recarga sin conexión: invierno con sus cifras', (await within(`copy-${ids.t1}`, 'copy-estimate')) === '111 L111.000 mL');
    check('recarga sin conexión: verano, «Sin cifra» con su motivo, nunca un cero',
      (await within(`copy-${ids.t2}`, 'copy-estimate')) === 'Sin cifra' && /menos de tres campañas/.test((await within(`copy-${ids.t2}`, 'copy-reason')) ?? '') &&
      !/\b0 L\b/.test((await textOf(`copy-${ids.t2}`)) ?? ''));
    check('recarga sin conexión: ninguna respuesta de /estimation en esta lectura', served.length === servedBeforeReload, `${served.length - servedBeforeReload} respuestas`);
    await shot('04-recarga-sin-conexion');

    // 6. Con conexión otra vez, misma sesión: la copia se conserva.
    await page.setOfflineMode(false);
    await open(ids.t1);
    await page.waitForSelector('[data-testid="result-Herbicida de ensayo"]', { timeout: 20000 });
    check('reconexión: misma identidad, las dos copias siguen', (await copies()).length === 2);

    // 7a. Rol perdido detectado al recuperar la sesión (recarga): el servidor la devuelve como Agricultor → sin copia.
    control('demote');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => location.pathname !== '/colectivo/estimacion', { timeout: 15000 });
    await sleep(1500);
    check('rol perdido al recuperar la sesión: fuera de la pantalla institucional', (await page.evaluate(() => location.pathname)) !== '/colectivo/estimacion', await page.evaluate(() => location.pathname));
    check('rol perdido al recuperar la sesión: las copias se retiran de IndexedDB', (await copies()).length === 0);
    await shot('05a-rol-perdido-al-recargar');
    control('promote');

    // 7b. Rol perdido con la pantalla abierta: la consulta siguiente devuelve el perfil de Agricultor → sin cifras y sin copia.
    await open(ids.t1);
    await page.waitForSelector('[data-testid="result-Herbicida de ensayo"]', { timeout: 20000 });
    await downloadCopy();
    check('rol recuperado: una copia nueva', (await copies()).length === 1);
    control('demote');
    await page.select('#campaign-picker', ids.t2);
    await page.waitForSelector('[data-testid="error-forbidden"]', { timeout: 15000 });
    await sleep(1000);
    check('rol perdido con la pantalla abierta: aviso, sin resultados ni panel de copia', (await page.$('[data-testid^="result-"]')) === null && (await page.$('[data-testid="copy-panel"]')) === null);
    check('rol perdido con la pantalla abierta: la copia se retira de IndexedDB', (await copies()).length === 0);
    check('rol perdido: el servidor entregó el perfil FARMER en /results', served.some((r) => r.path.endsWith('/results') && r.profile === 'FARMER'));
    await shot('05b-rol-perdido-pantalla-abierta');
    control('promote');

    // 8. Cierre de sesión: se borra la copia.
    await open(ids.t1);
    await page.waitForSelector('[data-testid="result-Herbicida de ensayo"]', { timeout: 20000 });
    await downloadCopy();
    check('antes de cerrar sesión: una copia', (await copies()).length === 1);
    await logout();
    check('cierre de sesión: ninguna copia en IndexedDB', (await copies()).length === 0);
    check('cierre de sesión: el login no ofrece copia', (await page.$('[data-testid="offline-copy-link"]')) === null);
    await shot('06-sesion-cerrada');

    // 9. Respuesta tardía: la descarga de la Directiva A responde cuando la sesión ya es del Administrador A.
    await login(ids.directorEmail);
    await open(ids.t1);
    await page.waitForSelector('[data-testid="result-Herbicida de ensayo"]', { timeout: 20000 });
    await page.setRequestInterception(true);
    let held = null;
    const hold = (request) => {
      if (request.url().includes('/api/v1/estimation/download') && !held) held = request;
      else request.continue().catch(() => undefined);
    };
    page.on('request', hold);
    await clickButton('Descargar copia para consultar sin conexión');
    for (let i = 0; i < 40 && !held; i++) await sleep(100);
    check('respuesta tardía: la descarga de A queda retenida', Boolean(held));
    await logout();
    await login(ids.adminEmail, { inPlace: true });
    await held.continue();
    await sleep(3000);
    page.off('request', hold);
    await page.setRequestInterception(false);
    const afterLate = await copies();
    check('respuesta tardía: la descarga de A llegó (200) pero no se guardó para nadie', afterLate.length === 0 && served.some((r) => r.path.endsWith('/download') && r.status === 200), JSON.stringify(afterLate.map((c) => c.owner.userId)));

    // 10. Cambio de identidad y de sindicato: el Administrador A descarga; sin conexión recarga; vuelve la conexión y entra la Directiva B.
    await open(ids.t1);
    await page.waitForSelector('[data-testid="result-Herbicida de ensayo"]', { timeout: 20000 });
    await downloadCopy();
    check('Administrador A: una copia suya', (await copies()).every((c) => c.owner.userId === ids.adminUser) && (await copies()).length === 1);
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await page.waitForFunction(() => location.pathname === '/login', { timeout: 20000 });
    await page.setOfflineMode(false);
    await login(ids.directorBEmail, { inPlace: true });
    await sleep(1500);
    const afterB = await copies();
    check('otra identidad de otro sindicato: la copia del Administrador A se borra', afterB.length === 0, JSON.stringify(afterB.map((c) => c.owner.tenantId)));
    await page.goto(`${WEB_URL}/estimacion/copia-sin-conexion`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="copy-none"]', { timeout: 10000 });
    check('Directiva B: no ve ninguna copia', (await page.$('[data-testid^="copy-result-"]')) === null);
    await shot('07-otra-identidad-otro-sindicato');

    // 11. Para la fase pendiente: la Directiva A deja una copia con su sesión abierta.
    await page.goto(`${WEB_URL}/colectivo/estimacion`, { waitUntil: 'domcontentloaded' });
    await sleep(1500);
    await logout();
    await login(ids.directorEmail);
    await open(ids.t1);
    await page.waitForSelector('[data-testid="result-Herbicida de ensayo"]', { timeout: 20000 });
    await downloadCopy();
    check('antes de la política pendiente: una copia de la Directiva A', (await copies()).length === 1);
  } else {
    // 12. Política pendiente (backend reiniciado sin modo provisional), mismo perfil de navegador y misma sesión.
    // La lectura sin conexión no llama a la estimación: sirve para ver la IndexedDB antes de consultar.
    await page.goto(`${WEB_URL}/estimacion/copia-sin-conexion`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`[data-testid="copy-${ids.t1}"]`, { timeout: 15000 });
    check('perfil persistente: la copia de la Directiva A sigue antes de consultar', (await copies()).length === 1);
    await open(ids.t1);
    await page.waitForSelector('[data-testid="error-policy"]', { timeout: 20000 });
    await sleep(1000);
    check('política pendiente: aviso, sin cifras ni panel de copia', (await page.$('[data-testid^="result-"]')) === null && (await page.$('[data-testid="copy-panel"]')) === null);
    check('política pendiente: la copia se retira de IndexedDB', (await copies()).length === 0);
    check('política pendiente: el servidor respondió 409 POLICY_PENDING', served.some((r) => r.status === 409 && r.message === 'POLICY_PENDING'));
    await page.goto(`${WEB_URL}/estimacion/copia-sin-conexion`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="copy-none"]', { timeout: 10000 });
    check('política pendiente: tampoco sin conexión queda copia que leer', true);
    await shot('08-politica-pendiente');
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
