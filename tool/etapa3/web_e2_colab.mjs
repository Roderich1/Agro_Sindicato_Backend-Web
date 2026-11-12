/**
 * Recorrido Web de E2 §10 (colaboradores, CONV-1/CONV-2 y revocación) en el entorno aislado (5175 → 3350).
 * Edge sin interfaz. Contraseñas de un solo uso por `password-pipe`, nunca impresas. Datos sintéticos.
 *   node web_e2_colab.mjs <outDir> abrir <convocatoria>                        la responsable la abre
 *   node web_e2_colab.mjs <outDir> conceder <convocatoria> <PARTICIPANTS|MANAGE> la responsable concede a Administración
 *   node web_e2_colab.mjs <outDir> ver <convocatoria> <directiva|admin>         detalle y participantes
 *   node web_e2_colab.mjs <outDir> revocar-en-vivo <convocatoria>
 *        Administración tiene la página abierta con participantes; la responsable retira PARTICIPANTS en otra
 *        sesión; la página de Administración recupera el foco y debe borrar nombres y cantidades.
 * Entorno: WEB_URL, BROWSER_PATH, PUPPETEER_HOME, BE_DIR.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = '.', action = 'ver', callName = '', arg4 = ''] = process.argv.slice(2);
const { WEB_URL = 'http://127.0.0.1:5175', BROWSER_PATH, PUPPETEER_HOME, BE_DIR } = process.env;
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EMAIL = { directiva: 'directiva.demo@example.test', admin: 'admin.demo@example.test' };
const browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, args: ['--lang=es-BO'], protocolTimeout: 90000 });
const result = { action, at: new Date().toISOString() };

// El limitador de la API admite pocos inicios de sesión por minuto: pausa opcional y entre sesiones.
let sessions = 0;
async function session(role) {
  if (sessions++ > 0 || process.env.START_DELAY_MS) await sleep(sessions > 1 ? 20000 : Number(process.env.START_DELAY_MS));
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setBypassServiceWorker(true);
  await page.setViewport({ width: 1366, height: 900 });
  const api = [];
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/v1/joint-purchase-calls')) api.push(`${r.request().method()} ${u.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>')} → ${r.status()}`);
  });
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', EMAIL[role]);
  const pw = execFileSync(process.execPath, [join(BE_DIR, 'tool/demo-rica/demo-rica.cjs'), 'password-pipe', role], {
    cwd: join(BE_DIR, 'Back'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  });
  await page.type('#password', pw);
  await Promise.all([page.waitForResponse((r) => /\/auth\/(v2\/)?login$/.test(r.url()), { timeout: 20000 }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 20000 });
  return { page, api, role };
}
async function openCall({ page }) {
  await page.goto(`${WEB_URL}/colectivo/compras-conjuntas`, { waitUntil: 'networkidle0' });
  await sleep(1500);
  for (const a of await page.$$('a')) if ((await a.evaluate((e) => e.textContent ?? '')).includes(callName)) { await a.click(); await sleep(3000); return; }
  throw new Error(`convocatoria «${callName}» no encontrada`);
}
async function clickButton(page, re, scope = 'button') {
  for (const h of await page.$$(scope)) {
    const t = (await h.evaluate((e) => (e.getAttribute('aria-label') || e.textContent || '').trim()));
    if (re.test(t) && !(await h.evaluate((e) => e.disabled))) { await h.click(); await sleep(1200); return t; }
  }
  throw new Error(`no hay botón ${re}`);
}
const shot = async (page, n) => page.screenshot({ path: join(outDir, `${action}_${n}.png`), fullPage: true });
const panels = (page) => page.evaluate(() => {
  const t = (sel) => document.querySelector(sel)?.innerText ?? null;
  return {
    participants: t('[data-testid="participants-panel"]'),
    collaborators: t('[data-testid="collaborators-panel"]'),
    rows: [...document.querySelectorAll('[data-testid="participant-row"]')].map((r) => r.innerText),
    hidden_notice: t('[data-testid="hidden-participants-notice"]'),
    revoked: t('[data-testid="participants-revoked"]'),
    forbidden: t('[data-testid="participants-forbidden"]'),
    products: t('table'),
  };
});

try {
  if (action === 'abrir') {
    const s = await session('directiva');
    await openCall(s);
    await clickButton(s.page, /^Abrir$/);
    const box = await s.page.$('[role="dialog"] input[type="checkbox"]');
    if (box) await box.click();
    await clickButton(s.page, /^Abrir convocatoria$/);
    await sleep(2500);
    await shot(s.page, '01_abierta');
    result.text = await s.page.evaluate(() => document.querySelector('main')?.innerText.slice(0, 900));
    result.api = s.api;
  } else if (action === 'conceder') {
    const s = await session('directiva');
    await openCall(s);
    await clickButton(s.page, /^Conceder permiso$/);
    await s.page.waitForSelector('#grant-user');
    await sleep(1500);
    const options = await s.page.$$eval('#grant-user option', (os) => os.map((o) => ({ v: o.value, t: o.textContent })));
    const admin = options.find((o) => /Admin/i.test(o.t ?? ''));
    if (!admin) throw new Error(`sin candidato de Administración: ${JSON.stringify(options.map((o) => o.t))}`);
    await s.page.select('#grant-user', admin.v);
    const radios = await s.page.$$('[role="dialog"] input[type="radio"]');
    for (const r of radios) {
      const label = await r.evaluate((e) => e.closest('label')?.textContent ?? '');
      if ((arg4 === 'MANAGE' && /Administrar/.test(label)) || (arg4 !== 'MANAGE' && /Consultar participantes/.test(label))) await r.click();
    }
    const confirm = await s.page.$('[role="dialog"] input[type="checkbox"]');
    if (confirm) await confirm.click();
    await shot(s.page, '01_dialogo');
    const dialogButtons = await s.page.$$('[role="dialog"] button');
    for (const b of dialogButtons) if (/^Conceder permiso$/.test((await b.evaluate((e) => e.textContent ?? '')).trim())) { await b.click(); break; }
    await sleep(3000);
    await shot(s.page, '02_concedido');
    Object.assign(result, await panels(s.page));
    result.api = s.api;
  } else if (action === 'ver') {
    const s = await session(arg4 === 'admin' ? 'admin' : 'directiva');
    await openCall(s);
    await sleep(2000);
    await shot(s.page, `01_${s.role}`);
    Object.assign(result, await panels(s.page));
    result.api = s.api;
  } else if (action === 'revocar-en-vivo') {
    const admin = await session('admin');
    await openCall(admin);
    await sleep(2000);
    result.before = await panels(admin.page);
    await shot(admin.page, '01_admin_con_permiso');
    const resp = await session('directiva');
    await openCall(resp);
    await clickButton(resp.page, /^Retirar «Consultar participantes y cantidades»/);
    const confirm = await resp.page.$('[role="dialog"] input[type="checkbox"]');
    if (confirm) await confirm.click();
    const buttons = await resp.page.$$('[role="dialog"] button');
    for (const b of buttons) if (/^Retirar permiso$/.test((await b.evaluate((e) => e.textContent ?? '')).trim())) { await b.click(); break; }
    await sleep(3000);
    await shot(resp.page, '02_responsable_retira');
    result.revoked_at = new Date().toISOString();
    // La página de Administración sigue abierta con los datos de antes; recupera el foco.
    result.still_shown_before_focus = (await panels(admin.page)).rows.length;
    await admin.page.bringToFront();
    await admin.page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
    await sleep(5000);
    result.after = await panels(admin.page);
    result.after_body_has_quantities = await admin.page.evaluate(() => /\d+ L\b/.test(document.querySelector('[data-testid="participants-panel"]')?.innerText ?? ''));
    await shot(admin.page, '03_admin_tras_foco');
    result.api_admin = admin.api;
    result.api_responsable = resp.api;
  } else throw new Error(`acción desconocida ${action}`);
} catch (e) {
  result.error = e.message;
  console.log(`ERROR ${e.message}`);
} finally {
  writeFileSync(join(outDir, `${action}.json`), JSON.stringify(result, null, 2));
  await browser.close();
}
