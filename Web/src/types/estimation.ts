/**
 * F12-EST-06 (#179): tipos de INT-09 (docs/api/openapi-f12-estimation.json),
 * perfil institucional. Las cantidades son strings exactos en unidad base: la
 * Web nunca las convierte a `number` ni calcula con ellas.
 */
import type { BaseUnit } from '../lib/quantity';

export type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'NOT_EXECUTED';
export type StopCode = 'POLICY_PENDING' | 'REQUESTER_NOT_AUTHORIZED' | 'TARGET_CAMPAIGN_NOT_ELIGIBLE';
export type RunOutcome = 'CALCULATED' | 'FAILED';
export type FailureCode = 'CALCULATION_FAILED' | 'RETRIES_EXHAUSTED';
export type ResultStatus = 'ESTIMATED' | 'INSUFFICIENT_DATA' | 'INCOMPATIBLE_DATA' | 'CALCULATION_FAILED';
export type ReasonCode =
  | 'LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED'
  | 'SPAN_TOO_SHORT'
  | 'NO_SERIES'
  | 'MIXED_UNITS'
  | 'NO_COMPARABLE_CAMPAIGNS'
  | 'COVERAGE_UNKNOWN'
  | 'CALCULATION_ERROR';
export type Validity = 'NOT_USABLE' | 'SUPERSEDED' | 'OUTDATED' | 'CURRENT';
export type ValidityReason =
  | 'RUN_FAILED'
  | 'NO_FIGURE'
  | 'LATER_RUN'
  | 'SOURCES_CHANGED'
  | 'CLASSIFICATION_CORRECTED'
  | 'SOURCES_WITHDRAWN';

export interface CampaignRef {
  campaign_ref: string;
  name: string;
  status: 'PLANIFICADA' | 'ABIERTA' | 'CERRADA' | 'CANCELADA';
  start_date: string;
  end_date: string | null;
}

export interface SeasonRef {
  season_ref: string;
  key: string;
  definition: string;
  duration_days: number;
}

export interface ProductRef {
  product_ref: string;
  name: string;
}

export interface Job {
  contract_version: 1;
  job_ref: string;
  request_id: string;
  scope: { tenant_ref: string };
  requested_by_role: 'DIRECTIVA' | 'ADMINISTRADOR';
  target: CampaignRef;
  product_refs: string[] | null;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  enqueued_at: string;
  started_at: string | null;
  finished_at: string | null;
  stop_code: StopCode | null;
  stop_evidence: Record<string, unknown> | null;
  run_ref: string | null;
}

export interface Coverage {
  status: 'IDENTIFIED' | 'UNKNOWN';
  unknown_reason: 'SEALED_BEFORE_COVERAGE' | 'POPULATION_MISMATCH' | 'NOT_SEALED' | null;
  members_in_published_figures: number | null;
  linked_members: number | null;
  measures: 'PARTICIPATION_NOT_COMPLETENESS';
}

export interface SpanCoverage {
  status: 'IDENTIFIED' | 'UNKNOWN';
  campaigns: { campaign_ref: string; coverage: Coverage }[];
}

/** `InstitutionalResult`: lo que `GET /results` entrega a DIRECTIVA y ADMINISTRADOR. */
export interface InstitutionalResult {
  product: ProductRef;
  base_unit: BaseUnit;
  presentation_unit: 'L' | 'KG';
  status: ResultStatus;
  reason_code: ReasonCode | null;
  method: 'SES_NAIVE';
  run_ref: string;
  generated_at: string;
  span_length: number | null;
  estimate_base: string | null;
  naive_base: string | null;
  coverage: SpanCoverage;
  validity: Validity;
  validity_reason: ValidityReason | null;
}

export interface InstitutionalResults {
  contract_version: 1;
  profile: 'INSTITUTIONAL';
  scope: { tenant_ref: string };
  target: CampaignRef;
  season: SeasonRef | null;
  evaluated_at: string;
  results: InstitutionalResult[];
  notice: string;
}

export interface SeriesPoint {
  position: number;
  campaign: CampaignRef;
  kind: 'VERIFIED_CONSUMPTION' | 'NO_RECORD' | 'HIDDEN';
  quantity_base: string | null;
  seal_ref: string | null;
  classification_ref: string;
  coverage: Coverage;
  in_span: boolean;
  exclusion_reason: 'NO_RECORD' | 'HIDDEN' | 'BEFORE_GAP' | 'NOT_BEFORE_TARGET' | null;
}

