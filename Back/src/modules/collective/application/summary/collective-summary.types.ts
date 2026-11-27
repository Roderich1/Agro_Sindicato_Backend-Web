import type {
  CampaignStatus,
  Prisma,
  SyncV1BaseUnit,
  SyncV1ProjectionType,
  UserRole,
} from "@prisma/client";
import type { DisclosureMode, DisclosurePolicy } from "../collective-config";

/**
 * `WITHDRAWN_AFTER_SEAL` only appears in a sealed version: its contributor
 * withdrew after the seal (F07_SEALED_HISTORY_CONTRACT §5.2).
 */
export type CellStatus =
  | "DISCLOSED"
  | "SUPPRESSED_UNDER_THRESHOLD"
  | "SUPPRESSED_REVISION"
  | "OVERFLOW"
  | "WITHDRAWN_AFTER_SEAL";

/**
 * The sealed version of a campaign (F07_SEALED_HISTORY_CONTRACT §9).
 * `accepted_until` equals `sealed_at`: Central included what it had accepted
 * up to that instant, which says nothing about what phones did not publish.
 */
export interface SealRef {
  seal_ref: string;
  version: number;
  sealed_at: string;
  accepted_until: string;
  sealed_by: { user_ref: string; name: string; role: UserRole };
  /** E4 §3.4: the policy and threshold the campaign was sealed with (never changed by a later activation). */
  policy: DisclosurePolicy;
  threshold: number | null;
}

/** One output cell. Only aggregates derived in Central (F06 §5). */
export interface SummaryCell {
  projection_type: SyncV1ProjectionType;
  product_ref: string;
  product_name: string;
  base_unit: SyncV1BaseUnit;
  presentation_unit: "L" | "KG";
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
  campaign: { campaign_ref: string; name: string; status: CampaignStatus };
  /** Null while the campaign has no sealed version. */
  seal: SealRef | null;
  /**
   * E4 §3.4: the policy the figures were decided with: the configured one for
   * an unsealed campaign, the sealed one for a sealed campaign. `threshold`
   * is 3 with F07-POL-01 and null with F07-POL-02 or POLICY_PENDING.
   */
  disclosure: {
    mode: DisclosureMode;
    policy: DisclosurePolicy;
    approved: boolean;
    threshold: number | null;
  };
  /**
   * In a sealed version, the coverage stored at the seal: never recomputed.
   * F10-SEC-02 (#45): `members_with_contribution` counts only Members inside a
   * published figure; `suppressed_cells` flags suppressed rows without a count.
   */
  coverage: { linked_members: number; members_with_contribution: number; suppressed_cells: boolean } | null;
  cells: SummaryCell[];
}

export type Tx = Prisma.TransactionClient;

/**
 * A summary plus, keyed by `cellId`, the release whose figure each DISCLOSED
 * cell shows. Internal only.
 */
export interface DecidedSummary {
  summary: CollectiveSummary;
  releaseOf: ReadonlyMap<string, string>;
  /** Only for a decision of an unsealed campaign; never served. */
  population?: DecisionPopulation;
}

/**
 * Who the decision counted (internal, never served): the linked Members and,
 * per projection type, the Members inside a figure shown by this decision.
 */
export interface DecisionPopulation {
  linked: ReadonlySet<string>;
  published: ReadonlyMap<SyncV1ProjectionType, ReadonlySet<string>>;
}

export interface DecideOptions {
  /**
   * `false`: the same decision without any write. A figure that would be
   * published is not computed and `releaseOf` holds `pending:<cellId>`.
   */
  persist: boolean;
}

/** Marks, in a read-only decision, a figure that would be published now. */
export const PENDING_RELEASE_PREFIX = "pending:";

/** What a read of a sealed version loads: never `CollectiveReleaseItem`. */
export const SEALED_VERSION_INCLUDE = {
  sealedBy: { select: { id: true, name: true } },
  entries: {
    include: {
      canonicalProduct: { select: { name: true } },
      release: { select: { totalBase: true, contributorCount: true, dataAsOf: true, releasedAt: true } },
    },
  },
} satisfies Prisma.CollectiveSealInclude;

export type SealedVersion = Prisma.CollectiveSealGetPayload<{ include: typeof SEALED_VERSION_INCLUDE }>;

export const HIDDEN = {
  total_base: null,
  total_presentation: null,
  contributors: null,
  data_as_of: null,
  released_at: null,
  pending_changes: false,
};
