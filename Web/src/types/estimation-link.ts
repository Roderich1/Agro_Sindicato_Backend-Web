/**
 * E3 (docs/architecture/E3_ESTIMACION_EN_BORRADOR_CONTRATO.md §4): la
 * referencia de consumo estimado fijada en un borrador de propuesta y la
 * selección de productos para una convocatoria. Formas exactas de
 * `Back/src/modules/estimation/api/rest/proposal-estimation-link.schema.ts`.
 * Las cantidades son strings exactos en unidad base: la Web no calcula con
 * ellas; la comparación la decide el servidor.
 */
import type { BaseUnit } from '../lib/quantity';
import type { ProposalLineStatus } from './collective';
import type { CampaignRef, JobStatus, ProductRef, ReasonCode, ResultStatus, RunOutcome, SeasonRef, Validity, ValidityReason } from './estimation';

/** Estado de la referencia del borrador. */
export type LinkState = 'NONE' | 'CALCULATING' | 'LINKED' | 'UNAVAILABLE' | 'RESTRICTED';

/** Estado de la estimación de una línea (§4, «Estado por línea»). */
export type LineEstimationState =
  | 'NONE'
  | 'CALCULATING'
  | 'AVAILABLE'
  | 'OUTDATED'
  | 'INSUFFICIENT_DATA'
  | 'ERROR'
  | 'NO_RESULT'
  | 'RESTRICTED';

export type ComparisonBlocker =
  | 'NEED_NOT_DISCLOSED'
  | 'ESTIMATE_NOT_AVAILABLE'
  | 'ESTIMATE_NOT_CURRENT'
  | 'PRODUCT_MISMATCH'
  | 'UNIT_MISMATCH'
  | 'PERIOD_MISMATCH'
  | 'POPULATION_NOT_VERIFIED';

export type LinkMode = 'INITIAL' | 'UPDATE' | 'CLEAR';
export type LinkAction = 'LINK_EXISTING_RUN' | 'REUSE_JOB' | 'REQUEST_JOB' | 'CLEAR';
export type UpdateReason = 'NEWER_RUN' | 'OUTDATED' | 'FAILED' | 'NOT_EXECUTED' | 'INCOMPLETE';
export type NotCalculableReason = 'TARGET_CAMPAIGN_NOT_ELIGIBLE' | 'TARGET_CAMPAIGN_NOT_CLASSIFIED' | 'NO_ESTIMABLE_PRODUCTS';
export type PrepareBlocker = 'POLICY_PENDING' | NotCalculableReason;
export type PrepareOutcome = 'EXISTING' | 'LINKED_EXISTING_RUN' | 'REUSED_JOB' | 'REQUESTED_JOB' | 'CLEARED' | 'NOT_CALCULABLE';

/** Un vínculo del borrador (inmutable): el vigente o uno del historial. */
export interface EstimationLink {
  link_ref: string;
  sequence: number;
  mode: LinkMode;
  action: LinkAction;
  created_at: string;
  created_by: { user_ref: string; name: string; role: string };
  /** Ejecución fijada, o la que resolvió el trabajo. */
  run_ref: string | null;
  job_ref: string | null;
  job_status: JobStatus | null;
  stop_code: string | null;
  failure_code: string | null;
}

export interface EstimationLinkHistoryEntry extends EstimationLink {
  current: boolean;
}

/** Resumen de la ejecución fijada, sin cifras. */
export interface EstimationLinkRun {
  run_ref: string;
  job_ref: string;
  generated_at: string;
  outcome: RunOutcome;
  failure_code: string | null;
  method: string;
  method_version: string;
  season: SeasonRef;
  /** Campaña objetivo con su período (`start_date`, `end_date`). */
  target: CampaignRef;
  disclosure: { mode: string; policy: string; threshold: number };
}

export interface LinkDifference {
  /** Necesidad − estimación, exacta, 6 decimales, en unidad base. */
  difference_base: string;
  /** 4 decimales; `null` si la estimación es 0. */
  difference_percent: string | null;
  percent_undefined: 'ESTIMATE_ZERO' | null;
  direction: 'ABOVE' | 'BELOW' | 'EQUAL';
  /** Frase descriptiva del servidor, ya presentada en L o KG. */
  observation: string;
}

export interface LinkComparison {
  comparable: boolean;
  blockers: ComparisonBlocker[];
  message: string | null;
  /** Sólo sin blockers. */
  difference: LinkDifference | null;
}

export interface EstimationLinkLine {
  position: number;
  product: ProductRef;
  base_unit: BaseUnit;
  presentation_unit: 'L' | 'KG';
  /** La necesidad tal como la sirve el borrador (F07). */
  need: { status: ProposalLineStatus; quantity_base: string | null; quantity_presentation: string | null };
  estimation: {
    state: LineEstimationState;
    status: ResultStatus | null;
    reason_code: ReasonCode | null;
    /** Sólo en AVAILABLE y OUTDATED; 6 decimales. */
    estimate_base: string | null;
    validity: Validity | null;
    validity_reason: ValidityReason | null;
  };
  comparison: LinkComparison;
}

/** `GET /collective/proposals/{id}/estimation-link` y el `view` de cada respuesta. */
export interface EstimationLinkView {
  contract_version: 1;
  proposal_ref: string;
  target_campaign_ref: string;
  state: LinkState;
  link: EstimationLink | null;
  run: EstimationLinkRun | null;
  update: { available: boolean; reason: UpdateReason | null };
  prepare_blocker: PrepareBlocker | null;
  lines: EstimationLinkLine[];
  history: EstimationLinkHistoryEntry[];
  evaluated_at: string;
  notice: string;
}

/** Respuesta de `prepare` y `clear`. */
export interface EstimationLinkActionResult {
  outcome: PrepareOutcome;
  /** Sólo con NOT_CALCULABLE. */
  reason?: NotCalculableReason;
  view: EstimationLinkView;
}

export interface PrepareLinkBody {
  request_id: string;
  mode: 'INITIAL' | 'UPDATE';
  expected_link_ref?: string | null;
}

export interface ClearLinkBody {
  request_id: string;
  expected_link_ref: string;
}

/** `GET/PUT /collective/proposals/{id}/selection` (revisión 0 y lista vacía si nunca se eligió). */
export interface ProposalSelection {
  contract_version: 1;
  proposal_ref: string;
  revision: number;
  /** En el orden de las líneas del borrador. */
  product_refs: string[];
  updated_at: string | null;
}

export type LinkErrorCode =
  | 'PAYLOAD_INVALID'
  | 'PROPOSAL_NOT_FOUND'
  | 'POLICY_PENDING'
  | 'REFERENCE_CHANGED'
  | 'REFERENCE_UP_TO_DATE'
  | 'REQUEST_ID_REUSED'
  | 'PRODUCT_NOT_IN_PROPOSAL'
  | 'SELECTION_STALE';

/** Cuerpo cerrado de los errores de E3. */
export interface LinkErrorBody {
  errorCode: LinkErrorCode;
  view?: EstimationLinkView;
  selection?: ProposalSelection;
}
