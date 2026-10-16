import type { BaseUnit } from '../lib/quantity';

/** Contrato del resumen colectivo (Back `collective-summary.use-case.ts`). */
export type DisclosureMode = 'POLICY_PENDING' | 'PROVISIONAL_SYNTHETIC';
export type ProjectionType = 'CONSUMPTION_TOTAL' | 'DECLARED_NEED';
export type CellStatus = 'DISCLOSED' | 'SUPPRESSED_UNDER_THRESHOLD' | 'SUPPRESSED_REVISION' | 'OVERFLOW';
export type ProposalLineStatus = CellStatus | 'WITHDRAWN' | 'SUPERSEDED' | 'POLICY_PENDING';

export interface Coverage {
  linked_members: number;
  members_with_contribution: number;
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
