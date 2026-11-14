/**
 * Recorrido de la defensa en Edge sin interfaz: Resumen → Propuesta → Tendencias → Estimación
 * (más Cobertura, Campañas y Equivalencias). Navega dentro de la SPA (sin recargas:
 * /auth/refresh está limitado a 5 por minuto) y en cada vista comprueba lo que exige el
 * guion: título, acción principal y comienzo del resultado sin desplazamiento a 1366×768;
 * cifra publicada y oculta; apertura del último borrador sin generar uno; exportación del
 * CSV; estimación con cifra y caso con datos insuficientes; gráfico antes de la tabla.
 * Después repite las capturas a 1920×1080 y comprueba el ancho reducido (390 px).
 *
 *   node recorrido-panel.mjs <carpeta de salida>
 *
 * Entorno: WEB_URL (http://127.0.0.1:5198), BROWSER_PATH, PUPPETEER_HOME (carpeta con
 * node_modules/puppeteer-core), BE_DIR (worktree con tool/demo/demo-central.cjs y Back/),
 * DEMO_PG_ADMIN_URL y DEMO_API de la copia sintética. La contraseña de un solo uso de la
 * Directiva llega por la tubería `password-pipe` y no se imprime ni se guarda.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = '.'] = process.argv.slice(2);
const { WEB_URL = 'http://127.0.0.1:5198', BROWSER_PATH, PUPPETEER_HOME, BE_DIR } = process.env;
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const failures = [];
const say = (line) => {
  console.log(line);
  log.push(line);
};
const check = (ok, what) => {
  say(`${ok ? 'OK ' : 'FALLA'} ${what}`);
  if (!ok) failures.push(what);
};

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: true,
  userDataDir: join(outDir, 'perfil-panel'),
  defaultViewport: { width: 1366, height: 768 },
  args: ['--lang=es-BO'],
  protocolTimeout: 60000,
});
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
const posts = [];
page.on('request', (request) => {
  if (request.method() === 'POST') posts.push(new URL(request.url()).pathname);
});
await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
if (page.url().endsWith('/login')) {
  await page.type('#email', 'directiva.demo@example.test');
  const pw = execFileSync(process.execPath, [join(BE_DIR, 'tool/demo/demo-central.cjs'), 'password-pipe', 'directiva'], {
    cwd: join(BE_DIR, 'Back'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await page.type('#password', pw);
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/auth/login'), { timeout: 20000 }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 20000 });
}
await sleep(2500);

const go = async (path) => {
  const ok = await page.evaluate((p) => {
    const links = [...document.querySelectorAll(`aside nav a[href="${p}"]`)];
    const link = links[links.length - 1];
    if (!link) return false;
    link.click();
    return true;
  }, path);
  if (!ok) throw new Error(`no hay enlace a ${path}`);
  await sleep(2500);
};
const clickText = (text, nth = 0) =>
  page.evaluate(
    (t, n) => {
      const target = [...document.querySelectorAll('button, a, summary')].filter((x) => x.textContent.trim() === t)[n];
      if (!target) return false;
      target.click();
      return true;
    },
    text,
    nth,
  );
const shot = async (name) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: false });
  await page.screenshot({ path: join(outDir, `${name}-completa.png`), fullPage: true });
};
/** Estado de la vista: qué se ve sin desplazarse y cuánto hay que bajar. */
const inspect = (firstResultSelector) =>
  page.evaluate((sel) => {
    const top = (el) => (el ? Math.round(el.getBoundingClientRect().top) : null);
    const bottom = (el) => (el ? Math.round(el.getBoundingClientRect().bottom) : null);
    const main = document.querySelector('main');
    const primary = [...document.querySelectorAll('main a, main button')].filter((el) => /from-emerald-600/.test(el.className) && el.getBoundingClientRect().height > 0);
    const tenant = document.querySelector('aside p[title]');
    return {
      path: location.pathname,
      h1: document.querySelector('h1')?.innerText,
      innerH: window.innerHeight,
      innerW: window.innerWidth,
      scrollH: document.documentElement.scrollHeight,
      scrollW: document.documentElement.scrollWidth,
      toolbarBottom: bottom(main?.querySelector('[data-testid="toolbar"]')),
      firstResultTop: top(document.querySelector(sel)),
      primaryActions: primary.map((el) => el.textContent.trim()),
      primaryBottom: primary.length ? bottom(primary[0]) : null,
      synthetic: document.querySelector('[data-testid="synthetic-badge"]')?.textContent ?? null,
      tenantFits: tenant ? tenant.scrollWidth <= tenant.clientWidth + 1 && tenant.scrollHeight <= tenant.clientHeight + 1 : null,
      tenantText: tenant?.textContent ?? null,
      menu: [...document.querySelectorAll('aside nav a')].map((a) => a.innerText.trim()).filter((v, i, arr) => arr.indexOf(v) === i),
      figures: [...document.querySelectorAll('.text-3xl, .text-2xl')].map((el) => el.textContent.trim()).filter(Boolean).slice(0, 8),
    };
  }, firstResultSelector);

