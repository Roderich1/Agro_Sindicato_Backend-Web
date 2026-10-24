/**
 * F07: recorrido de integración Web↔Backend del sellado manual, la consulta
 * histórica y las tendencias, con el dataset sintético D4
 * (Back/scripts/f07-synthetic-seed.cjs) y la API real. Es una comprobación
 * funcional, no una evaluación con personas.
 *
 *   node walk-seal.mjs <salida>
 *
 * Entorno: WEB_URL, API_URL, WALK_PASSWORD (sólo en el proceso), CAMPAIGN_ID
 * (C1), CAMPAIGN2_ID (C2), DATABASE_URL y JWT_SECRET (los de la API en marcha;
 * sólo para el aporte sintético de F1 y para leer el snapshot), BROWSER_PATH.
 * Escribe capturas PNG, el CSV descargado y walk.json. No imprime secretos.
 */
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const tool = createRequire(new URL('../f10_eval_web/package.json', import.meta.url));
const back = createRequire(new URL('../../Back/package.json', import.meta.url));
const puppeteer = tool('puppeteer-core');
const { PrismaClient } = back('@prisma/client');
const jwt = back('jsonwebtoken');

const [outDir = '.'] = process.argv.slice(2);
const { WEB_URL, API_URL, WALK_PASSWORD, CAMPAIGN_ID, CAMPAIGN2_ID, JWT_SECRET, BROWSER_PATH } = process.env;
const out = resolve(outDir);
const downloads = join(out, 'descargas');
mkdirSync(downloads, { recursive: true });
const checks = [];
// Details keep no identifiers: the synthetic UUIDs are masked.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const check = (route, name, ok, detail = '') =>
  checks.push({ route, name, ok: Boolean(ok), detail: String(detail).replace(UUID, '<uuid>').slice(0, 600) });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const prisma = new PrismaClient();

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: true,
  args: ['--lang=es-BO'],
  defaultViewport: { width: 1366, height: 900 },
});
const version = await browser.version();
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
const shot = async (name) => {
  await sleep(500);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
};

// ------------------------------------------------------------------ API

