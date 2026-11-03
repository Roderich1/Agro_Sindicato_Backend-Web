/**
 * F12-EST-08 (#181): recorrido de «Necesidades y propuesta conjunta» con la
 * estimación del consumo como referencia, contra el backend REAL (`node
 * dist/main.js` con su trabajador) y PostgreSQL desechable, con datos
 * SINTÉTICOS. Navegador Edge sin interfaz mediante puppeteer-core, instalado
 * aparte (no es dependencia del proyecto).
 *
 *   node recorrido-web.mjs <fase: provisional|admin|pending> <salida>
 *
 * Entorno: WEB_URL, API_URL, WALK_PASSWORD y JWT_SECRET (sólo en el proceso),
 * BROWSER_PATH, PUPPETEER_HOME, IDS (ids.json de control-sintetico.cjs),
 * BACK_DIR y PG_ADMIN_URL. Escribe capturas PNG, `recorrido-<fase>.json`,
 * `respuestas-<fase>.json` (cada respuesta real de las rutas de propuestas y
 * de la referencia, resumida, sin cabeceras ni tokens) y los CSV descargados.
 * El service worker de la PWA se omite (`setBypassServiceWorker`) para que la
 * respuesta diferida que se retiene sea la de la página.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [phase = 'provisional', outDir = '.'] = process.argv.slice(2);
const { WEB_URL, API_URL, WALK_PASSWORD, JWT_SECRET, BROWSER_PATH, PUPPETEER_HOME, IDS, BACK_DIR, PG_ADMIN_URL } = process.env;
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
const backRequire = createRequire(join(BACK_DIR, 'package.json'));
const { PrismaClient } = backRequire('@prisma/client');
const jwt = backRequire('jsonwebtoken');
const ids = JSON.parse(readFileSync(IDS, 'utf8'));
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(outDir);
mkdirSync(out, { recursive: true });
const dbUrl = new URL(PG_ADMIN_URL);
dbUrl.pathname = `/${ids.database}`;
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl.toString() } } });
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 400) });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const control = (order) =>
  execFileSync(process.execPath, [join(here, 'control-sintetico.cjs'), order, IDS], { cwd: BACK_DIR, env: process.env, encoding: 'utf8' }).trim();
const snapshot = () => JSON.parse(control('snapshot'));
const changed = (a, b) => Object.keys(b).filter((t) => a[t] !== b[t]).sort();
const PRIVATE = ['Purchase', 'PurchaseItem', 'PurchaseItemAllocation', 'PurchaseParticipant', 'InventoryLot', 'StockMovement', 'PayableAccount', 'Payment'];
const state = existsState() ? JSON.parse(readFileSync(join(out, 'estado.json'), 'utf8')) : {};
function existsState() {
  try {
    readFileSync(join(out, 'estado.json'));
    return true;
  } catch {
    return false;
  }
}

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
      json = text;
    }
    return { status: res.status, json };
  }
}

async function apiLogin(email) {
  const r = await api('POST', '/auth/login', null, { email, password: WALK_PASSWORD });
  if (r.status !== 200 && r.status !== 201) throw new Error(`login ${r.status}`);
  return r.json.accessToken;
}

/** Auth V2 token of a synthetic AGRICULTOR (memory only), as a phone would hold it. */
async function farmerToken(farmer) {
  const registration = await prisma.clientRegistration.create({
    data: { tenantId: ids.tenant, memberId: farmer.memberId, clientIdHash: randomBytes(32).toString('hex') },
  });
  const session = await prisma.authSession.create({
    data: { memberId: farmer.memberId, clientRegistrationId: registration.id, refreshTransport: 'BODY', expiresAt: new Date(Date.now() + 3600 * 1000) },
  });
  return jwt.sign(
    { sub: farmer.userId, email: farmer.email, tenantId: ids.tenant, role: 'AGRICULTOR', memberId: farmer.memberId, sessionId: session.id, ver: 2 },
    JWT_SECRET,
    { expiresIn: '60m' },
  );
}