/* ── 1. Resumen colectivo ── */
await go('/colectivo/resumen');
let r = await inspect('[data-testid^="cell-DECLARED_NEED"]');
say(`resumen: ${JSON.stringify(r)}`);
check(r.h1 === 'Resumen colectivo', 'Resumen: título');
check(r.firstResultTop !== null && r.firstResultTop < r.innerH, `Resumen: la primera fila de necesidad empieza a ${r.firstResultTop}px (< ${r.innerH})`);
check(r.primaryActions.length === 1 && r.primaryActions[0] === 'Revisar borrador', `Resumen: una sola acción primaria (${r.primaryActions.join(', ')})`);
check(r.synthetic === 'Datos sintéticos', 'Resumen: etiqueta «Datos sintéticos» en la cabecera');
check(r.tenantFits === true, `Resumen: nombre del sindicato sin truncar («${r.tenantText}»)`);
check(JSON.stringify(r.menu) === JSON.stringify(['Resumen colectivo', 'Propuesta conjunta', 'Tendencias', 'Estimación del consumo', 'Cobertura', 'Productos', 'Campañas', 'Equivalencias de productos']), `menú: ${r.menu.join(' | ')}`);
const rows = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid^="cell-DECLARED_NEED"]')].map((row) => ({ id: row.dataset.testid, text: row.innerText.replace(/\s+/g, ' ').trim() })),
);
say(`filas: ${JSON.stringify(rows)}`);
check(rows.some((row) => /Publicado/.test(row.text) && /\d+ L/.test(row.text)), 'Resumen: una cifra publicada con unidad');
check(rows.some((row) => /Oculto por privacidad/.test(row.text) && !/\d+ L/.test(row.text)), 'Resumen: una cifra oculta por privacidad sin cantidad');
const coverage = await page.$eval('[data-testid="coverage"]', (el) => el.innerText.replace(/\s+/g, ' ').trim());
say(`cobertura: ${coverage}`);
check(/\d+ de \d+ agricultores vinculados con cifras publicadas/.test(coverage) && /Ver cobertura/.test(coverage), 'Resumen: tarjeta de cobertura con enlace');
await shot('1-resumen-1366x768');

/* ── 2. Propuesta conjunta (desde «Revisar borrador») ── */
const postsBefore = posts.length;
if (!(await clickText('Revisar borrador'))) throw new Error('sin «Revisar borrador»');
await sleep(3500);
r = await inspect('[data-testid^="line-"]');
say(`propuesta: ${JSON.stringify(r)}`);
check(r.h1 === 'Propuesta conjunta', 'Propuesta: título');
check(r.firstResultTop !== null && r.firstResultTop < r.innerH, `Propuesta: la primera línea del borrador empieza a ${r.firstResultTop}px`);
check(r.primaryActions.length === 1 && r.primaryActions[0] === 'Generar borrador', `Propuesta: una sola acción primaria (${r.primaryActions.join(', ')})`);
const generated = posts.slice(postsBefore).filter((p) => /propos|propuest/i.test(p));
check(generated.length === 0, `Propuesta: el último borrador se abrió por consulta, sin POST (${generated.join(', ') || 'ninguno'})`);
const draft = await page.evaluate(() => {
  const detail = document.querySelector('[aria-label="Detalle del borrador"]');
  return {
    header: detail?.querySelector('h2')?.innerText,
    badge: /^Borrador · /.test(detail?.querySelector('h2')?.innerText ?? '') && /Generado el /.test(detail?.innerText ?? ''),
    lines: [...document.querySelectorAll('[data-testid^="line-"]')].map((row) => row.innerText.replace(/\s+/g, ' ').trim().slice(0, 120)),
    referenceHeader: document.querySelector('[data-testid="reference-header"]')?.innerText,
  };
});
say(`borrador: ${JSON.stringify(draft)}`);
check(draft.badge && /^Borrador/.test(draft.header ?? ''), 'Propuesta: etiqueta «Borrador» y fecha');
check(/Referencia de consumo/.test(draft.referenceHeader ?? ''), 'Propuesta: columna «Referencia de consumo» separada de la necesidad');
await shot('2-propuesta-1366x768');
const csv = page.waitForResponse((res) => /csv/i.test(res.url()), { timeout: 15000 }).catch(() => null);
await clickText('Exportar CSV');
const csvResponse = await csv;
check(csvResponse !== null && csvResponse.status() === 200, `Propuesta: «Exportar CSV» pide el CSV al servidor (${csvResponse ? csvResponse.status() : 'sin respuesta'})`);
await page.evaluate(() => {
  const details = document.querySelector('details[aria-label="Historial de borradores"]');
  if (details) details.open = true;
});
await sleep(500);
await shot('2b-propuesta-historial-1366x768');