export interface ResultDetail {
  product: ProductRef;
  base_unit: BaseUnit;
  presentation_unit: 'L' | 'KG';
  status: ResultStatus;
  reason_code: ReasonCode | null;
  method: 'SES_NAIVE';
  run_ref: string;
  generated_at: string;
  span_length: number | null;
  estimate_base: string | null;
  naive_base: string | null;
  alpha: string | null;
  fit_informative: boolean | null;
  fit_criterion: string | null;
  span: { first_position: number; last_position: number; length: number; first_campaign_ref: string; last_campaign_ref: string } | null;
  series: { series_ref: string; version: number; source_hash: string; built_at: string } | null;
  points: SeriesPoint[];
  validations: { code: string; passed: boolean }[];
  metrics: { mae: string | null; wape: string | null } | null;
  validity: Validity;
  validity_reason: ValidityReason | null;
}

export interface RunSummary {
  contract_version: 1;
  run_ref: string;
  job_ref: string;
  scope: { tenant_ref: string };
  requested_by_role: 'DIRECTIVA' | 'ADMINISTRADOR';
  target: CampaignRef;
  season: SeasonRef;
  target_classification_ref: string;
  method: 'SES_NAIVE';
  method_version: string;
  outcome: RunOutcome;
  failure_code: FailureCode | null;
  previous_run_ref: string | null;
  content_hash: string;
  generated_at: string;
  counts: { estimated: number; insufficient_data: number; incompatible_data: number; calculation_failed: number };
}

export interface Run extends RunSummary {
  parameters: Record<string, unknown>;
  /** E4 §4.4: `threshold` es 3 en las ejecuciones con F07-POL-01 y `null` en las de F07-POL-02 (sin umbral). */
  disclosure: { mode: string; policy: string; threshold: number | null };
  results: ResultDetail[];
}

export interface RunList {
  contract_version: 1;
  items: RunSummary[];
  next_cursor: string | null;
}

/** `InstitutionalDownloadedResult`: un resultado de la copia, con la vigencia que tenía al descargarse. */
export type InstitutionalDownloadedResult = Omit<InstitutionalResult, 'validity'> & { validity_at_download: Validity };

/**
 * `InstitutionalDownload` (RF-40, contrato §9): la copia para consultar sin
 * conexión. La Web es institucional: una respuesta de otro perfil no se guarda.
 */
export interface InstitutionalDownload {
  contract_version: 1;
  kind: 'ESTIMATION_DOWNLOAD';
  profile: 'INSTITUTIONAL';
  scope: { tenant_ref: string };
  subject: { member_ref: string; role: 'AGRICULTOR' | 'DIRECTIVA' | 'ADMINISTRADOR' };
  downloaded_at: string;
  target: CampaignRef;
  season: SeasonRef | null;
  results: InstitutionalDownloadedResult[];
  may_be_outdated: true;
  notice: string;
  storage: {
    backup: 'EXCLUDED_FROM_PRIVATE_BACKUP';
    discard_on: ('IDENTITY_CHANGE' | 'SIGN_OUT')[];
    replace_only_with: 'NEWER_SAME_SUBJECT_AND_SCOPE';
  };
}

/** Lo que devuelve `GET /download`: el perfil lo decide el servidor según el rol vigente. */
export type EstimationDownload = InstitutionalDownload | (Omit<InstitutionalDownload, 'profile' | 'results'> & { profile: 'FARMER'; results: unknown[] });

/**
 * F12-EST-08 (#181): `GET /collective/proposals/{id}/estimation-reference`. La
 * estimación del consumo como referencia separada de cada línea del borrador:
 * el resultado de `GET /estimation/results` para el mismo producto canónico,
 * unidad y campaña, con su ejecución y fecha, o el motivo de su ausencia.
 */
export interface ReferenceEstimation {
  status: ResultStatus;
  reason_code: ReasonCode | null;
  estimate_base: string | null;
  validity: Validity;
  validity_reason: ValidityReason | null;
  method: 'SES_NAIVE';
  run_ref: string;
  generated_at: string;
  span_length: number | null;
  run_relation: 'BEFORE_PROPOSAL' | 'AFTER_PROPOSAL';
}

export interface ReferenceLine {
  position: number;
  product_ref: string;
  base_unit: BaseUnit;
  presentation_unit: 'L' | 'KG';
  absence: 'NO_RESULT' | 'POLICY_PENDING' | null;
  estimation: ReferenceEstimation | null;
}

export interface ProposalEstimationReference {
  contract_version: 1;
  kind: 'PROPOSAL_ESTIMATION_REFERENCE';
  label: 'Estimación del consumo';
  proposal_ref: string;
  proposal_generated_at: string;
  target_campaign_ref: string;
  availability: 'AVAILABLE' | 'POLICY_PENDING';
  evaluated_at: string;
  season: SeasonRef | null;
  lines: ReferenceLine[];
  notice: string;
}
