import type { BaseUnit } from '../lib/quantity';

/** Contrato del resumen colectivo (Back `collective-summary.use-case.ts`). */
export type DisclosureMode = 'POLICY_PENDING' | 'PROVISIONAL_SYNTHETIC';
export type ProjectionType = 'CONSUMPTION_TOTAL' | 'DECLARED_NEED';
/** WITHDRAWN_AFTER_SEAL sólo aparece en una versión sellada (F07, 2026-10-23). */
export type CellStatus =
  | 'DISCLOSED'
  | 'SUPPRESSED_UNDER_THRESHOLD'
  | 'SUPPRESSED_REVISION'
  | 'OVERFLOW'
  | 'WITHDRAWN_AFTER_SEAL';
export type ProposalLineStatus = CellStatus | 'WITHDRAWN' | 'SUPERSEDED' | 'POLICY_PENDING';
/** Estado de un punto de tendencia: NO_DATA (sin celda) y NOT_SEALED nunca son cero. */
export type TrendPointStatus = CellStatus | 'NO_DATA' | 'NOT_SEALED';
/** Cualquier estado que la interfaz sabe rotular. */
export type AnyStatus = ProposalLineStatus | TrendPointStatus;

/**
 * Versión sellada de una campaña (F07_SEALED_HISTORY_CONTRACT). `accepted_until`
 * es el instante de la decisión sellada: cada cifra vale por su `data_as_of`.
 */
export interface SealRef {
  seal_ref: string;
  version: number;
  sealed_at: string;
  accepted_until: string;
  sealed_by: { user_ref: string; name: string; role: 'DIRECTIVA' | 'ADMINISTRADOR' };
}

export interface Coverage {
  linked_members: number;
  /** F10-SEC-02: Members dentro de una cifra publicada (no cuenta celdas suprimidas). */
  members_with_contribution: number;
  /** Sólo en el resumen: alguna fila no tiene cifra; sin conteo. */
  suppressed_cells?: boolean;
  /**
   * Sólo en un borrador: regla con la que se guardó. ALL_CONTRIBUTORS es la
   * anterior a F10-SEC-02 (contaba también celdas sin cifra); no se reescribe.
   */
  basis?: 'PUBLISHED_FIGURES' | 'ALL_CONTRIBUTORS';
}

export interface CampaignRef {
  campaign_ref: string;
  name: string;
  status: string;
}

export interface SummaryCell {
  projection_type: ProjectionType;
  product_ref: string;
  product_name: string;
  base_unit: BaseUnit;
  presentation_unit: 'L' | 'KG';
  status: CellStatus;
  total_base: string | null;
  total_presentation: string | null;
  contributors: number | null;
  data_as_of: string | null;
  released_at: string | null;
  pending_changes: boolean;
}

export interface CollectiveSummary {
  contractVersion: 1;
  campaign: CampaignRef;
  seal: SealRef | null;
  disclosure: { mode: DisclosureMode; policy: 'F07-POL-01'; approved: false; threshold: number | null };
  coverage: Coverage | null;
  cells: SummaryCell[];
}

export interface ProposalLine {
  position: number;
  product_ref: string;
  product_name: string;
  base_unit: BaseUnit;
  presentation_unit: 'L' | 'KG';
  status: ProposalLineStatus;
  quantity_base: string | null;
  quantity_presentation: string | null;
  contributors: number | null;
  data_as_of: string | null;
  released_at: string | null;
  pending_changes: boolean;
}

export interface UserRef {
  user_ref: string;
  name: string;
}

export interface Proposal {
  contractVersion: 1;
  proposal_ref: string;
  status: 'DRAFT';
  basis: 'DECLARED_NEED';
  campaign: CampaignRef;
  seal: SealRef | null;
  generated_at: string;
  generated_by: UserRef;
  /** null cuando alguna cifra del borrador ya no se publica. */
  inputs_fingerprint: string | null;
  disclosure: { mode: DisclosureMode; policy: 'F07-POL-01'; approved: false };
  coverage: Coverage | null;
  lines: ProposalLine[];
  notice: string;
}

export interface ProposalSummary {
  proposal_ref: string;
  status: 'DRAFT';
  generated_at: string;
  generated_by: UserRef;
  inputs_fingerprint: string | null;
  line_count: number;
}

export type SealBlock = 'SEALING_DISABLED' | 'POLICY_PENDING' | 'CAMPAIGN_NOT_CLOSED';

/** Revisión previa al sellado: banderas sin conteos. */
export interface SealReview {
  review_ref: string;
  accepted_until: string;
  coverage: { linked_members: number; members_with_contribution: number; suppressed_cells: boolean };
  open_disputes: boolean;
  pending_changes: boolean;
  cells_without_figure: boolean;
}

export interface SealState {
  contractVersion: 1;
  campaign: CampaignRef;
  state: 'SEALED' | 'NOT_SEALED';
  seal: SealRef | null;
  can_seal: boolean;
  blocked_by: SealBlock[];
  review: SealReview | null;
  /** Sólo en la respuesta del POST: false si ya estaba sellada. */
  created?: boolean;
}

export interface TrendCampaign {
  campaign_ref: string;
  name: string;
  status: string;
  start_date: string;
  seal: SealRef | null;
  coverage: { linked_members: number; members_with_contribution: number; suppressed_cells: boolean } | null;
}

export interface TrendPoint {
  campaign_ref: string;
  status: TrendPointStatus;
  total_base: string | null;
  total_presentation: string | null;
  contributors: number | null;
  data_as_of: string | null;
  pending_changes: boolean;
}

export interface TrendSeries {
  projection_type: ProjectionType;
  product_ref: string;
  product_name: string;
  base_unit: BaseUnit;
  presentation_unit: 'L' | 'KG';
  points: TrendPoint[];
}

export interface CollectiveTrends {
  contractVersion: 1;
  disclosure: { mode: DisclosureMode; policy: 'F07-POL-01'; approved: false; threshold: number | null };
  projection_type: ProjectionType | null;
  campaigns: TrendCampaign[];
  series: TrendSeries[];
  notice: string;
}

export interface CatalogEntry {
  product_ref: string;
  product_name: string;
  unit: string;
  base_unit: BaseUnit | null;
  is_active: boolean;
}

export interface Association {
  association_ref: string;
  product_ref: string;
  product_name: string;
  canonical_product_ref: string;
  canonical_product_name: string;
  valid_from: string;
  valid_to: string | null;
  actor_ref: string;
  actor_name: string;
  reason: string;
  closed_by_ref: string | null;
  closed_by_name: string | null;
  close_reason: string | null;
}

export interface AssociationList {
  current: Association[];
  history: Association[];
}