/* ── 3. Tendencias ── */
await go('/colectivo/tendencias');
r = await inspect('[data-testid="trend-chart"]');
say(`tendencias: ${JSON.stringify(r)}`);
check(r.h1 === 'Tendencias', 'Tendencias: título');
const trend = await page.evaluate(() => {
  const chart = document.querySelector('[data-testid="trend-chart"]');
  const sources = document.querySelector('[data-testid="sources"]');
  const pressed = [...document.querySelectorAll('[data-testid="trend-type"] button')].map((b) => `${b.textContent.trim()}=${b.getAttribute('aria-pressed')}`);
  return {
    chartTop: chart ? Math.round(chart.getBoundingClientRect().top) : null,
    chartBottom: chart ? Math.round(chart.getBoundingClientRect().bottom) : null,
    sourcesTop: sources ? Math.round(sources.getBoundingClientRect().top) : null,
    sourcesOpen: sources?.open ?? null,
    aria: chart?.getAttribute('aria-label'),
    titles: [...(chart?.querySelectorAll('title') ?? [])].map((t) => t.textContent),
    pressed,
    products: [...document.querySelectorAll('#trend-product option')].map((o) => o.textContent),
  };
});
say(`gráfico: ${JSON.stringify(trend)}`);
check(trend.chartTop !== null && trend.sourcesTop !== null && trend.chartTop < trend.sourcesTop, 'Tendencias: el gráfico aparece antes de la tabla');
check(trend.chartBottom !== null && trend.chartBottom <= r.innerH, `Tendencias: el gráfico completo cabe sin desplazarse (termina a ${trend.chartBottom}px)`);
check(trend.pressed[0] === 'Consumo publicado=true', `Tendencias: abre con «Consumo publicado» (${trend.pressed.join(', ')})`);
check(trend.sourcesOpen === false, 'Tendencias: campañas, versión y cobertura plegadas en «Ver campañas y cobertura»');
await shot('3-tendencias-1366x768');
await clickText('Necesidad declarada');
await sleep(2500);
const needEmpty = await page.evaluate(() => document.querySelector('main')?.innerText.includes('Filtro aplicado') ?? false);
say(`tendencias/necesidad: estado vacío con filtro = ${needEmpty}`);
await shot('3b-tendencias-necesidad-1366x768');
await clickText('Consumo publicado');
await sleep(2500);

