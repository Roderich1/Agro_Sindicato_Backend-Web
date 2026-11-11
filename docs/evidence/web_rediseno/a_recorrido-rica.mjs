/**
 * Recorrido de la sesión A (etapa 2, 2026-11-10) con datos del servidor: copia «rica»
 * (API 3342, PG 15433), SÓLO LECTURA. Navega dentro de la SPA (sin recargas: /auth/refresh
 * está limitado) y comprueba el armazón y la navegación por tareas: menú y grupo
 * Administración, cada ítem a su vista, redirecciones de rutas antiguas con ?campaign=,
 * cobertura por enlace, un solo h1, teclado, menú del teléfono y barra inferior (390 y
 * 320 px), zoom 200 % (683×384 a 2x), movimiento reducido, escrituras y consola. Después,
 * agricultor1: sin menú ni datos.
 *
 *   node a_recorrido-rica.mjs <carpeta de salida>
 *
 * Entorno: WEB_URL (http://127.0.0.1:5171), BROWSER_PATH, PUPPETEER_HOME, BE_DIR (worktree
 * con tool/demo/demo-central.cjs y Back/), DEMO_PG_ADMIN_URL y DEMO_API de la copia «rica».
 * Las contraseñas de un solo uso llegan por la tubería `password-pipe`: no se imprimen ni
 * se guardan.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = '.'] = process.argv.slice(2);
const { WEB_URL = 'http://127.0.0.1:5171', BROWSER_PATH, PUPPETEER_HOME, BE_DIR } = process.env;
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Pausa entre vistas: la API limita a 20 peticiones por minuto por IP (ThrottlerModule). */
const PACE = Number(process.env.PACE_MS ?? 2500);
const log = [];
const failures = [];
const say = (line) => {
  console.log(line);
  log.push(line);
};
const check = (ok, what) => {
  say(`${ok ? 'OK   ' : 'FALLA'} ${what}`);
  if (!ok) failures.push(what);
};

const browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, args: ['--lang=es-BO'], protocolTimeout: 60000 });

/** Página en un contexto propio, con registro de escrituras, peticiones y consola. */
async function openPage() {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setBypassServiceWorker(true);
  await page.setViewport({ width: 1366, height: 768 });
  const state = { writes: [], apiGets: [], consoleErrors: [], failed: [] };
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/') && response.status() >= 400) state.failed.push(`${response.request().method()} ${url.pathname} ${response.status()}`);
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return;
    if (request.method() === 'GET') state.apiGets.push(url.pathname);
    else state.writes.push(`${request.method()} ${url.pathname}`);
  });
  page.on('console', (msg) => msg.type() === 'error' && state.consoleErrors.push(msg.text()));
  page.on('pageerror', (err) => state.consoleErrors.push(String(err)));
  return { context, page, state };
}

async function login(page, email, roleKey) {
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', email);
  const pw = execFileSync(process.execPath, [join(BE_DIR, 'tool/demo/demo-central.cjs'), 'password-pipe', roleKey], {
    cwd: join(BE_DIR, 'Back'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await page.type('#password', pw);
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/auth/login'), { timeout: 20000 }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 20000 });
  await sleep(PACE);
}

/** Navegación interna de la SPA (sin recarga): pushState + popstate, que escucha el router. */
async function spa(page, url) {
  await page.evaluate((u) => {
    window.history.pushState({}, '', u);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, url);
  await sleep(PACE);
}

const view = (page) =>
  page.evaluate(() => ({
    path: location.pathname,
    search: location.search,
    h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.trim()),
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    current: [...document.querySelectorAll('aside nav a[aria-current="page"]')].map((a) => a.textContent.trim()),
  }));

async function shot(page, name, fullPage = true) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage });
}

/* ═════════ DIRECTIVA ═════════ */
const dir = await openPage();
const { page } = dir;
await login(page, 'directiva.demo@example.test', 'directiva');
check((await view(page)).path === '/colectivo/resumen', 'Directiva entra al Resumen');

