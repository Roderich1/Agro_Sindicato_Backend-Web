// VERIFICACIÓN, repetición de U.8 (sin campaña activa → «Ir a Campañas»): en plan_v_simulados la comprobación se hizo
// antes de que se dibujara «Para atender» y el clic no encontró el elemento. Aquí se espera al elemento.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const F = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures_v.json'), 'utf8'));
const sc = F.scenarios.u8_sin_activa;
const rules = [
  { url: '/api/v1/campaigns/active([?]|$)', method: 'GET', body: sc.active },
  { url: '/api/v1/campaigns([?]|$)', method: 'GET', body: sc.campaigns },
  { url: '/collective/campaigns/[^/]+/summary', method: 'GET', body: sc.summary },
  { url: '/collective/campaigns/[^/]+/proposals', method: 'GET', body: sc.proposals },
];
const ITEM = "() => { const e = document.querySelector('[data-testid=\"action-no-active\"]'); return e ? { texto: e.textContent.trim(), href: e.closest('a')?.getAttribute('href') ?? null } : null; }";
export default [
  { role: 'directiva', steps: [
    { simulate: rules },
    { goto: `/colectivo/resumen?campaign=${sc.selected}`, reload: true, after: 4000 },
    { waitFor: '[data-testid="action-no-active"]' }, { wait: 1500 },
    { assert: 'U.8 «Para atender» sin campaña activa', js: ITEM },
    { shot: 'simulados/05-u8_sin_activa', desc: 'Resumen sin campaña activa: «Para atender» con «Ir a Campañas» (respuestas simuladas)', sizes: ['escritorio', 'movil'] },
    { clickSel: '[data-testid="action-no-active"]' }, { waitPath: '^/campaigns' }, { wait: 2500 },
    { assert: 'U.8 destino', js: "() => ({ path: location.pathname, h1: document.querySelector('h1')?.textContent?.trim(), activa: document.querySelector('main')?.innerText.match(/[^\n]*campaña activa[^\n]*/i)?.[0] ?? null })" },
    { shot: 'simulados/u8-campanas-destino', desc: 'U.8: destino de «Ir a Campañas» (lista simulada, sin activa)', full: false },
    { apiLog: 'U.8' },
  ] },
];
