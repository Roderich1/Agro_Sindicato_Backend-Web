/**
 * Recorrido de la sesión C con la copia «rica» (sólo lectura). Uso: node recorrido-c.mjs <carpeta>
 * Entorno: WEB_URL, BROWSER_PATH, PUPPETEER_HOME, BE_DIR, DEMO_PG_ADMIN_URL, EDGE_PROFILE.
 * La contraseña de un solo uso llega por `password-pipe` y no se imprime ni se guarda.
 * Se abortan las lecturas del resumen y del sellado (al entrar, la Web va al Resumen) porque
 * sin sellar esa lectura ejecuta la decisión de divulgación en el servidor.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir] = process.argv.slice(2);
const { WEB_URL = 'http://127.0.0.1:5173', BROWSER_PATH, PUPPETEER_HOME, BE_DIR, EDGE_PROFILE } = process.env;
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const failures = [];
const say = (line) => { console.log(line); log.push(line); };
const check = (ok, what) => { say(`${ok ? 'OK   ' : 'FALLA'} ${what}`); if (!ok) failures.push(what); };

/* Presentación igual a lib/quantity.ts (BigInt sobre texto). */
const UNIT = { ML: 'L', G: 'KG' };
const group = (d) => { const [w, f] = d.split('.'); const g = w.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return f ? `${g},${f}` : g; };
const toPres = (b) => { const v = BigInt(b); const f = (v % 1000n).toString().padStart(3, '0').replace(/0+$/, ''); return f ? `${v / 1000n}.${f}` : `${v / 1000n}`; };
const fmtQ = (b, u) => `${group(toPres(b))} ${UNIT[u]}`;
const decPres = (base) => {
  const m = /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.exec(base); const whole = m[1]; const digits = whole + (m[2] ?? '').slice(1); const point = whole.length - 3;
  const integer = point <= 0 ? '0' : digits.slice(0, point).replace(/^0+(?=\d)/, '');
  const fraction = (point <= 0 ? '0'.repeat(-point) + digits : digits.slice(point)).replace(/0+$/, '');
  return fraction ? `${integer}.${fraction}` : integer;
};
const fmtD = (b, u) => `${group(decPres(b))} ${UNIT[u]}`;
const micro = (s) => { const [w, f = ''] = s.split('.'); return BigInt(w) * 1000000n + BigInt(f.padEnd(6, '0')); };

const browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, userDataDir: EDGE_PROFILE, defaultViewport: { width: 1366, height: 768 }, args: ['--lang=es-BO'] });
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
const methods = {};
const writes = [];
const aborted = [];
const consoleErrors = [];
const json = new Map();
await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = new URL(req.url());
  if (url.pathname.startsWith('/api/')) {
    const key = `${req.method()} ${url.pathname.replace(/[0-9a-f-]{36}/g, ':id')}`;
    methods[key] = (methods[key] ?? 0) + 1;
    if (req.method() !== 'GET' && !/\/auth\/(login|refresh)$/.test(url.pathname)) writes.push(key);
    if (req.method() === 'GET' && /\/collective\/campaigns\/[^/]+\/(summary|seal)$/.test(url.pathname)) { aborted.push(key); return req.abort(); }
  }
  req.continue();
});
page.on('response', async (res) => {
  const url = new URL(res.url());
  if (res.request().method() === 'GET' && url.pathname.startsWith('/api/') && (res.headers()['content-type'] ?? '').includes('json')) {
    try { json.set(url.pathname + url.search, await res.json()); } catch { /* sin cuerpo */ }
  }
});
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${String(err).slice(0, 200)}`));

await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#email', { timeout: 60000 });
await page.type('#email', 'directiva.demo@example.test');
{
  const pw = execFileSync(process.execPath, [join(BE_DIR, 'tool/demo/demo-central.cjs'), 'password-pipe', 'directiva'], { cwd: join(BE_DIR, 'Back'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  await page.type('#password', pw);
}
await Promise.all([page.waitForResponse((r) => r.url().endsWith('/auth/login'), { timeout: 20000 }), page.click('button[type="submit"]')]);
await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 20000 });
await sleep(2000);

const go = async (path) => {
  await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path);
  await sleep(2500);
};
const shot = async (name) => {
  for (const [w, h] of [[1366, 768], [390, 844], [320, 568]]) {
    await page.setViewport({ width: w, height: h });
    await sleep(700);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(over <= 0, `${name} a ${w} px sin desplazamiento lateral de la página (${over} px)`);
    await page.screenshot({ path: join(outDir, `${name}-${w}.png`), fullPage: w !== 1366 });
  }
  await page.setViewport({ width: 683, height: 384 });
  await sleep(700);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 0, `${name} con zoom 200 % (683 px) sin desplazamiento lateral (${over} px)`);
  await page.screenshot({ path: join(outDir, `${name}-1366-zoom200.png`) });
  await page.setViewport({ width: 1366, height: 768 });
  await sleep(500);
};
const latest = (prefix) => [...json.entries()].filter(([k]) => k.startsWith(prefix)).pop()?.[1];
const text = (sel) => page.$eval(sel, (el) => el.textContent ?? '').catch(() => null);

/* ── Necesidades y propuestas ─────────────────────────────────────────── */
await go('/colectivo/propuestas');
const campaigns = json.get('/api/v1/campaigns') ?? [];
say(`Campañas en la copia: ${campaigns.length}`);
const options = await page.$$eval('#campaign-selector option', (os) => os.map((o) => o.value).filter(Boolean));
let withDraft = null;
let withoutDraft = null;
for (const id of options) {
  await page.select('#campaign-selector', id);
  await sleep(2500);
  const list = json.get(`/api/v1/collective/campaigns/${id}/proposals`);
  if (!list) continue;
  if (list.length > 0 && !withDraft) {
    withDraft = id;
    const proposal = json.get(`/api/v1/collective/proposals/${list[0].proposal_ref}`);
    await page.waitForFunction(() => document.querySelector('[data-testid="reference-header"]'), { timeout: 15000 }).catch(() => undefined);
    await sleep(1500);
    const reference = json.get(`/api/v1/collective/proposals/${list[0].proposal_ref}/estimation-reference`);
    check(Boolean(proposal), `borrador abierto por consulta (${list[0].proposal_ref.slice(0, 8)}) en ${campaigns.find((c) => c.id === id)?.name}`);
    check((await text('[data-testid="reference-header"]')) === 'Estimación del consumo (referencia)', 'rótulo «Estimación del consumo (referencia)»');
    let needs = 0, refs = 0, diffs = 0;
    for (const line of proposal?.lines ?? []) {
      const row = `[data-testid="line-${line.product_name}-${line.base_unit}"]`;
      const need = await text(`${row} [data-testid="need"]`);
      if (line.status === 'DISCLOSED' && line.quantity_base !== null) {
        needs++;
        check(need?.includes(fmtQ(line.quantity_base, line.base_unit)), `necesidad ${line.product_name}: ${fmtQ(line.quantity_base, line.base_unit)} = API`);
      } else check(!/\d[\d.,]* (L|KG)\b/.test(need ?? ''), `necesidad ${line.product_name} (${line.status}) sin cifra`);
      const ref = reference?.lines.find((r) => r.position === line.position);
      const cell = await text(`${row} [data-testid="reference"]`);
      const e = ref?.estimation;
      if (e && e.status === 'ESTIMATED' && e.estimate_base !== null) {
        refs++;
        check(cell?.includes(fmtD(e.estimate_base, ref.base_unit)), `referencia ${line.product_name}: ${fmtD(e.estimate_base, ref.base_unit)} = API`);
      }
      const comparable = Boolean(e && ref.absence === null && e.status === 'ESTIMATED' && e.validity === 'CURRENT' && e.estimate_base !== null && micro(e.estimate_base) > 0n && line.status === 'DISCLOSED' && line.quantity_base !== null);
      const shown = (await page.$(`${row} [data-testid="reference-difference"]`)) !== null;
      if (comparable) diffs++;
      check(shown === comparable, `diferencia ${line.product_name}: ${comparable ? 'comparable y mostrada' : 'no comparable y no mostrada'}`);
      check(!/%/.test(cell ?? ''), `referencia ${line.product_name} sin porcentaje`);
    }
    say(`   (${needs} necesidades, ${refs} referencias con cifra, ${diffs} diferencias comparables)`);
    check((await text('[data-testid="reference-evaluated"]'))?.startsWith('Vigencia evaluada el') ?? false, 'vigencia evaluada visible en la referencia');
    const href = await page.$eval('[data-testid="reference-note"] a', (a) => a.getAttribute('href')).catch(() => null);
    check(href === `/colectivo/historico?vista=estimacion&campaign=${id}`, `enlace al detalle: ${href}`);
    await shot('propuestas-con-borrador');
  } else if (list.length === 0 && !withoutDraft) {
    withoutDraft = id;
    check(Boolean(await page.$('[data-state="empty"]')), `campaña sin borrador (${campaigns.find((c) => c.id === id)?.name}): estado «sin borradores», sin cifras`);
    await shot('propuestas-sin-borrador');
  }
  if (withDraft && withoutDraft) break;
}
check(Boolean(withDraft), 'hay una campaña con borrador');
check(Boolean(withoutDraft), 'hay una campaña sin borrador');

/* ── Histórico: tendencias ────────────────────────────────────────────── */
await go('/colectivo/historico?vista=tendencias');
await page.waitForSelector('[data-testid="trend-chart"], [data-state]', { timeout: 20000 }).catch(() => undefined);
await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
await sleep(500);
{
  const trends = latest('/api/v1/collective/trends');
  say(`Tendencias: ${trends?.campaigns.length} campañas, ${trends?.series.length} series (${trends?.disclosure.mode})`);
  let points = 0;
  for (const s of trends?.series ?? []) {
    const nameOf = new Map(trends.campaigns.map((c) => [c.campaign_ref, c.name]));
    for (const p of s.points) {
      const t = await text(`[data-testid="series-${s.projection_type}-${s.product_name}-${s.base_unit}"] [data-testid="point-${nameOf.get(p.campaign_ref)}"]`);
      if (p.status === 'DISCLOSED' && p.total_base !== null) { points++; if (!t?.includes(fmtQ(p.total_base, s.base_unit))) check(false, `tendencia ${s.product_name} ${nameOf.get(p.campaign_ref)}: ${fmtQ(p.total_base, s.base_unit)}`); }
      else if (/\d[\d.,]* (L|KG)\b/.test(t ?? '')) check(false, `tendencia ${s.product_name} ${nameOf.get(p.campaign_ref)} (${p.status}) muestra cifra`);
    }
  }
  check(points > 0, `tendencias: ${points} cifras publicadas cotejadas con la API (tabla), huecos sin cifra`);
  const titles = await page.$$eval('[data-testid="trend-chart"] rect title', (ts) => ts.map((t) => t.textContent));
  const first = trends?.series[0];
  const expected = (first?.points ?? []).filter((p) => p.status === 'DISCLOSED' && p.total_base !== null && trends.campaigns.find((c) => c.campaign_ref === p.campaign_ref)?.seal).map((p) => `${trends.campaigns.find((c) => c.campaign_ref === p.campaign_ref).name}: ${fmtQ(p.total_base, first.base_unit)}`);
  check(JSON.stringify(titles) === JSON.stringify(expected), `gráfico (${first?.product_name}) = API: ${titles.length} columnas`);
  check((await page.evaluate(() => document.getAnimations().length)) === 0, 'sin animaciones en curso (prefers-reduced-motion)');
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = false)));
  await shot('historico-tendencias');
}

/* ── Histórico: estimación (teclado: Vista → Estimación del consumo con Enter) ── */
await page.evaluate(() => [...document.querySelectorAll('[role="group"][aria-label="Vista"] button')].find((b) => b.textContent === 'Estimación del consumo')?.focus());
await page.keyboard.press('Enter');
await sleep(3000);
check(page.url().includes('vista=estimacion'), `teclado: Enter en la vista cambia a ?vista=estimacion (${new URL(page.url()).search})`);
const estOptions = await page.$$eval('#campaign-selector option', (os) => os.map((o) => o.value).filter(Boolean));
let estimated = null, insufficient = null;
for (const id of estOptions) {
  await page.select('#campaign-selector', id);
  await sleep(3500);
  const r = json.get(`/api/v1/estimation/results?target_campaign_ref=${id}`);
  if (!r) continue;
  const name = campaigns.find((c) => c.id === id)?.name;
  const hasEst = r.results.some((x) => x.status === 'ESTIMATED' && x.estimate_base !== null);
  const hasIns = r.results.some((x) => x.status === 'INSUFFICIENT_DATA');
  if ((hasEst && !estimated) || (hasIns && !insufficient)) {
    for (const x of r.results) {
      const row = `[data-testid="result-${x.product.name}"]`;
      const est = await text(`${row} [data-testid="estimate"]`);
      const naive = await text(`${row} [data-testid="naive"]`);
      if (x.status === 'ESTIMATED' && x.estimate_base !== null) {
        check(est?.startsWith(fmtD(x.estimate_base, x.base_unit)), `estimación ${name} / ${x.product.name}: ${fmtD(x.estimate_base, x.base_unit)} = API`);
        if (x.naive_base !== null) check(naive?.startsWith(fmtQ(x.naive_base, x.base_unit)), `línea base ${x.product.name}: ${fmtQ(x.naive_base, x.base_unit)} = API`);
      } else check(!/\d[\d.,]* (L|KG)/.test(est ?? ''), `${x.product.name} (${x.status}${x.validity_reason ? ', ' + x.validity_reason : ''}): sin cifra («${est}»)`);
    }
    check((await text('[data-testid="results-evaluated"]'))?.startsWith('Vigencia evaluada el') ?? false, `evaluated_at visible (${name})`);
    if (hasEst && !estimated) { estimated = id; await shot('historico-estimacion-con-resultados'); }
    if (hasIns && !insufficient) { insufficient = id; if (id !== estimated) await shot('historico-estimacion-datos-insuficientes'); }
  }
  if (estimated && insufficient) break;
}
check(Boolean(estimated), 'hay una campaña objetivo con estimación');
say(insufficient ? 'Hay una campaña con «Datos insuficientes».' : 'Ninguna campaña de la copia tiene «Datos insuficientes».');

/* ── Catálogo ─────────────────────────────────────────────────────────── */
await go('/colectivo/catalogo?vista=productos');
await page.waitForSelector('#product-search', { timeout: 20000 }).catch(() => undefined);
{
  const products = latest('/api/v1/inventory/products') ?? [];
  const active = products.filter((p) => p.isActive);
  check((await text('[data-testid="products-count"]')) === `${active.length} ${active.length === 1 ? 'producto activo' : 'productos activos'}.`, `catálogo: ${active.length} activos = API`);
  const groups = await page.$$eval('[data-testid^="group-"]', (gs) => gs.map((g) => g.getAttribute('data-testid')));
  say(`   grupos por categoría: ${groups.join(', ')}`);
  await shot('catalogo-productos');
  const sample = active.find((p) => /[áéíóúÁÉÍÓÚ]/.test(p.name)) ?? active[0];
  const plain = sample ? sample.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().slice(0, 6) : 'xyz';
  await page.type('#product-search', plain);
  await sleep(600);
  const found = await page.$$eval('[data-testid^="product-"]', (rows) => rows.map((r) => r.getAttribute('data-testid').slice(8)));
  check(found.includes(sample?.name), `búsqueda «${plain}» (sin tildes, mayúsculas) encuentra «${sample?.name}» (${found.length} filas)`);
  await page.click('#product-search', { clickCount: 3 });
  await page.type('#product-search', 'zzzz sin coincidencia');
  await sleep(500);
  check(Boolean(await page.$('[data-state="no-match"]')), 'sin coincidencias: estado propio');
  await shot('catalogo-sin-coincidencias');
  const clear = await page.$$('[data-state="no-match"] button');
  if (clear[0]) await clear[0].click();
  await sleep(500);
  check((await page.$$('[data-testid^="product-"]')).length === active.length, '«Quitar filtros» vuelve a mostrar todos');
}
await page.evaluate(() => [...document.querySelectorAll('[role="group"][aria-label="Vista"] button')].find((b) => b.textContent === 'Equivalencias')?.click());
await sleep(2500);
{
  const list = latest('/api/v1/collective/product-associations');
  const current = await page.$$eval('[data-testid^="current-"]', (rows) => rows.length);
  check(current === (list?.current.length ?? -1), `equivalencias vigentes: ${current} = API`);
  await shot('catalogo-equivalencias');
}

/* ── Teclado: los primeros 12 focos con foco visible ─────────────────── */
{
  await page.evaluate(() => document.activeElement?.blur());
  const stops = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    stops.push(await page.evaluate(() => {
      const el = document.activeElement; const s = getComputedStyle(el);
      return `${el.tagName.toLowerCase()}«${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}»${s.outlineStyle !== 'none' || s.boxShadow !== 'none' ? '' : ' (sin foco visible)'}`;
    }));
  }
  say(`Tab: ${stops.join(' → ')}`);
}

await browser.close();
say(`Métodos HTTP: ${JSON.stringify(methods)}`);
check(writes.length === 0, `escrituras de negocio: ${writes.length} ${writes.join(', ')}`);
say(`Lecturas abortadas a propósito (resumen/sellado): ${aborted.length}`);
const relevant = consoleErrors.filter((e) => !/net::ERR_FAILED|summary|seal|Failed to load resource/.test(e));
say(`Errores de consola: ${consoleErrors.length} (${relevant.length} sin relación con las lecturas abortadas)`);
relevant.slice(0, 10).forEach((e) => say(`   ${e}`));
say(`FALLAS: ${failures.length}`);
writeFileSync(join(outDir, 'recorrido-c.log'), log.join('\n') + '\n');
