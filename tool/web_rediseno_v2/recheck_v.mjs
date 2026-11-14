/**
 * Orquestador: nueva comprobación en el navegador de los defectos V-1, V-2, V-3 y V-5 de la
 * verificación (docs/evidence/rediseno-web-v2/verificacion/README.md), contra la Web de revisión
 * (WEB_URL, 5177) y la API aislada 3350. Sólo lectura. Contraseñas de un solo uso, nunca impresas.
 *   node recheck_v.mjs <salida.json>
 */
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outFile] = process.argv.slice(2);
const { WEB_URL = 'http://127.0.0.1:5177', BROWSER_PATH, PUPPETEER_HOME, BE_DIR, DEMO_PG_ADMIN_URL } = process.env;
const puppeteer = createRequire(join(PUPPETEER_HOME, 'package.json'))('puppeteer-core');
const backRequire = createRequire(join(BE_DIR, 'Back', 'package.json'));
const { PrismaClient } = backRequire('@prisma/client');
const bcrypt = backRequire('bcrypt');
const dbUrl = (() => { const u = new URL(DEMO_PG_ADMIN_URL); u.pathname = '/agro_demo'; return u.toString(); })();
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EMAIL = { admin: 'admin.demo@example.test', directiva: 'directiva.demo@example.test' };
const browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, args: ['--lang=es-BO'] });
const out = {};

async function login(role) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setBypassServiceWorker(true);
  await page.setViewport({ width: 1440, height: 900 });
  page.calls = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) page.calls.push(`${r.method()} ${u.pathname}`); });
  const password = randomBytes(18).toString('base64url');
  await db.user.update({ where: { email: EMAIL[role] }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', EMAIL[role]);
  await page.type('#password', password);
  await Promise.all([page.waitForResponse((r) => /\/auth\/(v2\/)?login$/.test(r.url()), { timeout: 20000 }), page.click('button[type="submit"]')]);
  await page.waitForFunction(() => !['/', '/login'].includes(location.pathname), { timeout: 20000 });
  await sleep(2500);
  return page;
}
const go = async (page, p) => { await page.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')); }, p); await sleep(4000); };
const badge = (page) => page.evaluate(() => !!document.querySelector('[data-testid="synthetic-badge"]'));
const text = (page) => page.evaluate(() => document.body.innerText);

const dir = await login('directiva');
// V-2: con el modo provisional ya declarado por el Resumen.
await go(dir, '/colectivo/resumen');
out.v2 = { resumen: await badge(dir) };
for (const p of ['/colectivo/compras-conjuntas', '/colectivo/catalogo?vista=productos', '/campaigns', '/audit-logs']) { await go(dir, p); out.v2[p] = await badge(dir); }
// V-1: un borrador anterior desde el detalle de la campaña activa.
await go(dir, '/campaigns');
const detail = await dir.evaluate(() => document.querySelector('a[href^="/campaigns/"]')?.getAttribute('href'));
await go(dir, detail);
const links = await dir.evaluate(() => [...document.querySelectorAll('a[href*="borrador="]')].map((a) => a.getAttribute('href')));
const older = links[1] ?? null;
out.v1 = { detail, links: links.length, older };
if (older) {
  const wanted = new URL(older, WEB_URL).searchParams.get('borrador');
  dir.calls = [];
  await go(dir, older);
  const body = await text(dir);
  out.v1.wanted = wanted.slice(0, 8);
  out.v1.readWanted = dir.calls.some((c) => c.includes(wanted));
  out.v1.proposalReads = dir.calls.filter((c) => /proposals?\/[0-9a-f-]{36}$/.test(c)).map((c) => c.slice(-36, -28));
  out.v1.tabAnterior = /Borrador anterior/.test(body);
  out.v1.urlKeeps = (await dir.evaluate(() => location.search)).includes(wanted);
  out.v1.writes = dir.calls.filter((c) => !c.startsWith('GET') && !c.includes('/auth/'));
}
// V-3: Estimación redondeada con la cifra exacta visible.
await go(dir, '/colectivo/historico?vista=estimacion');
const est = await text(dir);
out.v3 = { approx: /≈\s?[\d.,]+\s?(KG|L|g|mL)/.test(est), exact: /Cifra exacta:/.test(est), nineDecimals: /\d,\d{7,}\s?(KG|L)(?!\s*\()/.test(est.replace(/Cifra exacta:[^\n]*/g, '')) };
// V-5: a 390 px en Campañas, «Más» marcado.
await dir.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await go(dir, '/campaigns');
out.v5 = { campanas: await dir.evaluate(() => !!document.querySelector('[data-section-in-more="true"]')) };
await go(dir, '/colectivo/resumen');
out.v5.resumen = await dir.evaluate(() => !!document.querySelector('[data-section-in-more="true"]'));
await dir.browserContext().close();

await sleep(20000);
const adm = await login('admin');
await go(adm, '/colectivo/resumen');
await go(adm, '/users');
out.v2.users = await badge(adm);
await adm.browserContext().close();

await browser.close();
await db.$disconnect();
writeFileSync(outFile, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
