/**
 * Datos sintéticos de la Estimación del consumo (INT-09, perfil institucional),
 * sesión C del rediseño (2026-11-10). Misma forma que `types/estimation.ts`;
 * ninguna cifra es real. Sólo para pruebas y casos extremos (`break-ui`).
 */
import type {
  CampaignRef,
  InstitutionalResult,
  InstitutionalResults,
  Job,
  ResultDetail,
  Run,
  RunList,
  RunSummary,
  SeasonRef,
  SeriesPoint,
} from '../../types/estimation';

export interface EstimationFixture {
  /** `GET /estimation/results`. */
  results: InstitutionalResults;
  /** `GET /estimation/runs` (primera página). */
  runs: RunList;
  /** `GET /estimation/runs/:id` de cada ejecución citada. */
  details: Run[];
  /** El último trabajo pedido en esta sesión, si lo hubo (la vista no pide ninguno al abrir). */
  job: Job | null;
}

export const ESTIMATION_TARGET: CampaignRef = {
  campaign_ref: '0c0c0c0c-0000-4000-8000-000000000001',
  name: 'Campaña invierno 2026',
  status: 'ABIERTA',
  start_date: '2026-05-01T00:00:00.000Z',
  end_date: null,
};
const SEASON: SeasonRef = { season_ref: 'season-1', key: 'INVIERNO', definition: 'Siembra de invierno (sintética)', duration_days: 180 };

function result(name: string, overrides: Partial<InstitutionalResult> = {}): InstitutionalResult {
  return {
    product: { product_ref: `p-${name}`, name },
    base_unit: 'ML',
    presentation_unit: 'L',
    status: 'ESTIMATED',
    reason_code: null,
    method: 'SES_NAIVE',
    run_ref: 'run-2',
    generated_at: '2026-11-02T14:00:00.000Z',
    span_length: 4,
    estimate_base: '111000.000000',
    naive_base: '116000',
    coverage: { status: 'IDENTIFIED', campaigns: [] },
    validity: 'CURRENT',
    validity_reason: null,
    ...overrides,
  };
}

function seriesPoint(position: number, name: string, kind: SeriesPoint['kind'], quantity: string | null, inSpan: boolean, exclusion: SeriesPoint['exclusion_reason'] = null): SeriesPoint {
  return {
    position,
    campaign: { campaign_ref: `c-${position}`, name, status: 'CERRADA', start_date: `${2016 + position}-05-01T00:00:00.000Z`, end_date: null },
    kind,
    quantity_base: kind === 'VERIFIED_CONSUMPTION' ? quantity : null,
    seal_ref: kind === 'VERIFIED_CONSUMPTION' ? `seal-${position}` : null,
    classification_ref: `k-${position}`,
    coverage: { status: 'IDENTIFIED', unknown_reason: null, members_in_published_figures: 5, linked_members: 9, measures: 'PARTICIPATION_NOT_COMPLETENESS' },
    in_span: inSpan,
    exclusion_reason: exclusion,
  };
}

const TARGET_POINT = (position: number) => ({ ...seriesPoint(position, ESTIMATION_TARGET.name, 'NO_RECORD', null, false, 'NOT_BEFORE_TARGET'), campaign: ESTIMATION_TARGET });

function detailOf(base: InstitutionalResult, overrides: Partial<ResultDetail> = {}): ResultDetail {
  return {
    ...base,
    alpha: base.status === 'ESTIMATED' ? '0.50' : null,
    fit_informative: base.status === 'ESTIMATED' ? true : null,
    fit_criterion: null,
    span: base.status === 'ESTIMATED' ? { first_position: 1, last_position: 4, length: 4, first_campaign_ref: 'c-1', last_campaign_ref: 'c-4' } : null,
    series: { series_ref: `series-${base.product.product_ref}`, version: 1, source_hash: 'b'.repeat(64), built_at: base.generated_at },
    points: [
      seriesPoint(1, 'Invierno 2022', 'VERIFIED_CONSUMPTION', '96000', true),
      seriesPoint(2, 'Invierno 2023', 'VERIFIED_CONSUMPTION', '120000', true),
      seriesPoint(3, 'Invierno 2024', 'VERIFIED_CONSUMPTION', '104000', true),
      seriesPoint(4, 'Invierno 2025', 'VERIFIED_CONSUMPTION', '116000', true),
      TARGET_POINT(5),
    ],
    validations: [],
    metrics: null,
    ...overrides,
  };
}

