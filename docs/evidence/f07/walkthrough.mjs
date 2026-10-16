/**
 * F07: recorrido Web con datos SINTÉTICOS (Edge/Chrome headless vía
 * puppeteer-core, instalado aparte; no es dependencia del proyecto).
 *
 *   node walkthrough.mjs <fase: provisional|pending> <salida>
 *
 * Entorno: WEB_URL, API_URL, WALK_PASSWORD (sólo en el proceso), BROWSER_PATH.
 * Escribe capturas PNG y `walkthrough-<fase>.json` con comprobaciones. No
 * imprime contraseñas ni tokens.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const [phase = 'provisional', outDir = '.'] = process.argv.slice(2);
const { WEB_URL, API_URL, WALK_PASSWORD, BROWSER_PATH } = process.env;
const out = resolve(outDir);
mkdirSync(out, { recursive: true });
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: true,
  args: ['--lang=es-BO', '--window-size=1440,1000'],
  defaultViewport: { width: 1440, height: 1000 },
});
const page = await browser.newPage();
const downloads = join(out, 'downloads');
mkdirSync(downloads, { recursive: true });
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });

async function shot(name) {
  await sleep(600);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
}

async function login(email) {
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', email);
  await page.type('#password', WALK_PASSWORD);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button[type="submit"]')]);
  // La raíz redirige en el cliente según el rol.
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 15000 });
}

async function logout() {
  // Hay dos menús (móvil oculto y escritorio): se pulsa el botón visible.
  for (const button of await page.$$('xpath/.//button[contains(., "Cerrar sesión")]')) {
    if (await button.boundingBox()) {
      await button.click();
      break;
    }
  }
  await page.waitForFunction(() => location.pathname === '/login', { timeout: 10000 });
}

async function clickText(text, tag = 'button') {
  const [element] = await page.$$(`xpath/.//${tag}[normalize-space(.)="${text}"]`);
  if (!element) throw new Error(`No ${tag} "${text}"`);
  await element.click();
}

// Celdas separadas por ' | ' para no concatenar columnas contiguas.
const rowText = (element) => {
  const cells = [...element.querySelectorAll('td')];
  return cells.length ? cells.map((td) => td.textContent.trim()).join(' | ') : element.textContent ?? '';
};
const text = (selector) => page.$eval(selector, rowText).catch(() => null);
/** Ítems visibles del menú lateral (el menú móvil oculto no cuenta). */
async function menuItems() {
  await page.waitForFunction(
    () => [...document.querySelectorAll('nav[aria-label="Navegación principal"] a')].some((a) => a.offsetParent !== null),
    { timeout: 15000 },
  );
  return page.$$eval('nav[aria-label="Navegación principal"] a', (links) =>
    links.filter((a) => a.offsetParent !== null).map((a) => a.textContent.trim()));
}
const campaignValue = (name) =>
  page.$$eval('#campaign-picker option', (options, wanted) => options.find((o) => o.textContent.startsWith(wanted))?.value, name);

async function pick(name) {
  await page.waitForFunction(
    (wanted) => [...document.querySelectorAll('#campaign-picker option')].some((o) => o.textContent.startsWith(wanted)),
    { timeout: 15000 },
    name,
  );
  const value = await campaignValue(name);
  await page.select('#campaign-picker', value);
  await page.waitForNetworkIdle({ idleTime: 500 });
  return value;
}