async function publishNeeds(campaignId, rows) {
  for (const [product, quantities] of rows) {
    for (const [i, quantity] of quantities.entries()) {
      const token = await farmerToken(ids.farmers[i]);
      const r = await api('POST', '/sync/v1/push', token, {
        contractVersion: 1, operationId: randomUUID(), projectionType: 'DECLARED_NEED', action: 'PUBLISH',
        causal: { predecessorOperationId: null, reconciliationReference: null },
        payload: { campaign_ref: campaignId, product_ref: ids.products[product], base_unit: 'ML', quantity_base: quantity },
      });
      if (r.json?.outcome !== 'APPLIED') throw new Error(`push ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
    }
  }
}

// ------------------------------------------------------------------ Web

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: true,
  args: ['--lang=es-BO', '--window-size=1440,1100'],
  defaultViewport: { width: 1440, height: 1100 },
});
const version = await browser.version();
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
const downloads = join(out, `downloads-${phase}`);
rmSync(downloads, { recursive: true, force: true });
mkdirSync(downloads, { recursive: true });
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });

/** Respuestas reales del servidor, resumidas: nunca cabeceras ni tokens. */
const served = [];
page.on('response', async (response) => {
  const url = new URL(response.url());
  if (!url.pathname.startsWith('/api/v1/collective/') || !url.pathname.includes('proposals')) return;
  if (url.pathname.endsWith('/csv')) {
    served.push({ at: new Date().toISOString(), method: 'GET', path: url.pathname, status: response.status() });
    return;
  }
  const body = await response.json().catch(() => null);
  let summary = body && typeof body === 'object' && 'message' in body ? { message: body.message } : null;
  if (response.ok() && url.pathname.endsWith('/estimation-reference')) {
    summary = {
      label: body.label, availability: body.availability, evaluated_at: body.evaluated_at, proposal_generated_at: body.proposal_generated_at,
      lines: body.lines.map((l) => ({ position: l.position, absence: l.absence, ...(l.estimation ? { status: l.estimation.status, reason_code: l.estimation.reason_code, estimate_base: l.estimation.estimate_base, validity: l.estimation.validity, validity_reason: l.estimation.validity_reason, run_ref: l.estimation.run_ref, run_relation: l.estimation.run_relation } : {}) })),
    };
  } else if (response.ok() && Array.isArray(body)) {
    summary = body.map((p) => ({ proposal_ref: p.proposal_ref, inputs_fingerprint: p.inputs_fingerprint, line_count: p.line_count }));
  } else if (response.ok() && body?.lines) {
    summary = { proposal_ref: body.proposal_ref, inputs_fingerprint: body.inputs_fingerprint, seal: body.seal?.seal_ref ?? null, lines: body.lines.map((l) => [l.position, l.status, l.quantity_base]) };
  }
  served.push({ at: new Date().toISOString(), method: response.request().method(), path: url.pathname, status: response.status(), body: summary });
});

/** Respuestas de la referencia retenidas a propósito (respuesta diferida). */
let holdFor = null;
const held = [];
await page.setRequestInterception(true);
page.on('request', (request) => {
  if (holdFor && request.url().includes(`/proposals/${holdFor}/estimation-reference`)) held.push(request);
  else void request.continue();
});

async function shot(name) {
  await sleep(500);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
}
async function login(email) {
  for (;;) {
    await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
    await page.type('#email', email);
    await page.type('#password', WALK_PASSWORD);
    const answer = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/auth/login'), { timeout: 15000 });
    await page.click('button[type="submit"]');
    if ((await answer).status() === 429) {
      await sleep(15000);
      continue;
    }
    await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 15000 });
    return;
  }
}
const proposals = (campaign) => page.goto(`${WEB_URL}/colectivo/propuestas?campaign=${campaign}`, { waitUntil: 'networkidle0' });
const cell = (product, testId) =>
  page.$eval(`[data-testid="line-${product}-ML"] [data-testid="${testId}"]`, (el) => el.textContent.trim()).catch(() => null);
async function waitCell(product, testId, pattern, timeout = 20000) {
  await page.waitForFunction(
    (p, id, src) => new RegExp(src).test(document.querySelector(`[data-testid="line-${p}-ML"] [data-testid="${id}"]`)?.textContent ?? ''),
    { timeout, polling: 250 },
    product,
    testId,
    pattern.source,
  );
}
async function clickButton(text, index = 0) {
  const buttons = await page.$$(`xpath/.//button[normalize-space(.)="${text}"]`);
  if (!buttons[index]) throw new Error(`No hay botón "${text}" (${index})`);
  await buttons[index].click();
}
const fingerprintText = () => page.$eval('[aria-label="Detalle del borrador"] h2 + p', (el) => el.textContent.trim()).catch(() => null);
async function generateDraft() {
  const answer = page.waitForResponse((r) => r.request().method() === 'POST' && /\/proposals$/.test(new URL(r.url()).pathname), { timeout: 20000 });
  await clickButton('Generar propuesta (borrador)');
  const created = await (await answer).json();
  await page.waitForSelector('[aria-label="Detalle del borrador"]');
  return created;
}
async function openDraft(proposalRef) {
  const history = await page.$$eval('[aria-label="Historial de borradores"] tr', (rows) => rows.length);
  const list = await (await fetch(`${API_URL}/api/v1/collective/campaigns/${state.currentCampaign}/proposals`, { headers: { Authorization: `Bearer ${state.token}` } })).json();
  const index = list.findIndex((p) => p.proposal_ref === proposalRef);
  if (index < 0 || index >= history) throw new Error(`borrador ${proposalRef} no está en el historial`);
  await clickButton('Ver', index);
}
/** The CSV the browser downloaded last, as rows (RFC 4180, `\n`). */
// Each one is kept renamed with its order, so the next one (same name) is detected as new.
let downloadCount = 0;
async function downloadCsv() {
  await clickButton('Exportar CSV');
  for (let i = 0; i < 60; i += 1) {
    const fresh = readdirSync(downloads).filter((f) => f.startsWith('propuesta-') && f.endsWith('.csv'));
    if (fresh.length) {
      downloadCount += 1;
      const file = `${String(downloadCount).padStart(2, '0')}-${fresh[0]}`;
      await sleep(300);
      renameSync(join(downloads, fresh[0]), join(downloads, file));
      return { file, rows: parseCsv(readFileSync(join(downloads, file), 'utf8')) };
    }
    await sleep(250);
  }
  throw new Error('no se descargó el CSV');
}
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  return rows;
}
/** The downloaded CSV against the JSON the server serves in the same state. */
async function csvMatchesServer(rows, proposalRef) {
  const view = (await api('GET', `/collective/proposals/${proposalRef}`, state.token)).json;
  const reference = (await api('GET', `/collective/proposals/${proposalRef}/estimation-reference`, state.token)).json;
  const head = Object.fromEntries(rows[0].map((k, i) => [k, rows[1][i]]));
  const header = rows[4];
  const lines = rows.slice(5).map((r) => Object.fromEntries(header.map((k, i) => [k, r[i]])));
  const problems = [];
  if (head.proposal_ref !== view.proposal_ref || head.inputs_fingerprint !== (view.inputs_fingerprint ?? '')) problems.push('cabecera');
  if (head.estimation_reference !== 'Estimación del consumo' || head.estimation_availability !== reference.availability) problems.push('referencia');
  if (header.slice(0, 12).join() !== 'position,product_ref,product_name,base_unit,presentation_unit,status,quantity_base,quantity_presentation,contributors,data_as_of,released_at,pending_changes') problems.push('columnas del borrador');
  for (const line of view.lines) {
    const row = lines.find((l) => Number(l.position) === line.position);
    const ref = reference.lines.find((l) => l.position === line.position);
    if (!row || row.status !== line.status || row.quantity_base !== (line.quantity_base ?? '')) problems.push(`línea ${line.position}`);
    const e = ref.estimation;
    if ((row?.estimation_estimate_base ?? '') !== (e?.estimate_base ?? '') || (row?.estimation_validity ?? '') !== (e?.validity ?? '') || (row?.estimation_run_ref ?? '') !== (e?.run_ref ?? '') || (row?.estimation_absence ?? '') !== (ref.absence ?? '')) {
      problems.push(`referencia ${line.position}`);
    }
  }
  return problems;
}
function save() {
  writeFileSync(join(out, `recorrido-${phase}.json`), `${JSON.stringify({ phase, browser: version, checks }, null, 2)}\n`);
  writeFileSync(join(out, `respuestas-${phase}.json`), `${JSON.stringify(served, null, 2)}\n`);
  const { token: _, ...persisted } = state;
  writeFileSync(join(out, 'estado.json'), `${JSON.stringify(persisted, null, 2)}\n`);
}

try {
  if (phase === 'provisional') {
    const privateBefore = snapshot();
    await login(ids.directorEmail);
    state.token = await apiLogin(ids.directorEmail);
    state.currentCampaign = ids.t1;
    await publishNeeds(ids.t1, [['herbicide', ['30000', '40000', '50000']], ['fungicide', ['500', '700', '800']], ['insecticide', ['1000', '2000']]]);
    await publishNeeds(ids.t2, [['herbicide', ['10000', '20000', '30000']]]);

    // 1. Sin ninguna estimación: la columna explica la ausencia, nunca un cero.
    await proposals(ids.t1);
    const p0 = await generateDraft();
    state.p0 = p0.proposal_ref;
    await waitCell('Herbicida de ensayo', 'reference', /Sin estimación/);
    check('Sin estimación: la columna se identifica como «Estimación del consumo (referencia)»', (await page.$eval('[data-testid="reference-header"]', (el) => el.textContent)) === 'Estimación del consumo (referencia)');
    for (const p of ['Herbicida de ensayo', 'Fungicida de ensayo', 'Insecticida de ensayo']) {
      const text = await cell(p, 'reference');
      check(`Sin estimación: ${p} dice «Sin estimación» y no muestra un cero`, /Sin estimación/.test(text) && !/\b0\b/.test(text), text);
    }
    check('Necesidad de Herbicida 120 L (30 + 40 + 50)', /120 L/.test(await cell('Herbicida de ensayo', 'need')), await cell('Herbicida de ensayo', 'need'));
    check('Insecticida, con dos aportantes, queda oculto bajo el umbral', /umbral/i.test(await page.$eval('[data-testid="line-Insecticida de ensayo-ML"]', (el) => el.textContent)));
    await shot('01-propuesta-sin-estimacion');

    // 2. La Directiva genera la estimación en su pantalla; el trabajador del proceso real la calcula.
    await page.goto(`${WEB_URL}/colectivo/estimacion?campaign=${ids.t1}`, { waitUntil: 'networkidle0' });
    await clickButton('Generar estimación');
    await page.waitForFunction(() => /^(Terminado|No se ejecutó)$/.test(document.querySelector('[data-testid="job-status"]')?.textContent?.trim() ?? ''), { timeout: 40000, polling: 250 });
    check('La estimación de T1 termina en el trabajador real', (await page.$eval('[data-testid="job-status"]', (el) => el.textContent.trim())) === 'Terminado');
    await sleep(1500);
    await shot('02-estimacion-generada');

    // 3. Con estimación disponible: mismo borrador, misma huella y la referencia aparte.
    await proposals(ids.t1);
    const p1 = await generateDraft();
    state.p1 = p1.proposal_ref;
    await waitCell('Herbicida de ensayo', 'reference', /111 L/);
    check('Misma huella de líneas con y sin estimación (P0 y P1)', p1.inputs_fingerprint !== null && p1.inputs_fingerprint === p0.inputs_fingerprint, `${p0.inputs_fingerprint} ${p1.inputs_fingerprint}`);
    check('Mismas líneas y cantidades con y sin estimación', JSON.stringify(p1.lines.map((l) => [l.product_ref, l.status, l.quantity_base])) === JSON.stringify(p0.lines.map((l) => [l.product_ref, l.status, l.quantity_base])));
    const total = (p) => p.lines.reduce((s, l) => s + BigInt(l.quantity_base ?? '0'), 0n).toString();
    check('Mismo total servido (122000 mL) con y sin estimación', total(p1) === total(p0) && total(p1) === '122000', `${total(p0)} ${total(p1)}`);
    const herb = await cell('Herbicida de ensayo', 'reference');
    check('Herbicida: 111 L, Vigente, ejecución anterior al borrador', /111 L/.test(herb) && /Vigente/.test(herb) && /anterior al borrador/.test(herb), herb);
    check('La necesidad de Herbicida sigue en 120 L, sin la estimación sumada', /120 L/.test(await cell('Herbicida de ensayo', 'need')) && !/231/.test(await page.$eval('body', (el) => el.textContent)));
    const fung = await cell('Fungicida de ensayo', 'reference');
    check('Fungicida: «Datos insuficientes» con su motivo, sin cifra', /Datos insuficientes/.test(fung) && /comparable inmediatamente anterior/.test(fung) && !/\d L/.test(fung), fung);
    check('Insecticida: «Sin estimación»', /Sin estimación/.test(await cell('Insecticida de ensayo', 'reference')));
    check('Nota: no se suma, no es la cantidad solicitada, detalle en la pantalla de estimación', /no es la cantidad solicitada/.test(await page.$eval('[data-testid="reference-note"]', (el) => el.textContent)) && /Detalle en «Estimación del consumo»/.test(await page.$eval('[data-testid="reference-note"]', (el) => el.textContent)));
    await shot('03-propuesta-con-referencia');

    // 4. El borrador anterior: la misma ejecución, marcada como posterior a él.
    await openDraft(state.p0);
    await waitCell('Herbicida de ensayo', 'reference', /posterior al borrador/);
    check('P0 (histórico): la ejecución se marca posterior al borrador', /posterior al borrador/.test(await cell('Herbicida de ensayo', 'reference')));
    await shot('04-borrador-anterior');

    // 5. Exportación de P1: columnas del borrador intactas y la referencia aparte, igual que el servidor.
    await openDraft(state.p1);
    await waitCell('Herbicida de ensayo', 'reference', /anterior al borrador/);
    const csv1 = await downloadCsv();
    const problems1 = await csvMatchesServer(csv1.rows, state.p1);
    check('CSV de P1: columnas del borrador iguales al JSON y estimation_* iguales a la referencia', problems1.length === 0, problems1.join('; '));
    check('CSV de P1: la referencia está identificada en la cabecera', csv1.rows[0].includes('estimation_reference') && csv1.rows[1].includes('Estimación del consumo'));

    // 6. Fuentes que cambian: desactualizada, con su motivo.
    control('classify-extra');
    await proposals(ids.t1);
    await openDraft(state.p1);
    await waitCell('Herbicida de ensayo', 'reference', /Desactualizado/);
    check('Desactualizada: «Desactualizado» con el motivo y la cifra a la vista', /cambiaron desde el cálculo/.test(await cell('Herbicida de ensayo', 'reference')) && /111 L/.test(await cell('Herbicida de ensayo', 'reference')));
    await shot('05-referencia-desactualizada');

    // 7. Una fuente retirada: sin cifra.
    control('withdraw');
    await proposals(ids.t1);
    await openDraft(state.p1);
    await waitCell('Herbicida de ensayo', 'reference', /Cifra retirada/);
    check('Fuente retirada: «Cifra retirada», sin 111 L', !/111/.test(await cell('Herbicida de ensayo', 'reference')));
    const csv2 = await downloadCsv();
    const problems2 = await csvMatchesServer(csv2.rows, state.p1);
    check('CSV tras la retirada: igual al servidor y sin la cifra retirada', problems2.length === 0 && !csv2.rows.some((r) => r.includes('111000.000000')), problems2.join('; '));
    await shot('06-fuente-retirada');

    // 8. Respuesta diferida: la referencia de P1 llega después de cambiar de campaña.
    holdFor = state.p1;
    await openDraft(state.p1);
    await waitCell('Herbicida de ensayo', 'reference', /Cargando/);
    await page.select('#campaign-picker', ids.t2);
    await page.waitForFunction(() => !document.querySelector('[aria-label="Detalle del borrador"]'), { timeout: 10000 });
    state.currentCampaign = ids.t2;
    await page.waitForFunction(() => /Todavía no hay borradores/.test(document.querySelector('[aria-label="Historial de borradores"]')?.textContent ?? ''), { timeout: 10000 });
    const p2 = await generateDraft();
    state.p2 = p2.proposal_ref;
    await waitCell('Herbicida de ensayo', 'reference', /Sin estimación/);
    check('Se retuvo la referencia de P1 mientras se cambiaba de campaña', held.length >= 1, held.length);
    holdFor = null;
    for (const request of held.splice(0)) await request.continue();
    await sleep(2000);
    const afterLate = await cell('Herbicida de ensayo', 'reference');
    check('La referencia tardía de P1 no aparece en el borrador de la otra campaña', /Sin estimación/.test(afterLate) && /60 L/.test(await cell('Herbicida de ensayo', 'need')), afterLate);
    check('Borrador de la otra campaña con su propia necesidad (60 L)', /60 L/.test(await cell('Herbicida de ensayo', 'need')));
    await shot('07-respuesta-diferida-descartada');

    // 9. Campaña sellada: leer el borrador, su referencia y su CSV no recalcula ni modifica nada.
    state.currentCampaign = ids.t1;
    const draftBefore = (await api('GET', `/collective/proposals/${state.p1}`, state.token)).json;
    const closed = await api('POST', `/campaigns/${ids.t1}/close`, state.token, {});
    const review = await api('GET', `/collective/campaigns/${ids.t1}/seal`, state.token);
    const sealed = await api('POST', `/collective/campaigns/${ids.t1}/seal`, state.token, { confirmed: true, review_ref: review.json?.review?.review_ref });
    check('T1 se cierra y se sella por la API', closed.status === 200 && sealed.status === 200, `${closed.status} ${sealed.status}`);
    const beforeReads = snapshot();
    await proposals(ids.t1);
    await openDraft(state.p1);
    await waitCell('Herbicida de ensayo', 'reference', /Cifra retirada/);
    const csv3 = await downloadCsv();
    const afterReads = snapshot();
    const draftAfter = (await api('GET', `/collective/proposals/${state.p1}`, state.token)).json;
    // Recargar la página renueva la sesión del navegador (RefreshToken, AuthSession): es la autenticación, no la propuesta.
    const SESSION = ['RefreshToken', 'AuthSession'];
    const readChanges = changed(beforeReads, afterReads);
    check(
      'Sellada: ninguna tabla salvo las de sesión cambia al consultar el borrador, la referencia y el CSV',
      readChanges.every((t) => SESSION.includes(t)),
      `cambiadas: ${readChanges.join(',') || 'ninguna'}`,
    );
    check('Sellada: mismas líneas y huella que antes del sellado', draftAfter.inputs_fingerprint === draftBefore.inputs_fingerprint && JSON.stringify(draftAfter.lines) === JSON.stringify(draftBefore.lines) && draftAfter.seal !== null);
    check('Sellada: el CSV sigue igual al servidor', (await csvMatchesServer(csv3.rows, state.p1)).length === 0);
    await shot('08-campana-sellada');

    const privateAfter = snapshot();
    const privateChanged = changed(privateBefore, privateAfter).filter((t) => PRIVATE.includes(t));
    check('Tablas privadas de compras, lotes, movimientos, deudas y pagos idénticas', privateChanged.length === 0, privateChanged.join(','));
    state.tablesChanged = changed(privateBefore, privateAfter);
  } else if (phase === 'admin') {
    await login(ids.adminEmail);
    state.token = await apiLogin(ids.adminEmail);
    state.currentCampaign = ids.t1;
    await proposals(ids.t1);
    await openDraft(state.p1);
    await waitCell('Herbicida de ensayo', 'reference', /Cifra retirada|111 L/);
    check('El Administrador ve la misma referencia separada', /Estimación del consumo/.test(await page.$eval('[data-testid="reference-header"]', (el) => el.textContent)));
    await shot('09-administrador');
  } else if (phase === 'pending') {
    await login(ids.directorEmail);
    state.token = await apiLogin(ids.directorEmail);
    state.currentCampaign = ids.t1;
    await proposals(ids.t1);
    await openDraft(state.p1);
    await waitCell('Herbicida de ensayo', 'reference', /política de divulgación no está aprobada/);
    check('Política pendiente: sin cifra de estimación, con el motivo', !/\d L/.test(await cell('Herbicida de ensayo', 'reference')));
    const csv = await downloadCsv();
    check('Política pendiente: el CSV sigue disponible, con POLICY_PENDING', csv.rows[1].includes('POLICY_PENDING'));
    await shot('10-politica-pendiente');
  }
} catch (error) {
  check('El recorrido termina sin excepción', false, error?.stack ?? error);
  await shot(`error-${phase}`).catch(() => undefined);
} finally {
  save();
  await browser.close();
  await prisma.$disconnect();
}
const failed = checks.filter((c) => !c.ok);
process.stdout.write(`${phase}: ${checks.length - failed.length}/${checks.length}\n`);
for (const f of failed) process.stdout.write(`  FALLA ${f.name}: ${f.detail}\n`);
process.exit(failed.length ? 1 : 0);