async function api(method, path, token, body) {
  for (;;) {
    const res = await fetch(`${API_URL}/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429) {
      await sleep(5000);
      continue;
    }
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text.slice(0, 200);
    }
    return { status: res.status, json };
  }
}

async function apiLogin(email) {
  // `api` waits on a 429: the login route allows 5 a minute.
  const r = await api('POST', '/auth/login', null, { email, password: WALK_PASSWORD });
  if (r.status !== 200 && r.status !== 201) throw new Error(`login ${r.status}`);
  return r.json.accessToken;
}

/**
 * The sealed snapshot as stored: header, entries and the referenced releases
 * (where the figures live), in a stable order. `visibilityWithdrawnAt` is kept
 * apart: by contract it is the only field a later CANCEL may set (NULL → date).
 */
async function snapshot(campaignId) {
  const seal = await prisma.collectiveSeal.findFirst({ where: { campaignId } });
  if (!seal) return null;
  const rows = await prisma.collectiveSealEntry.findMany({ where: { sealId: seal.id }, include: { release: true } });
  const norm = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x)));
  const key = (e) => `${e.projectionType}|${e.canonicalProductId}|${e.baseUnit}`;
  rows.sort((a, b) => (key(a) < key(b) ? -1 : 1));
  const withdrawn = rows.filter((e) => e.visibilityWithdrawnAt !== null).map(key);
  const entries = rows.map(({ visibilityWithdrawnAt: _, ...e }) => e);
  return { sealed: norm({ seal, entries }), withdrawn };
}

/** Auth V2 token of a synthetic AGRICULTOR, as the seed makes it (memory only). */
async function farmerToken(email) {
  const user = await prisma.user.findFirst({ where: { email }, include: { members: true } });
  const member = user.members[0];
  const registration = await prisma.clientRegistration.create({
    data: { tenantId: user.tenantId, memberId: member.id, clientIdHash: randomBytes(32).toString('hex') },
  });
  const session = await prisma.authSession.create({
    data: {
      memberId: member.id,
      clientRegistrationId: registration.id,
      refreshTransport: 'BODY',
      expiresAt: new Date(Date.now() + 3600 * 1000),
    },
  });
  const token = jwt.sign(
    { sub: user.id, email, tenantId: user.tenantId, role: 'AGRICULTOR', memberId: member.id, sessionId: session.id, ver: 2 },
    JWT_SECRET,
    { expiresIn: '60m' },
  );
  return { token, memberId: member.id, tenantId: user.tenantId };
}

// ------------------------------------------------------------------ Web

/** Web login. The route allows 5 logins a minute (Throttle): on a 429 it waits and retries. */
async function login(email) {
  for (let attempt = 1; ; attempt++) {
    await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
    // A step that failed may have left a session open: close it first.
    if (!(await page.$('#email'))) {
      await logout();
      await page.waitForSelector('#email', { timeout: 10000 });
    }
    await page.type('#email', email);
    await page.type('#password', WALK_PASSWORD);
    const answer = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/auth/login'), { timeout: 15000 });
    await page.click('button[type="submit"]');
    if ((await answer).status() === 429 && attempt < 3) {
      await sleep(61000);
      continue;
    }
    await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 15000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => undefined);
    return;
  }
}

async function logout() {
  for (const button of await page.$$('xpath/.//button[contains(., "Cerrar sesión")]')) {
    if (await button.boundingBox()) {
      await button.click();
      break;
    }
  }
  await page.waitForFunction(() => location.pathname === '/login', { timeout: 10000 });
}

async function clickText(text, tag = 'button', exact = false) {
  const test = exact ? `normalize-space(.)="${text}"` : `contains(normalize-space(.), "${text}")`;
  for (const el of await page.$$(`xpath/.//${tag}[${test}]`)) {
    if (await el.boundingBox()) {
      await el.click();
      return true;
    }
  }
  return false;
}

/**
 * A row without a figure: Total explains the rule (it may name k, "Menos de 3
 * agricultores…") and carries no other number; Aportantes and Datos are "—".
 */
async function hiddenRow(selector) {
  const cells = await page.$$eval(`${selector} td`, (tds) => tds.map((td) => td.innerText.trim())).catch(() => []);
  const total = (cells[2] ?? '').replace(/Menos de \d+ agricultores/, '');
  return { ok: cells.length === 5 && !/\d/.test(total) && cells[3] === '—' && cells[4] === '—', detail: cells.join(' | ') };
}

const visibleLinks = () =>
  page.$$eval('a[href]', (as) => as.filter((a) => a.offsetParent !== null).map((a) => a.getAttribute('href')));
const text = (selector) => page.$eval(selector, (el) => el.innerText).catch(() => null);

/**
 * Picks the campaign once the picker has it and keeps picking until it holds:
 * the page sets its default campaign when the list arrives, which may come
 * after a first pick. Then waits for that campaign's summary.
 */
async function pickCampaign(campaignId) {
  await page.waitForFunction((id) => [...(document.querySelector('#campaign-picker')?.options ?? [])].some((o) => o.value === id), { timeout: 15000 }, campaignId);
  for (let i = 0; i < 10; i++) {
    await page.select('#campaign-picker', campaignId);
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => undefined);
    if ((await page.$eval('#campaign-picker', (s) => s.value)) === campaignId) break;
  }
  const name = campaignId === CAMPAIGN_ID ? C1 : C2;
  await page.waitForFunction((n) => document.body.innerText.toUpperCase().includes(`· ${n}`.toUpperCase()), { timeout: 15000 }, name).catch(() => undefined);
  await sleep(800);
}

async function openSummary(campaignId) {
  await page.goto(`${WEB_URL}/colectivo/resumen`, { waitUntil: 'networkidle0' });
  await pickCampaign(campaignId);
}

