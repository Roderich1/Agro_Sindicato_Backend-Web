/**
 * Conjuntos de datos SINTÉTICOS del prototipo del Resumen (2026-11-11), con la
 * forma exacta de los contratos (`types/collective.ts`, `types/estimation.ts`,
 * `types/campaigns.ts`). Reutilizan `dev/fixtures/*` (break-ui) y añaden los
 * casos que la comprobación visual exige: muchos productos, error de consulta,
 * sin permiso, sin campañas y carga. Nunca se envían a un servidor.
 */
import * as campaignsFixtures from '../../fixtures/campaigns-fixtures';
import { CAMPAIGN_IDS } from '../../fixtures/campaigns-fixtures';
import * as summaryFixtures from '../../fixtures/summary-fixtures';
import type { SummaryFixture } from '../../fixtures/summary-fixtures';
import type { AuditLog } from '../../../types/audit-logs';
import type { Campaign } from '../../../types/campaigns';
import type { CollectiveSummary, SealState, SummaryCell } from '../../../types/collective';
import type { InstitutionalResult, InstitutionalResults } from '../../../types/estimation';

/** Qué devuelve `GET /estimation/results` para una campaña del conjunto. */
export type EstimationAnswer = { kind: 'results'; results: InstitutionalResults } | { kind: 'policy' } | { kind: 'error' };
/** Qué devuelve `GET /audit-logs?campaignId=` para una campaña del conjunto (variante Ejecutivo). */
export type ActivityAnswer = { kind: 'logs'; logs: AuditLog[] } | { kind: 'error' };

export interface ResumenDataset {
  key: string;
  label: string;
  /** `GET /campaigns` y `GET /campaigns/active`. */
  campaigns: Campaign[];
  active: Campaign | null;
  /** `GET …/summary` por campaña; una campaña sin entrada se resuelve con un resumen vacío. */
  summaries: Record<string, CollectiveSummary>;
  /** `GET …/seal` por campaña (`null` = sellada: la Web no la pide). */
  sealStates: Record<string, SealState | null>;
  /** `GET /estimation/results` por campaña; sin entrada: sin ejecuciones (`results: []`). */
  estimations: Record<string, EstimationAnswer>;
  /** `GET /audit-logs?campaignId=` por campaña; sin entrada: bitácora vacía para esa campaña. */
  activity?: Record<string, ActivityAnswer>;
  /** Resultado de toda lectura del resumen, cuando el conjunto simula un fallo. */
  failure?: 'error' | 'forbidden' | 'loading';
  /** Campaña que el conjunto quiere mostrar (`?campaign=`); sin ella, la activa. */
  selected?: string;
}

const SYNTHETIC = { mode: 'PROVISIONAL_SYNTHETIC', policy: 'F07-POL-01', approved: false, threshold: 3 } as const;

/** Resumen sin ninguna cifra para una campaña que el fixture no cubre. */
export function emptySummaryFor(campaign: Campaign): CollectiveSummary {
  return {
    contractVersion: 1,
    campaign: { campaign_ref: campaign.id, name: campaign.name, status: campaign.status },
    seal: null,
    disclosure: SYNTHETIC,
    coverage: { linked_members: 9, members_with_contribution: 0, suppressed_cells: false },
    cells: [],
  };
}

function notSealed(summary: CollectiveSummary): SealState {
  return {
    contractVersion: 1,
    campaign: summary.campaign,
    state: 'NOT_SEALED',
    seal: null,
    can_seal: false,
    blocked_by: ['CAMPAIGN_NOT_CLOSED'],
    review: null,
  };
}

/* ── Estimación: resultados que coinciden con las celdas del resumen ─────── */

function resultFor(
  cell: SummaryCell,
  overrides: Partial<InstitutionalResult> = {},
): InstitutionalResult {
  return {
    product: { product_ref: cell.product_ref, name: cell.product_name },
    base_unit: cell.base_unit,
    presentation_unit: cell.presentation_unit,
    status: 'ESTIMATED',
    reason_code: null,
    method: 'SES_NAIVE',
    run_ref: 'run-2',
    generated_at: '2026-11-02T14:00:00.000Z',
    span_length: 4,
    estimate_base: null,
    naive_base: null,
    coverage: { status: 'IDENTIFIED', campaigns: [] },
    validity: 'CURRENT',
    validity_reason: null,
    ...overrides,
  };
}