function summary(runRef: string, overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    contract_version: 1,
    run_ref: runRef,
    job_ref: `job-${runRef}`,
    scope: { tenant_ref: 't-1' },
    requested_by_role: 'DIRECTIVA',
    target: ESTIMATION_TARGET,
    season: SEASON,
    target_classification_ref: 'k-target',
    method: 'SES_NAIVE',
    method_version: 'F12-EST-04/1',
    outcome: 'CALCULATED',
    failure_code: null,
    previous_run_ref: null,
    content_hash: 'c'.repeat(64),
    generated_at: '2026-11-02T14:00:00.000Z',
    counts: { estimated: 1, insufficient_data: 0, incompatible_data: 0, calculation_failed: 0 },
    ...overrides,
  };
}

function run(runRef: string, results: ResultDetail[], overrides: Partial<RunSummary> = {}): Run {
  return { ...summary(runRef, overrides), parameters: {}, disclosure: { mode: 'PROVISIONAL_SYNTHETIC', policy: 'F07-POL-01', threshold: 3 }, results };
}

/** La fila del historial de una ejecución: sin parámetros, divulgación ni resultados. */
function summaryFrom(full: Run): RunSummary {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { parameters, disclosure, results, ...rest } = full;
  return rest;
}

function resultsOf(results: InstitutionalResult[], evaluatedAt = '2026-11-02T15:00:00.000Z'): InstitutionalResults {
  return {
    contract_version: 1,
    profile: 'INSTITUTIONAL',
    scope: { tenant_ref: 't-1' },
    target: ESTIMATION_TARGET,
    season: SEASON,
    evaluated_at: evaluatedAt,
    results,
    notice: 'Estimación exploratoria SES/naive: referencia de consumo para una campaña comparable. No se suma a la necesidad declarada.',
  };
}

/* ── demo ─────────────────────────────────────────────────────────────── */

