/**
 * F10 usabilidad, DS-UX Web: contraste del oráculo independiente
 * (oraculo_web.json) con la API y con la Web compiladas, sobre un tenant de
 * VERIFICACIÓN sembrado con Back/scripts/f10-dsux-central-seed.cjs. El tenant
 * queda consumido (W3 asocia y W4 genera un borrador): nunca se usa el de un
 * participante.
 *
 *   node contraste.mjs <salida> <manifiesto.json>
 *
 * Entorno: API_URL, WEB_URL, F10_UX_PASSWORD (sólo en el proceso),
 * BROWSER_PATH, VIEWPORT (1366x768 | 1920x1080), CANONICAL (Bellator |
 * Belator: el sentido de W3 que se ensaya). Política sin tocar: el API corre en
 * provisional-synthetic con NODE_ENV=development (desviación declarada, §0.4).
 *
 * Cada comprobación queda como CUMPLE/NO CUMPLE con su detalle. Si la API o la
 * Web muestran otra cosa que el oráculo, se registra así: no se cambia el
 * valor esperado. No imprime secretos.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const [outDir = '.', manifestPath] = process.argv.slice(2);
const { API_URL, WEB_URL, F10_UX_PASSWORD, BROWSER_PATH, VIEWPORT = '1366x768', CANONICAL = 'Bellator' } = process.env;
if (!['Bellator', 'Belator'].includes(CANONICAL)) throw new Error('CANONICAL must be Bellator or Belator');
const ALIAS = CANONICAL === 'Bellator' ? 'Belator' : 'Bellator';
const here = dirname(fileURLToPath(import.meta.url));
const oracle = JSON.parse(readFileSync(join(here, 'oraculo_web.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const [width, height] = VIEWPORT.split('x').map(Number);
const label = `${manifest.label}-${CANONICAL}-${VIEWPORT}`;
const out = resolve(outDir, label);
mkdirSync(out, { recursive: true });
const checks = [];
const check = (stage, name, ok, detail = '') => checks.push({ stage, name, ok: Boolean(ok), detail: String(detail).slice(0, 400) });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const campaignId = manifest.campaign.id;
const E = oracle.esperado;

/** Igual que Web/src/lib/quantity.ts: base → «150 L». */
function present(base) {
  const v = BigInt(base);
  const fraction = (v % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  const whole = (v / 1000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${fraction ? `${whole},${fraction}` : whole} L`;
}
const coverageText = (c) => `${c.members_with_contribution} de ${c.linked_members} agricultores vinculados con cifras publicadas`;

async function apiLogin(email) {
  const res = await fetch(`${API_URL}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: F10_UX_PASSWORD }) });
  if (res.status !== 200 && res.status !== 201) throw new Error(`login por la API: HTTP ${res.status}`);
  return (await res.json()).accessToken;
}
async function api(path, token) {
  const res = await fetch(`${API_URL}/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: res.status === 200 ? await res.json() : await res.text() };
}

/** Compara las celdas DECLARED_NEED de la API con las esperadas. */
function compareApi(stage, who, summary, expectedCells, expectedCoverage) {
  const cells = summary.cells ?? [];
  check(stage, `${who}: sólo celdas DECLARED_NEED en ML`, cells.every((c) => c.projection_type === 'DECLARED_NEED' && c.base_unit === 'ML'), cells.map((c) => `${c.projection_type}/${c.base_unit}`).join(' '));
  for (const want of expectedCells) {
    const got = cells.find((c) => c.product_name === want.producto);
    check(stage, `${who}: ${want.producto} = ${want.total_base} ML, ${want.aportantes} aportantes, publicada`,
      got && got.status === 'DISCLOSED' && got.total_base === want.total_base && got.total_presentation === want.total_presentacion && got.contributors === want.aportantes,
      got ? `${got.status} ${got.total_base} (${got.total_presentation}) ${got.contributors}` : 'sin fila');
  }
  const cov = summary.coverage ?? {};
  check(stage, `${who}: cobertura ${coverageText(expectedCoverage)}`,
    cov.members_with_contribution === expectedCoverage.members_with_contribution && cov.linked_members === expectedCoverage.linked_members,
    `members_with_contribution=${cov.members_with_contribution} linked_members=${cov.linked_members} suppressed_cells=${cov.suppressed_cells}`);
  check(stage, `${who}: política provisional, k = ${oracle.politica.k}, sin aprobar`,
    summary.disclosure?.mode === oracle.politica.modo && summary.disclosure?.threshold === oracle.politica.k && summary.disclosure?.approved === false,
    JSON.stringify(summary.disclosure));
  return cov;
}

const browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, args: ['--lang=es-BO', `--window-size=${width},${height}`], defaultViewport: { width, height } });
const version = await browser.version();
const page = await browser.newPage();
const downloads = join(out, 'downloads');
mkdirSync(downloads, { recursive: true });
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
const shot = async (name) => { await sleep(500); await page.screenshot({ path: join(out, `${name}.png`), fullPage: true }); };
const rowText = (el) => { const cells = [...el.querySelectorAll('td')]; return cells.length ? cells.map((td) => td.textContent.trim()).join(' | ') : el.textContent ?? ''; };
const text = (sel) => page.$eval(sel, rowText).catch(() => null);
const cellSel = (product) => `[data-testid="cell-DECLARED_NEED-${product}-ML"]`;
async function clickText(t) {
  const [el] = await page.$$(`xpath/.//button[normalize-space(.)="${t}"]`);
  if (!el) throw new Error(`No button "${t}"`);
  await el.click();
}
async function login(email) {
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', email);
  await page.type('#password', F10_UX_PASSWORD);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 15000 });
}
async function openSummary() {
  await page.goto(`${WEB_URL}/colectivo/resumen?campaign=${campaignId}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector(cellSel('Glifosato Demo'), { timeout: 15000 });
}
async function compareWeb(stage, expectedCells, expectedCoverage) {
  for (const want of expectedCells) {
    const shown = await text(cellSel(want.producto));
    const expected = `| ${present(want.total_base)} | ${want.aportantes} |`;
    check(stage, `Web: ${want.producto} ${expected}`, shown?.includes(expected), shown ?? 'sin fila');
  }
  const coverage = await text('[data-testid="coverage"]');
  check(stage, `Web: cobertura «${coverageText(expectedCoverage)}»`, coverage?.includes(coverageText(expectedCoverage)), coverage);
  return coverage;
}

const observed = {};
try {
  const directiva = await apiLogin(manifest.accounts.directiva);
  const presidente = await apiLogin(manifest.accounts.administrador);

  // Antes de W3: valores de W1 y W2, sin asociaciones ni borradores.
  for (const [who, token] of [['Directiva', directiva], ['Administrador', presidente]]) {
    const s = await api(`/collective/campaigns/${campaignId}/summary`, token);
    check('antes_de_W3', `${who}: resumen HTTP 200`, s.status === 200, `HTTP ${s.status}`);
    if (s.status === 200) observed[`antes_${who}`] = compareApi('antes_de_W3', who, s.body, E.antes_de_W3.celdas, E.antes_de_W3.cobertura);
  }
  const assoc = await api('/collective/product-associations', directiva);
  check('antes_de_W3', 'Sin asociación vigente ni historial (W3 parte sin asociación)',
    assoc.status === 200 && assoc.body.current?.length === E.antes_de_W3.asociaciones_vigentes && assoc.body.history?.length === 0,
    `HTTP ${assoc.status} current=${assoc.body?.current?.length} history=${assoc.body?.history?.length}`);
  const proposalsBefore = await api(`/collective/campaigns/${campaignId}/proposals`, directiva);
  check('antes_de_W3', 'Sin borradores previos (W4 parte sin borradores)', proposalsBefore.status === 200 && proposalsBefore.body.length === E.antes_de_W3.borradores, `HTTP ${proposalsBefore.status} n=${proposalsBefore.body?.length}`);

  await login(manifest.accounts.directiva);
  await openSummary();
  observed.web_cobertura_antes = await compareWeb('antes_de_W3', E.antes_de_W3.celdas, E.antes_de_W3.cobertura);
  await shot('1-resumen-antes-W3');

  // W3 por la interfaz, en el sentido elegido: la denominación ALIAS pasa a CANONICAL.
  await page.goto(`${WEB_URL}/colectivo/reconciliacion`, { waitUntil: 'networkidle0' });
  const [row] = await page.$$(`[data-testid="product-${ALIAS}"]`);
  if (!row) throw new Error(`sin fila product-${ALIAS} en la reconciliación`);
  const [associate] = await row.$$('xpath/.//button[normalize-space(.)="Asociar…"]');
  await associate.click();
  await page.waitForSelector('#canonical');
  const canonicalValue = await page.$$eval('#canonical option', (o, c) => o.find((x) => x.textContent.startsWith(`${c} (`))?.value, CANONICAL);
  check('W3', `La lista de canónicos ofrece ${CANONICAL}`, Boolean(canonicalValue), canonicalValue ?? 'no');
  await page.select('#canonical', canonicalValue);
  await page.type('#reason', 'Mismo producto (DS-UX, verificación previa)');
  await page.click('input[type="checkbox"]');
  await clickText('Confirmar asociación');
  await page.waitForSelector(`[data-testid="current-${ALIAS}"]`, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Historial"] tbody tr').length > 0, { timeout: 15000 });
  const history = await page.$$eval('[aria-label="Historial"] tbody tr', (rows) => rows.map((r) => r.textContent));
  check('W3', `Historial «${ALIAS} → ${CANONICAL}» con motivo`, history.some((h) => h.includes(`${ALIAS} → ${CANONICAL}`) && h.includes('Mismo producto')), history.join(' || '));
  await shot('2-reconciliacion-W3');

  // Tras W3.
  const expectedAfter = E.tras_W3.celdas_por_canonico[CANONICAL];
  for (const [who, token] of [['Directiva', directiva], ['Administrador', presidente]]) {
    const s = await api(`/collective/campaigns/${campaignId}/summary`, token);
    check('tras_W3', `${who}: resumen HTTP 200`, s.status === 200, `HTTP ${s.status}`);
    if (s.status !== 200) continue;
    observed[`tras_${who}`] = compareApi('tras_W3', who, s.body, expectedAfter, E.tras_W3.cobertura);
    const aliasRow = (s.body.cells ?? []).find((c) => c.product_name === ALIAS);
    observed[`tras_${who}_fila_${ALIAS}`] = aliasRow ? { status: aliasRow.status, total_base: aliasRow.total_base ?? null, contributors: aliasRow.contributors ?? null } : 'sin fila';
    check('tras_W3', `${who}: ${ALIAS} sin cifra propia`, !aliasRow || (aliasRow.status !== 'DISCLOSED' && aliasRow.total_base == null), JSON.stringify(observed[`tras_${who}_fila_${ALIAS}`]));
  }
  const assocAfter = await api('/collective/product-associations', directiva);
  const currentText = JSON.stringify(assocAfter.body?.current ?? []);
  check('tras_W3', `API: una asociación vigente ${ALIAS} → ${CANONICAL}`,
    assocAfter.status === 200 && assocAfter.body.current?.length === E.tras_W3.asociaciones_vigentes && currentText.includes(ALIAS) && currentText.includes(CANONICAL),
    currentText.slice(0, 300));
  await openSummary();
  observed.web_cobertura_tras = await compareWeb('tras_W3', expectedAfter, E.tras_W3.cobertura);
  observed[`web_fila_${ALIAS}_tras`] = await text(cellSel(ALIAS));
  check('tras_W3', `Web: ${ALIAS} sin cifra propia`, observed[`web_fila_${ALIAS}_tras`] === null || !/\d+([.,]\d+)? L\b/.test(observed[`web_fila_${ALIAS}_tras`]), observed[`web_fila_${ALIAS}_tras`] ?? 'sin fila');
  await shot('3-resumen-tras-W3');

  // W4 por la interfaz: borrador y CSV.
  await page.goto(`${WEB_URL}/colectivo/propuestas?campaign=${campaignId}`, { waitUntil: 'networkidle0' });
  await clickText('Generar propuesta (borrador)');
  await page.waitForSelector(`[data-testid="line-${CANONICAL}-ML"]`, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Historial de borradores"] tbody tr').length === 1, { timeout: 15000 });
  check('tras_W4', 'Un borrador en el historial', true, '1 fila');
  await clickText('Exportar CSV');
  let csv = '';
  for (let i = 0; i < 20 && !csv; i += 1) {
    await sleep(300);
    const file = readdirSync(downloads).find((f) => f.endsWith('.csv'));
    if (file) csv = readFileSync(join(downloads, file), 'utf8');
  }
  check('tras_W4', 'CSV descargado', csv.length > 0, csv ? `${csv.split(/\r?\n/).length} líneas` : 'sin archivo');
  for (const want of E.tras_W4.lineas_por_canonico[CANONICAL]) {
    const line = `,${want.producto},ML,L,DISCLOSED,${want.total_base},${want.total_presentacion},${want.aportantes},`;
    check('tras_W4', `CSV: ${want.producto} ${want.total_base} ML (${want.total_presentacion} L), ${want.aportantes} aportantes`, csv.includes(line), csv.split(/\r?\n/).find((l) => l.includes(want.producto)) ?? 'sin línea');
  }
  // La denominación asociada puede aparecer como fila sin cifra (retirada por
  // la reagrupación); lo que el oráculo exige es que no tenga cifra propia.
  const aliasLine = csv.split(/\r?\n/).find((l) => l.includes(`,${ALIAS},ML,L,`));
  check('tras_W4', `CSV: ${ALIAS} sin cifra propia`, !aliasLine || /,ML,L,SUPPRESSED_[A-Z_]+,,,,/.test(aliasLine), aliasLine ?? 'sin línea');
  check('tras_W4', 'CSV sin NaN ni undefined', !/NaN|undefined/.test(csv));
  const proposalsAfter = await api(`/collective/campaigns/${campaignId}/proposals`, directiva);
  check('tras_W4', 'API: un borrador', proposalsAfter.status === 200 && proposalsAfter.body.length === E.tras_W4.borradores, `n=${proposalsAfter.body?.length}`);
  await shot('4-propuesta-W4');
} catch (error) {
  await page.screenshot({ path: join(out, 'error.png'), fullPage: true }).catch(() => undefined);
  check('—', 'Recorrido completo sin excepción', false, `${page.url()} — ${String(error.message).split('\n')[0]}`);
}
await browser.close();

const stages = ['antes_de_W3', 'W3', 'tras_W3', 'tras_W4'].map((stage) => {
  const own = checks.filter((c) => c.stage === stage);
  const aborted = checks.some((c) => c.stage === '—');
  return { stage, result: own.length && own.every((c) => c.ok) && !aborted ? 'CUMPLE' : own.length ? 'NO CUMPLE' : 'NO EJECUTADA', checks: own.length };
});
writeFileSync(join(out, 'contraste.json'), `${JSON.stringify({ label, canonical: CANONICAL, alias: ALIAS, browser: version, viewport: VIEWPORT, date: new Date().toISOString(), tenant_slug: manifest.tenant.slug, dataset_sha256: manifest.dataset_sha256, stages, observed, checks }, null, 2)}\n`);
process.stdout.write(`${label} (${version}): ${stages.map((s) => `${s.stage}=${s.result}`).join(' ')}\n`);
for (const c of checks.filter((c) => !c.ok)) process.stdout.write(`  NO CUMPLE ${c.stage}: ${c.name} — ${c.detail}\n`);
