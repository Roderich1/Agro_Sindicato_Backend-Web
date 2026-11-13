// VERIFICACIÓN, ronda de estados SIMULADOS (2026-11-13, código 1b7fbb4 en 5177): estados que la API real no produce
// con los datos actuales. Las respuestas salen de `fixtures_v.json` (generado por fixtures_v.mjs desde los fixtures de
// la Web y de products.page.test.tsx); el resto de las llamadas va a la API real. Toda captura lleva «__SIMULADO».
// Lámina 05 §2, §3, §4, §5, §10, §11 y §12; 30.3 (abrir y cancelar «Sellar esta versión», sin POST); 21/39 productos
// inactivos; U.8 sin campaña activa → «Ir a Campañas». Cada escenario recarga la página (el contexto de campaña activa
// se lee al cargar), una recarga por escenario.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const F = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures_v.json'), 'utf8'));
const summaryRules = (sc) => [
  { url: '/api/v1/campaigns/active(\\?|$)', method: 'GET', body: sc.active },
  { url: '/api/v1/campaigns(\\?|$)', method: 'GET', body: sc.campaigns },
  { url: '/collective/campaigns/[^/]+/summary', method: 'GET', body: sc.summary },
  { url: '/collective/campaigns/[^/]+/seal$', method: 'GET', body: sc.sealState },
  { url: '/collective/campaigns/[^/]+/proposals', method: 'GET', body: sc.proposals },
];
const B = F.borrador;
const proposalRules = (link) => [
  { url: '/api/v1/campaigns/active(\\?|$)', method: 'GET', body: B.active },
  { url: '/api/v1/campaigns(\\?|$)', method: 'GET', body: B.campaigns },
  { url: '/collective/campaigns/[^/]+/proposals', method: 'GET', body: B.history },
  { url: '/collective/proposals/[^/]+/estimation-link$', method: 'GET', body: link },
  { url: '/collective/proposals/[^/]+/selection$', method: 'GET', body: B.selection },
  { url: '/collective/proposals/[^/]+$', method: 'GET', body: B.proposal },
];
const VISTA = () => ({
  path: location.pathname + location.search,
  h1: document.querySelector('h1')?.textContent?.trim(),
  estados: [...document.querySelectorAll('[data-testid]')].map((e) => e.dataset.testid).filter((t) => /no-campaigns|all-hidden|policy|empty|seal|no-active|version|coverage|reference|link-|inactive/.test(t)).slice(0, 14),
  texto: document.querySelector('main')?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 500),
});
const resumen = (key, label, sizes = ['escritorio']) => {
  const sc = F.scenarios[key];
  return [
    { simulate: summaryRules(sc) },
    { goto: sc.selected ? `/colectivo/resumen?campaign=${sc.selected}` : '/colectivo/resumen', reload: true, after: 6000 },
    { assert: `${label}`, js: VISTA.toString() },
    { measure: label },
    { shot: `simulados/05-${key}`, desc: `Resumen · ${label} (respuestas simuladas)`, state: label, sizes },
  ];
};
export default [
  { role: 'directiva', steps: [
    { apiLog: 'inicio de sesión (real)' },
    ...resumen('s2_sin_campanas', '05 §2 sin campañas'),
    { mark: '^Ir a Campañas' }, { waitPath: '^/campaigns' }, { wait: 2000 },
    { assert: 'U.8 (sin campañas) → destino', js: VISTA.toString() },
    ...resumen('u8_sin_activa', 'U.8 sin campaña activa'),
    { assert: 'U.8 «Para atender» sin campaña activa', js: "() => { const e = document.querySelector('[data-testid=\"action-no-active\"]'); return e ? { texto: e.textContent.trim(), href: e.closest('a')?.getAttribute('href') } : null; }" },
    { clickSel: '[data-testid="action-no-active"]' }, { waitPath: '^/campaigns' }, { wait: 2000 },
    { assert: 'U.8 «Ir a Campañas» → destino', js: VISTA.toString() },
    { shot: 'simulados/u8-campanas-destino', desc: 'U.8: destino de «Ir a Campañas» (lista simulada sin activa)', full: false },
    ...resumen('s3_sin_cifras', '05 §3 sin cifras'),
    ...resumen('s4_todo_oculto', '05 §4 todo oculto'),
    ...resumen('s5_politica_pendiente', '05 §5 política pendiente'),
    ...resumen('s10_cerrada_sin_sellar', '05 §10 cerrada sin sellar, lista para sellar', ['escritorio', 'movil']),
    { apiLog: 'Resumen simulado hasta §10' },
    // 30.3: abrir y cancelar
    { mark: '^Sellar esta versión' }, { wait: 1200 },
    { focusInfo: '30.3 foco al abrir' },
    { assert: '30.3 diálogo «Sellar esta versión»', js: "() => { const d = document.querySelector('[role=\"dialog\"], [role=\"alertdialog\"]'); return d ? { titulo: d.querySelector('h2')?.textContent?.trim(), texto: d.innerText.replace(/\\s+/g, ' ').trim().slice(0, 600), botones: [...d.querySelectorAll('button')].map((b) => `${b.textContent.trim()}${b.disabled ? ' [desactivado]' : ''}`) } : null; }" },
    { shot: 'simulados/30-3-sellar-dialogo', desc: '30.3 Sellar esta versión (revisión simulada), sin enviar', full: false },
    { escape: true }, { focusInfo: '30.3 foco tras Esc' },
    { apiLog: '30.3 abrir y cancelar (no debe haber POST …/seal)' },
    ...resumen('s11_sellada', '05 §11 sellada', ['escritorio', 'movil']),
    // §12: la referencia en el borrador (6 estados)
    ...Object.keys(B.linkStates).flatMap((k) => [
      { simulate: proposalRules(B.linkStates[k]) },
      { goto: `/colectivo/propuestas?campaign=${B.campaigns[0].id}`, reload: true, after: 6000 },
      { assert: `05 §12 referencia ${k}`, js: "() => ({ franja: [...document.querySelectorAll('main section, main [data-testid]')].map((e) => e.innerText).find((t) => /Consumo estimado|referencia/i.test(t))?.replace(/\\s+/g, ' ').trim().slice(0, 300) ?? null, botones: [...document.querySelectorAll('main button')].map((b) => b.getAttribute('aria-label') || b.textContent.trim()).filter((t) => /referencia|Actualizar|Quitar|Obtener/i.test(t)) })" },
      { shot: `simulados/05-12-referencia-${k}`, desc: `Borrador · referencia ${k} (respuestas simuladas)`, state: k, full: false },
    ]),
    { apiLog: '§12 (sólo GET esperados)' },
    // 21 / 39: productos inactivos
    { simulate: [{ url: '/api/v1/inventory/products(\\?|$)', method: 'GET', body: F.productsCatalog }] },
    { goto: '/colectivo/catalogo?vista=productos', reload: true, after: 6000 },
    { click: '^Ver productos inactivos' }, { wait: 1000 },
    { assert: '21 productos inactivos', js: "() => document.querySelector('[data-testid=\"inactive-products\"]')?.innerText?.replace(/\\s+/g, ' ').trim().slice(0, 500) ?? null" },
    { scroll: '[data-testid="inactive-products"]' },
    { shot: 'simulados/21-productos-inactivos', desc: 'Productos: «Ver productos inactivos» con un producto (lista simulada)', sizes: ['escritorio', 'movil'] },
    { apiLog: 'productos (sólo GET)' },
    { unsimulate: true },
  ] },
];