const demoResults = [
  result('Glifosato'),
  result('Urea', { base_unit: 'G', presentation_unit: 'KG', estimate_base: '27500.500000', naive_base: '25000' }),
  result('Cipermetrina', { status: 'INSUFFICIENT_DATA', reason_code: 'SPAN_TOO_SHORT', estimate_base: null, naive_base: null, span_length: 2, validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' }),
];
const demoRun = run('run-2', demoResults.map((r) => detailOf(r)), { counts: { estimated: 2, insufficient_data: 1, incompatible_data: 0, calculation_failed: 0 } });

export const demo: EstimationFixture = {
  results: resultsOf(demoResults),
  runs: { contract_version: 1, items: [summaryFrom(demoRun)], next_cursor: null },
  details: [demoRun],
  job: null,
};

/* ── worst ────────────────────────────────────────────────────────────── */

const LONG_NAME = 'Herbicida sistémico de amplio espectro para barbecho químico 480 g/L';
const worstResults: InstitutionalResult[] = [
  // Seis decimales y línea base «0» (un consumo publicado de cero es cero, no ausencia).
  result(LONG_NAME, { estimate_base: '123456789012.123456', naive_base: '0', generated_at: '2026-11-03T23:59:00.000Z' }),
  result('Urea', { base_unit: 'G', presentation_unit: 'KG', estimate_base: '25.000001', naive_base: '25', validity: 'OUTDATED', validity_reason: 'SOURCES_CHANGED' }),
  // Fuente retirada: cifras nulas.
  result('Fungicida protectante a base de mancozeb 80 % WP (polvo mojable)', { base_unit: 'G', presentation_unit: 'KG', estimate_base: null, naive_base: null, validity: 'OUTDATED', validity_reason: 'SOURCES_WITHDRAWN' }),
  // De una ejecución anterior, sustituida.
  result('Insecticida piretroide Cipermetrina 25 % EC', { run_ref: 'run-1', generated_at: '2026-10-20T10:00:00.000Z', estimate_base: '48000.333333', naive_base: '50000', validity: 'SUPERSEDED', validity_reason: 'LATER_RUN' }),
  result('Amina', { status: 'INSUFFICIENT_DATA', reason_code: 'LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED', estimate_base: null, naive_base: null, span_length: null, validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' }),
  result('Coadyuvante siliconado no iónico', { status: 'INCOMPATIBLE_DATA', reason_code: 'MIXED_UNITS', estimate_base: null, naive_base: null, span_length: null, validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' }),
  result('GLIFÓSATO', { status: 'CALCULATION_FAILED', reason_code: 'CALCULATION_ERROR', estimate_base: null, naive_base: null, span_length: null, validity: 'NOT_USABLE', validity_reason: 'RUN_FAILED' }),
];

const hiddenPoints = [
  seriesPoint(1, 'Invierno 2017 – Valle Alto (siembra tardía)', 'VERIFIED_CONSUMPTION', '123456789012', false, 'BEFORE_GAP'),
  seriesPoint(2, 'Verano 2017-2018', 'HIDDEN', null, false, 'HIDDEN'),
  seriesPoint(3, 'Invierno 2018', 'VERIFIED_CONSUMPTION', '25', true),
  seriesPoint(4, 'Campaña de verano 2018-2019 (zona de riego)', 'NO_RECORD', null, false, 'NO_RECORD'),
  TARGET_POINT(5),
];

const worstLatest = run(
  'run-2',
  worstResults.filter((r) => r.run_ref === 'run-2').map((r, i) => detailOf(r, i === 2 ? { points: hiddenPoints, span: null } : {})),
  { counts: { estimated: 3, insufficient_data: 1, incompatible_data: 1, calculation_failed: 1 }, previous_run_ref: 'run-1', generated_at: '2026-11-03T23:59:00.000Z' },
);
const worstEarlier = run('run-1', [detailOf(worstResults[3]!)], { generated_at: '2026-10-20T10:00:00.000Z' });

export const worst: EstimationFixture = {
  results: resultsOf(worstResults, '2026-11-04T00:00:30.000Z'),
  runs: {
    contract_version: 1,
    items: [
      summary('run-3', { outcome: 'FAILED', failure_code: 'RETRIES_EXHAUSTED', generated_at: '2026-11-04T00:00:00.000Z', counts: { estimated: 0, insufficient_data: 0, incompatible_data: 0, calculation_failed: 0 } }),
      summaryFrom(worstLatest),
      summaryFrom(worstEarlier),
    ],
    next_cursor: 'cursor-siguiente',
  },
  details: [worstLatest, worstEarlier, run('run-3', [], { outcome: 'FAILED', failure_code: 'RETRIES_EXHAUSTED', generated_at: '2026-11-04T00:00:00.000Z' })],
  job: {
    contract_version: 1,
    job_ref: 'job-w',
    request_id: 'req-w',
    scope: { tenant_ref: 't-1' },
    requested_by_role: 'DIRECTIVA',
    target: ESTIMATION_TARGET,
    product_refs: null,
    status: 'NOT_EXECUTED',
    attempts: 0,
    max_attempts: 3,
    enqueued_at: '2026-11-04T00:00:00.000Z',
    started_at: null,
    finished_at: '2026-11-04T00:00:01.000Z',
    stop_code: 'TARGET_CAMPAIGN_NOT_ELIGIBLE',
    stop_evidence: null,
    run_ref: null,
  },
};

/* ── empty y one ──────────────────────────────────────────────────────── */

export const empty: EstimationFixture = {
  results: resultsOf([]),
  runs: { contract_version: 1, items: [], next_cursor: null },
  details: [],
  job: null,
};

const oneResult = result('Urea', { base_unit: 'G', presentation_unit: 'KG', estimate_base: '1000.000000', naive_base: '1000', span_length: 1 });
const oneRun = run('run-2', [detailOf(oneResult)]);
export const one: EstimationFixture = {
  results: resultsOf([oneResult]),
  runs: { contract_version: 1, items: [summaryFrom(oneRun)], next_cursor: null },
  details: [oneRun],
  job: null,
};

export const estimationFixtures = { demo, worst, empty, one } as const;
