/**
 * Recorrido Web de la etapa 2 (convocatorias) contra el entorno aislado (Web 5175 → API 3350).
 * Edge sin interfaz (puppeteer-core). Contraseñas de un solo uso por `password-pipe`, nunca
 * impresas. Datos sintéticos.
 *   node web_e2.mjs <outDir> crear <nombre> <minutos> <producto1|producto2|...>
 *   node web_e2.mjs <outDir> ver <nombre> [rol]        rol = directiva (responsable) | admin
 *   node web_e2.mjs <outDir> cerrar <nombre>
 * Entorno: WEB_URL, BROWSER_PATH, PUPPETEER_HOME, BE_DIR, DEMO_PG_ADMIN_URL, DEMO_API.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = '.', action = 'ver', name = '', arg4 = '', arg5 = ''] = process.argv.slice(2);
const { WEB_URL = 'http://127.0.0.1:5175', BROWSER_PATH, PUPPETEER_HOME, BE_DIR } = process.env;
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const say = (l) => { console.log(l); log.push(l); };
const role = action === 'ver' && arg4 === 'admin' ? 'admin' : 'directiva';
const email = role === 'admin' ? 'admin.demo@example.test' : 'directiva.demo@example.test';
const tag = `${action}_${role}`;

const browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, args: ['--lang=es-BO'], protocolTimeout: 60000 });
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
await page.setViewport({ width: 1366, height: 900 });
const state = { api: [], errors: [] };
page.on('request', (req) => {
  const u = new URL(req.url());
  if (u.pathname.startsWith('/api/')) state.api.push(`${req.method()} ${u.pathname.replace(/[0-9a-f-]{36}/g, '<id>')}`);
});
page.on('console', (m) => m.type() === 'error' && state.errors.push(m.text()));
const shot = async (n) => { await page.screenshot({ path: join(outDir, `${tag}_${n}.png`), fullPage: true }); say(`captura ${tag}_${n}.png`); };
const text = () => page.evaluate(() => document.querySelector('main')?.innerText ?? document.body.innerText);
async function clickText(re, scope = 'button') {
  for (const h of await page.$$(scope)) if (re.test((await h.evaluate((e) => e.textContent ?? '')).trim())) { await h.click(); await sleep(900); return true; }
  throw new Error(`no se encontró ${scope} ${re}`);
}
async function login() {
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', email);
  const pw = execFileSync(process.execPath, [join(BE_DIR, 'tool/demo-rica/demo-rica.cjs'), 'password-pipe', role], {
    cwd: join(BE_DIR, 'Back'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  });
  await page.type('#password', pw);
  await Promise.all([page.waitForResponse((r) => /\/auth\/(v2\/)?login$/.test(r.url()), { timeout: 20000 }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 20000 });
  say(`sesión iniciada como ${role}`);
}
async function openCall() {
  await page.goto(`${WEB_URL}/colectivo/compras-conjuntas`, { waitUntil: 'networkidle0' });
  await sleep(1500);
  for (const a of await page.$$('a')) if ((await a.evaluate((e) => e.textContent ?? '')).includes(name)) { await a.click(); await sleep(2500); return; }
  throw new Error(`convocatoria «${name}» no encontrada en la lista`);
}

try {
  await login();
  if (action === 'crear') {
    await page.goto(`${WEB_URL}/colectivo/compras-conjuntas`, { waitUntil: 'networkidle0' });
    await sleep(1500);
    await shot('01_lista');
    await clickText(/^Nueva convocatoria$/);
    await page.type('#call-name', name);
    const minutes = Number(arg4 || 20);
    const d = new Date(Date.now() + minutes * 60_000);
    const pad = (n) => String(n).padStart(2, '0');
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    await page.$eval('#call-deadline', (el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, local);
    const options = await page.$$eval('#call-responsible option', (os) => os.map((o) => ({ v: o.value, t: o.textContent })));
    const responsible = options.find((o) => /Directiva DEMO/.test(o.t ?? ''));
    if (!responsible) throw new Error(`sin responsable elegible Directiva DEMO: ${JSON.stringify(options.map((o) => o.t))}`);
    await page.select('#call-responsible', responsible.v);
    await sleep(800);
    for (const product of arg5.split('|').filter(Boolean)) {
      let done = false;
      for (const li of await page.$$('ul[aria-label="Productos del catálogo"] li')) {
        const t = await li.evaluate((e) => e.textContent ?? '');
        if (t.includes(product)) { const box = await li.$('input[type="checkbox"]'); if (box) { await box.click(); done = true; break; } }
      }
      say(`producto ${product}: ${done ? 'elegido' : 'NO encontrado'}`);
    }
    await shot('02_borrador_formulario');
    await clickText(/^Crear borrador$/);
    await sleep(2500);
    await shot('03_borrador_creado');
    say(`ruta tras crear: ${await page.evaluate(() => location.pathname)}`);
    await clickText(/^Abrir$/);
    await shot('04_abrir_dialogo');
    const box = await page.$('[role="dialog"] input[type="checkbox"]');
    if (box) await box.click();
    await clickText(/^Abrir convocatoria$/);
    await sleep(2500);
    await shot('05_abierta');
    say(`estado mostrado: ${(await text()).match(/Abierta|Borrador|Cerrada|Cancelada/)?.[0]}`);
  }
  if (action === 'ver') {
    await openCall();
    await shot('01_detalle');
    const t = await text();
    say(`participantes visibles: ${/Participantes \(lista provisional\)/.test(t)}; aviso sólo responsable: ${/Sólo el responsable de esta convocatoria/.test(t)}; total oculto en vivo: ${/Total visible sólo para el responsable/.test(t)}; «@»: ${/@/.test(t)}`);
  }
  if (action === 'cerrar') {
    await openCall();
    if (/\bCerrar\b/.test(await text()) && !/Consolidado al cierre/.test(await text())) {
      await clickText(/^Cerrar$/);
      const box = await page.$('[role="dialog"] input[type="checkbox"]');
      if (box) await box.click();
      await clickText(/^Cerrar convocatoria$/);
      await sleep(2500);
    }
    await shot('01_consolidado');
    const t = await text();
    say(`consolidado: ${/Consolidado al cierre/.test(t)}; menciona comprado/entregado fuera de la negación: ${/comprad|entregad/i.test(t.replace(/no son compras[^.]*\./gi, ''))}`);
  }
  say(`peticiones API: ${state.api.length}; errores de consola: ${state.errors.length}`);
} catch (error) {
  say(`ERROR: ${String(error).slice(0, 300)}`);
  await shot('error').catch(() => {});
} finally {
  writeFileSync(join(outDir, `${tag}_log.txt`), log.join('\n') + '\n' + state.api.join('\n') + '\n');
  await browser.close();
}