/* ── 4. Estimación del consumo ── */
await go('/colectivo/estimacion');
// Con muchos productos la estimación carga el detalle de cada ejecución: se espera al primer resultado.
await page.waitForSelector('[data-testid^="result-"]', { timeout: 20000 }).catch(() => null);
r = await inspect('[data-testid^="result-"]');
say(`estimación: ${JSON.stringify(r)}`);
check(r.h1 === 'Estimación del consumo', 'Estimación: título');
check(r.primaryActions.length === 1 && r.primaryActions[0] === 'Generar estimación' && r.primaryBottom < r.innerH, `Estimación: «Generar estimación» arriba (${r.primaryActions.join(', ')})`);
check(r.firstResultTop !== null && r.firstResultTop < r.innerH, `Estimación: el primer resultado empieza a ${r.firstResultTop}px`);
const results = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid^="result-"]')].map((row) => ({
    id: row.dataset.testid,
    estimate: row.querySelector('[data-testid="estimate"]')?.textContent.trim(),
    naive: row.querySelector('[data-testid="naive"]')?.textContent.trim(),
    base: row.querySelector('[data-testid="observed-last"]')?.textContent.trim(),
    validity: row.querySelector('[data-testid="validity"]')?.textContent.trim(),
    reason: row.querySelector('[data-testid="reason"]')?.textContent.trim() ?? null,
    earlier: row.querySelector('[data-testid="earlier-run"]')?.textContent.trim() ?? null,
  })),
);
say(`resultados: ${JSON.stringify(results)}`);
check(results.some((x) => /^\d+ L/.test(x.estimate ?? '') && /^\d+ L/.test(x.naive ?? '')), 'Estimación: una estimación con cifra y su línea base (último consumo publicado)');
check(results.some((x) => x.estimate === 'Datos insuficientes' && x.reason), 'Estimación: un caso «Datos insuficientes» con motivo y sin cifra');
await shot('4-estimacion-1366x768');
await page.evaluate(() => document.querySelectorAll('main table details').forEach((d) => { d.open = true; }));
await sleep(500);
await shot('4b-estimacion-detalle-1366x768');

/* ── 5. Cobertura, Campañas y Equivalencias ── */
await go('/colectivo/cobertura');
r = await inspect('[data-testid="coverage"]');
say(`cobertura: ${JSON.stringify(r)}`);
check(r.h1 === 'Cobertura', 'Cobertura: título');
await shot('5-cobertura-1366x768');
await go('/campaigns');
r = await inspect('[data-testid^="campaign-row-"]');
say(`campañas: ${JSON.stringify(r)}`);
check(r.firstResultTop !== null && r.firstResultTop < r.innerH, `Campañas: la activa arriba y el historial empieza a ${r.firstResultTop}px`);
await shot('6-campanas-1366x768');
await go('/colectivo/reconciliacion');
r = await inspect('[data-testid^="product-"], [data-testid^="current-"]');
say(`equivalencias: ${JSON.stringify(r)}`);
check(r.h1 === 'Equivalencias de productos', 'Equivalencias: título');
await shot('7-equivalencias-1366x768');

/* ── 6. 1920×1080 y ancho reducido ── */
await page.setViewport({ width: 1920, height: 1080 });
for (const [path, name, sel] of [
  ['/colectivo/resumen', '1-resumen-1920x1080', '[data-testid^="cell-DECLARED_NEED"]'],
  ['/colectivo/propuestas', '2-propuesta-1920x1080', '[data-testid^="line-"]'],
  ['/colectivo/tendencias', '3-tendencias-1920x1080', '[data-testid="trend-chart"]'],
  ['/colectivo/estimacion', '4-estimacion-1920x1080', '[data-testid^="result-"]'],
]) {
  await go(path);
  r = await inspect(sel);
  say(`${name}: ${JSON.stringify({ h1: r.h1, firstResultTop: r.firstResultTop, scrollW: r.scrollW, innerW: r.innerW })}`);
  check(r.firstResultTop !== null && r.firstResultTop < r.innerH && r.scrollW <= r.innerW, `${name}: resultado visible y sin desbordamiento horizontal`);
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: false });
}
await page.setViewport({ width: 390, height: 844 });
for (const [path, name, sel] of [
  ['/colectivo/resumen', '1-resumen-390', '[data-testid^="cell-DECLARED_NEED"]'],
  ['/colectivo/propuestas', '2-propuesta-390', '[data-testid^="line-"]'],
  ['/colectivo/estimacion', '4-estimacion-390', '[data-testid^="result-"]'],
]) {
  // Con 390 px el menú lateral está oculto: se navega por la barra inferior o por la URL del historial.
  await page.evaluate((p) => {
    const link = [...document.querySelectorAll(`a[href="${p}"]`)].pop();
    if (link) link.click();
  }, path);
  await sleep(2500);
  r = await inspect(sel);
  say(`${name}: ${JSON.stringify({ path: r.path, h1: r.h1, scrollW: r.scrollW, innerW: r.innerW })}`);
  check(r.scrollW <= r.innerW + 1, `${name}: sin desplazamiento horizontal de la página (${r.scrollW} ≤ ${r.innerW})`);
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: false });
}

say(`fallos: ${failures.length}`);
writeFileSync(join(outDir, 'recorrido-panel.log'), log.join('\n') + '\n');
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