const menu = await page.evaluate(() => {
  const nav = document.querySelector('aside nav[aria-label="Navegación principal"]');
  return {
    labels: [...nav.querySelectorAll('a')].map((a) => a.textContent.trim()),
    hrefs: [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    groups: [...nav.querySelectorAll('p')].map((p) => p.textContent.trim()),
  };
});
say(`menú: ${menu.labels.join(' · ')} | grupos: ${menu.groups.join(', ')}`);
check(
  JSON.stringify(menu.labels) === JSON.stringify(['Resumen', 'Campañas', 'Necesidades y propuestas', 'Histórico y estimaciones', 'Catálogo y equivalencias', 'Bitácora']),
  'menú por tareas de la Directiva (sin Usuarios)',
);
check(menu.groups.includes('Administración'), 'grupo «Administración» visible');

const campaignId = await page.evaluate(() => {
  const m = location.search.match(/campaign=([0-9a-f-]{36})/i);
  if (m) return m[1];
  const opt = [...document.querySelectorAll('main select option')].find((o) => /^[0-9a-f-]{36}$/i.test(o.value));
  return opt?.value ?? null;
});
check(Boolean(campaignId), 'hay una campaña para probar ?campaign=');

for (const [href, slug] of [
  ['/colectivo/resumen', 'resumen'],
  ['/campaigns', 'campanas'],
  ['/colectivo/propuestas', 'necesidades'],
  ['/colectivo/historico', 'historico'],
  ['/colectivo/catalogo', 'catalogo'],
  ['/audit-logs', 'bitacora'],
]) {
  await page.evaluate((h) => document.querySelector(`aside nav a[href="${h}"]`).click(), href);
  await sleep(PACE);
  const v = await view(page);
  check(v.path === href, `menú → ${href} (llegó a ${v.path})`);
  check(v.h1.length === 1, `${href}: un solo h1 (${v.h1.length}: ${v.h1.join(' | ')})`);
  check(v.scrollW <= v.innerW, `${href}: sin desplazamiento horizontal a 1366 px`);
  check(v.current.length === 1, `${href}: un ítem activo (${v.current.join(', ')})`);
  await shot(page, `1366_${slug}`);
}

/* Redirecciones de rutas antiguas, conservando ?campaign= */
for (const [from, to, vista] of [
  ['/colectivo/tendencias', '/colectivo/historico', 'tendencias'],
  ['/colectivo/estimacion', '/colectivo/historico', 'estimacion'],
  ['/colectivo/productos', '/colectivo/catalogo', 'productos'],
  ['/colectivo/reconciliacion', '/colectivo/catalogo', 'equivalencias'],
]) {
  await spa(page, `${from}?campaign=${campaignId}`);
  const v = await view(page);
  const params = new URLSearchParams(v.search);
  check(v.path === to && params.get('vista') === vista && params.get('campaign') === campaignId, `${from} → ${v.path}${v.search}`);
  check(v.h1.length === 1, `${from}: un solo h1 tras redirigir`);
}
await spa(page, `/directiva?campaign=${campaignId}`);
{
  const v = await view(page);
  check(v.path === '/colectivo/propuestas', `/directiva → ${v.path}${v.search}`);
  check(new URLSearchParams(v.search).get('campaign') === campaignId, '/directiva conserva ?campaign= (LegacyDirectivaRedirect)');
}

/* Cobertura por enlace desde el Resumen */
await page.evaluate(() => document.querySelector('aside nav a[href="/colectivo/resumen"]').click());
await sleep(PACE);
const coverageLinked = await page.evaluate(() => {
  const link = [...document.querySelectorAll('main a')].find((a) => (a.getAttribute('href') ?? '').startsWith('/colectivo/cobertura'));
  if (!link) return false;
  link.click();
  return true;
});
await sleep(PACE);
{
  const v = await view(page);
  check(coverageLinked && v.path === '/colectivo/cobertura', `cobertura accesible por enlace del Resumen (${v.path})`);
  check(v.h1.length === 1, `cobertura: un solo h1 (${v.h1.join(' | ')})`);
  check(!menu.hrefs.includes('/colectivo/cobertura'), 'cobertura fuera del menú');
  await shot(page, '1366_cobertura');
}

/* Teclado por el menú lateral: Tab hasta «Campañas», Enter */
await page.evaluate(() => document.querySelector('aside nav a[href="/colectivo/resumen"]').click());
await sleep(PACE);
await page.evaluate(() => document.activeElement?.blur());
let reached = false;
let outline = null;
for (let i = 0; i < 40 && !reached; i += 1) {
  await page.keyboard.press('Tab');
  const info = await page.evaluate(() => {
    const el = document.activeElement;
    return { href: el?.getAttribute?.('href'), inAside: Boolean(el?.closest?.('aside')), outline: el ? getComputedStyle(el).outlineStyle : null };
  });
  if (info.inAside && info.href === '/campaigns') {
    reached = true;
    outline = info.outline;
  }
}
check(reached, 'Tab llega a «Campañas» en el menú lateral');
check(outline && outline !== 'none', `foco visible en el menú (outline: ${outline})`);
await page.keyboard.press('Enter');
await sleep(PACE);
check((await view(page)).path === '/campaigns', 'Enter abre Campañas');

/* Zoom 200 % ≈ 683×384 CSS a escala 2 */
await page.setViewport({ width: 683, height: 384, deviceScaleFactor: 2 });
for (const [href, slug] of [
  ['/colectivo/resumen', 'resumen'],
  ['/campaigns', 'campanas'],
  ['/colectivo/propuestas', 'necesidades'],
  ['/colectivo/historico', 'historico'],
  ['/colectivo/catalogo', 'catalogo'],
]) {
  await spa(page, href);
  const v = await view(page);
  const header = await page.evaluate(() => {
    const h = document.querySelector('header');
    return { scrollW: h.scrollWidth, clientW: h.clientWidth };
  });
  check(v.scrollW <= v.innerW, `zoom 200 % ${href}: sin desplazamiento horizontal (${v.scrollW}/${v.innerW})`);
  check(header.scrollW <= header.clientW, `zoom 200 % ${href}: la cabecera no desborda (${header.scrollW}/${header.clientW})`);
  await shot(page, `zoom200_${slug}`, false);
}

/* Teléfono: 390 y 320 px */
for (const [w, h] of [
  [390, 844],
  [320, 568],
]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await spa(page, `/colectivo/resumen?campaign=${campaignId}`);
  const bottom = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Navegación rápida"]');
    return nav ? [...nav.querySelectorAll('a')].map((a) => ({ text: a.textContent.trim(), clipped: a.scrollWidth > a.clientWidth })) : [];
  });
  check(JSON.stringify(bottom.map((b) => b.text)) === JSON.stringify(['Resumen', 'Campañas', 'Necesidades', 'Histórico']), `${w} px: barra inferior ${bottom.map((b) => b.text).join(' · ')}`);
  check(bottom.every((b) => !b.clipped), `${w} px: etiquetas de la barra inferior sin recortar`);
  const v = await view(page);
  check(v.scrollW <= v.innerW, `${w} px Resumen: sin desplazamiento horizontal (${v.scrollW}/${v.innerW})`);
  const select = await page.evaluate(() => {
    const s = document.querySelector('main select');
    return s ? { right: Math.round(s.getBoundingClientRect().right), width: window.innerWidth } : null;
  });
  check(!select || select.right <= select.width, `${w} px: el selector de campaña no desborda (${select ? `${select.right}/${select.width}` : 'sin selector'})`);
  await shot(page, `${w}_resumen`);
  await page.click('button[aria-label="Abrir menú"]');
  await sleep(400);
  const opened = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-label="Menú"]');
    return { open: Boolean(d), focusInside: Boolean(d && d.contains(document.activeElement)) };
  });
  check(opened.open && opened.focusInside, `${w} px: menú abierto con el foco dentro`);
  await shot(page, `${w}_menu`, false);
  let escaped = false;
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement)));
    if (!inside) escaped = true;
  }
  check(!escaped, `${w} px: 25 Tab sin salir del menú`);
  await page.keyboard.press('Escape');
  await sleep(300);
  const closed = await page.evaluate(() => ({ open: Boolean(document.querySelector('[role="dialog"]')), focus: document.activeElement?.getAttribute('aria-label') }));
  check(!closed.open && closed.focus === 'Abrir menú', `${w} px: Escape cierra y el foco vuelve a «Abrir menú»`);
  for (const href of ['/campaigns', '/colectivo/propuestas', '/colectivo/historico']) {
    await spa(page, href);
    const vv = await view(page);
    check(vv.scrollW <= vv.innerW, `${w} px ${href}: sin desplazamiento horizontal (${vv.scrollW}/${vv.innerW})`);
    if (w === 320) await shot(page, `${w}_${href.split('/').pop()}`);
  }
}

