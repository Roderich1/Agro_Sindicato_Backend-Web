import { JointPurchaseCallStatus, Prisma, SyncV1BaseUnit } from "@prisma/client";
import { CollectiveConfig } from "@/modules/collective/application/collective-config";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { InstitutionalActor } from "../../domain/call-error";
import { SERVER_ID } from "../../domain/participation-input";
import { CallVisibility, ParticipationForVisibility } from "../../domain/visibility";
import { accessOf, responsibleIsEligible, rowInForce, rowPendingReview } from "../call-access";
import { ACCESS_MANAGE, Tx } from "../call-store";
import {
  CallDetailViewV2,
  CallOriginView,
  iso,
  presentationUnit,
  ProposalReferenceView,
  REFERENCE_DISCLOSED_LABEL,
  REFERENCE_NO_FIGURE_LABEL,
} from "../call-views";
import { Clock } from "../clock";
import { frozenParticipations } from "./institutional-calls.queries";
import {
  CallTotals,
  NOT_FOUND,
  ProductTotals,
  sameProducts,
  sortHistory,
} from "./institutional-calls.types";

const releaseVisibility = {
  withdrawnAt: true,
  items: {
    where: {
      contribution: {
        OR: [
          { status: { not: "ACTIVE" } },
          { member: { OR: [{ isActive: false }, { role: { not: "AGRICULTOR" } }, { user: { isActive: false } }] } },
        ],
      },
    },
    select: { contributionId: true },
    take: 1,
  },
} satisfies Prisma.CollectiveReleaseSelect;

type ReleaseVisibility = { withdrawnAt: Date | null; items: readonly unknown[] };

function releaseIsVisible(release: ReleaseVisibility | null): boolean {
  return release !== null && release.withdrawnAt === null && release.items.length === 0;
}