async function api(path, token, method = 'GET') {
  const res = await fetch(`${API_URL}/api/v1${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.text() };
}

async function apiLogin(email) {
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: WALK_PASSWORD }),
  });
  return (await res.json()).accessToken;
}

const C1 = 'Campaña Verano 2026 (sintética)';

try {
if (phase === 'provisional') {
  // 1. Directiva: aterriza en el resumen; etapa RAW.
  await login('directiva@f07.example.test');
  check('Directiva aterriza en /colectivo/resumen', page.url().includes('/colectivo/resumen'), page.url());
  const menu = await menuItems();
  check('Menú congelado de Directiva', JSON.stringify(menu) === JSON.stringify(['Resumen colectivo', 'Necesidades y propuesta', 'Cobertura', 'Reconciliación', 'Campanas']), menu.join(' | '));
  const c1 = await pick(C1);
  await page.waitForSelector('[data-testid="cell-DECLARED_NEED-Urea F06-G"]');
  const raw = {
    urea: await text('[data-testid="cell-DECLARED_NEED-Urea F06-G"]'),
    belator: await text('[data-testid="cell-DECLARED_NEED-Belator-ML"]'),
    bellator: await text('[data-testid="cell-DECLARED_NEED-Bellator-ML"]'),
    glifosatoConsumo: await text('[data-testid="cell-CONSUMPTION_TOTAL-Glifosato F06-ML"]'),
    coverage: await text('[data-testid="coverage"]'),
  };
  check('RAW Urea necesidad = 25 KG / 3 (incluye un cero explícito)', /\| 25 KG \| 3 \|/.test(raw.urea), raw.urea);
  check('RAW Belator suprimida, sin cifra (7000 ML ocultos)', /Menos de 3/.test(raw.belator) && !/\d+([.,]\d+)? L/.test(raw.belator), raw.belator);
  check('RAW Bellator suprimida, sin cifra (4000 ML ocultos)', /Menos de 3/.test(raw.bellator) && !/\d+([.,]\d+)? L/.test(raw.bellator), raw.bellator);
  check('RAW consumo Glifosato = 8,25 L / 3', /\| 8,25 L \| 3 \|/.test(raw.glifosatoConsumo), raw.glifosatoConsumo);
  check('Cobertura 3 de 4 (ausencia ≠ cero)', /3 de 4/.test(raw.coverage) && /desconocido, no cero/.test(raw.coverage), raw.coverage);
  check('Glifosato necesidad C1 cancelada: ausente', (await page.$('[data-testid="cell-DECLARED_NEED-Glifosato F06-ML"]')) === null);
  await shot('01-resumen-c1-raw');

  // 2. Propuesta RAW y regeneración.
  await page.goto(`${WEB_URL}/colectivo/propuestas?campaign=${c1}`, { waitUntil: 'networkidle0' });
  await clickText('Generar propuesta (borrador)');
  await page.waitForSelector('[data-testid="line-Urea F06-G"]');
  const rawLines = await page.$$eval('[data-testid^="line-"]', (rows) =>
    rows.map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent.trim()).join(' | ')));
  check('Propuesta RAW: 3 líneas, sólo Urea con cifra', rawLines.length === 3 && rawLines.filter((l) => /\| \d+([.,]\d+)? (KG|L) \|/.test(l)).length === 1, rawLines.join(' || '));
  await sleep(1200);
  await clickText('Generar propuesta (borrador)');
  await page.waitForNetworkIdle({ idleTime: 700 });
  const fingerprints = await page.$$eval('[aria-label="Historial de borradores"] code', (codes) => codes.map((c) => c.getAttribute('title')));
  check('Regenerar sin cambios: misma huella', fingerprints.length === 2 && fingerprints[0] === fingerprints[1], fingerprints.join(' '));
  await shot('02-propuesta-c1-raw-regenerada');

  // 3. Reconciliación Bellator → Belator con confirmación explícita.
  await page.goto(`${WEB_URL}/colectivo/reconciliacion`, { waitUntil: 'networkidle0' });
  const [bellatorRow] = await page.$$('[data-testid="product-Bellator"]');
  const [associate] = await bellatorRow.$$('xpath/.//button[normalize-space(.)="Asociar…"]');
  await associate.click();
  await page.waitForSelector('#canonical');
  const belatorValue = await page.$$eval('#canonical option', (o) => o.find((x) => x.textContent.startsWith('Belator ('))?.value);
  await page.select('#canonical', belatorValue);
  await page.type('#reason', 'Misma formulación (dataset sintético D4)');
  const disabledBefore = await page.$eval('xpath/.//button[normalize-space(.)="Confirmar asociación"]', (b) => b.disabled);
  check('Sin marcar la confirmación no se puede asociar', disabledBefore === true);
  await page.click('input[type="checkbox"]');
  await shot('03-reconciliacion-confirmacion');
  await clickText('Confirmar asociación');
  await page.waitForSelector('[data-testid="current-Bellator"]');
  await shot('04-reconciliacion-historial');

  // 4. Resumen CANONICAL.
  await page.goto(`${WEB_URL}/colectivo/resumen?campaign=${c1}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="cell-DECLARED_NEED-Belator-ML"]');
  const canonical = {
    belator: await text('[data-testid="cell-DECLARED_NEED-Belator-ML"]'),
    belatorConsumo: await text('[data-testid="cell-CONSUMPTION_TOTAL-Belator-ML"]'),
    bellator: await page.$('[data-testid="cell-DECLARED_NEED-Bellator-ML"]'),
  };
  check('CANONICAL Belator necesidad = 11 L / 3', /\| 11 L \| 3 \|/.test(canonical.belator), canonical.belator);
  check('CANONICAL Belator consumo = 8 L / 3', /\| 8 L \| 3 \|/.test(canonical.belatorConsumo), canonical.belatorConsumo);
  check('Bellator ya no es una fila propia', canonical.bellator === null);
  await shot('05-resumen-c1-canonico');

  // 5. Propuesta regenerada tras la asociación + CSV.
  await page.goto(`${WEB_URL}/colectivo/propuestas?campaign=${c1}`, { waitUntil: 'networkidle0' });
  await clickText('Generar propuesta (borrador)');
  await page.waitForSelector('[data-testid="line-Belator-ML"]');
  const belatorLine = await text('[data-testid="line-Belator-ML"]');
  check('Propuesta regenerada: Belator 11 L', /\| 11 L \| 3 \|/.test(belatorLine), belatorLine);
  const fp = await page.$$eval('[aria-label="Historial de borradores"] code', (codes) => codes.map((c) => c.getAttribute('title')));
  check('La asociación cambia la huella', fp.length === 3 && fp[0] !== fp[1] && fp[1] === fp[2], fp.join(' '));
  await clickText('Exportar CSV');
  await sleep(2000);
  const csvFile = readdirSync(downloads).find((f) => f.endsWith('.csv'));
  const csv = csvFile ? readFileSync(join(downloads, csvFile), 'utf8') : '';
  check('CSV descargado del servidor con Belator 11000', /,Belator,ML,L,DISCLOSED,11000,11,3,/.test(csv), csvFile ?? 'sin archivo');
  if (csv) writeFileSync(join(out, 'propuesta-c1-canonica.csv'), csv);
  await shot('06-propuesta-c1-canonica');

  // 6. Cobertura agregada.
  await page.goto(`${WEB_URL}/colectivo/cobertura?campaign=${c1}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="coverage"]');
  await shot('07-cobertura');
  await logout();

  // 7. Presidente (ADMINISTRADOR del tenant): menú con Usuarios.
  await login('presidente@f07.example.test');
  const adminMenu = await menuItems();
  check('Menú de ADMINISTRADOR = Directiva + Usuarios', adminMenu.at(-1) === 'Usuarios' && adminMenu.includes('Reconciliación'), adminMenu.join(' | '));
  await shot('08-menu-administrador');
  await logout();

  // 8. Agricultor: rutas colectivas redirigen; API 403.
  await login('f1@f07.example.test');
  await page.goto(`${WEB_URL}/colectivo/propuestas`, { waitUntil: 'networkidle0' });
  check('AGRICULTOR redirigido fuera de /colectivo', !page.url().includes('/colectivo'), page.url());
  const farmerMenu = await menuItems();
  check('AGRICULTOR no ve vistas colectivas en el menú', !farmerMenu.some((l) => /colectivo|propuesta|Reconciliación|Cobertura/i.test(l)), farmerMenu.join(' | '));
  await shot('09-agricultor-redirigido');
  await logout();

  // 9. API: Auth V1 de la Web; agricultor 403, tenant ajeno 404, sin sesión 401.
  const farmer = await apiLogin('f1@f07.example.test');
  const other = await apiLogin('ajena@f07.example.test');
  for (const path of [`/collective/campaigns/${c1}/summary`, `/collective/campaigns/${c1}/proposals`]) {
    const f = await api(path, farmer);
    const o = await api(path, other);
    const n = await api(path, null);
    check(`API ${path}: AGRICULTOR 403, ajeno 404, sin sesión 401`, f.status === 403 && o.status === 404 && n.status === 401, `${f.status}/${o.status}/${n.status}`);
    check(`API ${path}: ninguna respuesta denegada contiene cifras`, ![f, o, n].some((r) => /11000|25000/.test(r.body)));
  }
}

if (phase === 'pending') {
  // API sin modo provisional: política pendiente.
  await login('directiva@f07.example.test');
  const c1 = await pick(C1);
  await page.waitForNetworkIdle({ idleTime: 500 });
  const body = await page.$eval('main', (m) => m.textContent);
  check('POLICY_PENDING: aviso y ninguna tabla', /Política de divulgación pendiente/.test(body) && (await page.$('main table')) === null);
  await shot('10-resumen-policy-pending');
  await page.goto(`${WEB_URL}/colectivo/propuestas?campaign=${c1}`, { waitUntil: 'networkidle0' });
  await clickText('Generar propuesta (borrador)');
  await page.waitForNetworkIdle({ idleTime: 700 });
  const after = await page.$eval('main', (m) => m.textContent);
  check('POLICY_PENDING: generar se rechaza sin guardar', /no se genera ni se guarda/.test(after));
  const [first] = await page.$$('xpath/.//button[normalize-space(.)="Ver"]');
  await first.click();
  await page.waitForSelector('[aria-label="Detalle del borrador"]');
  const detail = await page.$eval('[aria-label="Detalle del borrador"]', (d) => d.textContent);
  check('Borrador anterior bajo POLICY_PENDING: sin cifras', /no se muestran cifras/.test(detail) && !/\d+([.,]\d+)? (KG|L)\b/.test(detail));
  await shot('11-propuesta-policy-pending');
}

} catch (error) {
  // Diagnóstico: captura y URL del fallo; la comprobación queda en FALLO.
  await page.screenshot({ path: join(out, `error-${phase}.png`), fullPage: true }).catch(() => undefined);
  check(`Recorrido ${phase} completo`, false, `${page.url()} — ${error.message.split('\n')[0]}`);
}
await browser.close();
writeFileSync(join(out, `walkthrough-${phase}.json`), `${JSON.stringify({ phase, date: new Date().toISOString(), checks }, null, 2)}\n`);
const failed = checks.filter((c) => !c.ok);
process.stdout.write(`${phase}: ${checks.length - failed.length}/${checks.length} comprobaciones OK\n`);
for (const c of failed) process.stdout.write(`FALLO: ${c.name} — ${c.detail}\n`);
process.exitCode = failed.length ? 1 : 0;