/* Movimiento reducido */
await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await spa(page, `/colectivo/resumen?campaign=${campaignId}`);
const reduced = await page.evaluate(() => {
  const el = document.querySelector('.ui-press');
  return el ? getComputedStyle(el).transitionProperty : null;
});
check(reduced !== null && !/transform/.test(reduced), `movimiento reducido: .ui-press sin transform (${reduced})`);
await shot(page, '1366_resumen_reduced-motion', false);
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

const dirWrites = dir.state.writes.filter((w) => !/\/auth\/(login|refresh)$/.test(w));
say(`Directiva: peticiones no GET = ${JSON.stringify(dir.state.writes)}`);
say(`Directiva: respuestas >= 400 = ${JSON.stringify(dir.state.failed)}`);
check(dirWrites.length === 0, `Directiva: 0 escrituras de negocio (${dirWrites.length})`);
check(dir.state.consoleErrors.length === 0, `Directiva: consola sin errores (${dir.state.consoleErrors.length}: ${dir.state.consoleErrors.slice(0, 3).join(' | ')})`);
await dir.context.close();

/* ═════════ AGRICULTOR ═════════ */
const farmer = await openPage();
await login(farmer.page, 'agricultor1.demo@example.test', 'agricultor1');
{
  const v = await view(farmer.page);
  const navs = await farmer.page.evaluate(() => document.querySelectorAll('nav').length);
  check(v.path === '/sin-acceso-web', `agricultor1 entra al aviso (${v.path})`);
  check(navs === 0, `agricultor1: sin menú ni navegación (${navs} nav)`);
  await shot(farmer.page, 'agricultor_aviso', false);
  await spa(farmer.page, `/colectivo/historico?campaign=${campaignId}`);
  const after = await view(farmer.page);
  check(after.path === '/sin-acceso-web', `agricultor1: /colectivo/historico redirige al aviso (${after.path})`);
}
const collectiveGets = farmer.state.apiGets.filter((p) => /collective|estimation|campaigns|products/.test(p));
say(`agricultor1: GET de la API = ${JSON.stringify([...new Set(farmer.state.apiGets)])}`);
say(`agricultor1: respuestas >= 400 = ${JSON.stringify(farmer.state.failed)}`);
check(collectiveGets.length === 0, 'agricultor1: ninguna lectura de datos colectivos ni de campañas');
check(farmer.state.writes.filter((w) => !/\/auth\/(login|refresh)$/.test(w)).length === 0, 'agricultor1: 0 escrituras');
check(farmer.state.consoleErrors.length === 0, `agricultor1: consola sin errores (${farmer.state.consoleErrors.length})`);
await farmer.context.close();

await browser.close();
writeFileSync(join(outDir, 'recorrido.log'), `${log.join('\n')}\n\nFALLAS: ${failures.length}\n${failures.join('\n')}\n`);
say(`\nFALLAS: ${failures.length}`);