export async function renderDetailView(
  db: Tx | PrismaService,
  collective: CollectiveConfig,
  clock: Clock,
  actor: InstitutionalActor,
  id: string,
): Promise<CallDetailViewV2> {
  if (!SERVER_ID.test(id)) throw NOT_FOUND();
  const call = await db.jointPurchaseCall.findFirst({
    where: { id, tenantId: actor.tenantId },
    include: {
      campaign: { select: { id: true, name: true, status: true } },
      responsible: { select: { id: true, name: true, members: { where: { tenantId: actor.tenantId }, select: { role: true } } } },
      createdBy: { select: { id: true, name: true } },
      openedBy: { select: { id: true, name: true } },
      cancelledBy: { select: { id: true, name: true } },
      products: {
        orderBy: { position: "asc" },
        include: {
          product: { select: { name: true, isActive: true } },
          sourceLine: {
            select: {
              proposalId: true,
              position: true,
              status: true,
              release: { select: { totalBase: true, contributorCount: true, releasedAt: true, ...releaseVisibility } },
            },
          },
        },
      },
      events: {
        orderBy: [{ at: "asc" }, { id: "asc" }],
        include: { actor: { select: { id: true, name: true } } },
      },
      closing: { include: { lines: true } },
      responsibleChanges: {
        orderBy: { version: "asc" },
        include: {
          previous: { select: { id: true, name: true } },
          next: { select: { id: true, name: true } },
          actor: { select: { id: true, name: true } },
        },
      },
      origin: {
        include: {
          recordedBy: { select: { id: true, name: true } },
          products: { orderBy: { position: "asc" }, include: { product: { select: { name: true } } } },
          proposal: {
            select: {
              generatedAt: true,
              lines: { where: { status: "DISCLOSED" }, select: { release: { select: releaseVisibility } } },
            },
          },
        },
      },
    },
  });
  if (!call) throw NOT_FOUND();
  const access = await accessOf(db, call, actor.userId);
  const totals = await totalsOf(db, call, call.closing);
  const disclosureAuthorized = collective.mode !== "POLICY_PENDING";
  const responsibleEligible = await responsibleIsEligible(db, actor.tenantId, call.responsibleUserId);
  const delegations = await db.jointPurchaseCallAccess.findMany({
    where: { callId: call.id, grant: ACCESS_MANAGE, grantedByUserId: { not: null } },
    select: { userId: true, grant: true, grantedByUserId: true, responsibleVersion: true },
  });
  const collaborators = new Set(delegations.filter((row) => rowInForce(call, row, true)).map((row) => row.userId));
  const pendingReviews = delegations.filter((row) => rowPendingReview(call, row)).length;
  const canManage = access.grants.has(ACCESS_MANAGE);
  return {
    contractVersion: 2,
    call_id: call.id,
    name: call.name,
    status: call.status,
    campaign: { campaign_ref: call.campaign.id, name: call.campaign.name, status: call.campaign.status },
    deadline_at: call.deadlineAt.toISOString(),
    opened_at: iso(call.openedAt),
    closed_at: iso(call.closedAt),
    cancelled_at: iso(call.cancelledAt),
    cancel_reason: call.cancelReason,
    created_at: call.createdAt.toISOString(),
    updated_at: call.updatedAt.toISOString(),
    server_time: clock.now().toISOString(),
    responsible: {
      user_ref: call.responsible.id,
      name: call.responsible.name,
      role: call.responsible.members[0]?.role ?? null,
      eligible: responsibleEligible,
      version: call.responsibleVersion,
    },
    created_by: { user_ref: call.createdBy.id, name: call.createdBy.name },
    opened_by: call.openedBy ? { user_ref: call.openedBy.id, name: call.openedBy.name } : null,
    cancelled_by: call.cancelledBy ? { user_ref: call.cancelledBy.id, name: call.cancelledBy.name } : null,
    source_proposal_ref: call.sourceProposalId,
    participant_count: totals.participantCount,
    totals_source: totals.source,
    can_view_participants: access.canViewParticipants,
    is_responsible: access.isResponsible,
    can_manage: canManage,
    can_cancel_or_close: canManage,
    delegations_suspended: !responsibleEligible,
    my_grants: canManage ? [ACCESS_MANAGE] : [],
    collaborator_count: collaborators.size,
    can_substitute_responsible: access.canViewParticipants && !responsibleEligible && call.status !== "CANCELLED",
    pending_delegation_reviews: pendingReviews,
    pending_consent_count: access.visibility.pendingConsentCount(totals.all),
    responsible_changes: call.responsibleChanges.map((change) => ({
      version: change.version,
      at: change.at.toISOString(),
      previous: { user_ref: change.previous.id, name: change.previous.name },
      next: { user_ref: change.next.id, name: change.next.name },
      actor: { user_ref: change.actor.id, name: change.actor.name },
      reason: change.reason,
      call_status: change.callStatus,
      suspended_delegations: change.suspendedDelegations,
    })),
    products: call.products.map((product) => ({
      position: product.position,
      product_ref: product.productId,
      name: product.product.name,
      unit: presentationUnit(product.baseUnit),
      base_unit: product.baseUnit,
      is_active: product.product.isActive,
      reference: referenceOf(product.sourceLine, disclosureAuthorized),
      totals: productTotalOf(access.visibility, totals, product.productId),
    })),
    origin: originView(call.origin, disclosureAuthorized),
    origin_differs_from_current:
      call.origin !== null &&
      !sameProducts(
        call.origin.products.map((p) => p.productId),
        call.products.map((p) => p.productId),
      ),
    history: sortHistory(
      call.events.map((event) => ({
        at: event.at.toISOString(),
        kind: event.kind,
        actor: event.actor ? { user_ref: event.actor.id, name: event.actor.name } : null,
        detail: event.detail,
      })),
    ),
  };
}

