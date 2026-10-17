/**
 * F10 (RNF-08): matriz de compatibilidad Web B1/B2, flujos W1–W5 del protocolo
 * v1.1 §2.3, con el dataset sintético D4 (Back/scripts/f07-synthetic-seed.cjs)
 * y la Web compilada.
 *
 *   node compat.mjs <salida>
 *
 * Entorno: WEB_URL, API_URL, WALK_PASSWORD (sólo en el proceso), BROWSER_PATH,
 * BROWSER_LABEL (B1-chrome | B2-edge), VIEWPORT (1366x768 | 1920x1080),
 * ORACLE (ruta a F06_EXPECTED_CELLS.csv).
 *
 * Cada comprobación queda como CUMPLE/NO CUMPLE con su detalle. Un flujo
 * (W1–W5) CUMPLE sólo si todas sus comprobaciones cumplen. No imprime secretos.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const [outDir = '.'] = process.argv.slice(2);
const { WEB_URL, API_URL, WALK_PASSWORD, BROWSER_PATH, BROWSER_LABEL = 'browser', VIEWPORT = '1366x768', ORACLE } = process.env;
const [width, height] = VIEWPORT.split('x').map(Number);
const label = `${BROWSER_LABEL}-${VIEWPORT}`;
const out = resolve(outDir, label);
mkdirSync(out, { recursive: true });
const checks = [];
const check = (flow, name, ok, detail = '') => checks.push({ flow, name, ok: Boolean(ok), detail: String(detail).slice(0, 300) });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const oracle = (() => {
  const [header, ...rows] = readFileSync(ORACLE, 'utf8').trim().split(/\r?\n/).map((l) => l.split(','));
  return rows.map((r) => Object.fromEntries(header.map((k, i) => [k, r[i] ?? ''])));
})();

/** Igual que Web/src/lib/quantity.ts: base → «11,5 L». */
function present(base, unit) {
  const v = BigInt(base);
  const fraction = (v % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  const whole = (v / 1000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${fraction ? `${whole},${fraction}` : whole} ${unit === 'ML' ? 'L' : 'KG'}`;
}

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: true,
  args: ['--lang=es-BO', `--window-size=${width},${height}`],
  defaultViewport: { width, height },
});
const version = await browser.version();
const page = await browser.newPage();
const downloads = join(out, 'downloads');
mkdirSync(downloads, { recursive: true });
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });

const shot = async (name) => { await sleep(500); await page.screenshot({ path: join(out, `${name}.png`), fullPage: true }); };
const rowText = (el) => {
  const cells = [...el.querySelectorAll('td')];
  return cells.length ? cells.map((td) => td.textContent.trim()).join(' | ') : el.textContent ?? '';
};
const text = (sel) => page.$eval(sel, rowText).catch(() => null);

async function login(email) {
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', email);
  await page.type('#password', WALK_PASSWORD);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 15000 });
}
async function logout() {
  for (const button of await page.$$('xpath/.//button[contains(., "Cerrar sesión")]')) {
    if (await button.boundingBox()) { await button.click(); break; }
  }
  await page.waitForFunction(() => location.pathname === '/login', { timeout: 10000 });
}
async function menuItems() {
  await page.waitForFunction(
    () => [...document.querySelectorAll('nav[aria-label="Navegación principal"] a')].some((a) => a.offsetParent !== null),
    { timeout: 15000 },
  );
  return page.$$eval('nav[aria-label="Navegación principal"] a', (links) => links.filter((a) => a.offsetParent !== null).map((a) => a.textContent.trim()));
}
async function clickText(t) {
  const [el] = await page.$$(`xpath/.//button[normalize-space(.)="${t}"]`);
  if (!el) throw new Error(`No button "${t}"`);
  await el.click();
}
async function pick(name) {
  await page.waitForFunction((w) => [...document.querySelectorAll('#campaign-picker option')].some((o) => o.textContent.startsWith(w)), { timeout: 15000 }, name);
  const value = await page.$$eval('#campaign-picker option', (o, w) => o.find((x) => x.textContent.startsWith(w))?.value, name);
  await page.select('#campaign-picker', value);
  await page.waitForNetworkIdle({ idleTime: 500 });
  return value;
}
async function apiLogin(email) {
  const res = await fetch(`${API_URL}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: WALK_PASSWORD }) });
  return (await res.json()).accessToken;
}
async function api(path, token) {
  const res = await fetch(`${API_URL}/api/v1${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.text() };
}

/** Compara cada celda de la etapa del oráculo con lo que muestra la tabla. */
async function compareOracle(flow, stage) {
  for (const row of oracle.filter((r) => r.stage === stage && r.campaign === 'C1')) {
    const sel = `[data-testid="cell-${row.projection_type}-${row.product}-${row.base_unit}"]`;
    const shown = await text(sel);
    const name = `${stage} ${row.projection_type} ${row.product}: ${row.status}`;
    if (row.status === 'ABSENT') check(flow, `${name} (sin fila, no 0)`, shown === null, shown ?? 'sin fila');
    else if (row.status === 'DISCLOSED') {
      const expected = `| ${present(row.visible_total_base, row.base_unit)} | ${row.visible_contributors} |`;
      check(flow, `${name} = ${expected}`, shown?.includes(expected), shown);
    } else check(flow, `${name} (sin cifra ni conteo)`, shown !== null && /Menos de 3|umbral/.test(shown) && !/\d+([.,]\d+)? (L|KG)\b/.test(shown), shown);
  }
}

const C1 = 'Campaña Verano 2026 (sintética)';
try {
  // W1. Acceso por rol.
  await login('directiva@f07.example.test');
  check('W1', 'Directiva aterriza en /colectivo/resumen', page.url().includes('/colectivo/resumen'), page.url());
  const menu = await menuItems();
  check('W1', 'Menú F07 de Directiva', JSON.stringify(menu) === JSON.stringify(['Resumen colectivo', 'Necesidades y propuesta', 'Cobertura', 'Reconciliación', 'Campanas']), menu.join(' | '));

  // W2. Resumen por campaña (etapa RAW del oráculo D4).
  const c1 = await pick(C1);
  await page.waitForSelector('[data-testid="cell-DECLARED_NEED-Urea F06-G"]');
  await compareOracle('W2', 'RAW');
  const coverage = await text('[data-testid="coverage"]');
  check('W2', 'Cobertura «3 de 4» y ausencia ≠ 0', /3 de 4/.test(coverage) && /desconocido, no cero/.test(coverage), coverage);
  await shot('W2-resumen');

  // W3. Propuesta y CSV.
  await page.goto(`${WEB_URL}/colectivo/propuestas?campaign=${c1}`, { waitUntil: 'networkidle0' });
  await clickText('Generar propuesta (borrador)');
  await page.waitForSelector('[data-testid="line-Urea F06-G"]');
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Historial de borradores"] tbody tr').length === 1, { timeout: 15000 });
  const fp = await page.$$eval('[aria-label="Historial de borradores"] code', (c) => c.map((x) => x.getAttribute('title')));
  check('W3', 'Borrador en el historial con su huella', fp.length === 1 && /^[0-9a-f]{64}$/.test(fp[0] ?? ''), fp.join(' '));
  await clickText('Exportar CSV');
  let csv = '';
  for (let i = 0; i < 20 && !csv; i += 1) {
    await sleep(300);
    const file = readdirSync(downloads).find((f) => f.endsWith('.csv'));
    if (file) csv = readFileSync(join(downloads, file), 'utf8');
  }
  check('W3', 'CSV descargado', csv.length > 0, csv ? `${csv.split(/\r?\n/).length} líneas` : 'sin archivo');
  check('W3', 'CSV: Urea 25000 G exactos y sin NaN', /,Urea F06,G,KG,DISCLOSED,25000,25,3,/.test(csv) && !/NaN|undefined/.test(csv), csv.split(/\r?\n/).find((l) => l.includes('Urea')) ?? '');
  await shot('W3-propuesta');

  // W5. Sin conexión: mensaje claro y nada se encola.
  const director = await apiLogin('directiva@f07.example.test');
  const before = JSON.parse((await api(`/collective/campaigns/${c1}/proposals`, director)).body).length;
  await page.setOfflineMode(true);
  await clickText('Generar propuesta (borrador)');
  await sleep(1500);
  const offlineText = await page.$eval('main', (m) => m.textContent);
  check('W5', 'Mensaje claro sin conexión', /Sin conexión con el servidor/.test(offlineText), offlineText.match(/Sin conexión[^.]*\./)?.[0] ?? '');
  await shot('W5-sin-conexion');
  await page.setOfflineMode(false);
  await sleep(4000);
  const after = JSON.parse((await api(`/collective/campaigns/${c1}/proposals`, director)).body).length;
  check('W5', 'Al reconectar no se envía nada encolado', after === before, `${before} → ${after}`);
  const queued = await page.evaluate(() => Object.keys(localStorage).filter((k) => /queue|offline/i.test(k)).map((k) => `${k}=${localStorage.getItem(k)}`));
  check('W5', 'Sin cola local de operaciones', queued.every((q) => /=(\[\]|null)?$/.test(q)), queued.join(' ') || 'sin claves');

  // W4. Reconciliación con motivo e historial «anterior → nuevo».
  await page.goto(`${WEB_URL}/colectivo/reconciliacion`, { waitUntil: 'networkidle0' });
  const [bellatorRow] = await page.$$('[data-testid="product-Bellator"]');
  const [associate] = await bellatorRow.$$('xpath/.//button[normalize-space(.)="Asociar…"]');
  await associate.click();
  await page.waitForSelector('#canonical');
  const belatorValue = await page.$$eval('#canonical option', (o) => o.find((x) => x.textContent.startsWith('Belator ('))?.value);
  await page.select('#canonical', belatorValue);
  await page.type('#reason', 'Misma formulación (dataset sintético D4)');
  check('W4', 'Sin confirmación no se puede asociar', await page.$eval('xpath/.//button[normalize-space(.)="Confirmar asociación"]', (b) => b.disabled));
  await page.click('input[type="checkbox"]');
  await clickText('Confirmar asociación');
  await page.waitForSelector('[data-testid="current-Bellator"]');
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Historial"] tbody tr').length > 0, { timeout: 15000 });
  const history = await page.$$eval('[aria-label="Historial"] tbody tr', (rows) => rows.map((r) => r.textContent));
  check('W4', 'Historial «Bellator → Belator» con motivo', history.some((h) => h.includes('Bellator → Belator') && h.includes('Misma formulación')), history.join(' || '));
  await shot('W4-reconciliacion');
  await page.goto(`${WEB_URL}/colectivo/resumen?campaign=${c1}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="cell-DECLARED_NEED-Belator-ML"]');
  await compareOracle('W4', 'CANONICAL');
  await logout();

  // W1 (cont.). Administrador y agricultor.
  await login('presidente@f07.example.test');
  const adminMenu = await menuItems();
  check('W1', 'Menú de Administrador = Directiva + Usuarios', adminMenu.at(-1) === 'Usuarios' && adminMenu.includes('Reconciliación'), adminMenu.join(' | '));
  await logout();
  await login('f1@f07.example.test');
  await page.goto(`${WEB_URL}/colectivo/resumen`, { waitUntil: 'networkidle0' });
  check('W1', 'Agricultor redirigido fuera de /colectivo', !page.url().includes('/colectivo'), page.url());
  const farmer = await apiLogin('f1@f07.example.test');
  check('W1', 'API del resumen: agricultor 403', (await api(`/collective/campaigns/${c1}/summary`, farmer)).status === 403);
  await shot('W1-agricultor');
  await logout();
} catch (error) {
  await page.screenshot({ path: join(out, 'error.png'), fullPage: true }).catch(() => undefined);
  check('—', 'Recorrido completo sin excepción', false, `${page.url()} — ${String(error.message).split('\n')[0]}`);
}
await browser.close();

const flows = ['W1', 'W2', 'W3', 'W4', 'W5'].map((flow) => {
  const own = checks.filter((c) => c.flow === flow);
  const aborted = checks.some((c) => c.flow === '—');
  return { flow, result: own.length && own.every((c) => c.ok) && !aborted ? 'CUMPLE' : own.length ? 'NO CUMPLE' : 'NO EJECUTADA', checks: own.length };
});
writeFileSync(join(out, 'compat.json'), `${JSON.stringify({ config: label, browser: version, viewport: VIEWPORT, date: new Date().toISOString(), flows, checks }, null, 2)}\n`);
process.stdout.write(`${label} (${version}): ${flows.map((f) => `${f.flow}=${f.result}`).join(' ')}\n`);
for (const c of checks.filter((c) => !c.ok)) process.stdout.write(`  NO CUMPLE ${c.flow}: ${c.name} — ${c.detail}\n`);