const step = async (route, name, fn) => {
  try {
    await fn();
  } catch (error) {
    check(route, `${name}: sin excepción`, false, error.message);
    await shot(`error-${route}-${name.replace(/\W+/g, '-')}`).catch(() => undefined);
  }
};

const summaryOf = async (token) => (await api('GET', `/collective/campaigns/${CAMPAIGN_ID}/summary`, token)).json;
const C1 = (await prisma.agriculturalCampaign.findUnique({ where: { id: CAMPAIGN_ID } })).name;
const C2 = (await prisma.agriculturalCampaign.findUnique({ where: { id: CAMPAIGN2_ID } })).name;
const tokens = {};

// ------------------------------------------------------------------ R1: permisos por rol

await step('R1', 'permisos', async () => {
  for (const [who, email] of [
    ['DIRECTIVA', 'directiva@f07.example.test'],
    ['ADMINISTRADOR', 'presidente@f07.example.test'],
  ]) {
    await login(email);
    const links = await visibleLinks();
    check('R1', `${who}: menú con Resumen colectivo y Tendencias`, links.includes('/colectivo/resumen') && links.includes('/colectivo/tendencias'), links.filter((h) => h.startsWith('/colectivo')).join(' '));
    await page.goto(`${WEB_URL}/colectivo/tendencias`, { waitUntil: 'networkidle0' });
    check('R1', `${who}: entra en /colectivo/tendencias`, (await page.evaluate(() => location.pathname)) === '/colectivo/tendencias');
    await shot(`r1-${who.toLowerCase()}-tendencias`);
    await logout();
  }
  await login('f1@f07.example.test');
  const home = await page.evaluate(() => location.pathname);
  const links = await visibleLinks();
  check('R1', 'AGRICULTOR: sin enlaces colectivos en el menú', !links.some((h) => h.startsWith('/colectivo')), `inicio ${home}; enlaces ${links.join(' ')}`);
  for (const path of ['/colectivo/tendencias', '/colectivo/resumen']) {
    await page.goto(`${WEB_URL}${path}`, { waitUntil: 'networkidle0' });
    await sleep(800);
    const at = await page.evaluate(() => location.pathname);
    check('R1', `AGRICULTOR: ${path} redirige fuera`, at !== path, `queda en ${at}`);
  }
  await shot('r1-agricultor-redirigido');
  await logout();

  tokens.directiva = await apiLogin('directiva@f07.example.test');
  tokens.admin = await apiLogin('presidente@f07.example.test');
  const farmer = await apiLogin('f1@f07.example.test');
  const other = await apiLogin('ajena@f07.example.test');
  for (const [path, label] of [
    ['/collective/trends', 'GET tendencias'],
    [`/collective/campaigns/${CAMPAIGN_ID}/seal`, 'GET estado del sellado'],
  ]) {
    const r = await api('GET', path, farmer);
    check('R1', `API, AGRICULTOR: ${label} → 403`, r.status === 403, r.status);
  }
  const post = await api('POST', `/collective/campaigns/${CAMPAIGN_ID}/seal`, farmer, { confirmed: true, review_ref: 'x' });
  check('R1', 'API, AGRICULTOR: POST sellar → 403', post.status === 403, post.status);
  const foreign = await api('GET', `/collective/campaigns/${CAMPAIGN_ID}/seal`, other);
  check('R1', 'API, DIRECTIVA de otro tenant: GET estado del sellado → 404', foreign.status === 404, foreign.status);
});

// ------------------------------------------------------------------ R2: sellado desde la UI