async function totalsOf(
  db: Tx | PrismaService,
  call: { id: string; status: JointPurchaseCallStatus },
  closing: { participantCount: number; lines: { productId: string; totalQuantityBase: bigint; participantCount: number }[] } | null,
): Promise<CallTotals> {
  if (closing) {
    const frozen = await frozenParticipations(db, call.id);
    return {
      source: "CLOSING",
      participantCount: closing.participantCount,
      all: frozen,
      byProduct: new Map(
        closing.lines.map((l) => [
          l.productId,
          { total: l.totalQuantityBase, count: l.participantCount, participations: frozen.filter((p) => p.productIds.includes(l.productId)) },
        ]),
      ),
    };
  }
  if (call.status === "DRAFT") return { source: "NONE", participantCount: 0, all: [], byProduct: new Map() };
  const active = await db.jointPurchaseParticipation.findMany({
    where: { callId: call.id, status: "ACTIVE" },
    select: { consentScope: true, lines: { select: { productId: true, quantityBase: true } } },
  });
  const byProduct = new Map<string, ProductTotals>();
  const all: ParticipationForVisibility[] = [];
  for (const participation of active) {
    const forVisibility = {
      consentScope: participation.consentScope,
      productIds: participation.lines.map((l) => l.productId),
    };
    all.push(forVisibility);
    for (const line of participation.lines) {
      const entry = byProduct.get(line.productId) ?? { total: 0n, count: 0, participations: [] };
      entry.total += line.quantityBase;
      entry.count += 1;
      entry.participations.push(forVisibility);
      byProduct.set(line.productId, entry);
    }
  }
  return { source: "LIVE", participantCount: active.length, all, byProduct };
}

function productTotalOf(visibility: CallVisibility, totals: CallTotals, productId: string) {
  const entry = totals.byProduct.get(productId) ?? { total: 0n, count: 0, participations: [] };
  return visibility.productTotal(entry.total, entry.count, entry.participations, totals.source === "CLOSING" ? "CLOSING" : "LIVE");
}

function originView(
  origin: {
    kind: CallOriginView["kind"];
    proposalId: string | null;
    proposalFingerprint: string | null;
    selectionRevision: number | null;
    selectionMatched: boolean | null;
    recordedAt: Date;
    recordedBy: { id: string; name: string };
    products: {
      position: number;
      productId: string;
      baseUnit: SyncV1BaseUnit;
      proposalPosition: number | null;
      product: { name: string };
    }[];
    proposal: { generatedAt: Date; lines: { release: ReleaseVisibility | null }[] } | null;
  } | null,
  disclosureAuthorized: boolean,
): CallOriginView | null {
  if (!origin) return null;
  const fingerprintServed =
    disclosureAuthorized && (origin.proposal?.lines ?? []).every((line) => releaseIsVisible(line.release));
  return {
    kind: origin.kind,
    proposal_ref: origin.proposalId,
    proposal_generated_at: origin.proposal ? origin.proposal.generatedAt.toISOString() : null,
    proposal_fingerprint: fingerprintServed ? origin.proposalFingerprint : null,
    selection_revision: origin.selectionRevision,
    selection_matched: origin.selectionMatched,
    recorded_at: origin.recordedAt.toISOString(),
    recorded_by: { user_ref: origin.recordedBy.id, name: origin.recordedBy.name },
    products: origin.products.map((product) => ({
      position: product.position,
      product_ref: product.productId,
      product_name: product.product.name,
      base_unit: product.baseUnit,
      proposal_position: product.proposalPosition,
    })),
  };
}

function referenceOf(
  line: {
    proposalId: string;
    position: number;
    status: string;
    release: (ReleaseVisibility & { totalBase: bigint; contributorCount: number; releasedAt: Date }) | null;
  } | null,
  disclosureAuthorized: boolean,
): ProposalReferenceView | null {
  if (!line) return null;
  const release = line.release;
  if (disclosureAuthorized && line.status === "DISCLOSED" && release && releaseIsVisible(release)) {
    return {
      proposal_ref: line.proposalId,
      position: line.position,
      status: "DISCLOSED",
      label: REFERENCE_DISCLOSED_LABEL,
      quantity_base: release.totalBase.toString(),
      contributors: release.contributorCount,
      released_at: release.releasedAt.toISOString(),
    };
  }
  return {
    proposal_ref: line.proposalId,
    position: line.position,
    status: "NO_FIGURE",
    label: REFERENCE_NO_FIGURE_LABEL,
    quantity_base: null,
    contributors: null,
    released_at: null,
  };
}
