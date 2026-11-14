/**
 * Sesión VERIFICACIÓN (2026-11-13): respuestas SIMULADAS para los estados que la API real no produce con los datos
 * de la base aislada. No inventa campos: importa los fixtures de la Web (`Web/src/dev/fixtures/*.ts`, los mismos que
 * usan `collective-summary.fixtures.test.tsx`, `seal-panel.test.tsx` y las pruebas del borrador) con el quitado de
 * tipos de Node y escribe `fixtures_v.json`. Lo único derivado es: filtrar listas de un fixture (todo oculto, sin
 * campaña activa), copiar una campaña de fixture con el id de la campaña del fixture del borrador, y la lista de
 * productos, copiada literalmente de `pages/products.page.test.tsx` (`CATALOG`, con «Retirado sintético» inactivo).
 *   node tool/web_rediseno_v2/fixtures_v.mjs
 */
import { registerHooks } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../Web/src');
// Los fixtures importan sin extensión ('./campaigns-fixtures'): se resuelve a .ts.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts')) {
      const base = fileURLToPath(new URL(specifier, context.parentURL));
      if (!existsSync(base) && existsSync(`${base}.ts`)) return next(pathToFileURL(`${base}.ts`).href, context);
    }
    return next(specifier, context);
  },
});
const load = (p) => import(pathToFileURL(join(SRC, p)).href);
const S = await load('dev/fixtures/summary-fixtures.ts');
const C = await load('dev/fixtures/campaigns-fixtures.ts');
const P = await load('dev/fixtures/proposal-fixtures.ts');

const worstActive = C.activeOf(C.worst);
const hiddenCells = S.worst.summary.cells.filter((c) => c.status === 'SUPPRESSED_UNDER_THRESHOLD');

// Borrador (05 §12): fixture `demo` de proposal-fixtures; su campaña es PROPOSAL_CAMPAIGN_REF.
const proposal = P.demo.proposal;
const proposalCampaign = { ...C.demo.find((c) => c.isActive), id: P.PROPOSAL_CAMPAIGN_REF, name: proposal.campaign.name };
const LINKED = P.demo.link;
const linkStates = {
  NONE: P.linkViewFor(proposal, [], { state: 'NONE' }),
  CALCULATING: P.linkViewFor(proposal, [], { state: 'CALCULATING', link: P.linkOf({ action: 'REQUEST_JOB', run_ref: null, job_ref: 'job-0000-4000-8000-000000000009', job_status: 'QUEUED' }) }),
  LINKED,
  LINKED_DESACTUALIZADA: { ...LINKED, update: { available: true, reason: 'NEWER_RUN' } },
  RESTRICTED: P.linkViewFor(proposal, [], { state: 'RESTRICTED', prepare_blocker: 'POLICY_PENDING' }),
  UNAVAILABLE: P.linkViewFor(proposal, [], {
    state: 'UNAVAILABLE',
    link: P.linkOf({ action: 'REQUEST_JOB', run_ref: null, job_ref: 'job-0000-4000-8000-000000000009', job_status: 'NOT_EXECUTED', stop_code: 'TARGET_CAMPAIGN_NOT_ELIGIBLE' }),
    update: { available: true, reason: 'NOT_EXECUTED' },
  }),
};

// pages/products.page.test.tsx: la función `product()` y `CATALOG` (dos activos y «Retirado sintético» inactivo), campo por campo.
// La Web pide todos los productos en una sola llamada (`GET /inventory/products`) y separa los inactivos en el navegador.
const product = (name, overrides = {}) => ({
  id: `id-${name}`, tenantId: 't-1', name, commercialName: null, activeIngredient: null, category: null,
  toxicologicalCategory: null, safetyDataSheetUrl: null, safetyDataSheetName: null, safetyInstructions: null, qrCodeValue: null, unit: 'L',
  minimumStock: '0', expirationWarningDays: 90, isActive: true, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
  ...overrides,
});
const productsCatalog = [
  product('Herbicida sintético', { category: 'Herbicida', activeIngredient: 'Glifosato' }),
  product('Urea sintética', { unit: 'kg', category: 'Fertilizante' }),
  product('Retirado sintético', { isActive: false }),
];

const scenarios = {
  s2_sin_campanas: { campaigns: C.empty, active: null, selected: null, summary: null, sealState: null, proposals: [] },
  u8_sin_activa: { campaigns: C.worst.filter((c) => !c.isActive), active: null, selected: S.worstSealed.selected, summary: S.worstSealed.summary, sealState: null, proposals: [] },
  s3_sin_cifras: S.empty,
  s4_todo_oculto: { ...S.worst, summary: { ...S.worst.summary, cells: hiddenCells } },
  s5_politica_pendiente: S.worstPolicyPending,
  s10_cerrada_sin_sellar: S.worstClosedUnsealed,
  s11_sellada: S.worstSealed,
};
const out = {
  generado: new Date().toISOString(),
  origen: 'Web/src/dev/fixtures (summary, campaigns, proposal) y pages/products.page.test.tsx',
  worstActive,
  scenarios,
  borrador: { campaigns: [proposalCampaign], active: proposalCampaign, history: P.demo.history, proposal, selection: P.demo.selection, linkStates },
  productsCatalog,
};
writeFileSync(join(here, 'fixtures_v.json'), JSON.stringify(out, null, 1));
console.log(`fixtures_v.json: ${Object.keys(scenarios).length} escenarios del Resumen, ${Object.keys(linkStates).length} estados de la referencia, ${productsCatalog.length} productos (1 inactivo)`);