let reviewRef = null;
let snap0 = null;
let summary0 = null;
await step('R2', 'sellado', async () => {
  await login('directiva@f07.example.test');
  await openSummary(CAMPAIGN_ID);
  const openPanel = await text('[data-testid="seal-panel"]');
  const openState = await api('GET', `/collective/campaigns/${CAMPAIGN_ID}/seal`, tokens.directiva);
  check('R2', 'campaña abierta: no se puede sellar (bloqueo CAMPAIGN_NOT_CLOSED)', openState.json?.can_seal === false && JSON.stringify(openState.json?.blocked_by).includes('CAMPAIGN_NOT_CLOSED'), JSON.stringify(openState.json?.blocked_by));
  check('R2', 'campaña abierta: el panel no ofrece sellar', !(openPanel ?? '').includes('Sellar esta versión'), (openPanel ?? '(sin panel)').slice(0, 160));
  await shot('r2-1-abierta');

  const closed = await api('POST', `/campaigns/${CAMPAIGN_ID}/close`, tokens.directiva);
  check('R2', 'preparación: cierre de C1 por la API (DIRECTIVA)', closed.status === 200 || closed.status === 201, closed.status);
  await openSummary(CAMPAIGN_ID);
  await page.waitForSelector('[data-testid="seal-panel"]', { timeout: 15000 });
  await shot('r2-2-revision');
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes(`/collective/campaigns/${CAMPAIGN_ID}/seal`)) {
      reviewRef = JSON.parse(req.postData() ?? '{}').review_ref ?? null;
    }
  });
  check('R2', 'botón «Sellar esta versión…»', await clickText('Sellar esta versión'));
  await page.waitForSelector('input[type="checkbox"]', { timeout: 5000 });
  const sealButtonDisabled = await page.$$eval('button', (bs) => bs.filter((b) => b.innerText.trim() === 'Sellar').map((b) => b.disabled));
  check('R2', 'sin marcar la confirmación, «Sellar» está deshabilitado', sealButtonDisabled.length > 0 && sealButtonDisabled.every(Boolean), JSON.stringify(sealButtonDisabled));
  await page.click('input[type="checkbox"]');
  await shot('r2-3-confirmacion');
  const response = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/seal'), { timeout: 20000 });
  check('R2', 'botón «Sellar» del diálogo, una vez marcada la confirmación', await clickText('Sellar', 'button', true));
  const res = await response;
  const body = await res.json().catch(() => null);
  check('R2', 'POST del sellado desde la UI → 201/200, SEALED, created: true', [200, 201].includes(res.status()) && body?.state === 'SEALED' && body?.created === true, `${res.status()} ${body?.state} created=${body?.created}`);
  await sleep(2000);
  const panelAfter = await page.$('[data-testid="seal-panel"]');
  const pageText = await page.evaluate(() => document.body.innerText);
  // The headings are uppercased by CSS: innerText returns them uppercased.
  check('R2', 'tras sellar: sin panel de sellado, con «Versión 1 · sellada el…» y «Cobertura al sellar»', !panelAfter && /Versión 1 · sellada el/i.test(pageText) && /cobertura al sellar/i.test(pageText), (pageText.match(/Versión 1 · sellada el[^\n]*/i)?.[0] ?? '(sin versión)') + ' / ' + (pageText.match(/cobertura al sellar[^\n]*/i)?.[0] ?? '(sin cobertura)'));
  await shot('r2-4-sellada');
  snap0 = await snapshot(CAMPAIGN_ID);
  summary0 = await summaryOf(tokens.directiva);
  check('R2', 'snapshot en la base: 1 sellado con entradas, ninguna retirada', snap0 && snap0.sealed.entries.length > 0 && snap0.withdrawn.length === 0, snap0 ? `${snap0.sealed.entries.length} entradas, rol ${snap0.sealed.seal.sealedByRole}, umbral ${snap0.sealed.seal.threshold}` : 'sin sellado');
  await logout();
});

// ------------------------------------------------------------------ R3: segundo sellado