function resultsOf(summary: CollectiveSummary, results: InstitutionalResult[], evaluatedAt = '2026-11-10T15:00:00.000Z'): InstitutionalResults {
  return {
    contract_version: 1,
    profile: 'INSTITUTIONAL',
    scope: { tenant_ref: 't-proto' },
    target: { campaign_ref: summary.campaign.campaign_ref, name: summary.campaign.name, status: summary.campaign.status as 'ABIERTA', start_date: '2026-05-01T00:00:00.000Z', end_date: null },
    season: { season_ref: 'season-1', key: 'INVIERNO', definition: 'Siembra de invierno (sintética)', duration_days: 180 },
    evaluated_at: evaluatedAt,
    results,
    notice: 'Estimación exploratoria SES/naive: referencia de consumo para una campaña comparable. No se suma a la necesidad declarada.',
  };
}

const needsOf = (summary: CollectiveSummary) => summary.cells.filter((cell) => cell.projection_type === 'DECLARED_NEED');
const byName = (summary: CollectiveSummary, name: string) => needsOf(summary).find((cell) => cell.product_name === name)!;

function fromFixture(key: string, label: string, fixture: SummaryFixture, estimation?: EstimationAnswer, extra: Partial<ResumenDataset> = {}): ResumenDataset {
  const id = fixture.selected;
  return {
    key,
    label,
    campaigns: fixture.campaigns,
    active: fixture.active,
    selected: id,
    summaries: { [id]: fixture.summary },
    sealStates: { [id]: fixture.sealState },
    estimations: estimation ? { [id]: estimation } : {},
    ...extra,
  };
}

/* ── demo: 2 publicadas + 1 oculta, con estimación vigente para dos ───────── */

const demo = fromFixture('demo', 'Demo', summaryFixtures.demo, {
  kind: 'results',
  results: resultsOf(summaryFixtures.demo.summary, [
    resultFor(byName(summaryFixtures.demo.summary, 'Glifosato 480 SL'), { estimate_base: '39800.250000', naive_base: '41000' }),
    resultFor(byName(summaryFixtures.demo.summary, 'Urea 46 %'), { estimate_base: '362000.000000', naive_base: '355000' }),
  ]),
});

/* ── worst: nombres largos, cifras extremas, estados restringidos, estimación mixta ── */

