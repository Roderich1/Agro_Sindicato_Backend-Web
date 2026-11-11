/**
 * Recorrido Web de la etapa 1 («Por identificar») contra el entorno aislado ET1
 * (Web 5175 → API 3350). Edge sin interfaz (puppeteer-core). La contraseña de un
 * solo uso llega por `password-pipe` y no se imprime ni se guarda.
 *   node web_e1.mjs <outDir> <accion>   accion = lista | foto | vincular | crear | pendiente
 * Entorno: WEB_URL, BROWSER_PATH, PUPPETEER_HOME, BE_DIR, DEMO_PG_ADMIN_URL, DEMO_API.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = '.', action = 'lista', target = ''] = process.argv.slice(2);
const { WEB_URL = 'http://127.0.0.1:5175', BROWSER_PATH, PUPPETEER_HOME, BE_DIR } = process.env;
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const say = (l) => { console.log(l); log.push(l); };
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, args: ['--lang=es-BO'], protocolTimeout: 60000 });
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
await page.setViewport({ width: 1366, height: 900 });
const state = { api: [], errors: [], photo: null };
page.on('request', (req) => {
  const u = new URL(req.url());
  if (u.pathname.startsWith('/api/')) state.api.push(`${req.method()} ${u.pathname.replace(/[0-9a-f-]{36}/g, '<id>')}${u.search}`);
});
page.on('response', async (res) => {
  const u = new URL(res.url());
  if (/\/photo$/.test(u.pathname)) state.photo = { status: res.status(), type: res.headers()['content-type'], cache: res.headers()['cache-control'], length: res.headers()['content-length'] };
});
page.on('console', (m) => m.type() === 'error' && state.errors.push(m.text()));
page.on('pageerror', (e) => state.errors.push(String(e)));

async function shot(name) {
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  say(`captura ${name}.png`);
}
async function login() {
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', 'directiva.demo@example.test');
  const pw = execFileSync(process.execPath, [join(BE_DIR, 'tool/demo-rica/demo-rica.cjs'), 'password-pipe', 'directiva'], {
    cwd: join(BE_DIR, 'Back'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  });
  await page.type('#password', pw);
  await Promise.all([page.waitForResponse((r) => /\/auth\/(v2\/)?login$/.test(r.url()), { timeout: 20000 }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 20000 });
  say(`sesión iniciada como directiva (ruta ${await page.evaluate(() => location.pathname)})`);
}
async function openView() {
  await page.goto(`${WEB_URL}/colectivo/catalogo?vista=identificacion`, { waitUntil: 'networkidle0' });
  await sleep(1500);
  const text = await page.evaluate(() => document.querySelector('main')?.innerText ?? document.body.innerText);
  say(`vista cargada; contiene «Por identificar»: ${/Por identificar/.test(text)}; solicitudes visibles: ${(text.match(/Vincular/g) ?? []).length}`);
  if (/@/.test(text)) say('AVISO: la vista muestra un «@» (posible correo)');
  return text;
}
const byText = async (tag, re) => {
  const handles = await page.$$(tag);
  for (const h of handles) {
    const t = await h.evaluate((e) => e.textContent ?? '');
    if (re.test(t)) return h;
  }
  return null;
};
async function clickText(tag, re) {
  const h = await byText(tag, re);
  if (!h) throw new Error(`no se encontró ${tag} ${re}`);
  await h.click();
  await sleep(800);
}
async function fillReason(text) {
  const area = await page.$('textarea');
  if (!area) throw new Error('sin campo de motivo');
  await area.click({ clickCount: 3 });
  await area.type(text);
  const box = await page.$('input[type="checkbox"]');
  if (box) { const checked = await box.evaluate((e) => e.checked); if (!checked) await box.click(); }
}

try {
  await login();
  const text = await openView();
  await shot(`${action}_01_lista`);
  if (action === 'lista') { /* nada más */ }
  if (action === 'foto') {
    if (target) {
      for (const li of await page.$$('ul[aria-label="Solicitudes pendientes"] > li')) {
        if (!(await li.evaluate((e) => e.textContent ?? '')).includes(target)) continue;
        for (const b of await li.$$('button')) if (/^Ver foto$/.test(await b.evaluate((e) => e.textContent ?? ''))) await b.click();
      }
      await sleep(800);
    } else await clickText('button', /^Ver foto$/);
    await sleep(2000);
    await shot('foto_02_modal');
    say(`respuesta de la foto: ${JSON.stringify(state.photo)}`);
    const img = await page.$('dialog img, [role="dialog"] img, img[alt*="etiqueta"]');
    say(`img en el modal: ${img ? await img.evaluate((e) => `${e.naturalWidth}x${e.naturalHeight} src=${e.src.slice(0, 5)}`) : 'no'}`);
  }
  if (action === 'vincular' || action === 'crear' || action === 'pendiente') {
    // Abre la primera solicitud (o la que contenga el texto objetivo).
    const openerRe = { vincular: /^Vincular/, crear: /^Crear producto colectivo/, pendiente: /^Dejar pendiente/ }[action];
    let opener = null;
    if (target) {
      // Tarjeta de la solicitud que contiene el texto objetivo y, dentro, el botón de la acción.
      for (const li of await page.$$('ul[aria-label="Solicitudes pendientes"] > li')) {
        const t = await li.evaluate((e) => e.textContent ?? '');
        if (!t.includes(target)) continue;
        for (const b of await li.$$('button')) if (openerRe.test(await b.evaluate((e) => e.textContent ?? ''))) opener = b;
      }
    } else opener = await byText('button', openerRe);
    if (!opener) throw new Error('no se encontró el botón de la solicitud');
    await opener.click();
    await sleep(2000);
    await shot(`${action}_02_dialogo`);
    const dialogText = await page.evaluate(() => (document.querySelector('[role="dialog"]') ?? document.body).innerText);
    say(`diálogo: parecido ${/Parecido (alto|medio|bajo)/.test(dialogText)}; aclaración ${/la decisión es suya/.test(dialogText)}`);
    if (action === 'vincular') {
      const candidate = await page.$('[role="dialog"] input[type="radio"]');
      if (candidate) await candidate.click(); else say('sin candidatos: hay que elegir en el catálogo');
      await fillReason('Recorrido ET1 2026-11-11: coincide con la etiqueta reportada (datos sintéticos).');
      await shot('vincular_03_formulario');
      await clickText('button', /^Confirmar vínculo$/);
      await sleep(2500);
    }
    if (action === 'crear') {
      await fillReason('Recorrido ET1 2026-11-11: producto nuevo sin equivalente en el catálogo (sintético).');
      await shot('crear_03_formulario');
      await clickText('button', /^Crear y vincular$/);
      await sleep(2500);
    }
    if (action === 'pendiente') {
      await fillReason('Recorrido ET1 2026-11-11: falta la concentración en la etiqueta (sintético).');
      await shot('pendiente_03_formulario');
      await clickText('button', /^Guardar como pendiente$/);
      await sleep(2500);
    }
    await shot(`${action}_04_resultado`);
    const after = await page.evaluate(() => document.querySelector('main')?.innerText ?? document.body.innerText);
    say(`resultado: ${(after.match(/La decisión queda en la bitácora|no cambió nada|Pendiente por falta de información/g) ?? []).join(' | ') || 'sin aviso de resultado'}`);
  }
  say(`peticiones API: ${state.api.length}; errores de consola: ${state.errors.length}`);
  for (const e of state.errors.slice(0, 5)) say(`  consola: ${e.slice(0, 160)}`);
} catch (error) {
  say(`ERROR: ${String(error).slice(0, 300)}`);
  await shot(`${action}_error_${stamp()}`).catch(() => {});
} finally {
  writeFileSync(join(outDir, `${action}_log.txt`), log.join('\n') + '\n' + state.api.join('\n') + '\n');
  await browser.close();
}