await step('R3', 'segundo sellado', async () => {
  const again = await api('POST', `/collective/campaigns/${CAMPAIGN_ID}/seal`, tokens.admin, { confirmed: true, review_ref: reviewRef });
  check('R3', 'API, ADMINISTRADOR: segundo sellado → created: false', [200, 201].includes(again.status) && again.json?.created === false && again.json?.state === 'SEALED', `${again.status} created=${again.json?.created}`);
  const unconfirmed = await api('POST', `/collective/campaigns/${CAMPAIGN_ID}/seal`, tokens.admin, { confirmed: false, review_ref: reviewRef });
  check('R3', 'API: sin confirmación, aun sellada → 422 (nunca un éxito)', unconfirmed.status === 422, unconfirmed.status);
  const after = await snapshot(CAMPAIGN_ID);
  const seals = await prisma.collectiveSeal.count({ where: { campaignId: CAMPAIGN_ID } });
  check('R3', 'un solo sellado y el snapshot idéntico', seals === 1 && JSON.stringify(after) === JSON.stringify(snap0), `sellados ${seals}`);
  await login('presidente@f07.example.test');
  await openSummary(CAMPAIGN_ID);
  const panel = await page.$('[data-testid="seal-panel"]');
  const t = await page.evaluate(() => document.body.innerText);
  check('R3', 'UI, ADMINISTRADOR: la campaña sellada no ofrece sellar otra vez', !panel && !t.includes('Sellar esta versión'), '');
  await shot('r3-administrador-sellada');
  await logout();
});

// ------------------------------------------------------------------ R4: tendencias, k = 3 y CSV

await step('R4', 'tendencias', async () => {
  await login('directiva@f07.example.test');
  await page.goto(`${WEB_URL}/colectivo/tendencias`, { waitUntil: 'networkidle0' });
  await sleep(1500);
  const row1 = await text(`[data-testid="campaign-${C1}"]`);
  const row2 = await text(`[data-testid="campaign-${C2}"]`);
  check('R4', 'C1 aparece con su versión sellada', (row1 ?? '').includes('Versión 1, sellada el'), row1);
  check('R4', 'C2 sin sellar: «Sin sellar: no aporta cifras»', (row2 ?? '').includes('Sin sellar: no aporta cifras'), row2);
  const trends = await api('GET', '/collective/trends?projection_type=CONSUMPTION_TOTAL', tokens.directiva);
  const series = trends.json?.series ?? [];
  const pointOf = (product, campaign) => series.find((s) => s.product_name === product)?.points.find((p) => p.campaign_ref === campaign);
  const gli = pointOf('Glifosato F06', CAMPAIGN_ID);
  const bel = pointOf('Belator', CAMPAIGN_ID);
  const c2 = pointOf('Mancozeb F06', CAMPAIGN2_ID);
  check('R4', 'API: Glifosato F06 en C1 DISCLOSED, 8250 mL, 3 aportantes (k = 3)', gli?.status === 'DISCLOSED' && gli?.total_base === '8250' && gli?.contributors === 3, JSON.stringify(gli));
  check('R4', 'API: Belator en C1 (2 aportantes) SUPPRESSED_UNDER_THRESHOLD, sin total ni aportantes', bel?.status === 'SUPPRESSED_UNDER_THRESHOLD' && bel?.total_base === null && bel?.contributors === null, JSON.stringify(bel));
  check('R4', 'API: C2, sin sellar, NOT_SEALED y sin cifra', c2?.status === 'NOT_SEALED' && c2?.total_base === null, JSON.stringify(c2));
  const typeSelects = await page.$$('select');
  for (const select of typeSelects) {
    const values = await select.$$eval('option', (os) => os.map((o) => o.value));
    if (values.includes('CONSUMPTION_TOTAL')) await select.select('CONSUMPTION_TOTAL');
  }
  await sleep(1500);
  const gliUi = await text(`[data-testid="series-CONSUMPTION_TOTAL-Glifosato F06-ML"] [data-testid="point-${C1}"]`);
  const belUi = await hiddenRow(`[data-testid="series-CONSUMPTION_TOTAL-Belator-ML"] [data-testid="point-${C1}"]`);
  check('R4', 'UI: Glifosato F06 en C1 muestra cifra y 3 aportantes', /\d/.test(gliUi ?? '') && (gliUi ?? '').includes('3'), gliUi);
  check('R4', 'UI: Belator en C1 suprimida: sin total ni aportantes ni fecha', belUi.ok, belUi.detail);
  await shot('r4-1-tendencias-consumo');
  const before = new Set(readdirSync(downloads));
  check('R4', 'botón «Descargar CSV»', await clickText('Descargar CSV'));
  let file = null;
  for (let i = 0; i < 30 && !file; i++) {
    await sleep(300);
    file = readdirSync(downloads).find((f) => !before.has(f) && f.endsWith('.csv')) ?? null;
  }
  const csv = file ? readFileSync(join(downloads, file), 'utf8') : '';
  const lines = csv.split(/\r?\n/);
  const header = lines[0] ?? '';
  const gliLine = lines.find((l) => l.includes('Glifosato F06') && l.includes(C1)) ?? '';
  const belLine = lines.find((l) => l.includes('Belator') && l.includes(C1)) ?? '';
  check('R4', 'CSV descargado desde la UI', Boolean(file), file ?? 'sin archivo');
  check('R4', 'CSV: Glifosato F06 en C1 con 8250', gliLine.includes('8250') && gliLine.includes('DISCLOSED'), gliLine);
  check('R4', 'CSV: Belator en C1 suprimida, sin 5000 ni 4000 ni 1000', belLine.includes('SUPPRESSED_UNDER_THRESHOLD') && !/(^|,)(5000|4000|1000)(,|$)/.test(belLine), belLine);
  check('R4', 'CSV: cabecera', header.length > 0, header);
  await logout();
});