const worstSummary = summaryFixtures.worst.summary;
const worst = fromFixture('worst', 'Peor caso', summaryFixtures.worst, {
  kind: 'results',
  results: resultsOf(
    worstSummary,
    [
      resultFor(byName(worstSummary, summaryFixtures.LONG_PRODUCT), { estimate_base: '123456789012.123456', naive_base: '0', validity: 'OUTDATED', validity_reason: 'SOURCES_CHANGED' }),
      resultFor(byName(worstSummary, 'Urea granulada 46 % N'), { estimate_base: '25.000001', naive_base: '25' }),
      resultFor(byName(worstSummary, 'Glifosato 480 SL'), { run_ref: 'run-1', generated_at: '2026-10-20T10:00:00.000Z', estimate_base: '48000.333333', naive_base: '50000', validity: 'SUPERSEDED', validity_reason: 'LATER_RUN' }),
      resultFor(byName(worstSummary, 'Adherente agrícola no iónico'), { status: 'INSUFFICIENT_DATA', reason_code: 'SPAN_TOO_SHORT', span_length: 2, validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' }),
      resultFor(byName(worstSummary, 'Q'), { estimate_base: null, naive_base: null, validity: 'OUTDATED', validity_reason: 'SOURCES_WITHDRAWN' }),
    ],
    '2026-11-09T23:59:30.000Z',
  ),
});

/* ── sellada, cerrada sin sellar, política pendiente, vacía, una ─────────── */

const sellada = fromFixture('sellada', 'Sellada', summaryFixtures.worstSealed);
const cerrada = fromFixture('cerrada', 'Cerrada sin sellar', summaryFixtures.worstClosedUnsealed);
const politica = fromFixture('politica', 'Política pendiente', summaryFixtures.worstPolicyPending, { kind: 'policy' });
const vacia = fromFixture('vacia', 'Sin aportes', summaryFixtures.empty);
const una = fromFixture('una', 'Una cifra', summaryFixtures.one, {
  kind: 'results',
  results: resultsOf(summaryFixtures.one.summary, [resultFor(summaryFixtures.one.summary.cells[0]!, { estimate_base: '1000.000000', naive_base: '1000', span_length: 1 })]),
});

/* ── bitácora: lo que el servidor registra hoy para una campaña (C14) ─────── */

type Step = [action: string, summary: string, createdAt: string, entityName?: string];

/** Entradas sintéticas con la forma de `AuditLog`; sólo las acciones que el Back escribe (crear, actualizar, abrir, cerrar, sellar). */
function logsFor(campaign: Campaign, actorName: string, steps: Step[]): ActivityAnswer {
  return {
    kind: 'logs',
    logs: steps.map(([action, summary, createdAt, entityName = 'AgriculturalCampaign'], index) => ({
      id: `log-${campaign.id.slice(-4)}-${index}`,
      campaignId: campaign.id,
      campaign: { id: campaign.id, name: campaign.name, status: campaign.status },
      ownerUserId: null,
      actorUserId: 'u-directiva',
      actor: { id: 'u-directiva', name: actorName, role: 'DIRECTIVA' },
      action,
      entityName,
      entityId: entityName === 'AgriculturalCampaign' ? campaign.id : 'seal-0001',
      summary,
      before: null,
      after: null,
      metadata: null,
      createdAt,
    })),
  };
}

const campaignOf = (list: Campaign[], id: string) => list.find((entry) => entry.id === id)!;
const demoActive = campaignOf(campaignsFixtures.demo, CAMPAIGN_IDS.demoActive);
const demoClosed = campaignOf(campaignsFixtures.demo, CAMPAIGN_IDS.demoClosed);
const demoActivity: Record<string, ActivityAnswer> = {
  [CAMPAIGN_IDS.demoActive]: logsFor(demoActive, 'Directiva sintética', [
    ['CREAR', `Campana creada: ${demoActive.name}`, '2026-05-20T13:05:00.000Z'],
    ['ACTUALIZAR', `Campana actualizada: ${demoActive.name}`, '2026-05-28T16:40:00.000Z'],
    ['ABRIR_CAMPANA', `Campana abierta: ${demoActive.name}`, '2026-06-01T12:00:00.000Z'],
  ]),
  [CAMPAIGN_IDS.demoClosed]: logsFor(demoClosed, 'Directiva sintética', [
    ['CREAR', `Campana creada: ${demoClosed.name}`, '2025-12-15T13:05:00.000Z'],
    ['ABRIR_CAMPANA', `Campana abierta: ${demoClosed.name}`, '2026-01-10T12:00:00.000Z'],
    ['CERRAR_CAMPANA', `Campana cerrada: ${demoClosed.name}`, '2026-06-02T21:14:00.000Z'],
  ]),
};
demo.activity = demoActivity;
una.activity = {
  [CAMPAIGN_IDS.one]: logsFor(campaignOf(campaignsFixtures.one, CAMPAIGN_IDS.one), 'Directiva sintética', [
    ['CREAR', 'Campana creada: Campaña única 2026', '2026-05-02T10:00:00.000Z'],
    ['ABRIR_CAMPANA', 'Campana abierta: Campaña única 2026', '2026-05-03T10:00:00.000Z'],
  ]),
};
const worstActive = campaignOf(campaignsFixtures.worst, CAMPAIGN_IDS.worstActive);
/** Siete entradas (la vista muestra las cinco más recientes), autora y nombre largos. */
worst.activity = {
  [CAMPAIGN_IDS.worstActive]: logsFor(worstActive, summaryFixtures.LONG_AUTHOR, [
    ['CREAR', `Campana creada: ${worstActive.name}`, '2026-04-01T09:00:00.000Z'],
    ['ACTUALIZAR', `Campana actualizada: ${worstActive.name}`, '2026-04-03T09:30:00.000Z'],
    ['ACTUALIZAR', `Campana actualizada: ${worstActive.name}`, '2026-04-09T11:45:00.000Z'],
    ['ABRIR_CAMPANA', `Campana abierta: ${worstActive.name}`, '2026-04-15T12:00:00.000Z'],
    ['ACTUALIZAR', `Campana actualizada: ${worstActive.name}`, '2026-07-21T15:10:00.000Z'],
    ['ACTUALIZAR', `Campana actualizada: ${worstActive.name}`, '2026-09-30T18:25:00.000Z'],
    ['ACTUALIZAR', `Campana actualizada: ${worstActive.name}`, '2026-11-09T23:58:00.000Z'],
  ]),
};
const sealedCampaign = campaignOf(campaignsFixtures.worst, CAMPAIGN_IDS.worstClosedSealed);
sellada.activity = {
  [CAMPAIGN_IDS.worstClosedSealed]: logsFor(sealedCampaign, summaryFixtures.LONG_AUTHOR, [
    ['CREAR', `Campana creada: ${sealedCampaign.name}`, '2025-04-01T09:00:00.000Z'],
    ['ABRIR_CAMPANA', `Campana abierta: ${sealedCampaign.name}`, '2025-05-01T12:00:00.000Z'],
    ['CERRAR_CAMPANA', `Campana cerrada: ${sealedCampaign.name}`, '2025-10-30T20:00:00.000Z'],
    ['OTRO', 'Consolidado colectivo sellado (versión 1)', '2025-11-02T14:30:00.000Z', 'CollectiveSeal'],
  ]),
};
const unsealedCampaign = campaignOf(campaignsFixtures.worst, CAMPAIGN_IDS.worstClosedUnsealed);
cerrada.activity = {
  [CAMPAIGN_IDS.worstClosedUnsealed]: logsFor(unsealedCampaign, 'Directiva sintética', [
    ['CREAR', `Campana creada: ${unsealedCampaign.name}`, '2025-10-01T09:00:00.000Z'],
    ['ABRIR_CAMPANA', `Campana abierta: ${unsealedCampaign.name}`, '2025-11-01T12:00:00.000Z'],
    ['CERRAR_CAMPANA', `Campana cerrada: ${unsealedCampaign.name}`, '2026-04-30T20:00:00.000Z'],
  ]),
};

/* ── muchos: 29 necesidades (17 L y 12 KG) y 9 consumos ──────────────────── */

const MANY_L: [string, string | null, number][] = [
  ['Glifosato 480 SL', '184250', 11],
  ['Paraquat 276 SL', '96000', 7],
  ['2,4-D amina 720 SL', '61500', 6],
  ['Atrazina 500 SC', '58000', 5],
  ['Clorpirifos 480 EC', '42000', 6],
  ['Lambda-cihalotrina 50 EC', '12750', 4],
  ['Imidacloprid 350 SC', '9500', 3],
  ['Adherente agrícola no iónico', '0', 4],
  ['Aceite mineral agrícola', '150000', 9],
  ['Fertilizante foliar quelatado con micronutrientes (Zn, B, Mn)', '31250', 5],
  ['Propiconazol 250 EC', '7400', 3],
  ['Abamectina 18 EC', '2500', 3],
  ['Tebuconazol 430 SC', '18000', 4],
  ['Metamidofos 600 SL', null, 0],
  ['Cipermetrina 250 EC', null, 0],
  ['Oxicloruro de cobre 59 SC', '46250', 5],
  ['Sulfato de magnesio líquido', '3000', 3],
];
const MANY_KG: [string, string | null, number][] = [
  ['Urea 46 %', '2150000', 12],
  ['Fosfato diamónico 18-46-0', '1475000', 10],
  ['Cloruro de potasio 60 %', '980000', 8],
  ['Abono NPK 15-15-15', '905500', 9],
  ['Sulfato de amonio 21 %', '350000', 6],
  ['Mancozeb 80 WP', '125500', 7],
  ['Azufre mojable 80 WP', null, 0],
  ['Carbendazim 50 WP', '18000', 3],
  ['Metalaxil + mancozeb 72 WP', '24000', 4],
  ['Fungicida protectante Mancozeb 80 % WP en bolsa de 25 kg', '75000', 5],
  ['Cal agrícola', '3250000', 7],
  ['Boro granulado 15 %', '12500', 3],
];

function manyCell(name: string, base: string | null, contributors: number, unit: 'ML' | 'G', index: number, projection: SummaryCell['projection_type'] = 'DECLARED_NEED'): SummaryCell {
  const disclosed = base !== null;
  const minute = String(10 + (index % 45)).padStart(2, '0');
  const presentation = disclosed ? toPresentation(base) : null;
  return {
    projection_type: projection,
    product_ref: `p-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
    product_name: name,
    base_unit: unit,
    presentation_unit: unit === 'G' ? 'KG' : 'L',
    status: disclosed ? 'DISCLOSED' : index % 2 === 0 ? 'SUPPRESSED_UNDER_THRESHOLD' : 'SUPPRESSED_REVISION',
    total_base: base,
    total_presentation: presentation,
    contributors: disclosed ? contributors : null,
    data_as_of: disclosed ? `2026-11-0${1 + (index % 8)}T14:${minute}:00.000Z` : null,
    released_at: disclosed ? `2026-11-0${1 + (index % 8)}T14:${minute}:30.000Z` : null,
    pending_changes: disclosed && index % 7 === 3,
  };
}

/** Misma regla que `lib/quantity.toPresentation`, repetida aquí para no acoplar el fixture a la Web. */
function toPresentation(base: string): string {
  const value = BigInt(base);
  const whole = value / 1000n;
  const fraction = (value % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

const manyCampaign = campaignsFixtures.demo[0]!;
const manySummary: CollectiveSummary = {
  contractVersion: 1,
  campaign: { campaign_ref: manyCampaign.id, name: manyCampaign.name, status: manyCampaign.status },
  seal: null,
  disclosure: SYNTHETIC,
  coverage: { linked_members: 1284, members_with_contribution: 212, suppressed_cells: true },
  cells: [
    ...MANY_L.map(([name, base, contributors], index) => manyCell(name, base, contributors, 'ML', index)),
    ...MANY_KG.map(([name, base, contributors], index) => manyCell(name, base, contributors, 'G', index + 17)),
    ...MANY_L.slice(0, 5).map(([name, base, contributors], index) => manyCell(name, base === null ? null : String(BigInt(base) / 3n), Math.max(3, contributors - 2), 'ML', index + 29, 'CONSUMPTION_TOTAL')),
    ...MANY_KG.slice(0, 4).map(([name, base, contributors], index) => manyCell(name, base === null ? null : String(BigInt(base) / 4n), Math.max(3, contributors - 3), 'G', index + 34, 'CONSUMPTION_TOTAL')),
  ],
};
const muchos: ResumenDataset = {
  key: 'muchos',
  label: 'Muchos productos',
  campaigns: campaignsFixtures.demo,
  active: campaignsFixtures.activeOf(campaignsFixtures.demo),
  selected: manyCampaign.id,
  summaries: { [manyCampaign.id]: manySummary },
  sealStates: { [manyCampaign.id]: notSealed(manySummary) },
  activity: demoActivity,
  estimations: {
    [manyCampaign.id]: {
      kind: 'results',
      results: resultsOf(
        manySummary,
        needsOf(manySummary)
          .filter((cell, index) => cell.status === 'DISCLOSED' && index % 3 !== 1)
          .map((cell, index) =>
            resultFor(
              cell,
              index % 5 === 4
                ? { estimate_base: null, naive_base: null, status: 'INSUFFICIENT_DATA', reason_code: 'NO_COMPARABLE_CAMPAIGNS', validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' }
                : { estimate_base: `${BigInt(cell.total_base!) + BigInt(1000 * (index + 1))}.500000`, naive_base: cell.total_base, validity: index % 4 === 2 ? 'OUTDATED' : 'CURRENT', validity_reason: index % 4 === 2 ? 'SOURCES_CHANGED' : null },
            ),
          ),
      ),
    },
  },
};

/* ── fallos y ausencias ──────────────────────────────────────────────────── */

const error: ResumenDataset = { ...demo, key: 'error', label: 'Error de consulta', failure: 'error', estimations: {} };
const sinpermiso: ResumenDataset = { ...demo, key: 'sinpermiso', label: 'Sin permiso', failure: 'forbidden', estimations: {} };
const cargando: ResumenDataset = { ...demo, key: 'cargando', label: 'Cargando', failure: 'loading', estimations: {} };
const sincampanas: ResumenDataset = { key: 'sincampanas', label: 'Sin campañas', campaigns: [], active: null, selected: undefined, summaries: {}, sealStates: {}, estimations: {} };
/** Campaña activa con cifras pero las lecturas complementarias (`GET /estimation/results`, `GET /audit-logs`) fallan (p. ej. 502): la referencia y la actividad quedan en error, el resto no. */
const estimacionError: ResumenDataset = {
  ...demo,
  key: 'estimacion-error',
  label: 'Lecturas extra en error',
  estimations: { [CAMPAIGN_IDS.demoActive]: { kind: 'error' } },
  activity: { [CAMPAIGN_IDS.demoActive]: { kind: 'error' } },
};

export const DATASETS: readonly ResumenDataset[] = [demo, worst, muchos, sellada, cerrada, politica, vacia, una, estimacionError, error, sinpermiso, sincampanas, cargando];

export function datasetFor(key: string | null): ResumenDataset {
  return DATASETS.find((entry) => entry.key === key) ?? DATASETS[0]!;
}
