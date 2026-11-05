/**
 * Verificación del desplazamiento vertical de la Web institucional con una ventana
 * baja (Edge sin interfaz, puppeteer-core instalado aparte). Mide, por vista, si el
 * documento supera la ventana, si `scrollTo` y la rueda real llegan al final y
 * vuelven al principio, si el último botón queda a la vista, si un diálogo abierto
 * y cerrado deja el desplazamiento intacto y si al cambiar de vista se vuelve arriba.
 *
 *   node scroll-check.mjs <rol: directiva|admin> <alto en px> <carpeta de salida>
 *
 * Entorno: WEB_URL (http://127.0.0.1:5195), BROWSER_PATH, PUPPETEER_HOME (carpeta con
 * node_modules/puppeteer-core), BE_DIR (worktree con tool/demo/demo-central.cjs y Back/),
 * DEMO_PG_ADMIN_URL y DEMO_API de la copia sintética. La contraseña de un solo uso llega
 * por la tubería `password-pipe` y no se imprime ni se guarda.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [role = 'directiva', height = '600', outDir = '.'] = process.argv.slice(2);
const { WEB_URL = 'http://127.0.0.1:5195', BROWSER_PATH, PUPPETEER_HOME, BE_DIR } = process.env;
const EMAIL = { directiva: 'directiva.demo@example.test', admin: 'admin.demo@example.test' }[role];
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: true,
  userDataDir: join(outDir, `perfil-scroll-${role}`),
  defaultViewport: { width: 1366, height: Number(height) },
  args: ['--lang=es-BO'],
  protocolTimeout: 60000,
});
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
if (page.url().endsWith('/login')) {
  await page.type('#email', EMAIL);
  const pw = execFileSync(process.execPath, [join(BE_DIR, 'tool/demo/demo-central.cjs'), 'password-pipe', role], {
    cwd: join(BE_DIR, 'Back'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await page.type('#password', pw);
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/auth/login'), { timeout: 20000 }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 20000 });
}
await sleep(1500);

// Navegación dentro de la SPA: /auth/refresh está limitado a 5 por minuto y una recarga por vista lo agota.
const go = async (path) => {
  await page.evaluate((p) => {
    const links = [...document.querySelectorAll(`a[href="${p}"]`)];
    links[links.length - 1].click();
  }, path);
  await sleep(2500);
};
const clickText = (text, nth = 0) =>
  page.evaluate((t, n) => {
    const button = [...document.querySelectorAll('button')].filter((x) => x.textContent.trim() === t)[n];
    if (!button) return false;
    button.click();
    return true;
  }, text, nth);
const measure = async (label) => {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    window.scrollTo(0, 0);
    const top = window.scrollY;
    window.scrollTo(0, 1e6);
    const bottom = window.scrollY;
    const last = [...document.querySelectorAll('main button, main a')].pop();
    const rect = last ? last.getBoundingClientRect() : null;
    return {
      path: location.pathname,
      innerH: window.innerHeight,
      scrollH: root.scrollHeight,
      needsScroll: root.scrollHeight > root.clientHeight,
      top,
      bottom,
      lastText: last?.textContent.trim().slice(0, 30),
      lastVisibleAtBottom: rect ? rect.bottom <= window.innerHeight && rect.top >= 0 : null,
      bodyOverflow: getComputedStyle(document.body).overflowY,
      htmlOverflow: getComputedStyle(root).overflowY,
    };
  });
  console.log(label, JSON.stringify(result));
};
const wheel = async (label) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(800, 300);
  await page.mouse.wheel({ deltaY: 600 });
  await sleep(400);
  const down = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel({ deltaY: -600 });
  await sleep(400);
  const up = await page.evaluate(() => window.scrollY);
  console.log(label, JSON.stringify({ wheelDown: down, wheelUp: up }));
};

await go('/colectivo/resumen');
await measure('resumen');
await wheel('resumen rueda');
await go('/colectivo/propuestas');
if (await clickText('Ver último borrador')) await sleep(3000);
await measure('propuestas+borrador');
await wheel('propuestas rueda');
await go('/colectivo/estimacion');
await measure('estimacion');
await wheel('estimacion rueda');
await go('/campaigns');
await measure('campanas');
if (await clickText('Nueva campaña')) {
  await sleep(600);
  const open = (await page.$('.modal-backdrop')) !== null;
  await page.keyboard.press('Escape');
  await sleep(600);
  const closed = (await page.$('.modal-backdrop')) === null;
  console.log('dialogo', JSON.stringify({ open, closed }));
  await measure('campanas tras dialogo');
  await wheel('campanas rueda');
}
if (role === 'admin') {
  await go('/users');
  await measure('usuarios');
  await wheel('usuarios rueda');
}
await page.evaluate(() => window.scrollTo(0, 1e6));
await go('/colectivo/resumen');
console.log('tras cambiar de vista', JSON.stringify({ scrollY: await page.evaluate(() => window.scrollY) }));
await page.screenshot({ path: join(outDir, `scroll-${role}-${height}.png`) });
await browser.close();