// ------------------------------------------------------------------ R5: inmutabilidad

await step('R5', 'inmutabilidad', async () => {
  await login('directiva@f07.example.test');
  await openSummary(CAMPAIGN_ID);
  const uiBefore = await page.evaluate(() => document.body.innerText);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await pickCampaign(CAMPAIGN_ID);
  const pickedAfter = await page.$eval('#campaign-picker', (s) => s.value);
  check('R5', 'recarga: el selector vuelve a mostrar C1', pickedAfter === CAMPAIGN_ID);
  const uiAfter = await page.evaluate(() => document.body.innerText);
  const summaryReload = await summaryOf(tokens.directiva);
  check('R5', 'recarga: el resumen sellado no cambia (API)', JSON.stringify(summaryReload) === JSON.stringify(summary0));
  const lines = (t) => t.split('\n').map((l) => l.trim()).filter(Boolean);
  const gone = lines(uiBefore).filter((l) => !lines(uiAfter).includes(l));
  const added = lines(uiAfter).filter((l) => !lines(uiBefore).includes(l));
  check('R5', 'recarga: el texto de la página no cambia', uiBefore === uiAfter, `antes: ${JSON.stringify(gone)} después: ${JSON.stringify(added)}`);
  await shot('r5-0-tras-recarga');
  check('R5', 'recarga: el snapshot en la base no cambia', JSON.stringify(await snapshot(CAMPAIGN_ID)) === JSON.stringify(snap0));

  const f1 = await farmerToken('f1@f07.example.test');
  const products = Object.fromEntries((await prisma.product.findMany({ where: { tenantId: f1.tenantId } })).map((p) => [p.name, p.id]));
  const contribution = await prisma.syncV1Contribution.findFirst({
    where: { memberId: f1.memberId, campaignId: CAMPAIGN_ID, productId: products['Glifosato F06'], projectionType: 'CONSUMPTION_TOTAL' },
  });
  const base = { contractVersion: 1, projectionType: 'CONSUMPTION_TOTAL', payload: { campaign_ref: CAMPAIGN_ID, product_ref: products['Glifosato F06'], base_unit: 'ML' } };
  const publish = await api('POST', '/sync/v1/push', f1.token, {
    ...base,
    projectionType: 'DECLARED_NEED',
    operationId: randomUUID(),
    action: 'PUBLISH',
    causal: { predecessorOperationId: null, reconciliationReference: null },
    payload: { ...base.payload, quantity_base: '1000' },
  });
  check('R5', 'Sync v1: PUBLISH nuevo en C1 sellada → REJECTED CAMPAIGN_SEALED', publish.json?.outcome === 'REJECTED' && JSON.stringify(publish.json).includes('CAMPAIGN_SEALED'), `${publish.status} ${publish.json?.outcome} ${publish.json?.errorCode ?? publish.json?.code ?? ''}`);
  const cancel = await api('POST', '/sync/v1/push', f1.token, {
    ...base,
    operationId: randomUUID(),
    action: 'CANCEL',
    causal: { predecessorOperationId: contribution.headOperationId, reconciliationReference: null },
  });
  check('R5', 'Sync v1: CANCEL de F1 (Glifosato F06, C1) tras el sellado → APPLIED', cancel.status === 200 && cancel.json?.outcome === 'APPLIED', `${cancel.status} ${cancel.json?.outcome}`);
  const snapAfter = await snapshot(CAMPAIGN_ID);
  check('R5', 'tras el CANCEL: sellado, entradas y divulgaciones referenciadas idénticos en la base', JSON.stringify(snapAfter.sealed) === JSON.stringify(snap0.sealed));
  check('R5', 'tras el CANCEL: sólo la entrada de Glifosato F06 (consumo) queda marcada como retirada', snapAfter.withdrawn.length === 1 && snapAfter.withdrawn[0] === `CONSUMPTION_TOTAL|${products['Glifosato F06']}|ML`, `${snapAfter.withdrawn.length} marcadas`);
  const trends = await api('GET', '/collective/trends?projection_type=CONSUMPTION_TOTAL', tokens.directiva);
  const gli = (trends.json?.series ?? []).find((s) => s.product_name === 'Glifosato F06')?.points.find((p) => p.campaign_ref === CAMPAIGN_ID);
  check('R5', 'tras el CANCEL: Glifosato F06 en C1 → WITHDRAWN_AFTER_SEAL, sin cifra', gli?.status === 'WITHDRAWN_AFTER_SEAL' && gli?.total_base === null, JSON.stringify(gli));
  const summaryAfter = await summaryOf(tokens.directiva);
  check('R5', 'tras el CANCEL: 8250 ya no aparece en el resumen', !JSON.stringify(summaryAfter).includes('"8250"') && JSON.stringify(summary0).includes('"8250"'));
  check('R5', 'tras el CANCEL: la referencia del sellado no cambia', summaryAfter?.seal?.seal_ref === summary0?.seal?.seal_ref && summaryAfter?.seal?.sealed_at === summary0?.seal?.sealed_at, summaryAfter?.seal?.seal_ref ? 'misma' : 'distinta');
  await page.goto(`${WEB_URL}/colectivo/tendencias`, { waitUntil: 'networkidle0' });
  for (const select of await page.$$('select')) {
    const values = await select.$$eval('option', (os) => os.map((o) => o.value));
    if (values.includes('CONSUMPTION_TOTAL')) await select.select('CONSUMPTION_TOTAL');
  }
  await sleep(1500);
  const gliUi = await hiddenRow(`[data-testid="series-CONSUMPTION_TOTAL-Glifosato F06-ML"] [data-testid="point-${C1}"]`);
  check('R5', 'UI: Glifosato F06 en C1 retirada: sin total ni aportantes ni fecha', gliUi.ok, gliUi.detail);
  await shot('r5-tendencias-tras-cancel');
  await openSummary(CAMPAIGN_ID);
  await shot('r5-resumen-tras-cancel');
  await logout();
});

await browser.close();
await prisma.$disconnect();
const failed = checks.filter((c) => !c.ok).length;
writeFileSync(join(out, 'walk.json'), `${JSON.stringify({ browser: version, checks, failed }, null, 2)}\n`);
console.log(`${checks.length} comprobaciones, ${failed} fallidas; navegador ${version}`);
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'} [${c.route}] ${c.name}${c.ok ? '' : ` — ${c.detail}`}`);
process.exitCode = failed ? 1 : 0;
