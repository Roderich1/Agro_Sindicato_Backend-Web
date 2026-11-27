import { SyncV1BaseUnit, UserRole } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CallHttpError, InstitutionalActor } from "../../domain/call-error";
import { CallVisibility, ParticipationForVisibility } from "../../domain/visibility";
import { eligibleMemberWhere } from "../call-access";
import { checkProducts, frozenConsentScopes } from "./institutional-calls.queries";

export interface ClosedProductHistoryQuery {
  campaignId: string;
  productRefs: string[];
  excludeCallId?: string;
}

interface ClosedProductHistoryEntry {
  call_id: string;
  call_name: string;
  base_unit: SyncV1BaseUnit;
  visibility: "VISIBLE" | "PENDING_CONSENT";
  quantity_base: string | null;
}

interface ClosedProductHistoryTotal {
  status: "NO_HISTORY" | "VISIBLE" | "PENDING_CONSENT" | "INCOMPATIBLE_UNITS";
  total_quantity_base: string | null;
}

export interface ClosedProductHistoryView {
  contractVersion: 1;
  products: (ClosedProductHistoryTotal & {
    product_ref: string;
    product_name: string;
    base_unit: SyncV1BaseUnit;
    calls: ClosedProductHistoryEntry[];
  })[];
}

function totalOf(entries: ClosedProductHistoryEntry[], unit: SyncV1BaseUnit): ClosedProductHistoryTotal {
  if (entries.length === 0) return { status: "NO_HISTORY", total_quantity_base: null };
  if (entries.some((entry) => entry.quantity_base === null)) {
    return { status: "PENDING_CONSENT", total_quantity_base: null };
  }
  if (entries.some((entry) => entry.base_unit !== unit)) {
    return { status: "INCOMPATIBLE_UNITS", total_quantity_base: null };
  }
  const total = entries.reduce((sum, entry) => sum + BigInt(entry.quantity_base!), 0n);
  return { status: "VISIBLE", total_quantity_base: total.toString() };
}

export async function getClosedProductHistory(
  db: PrismaService,
  actor: InstitutionalActor,
  { campaignId, productRefs, excludeCallId }: ClosedProductHistoryQuery,
): Promise<ClosedProductHistoryView> {
  const member = await db.member.findFirst({
    where: { ...eligibleMemberWhere(actor.tenantId), userId: actor.userId },
    select: { role: true },
  });
  if (!member) throw new CallHttpError(403, "MANAGE_FORBIDDEN");
  const campaign = await db.agriculturalCampaign.findFirst({
    where: { id: campaignId, tenantId: actor.tenantId },
    select: { id: true },
  });
  if (!campaign) throw new CallHttpError(404, "CAMPAIGN_NOT_FOUND");

  const products = await checkProducts(db, actor.tenantId, productRefs);
  const selectedProducts = { productId: { in: productRefs } };
  const closings = await db.jointPurchaseCallClosing.findMany({
    where: {
      call: {
        tenantId: actor.tenantId,
        campaignId,
        status: "CLOSED",
        ...(excludeCallId ? { id: { not: excludeCallId } } : {}),
      },
      lines: { some: selectedProducts },
    },
    orderBy: [{ closedAt: "desc" }, { callId: "asc" }],
    select: {
      callId: true,
      call: { select: { name: true } },
      lines: {
        where: selectedProducts,
        select: { productId: true, baseUnit: true, totalQuantityBase: true, participantCount: true },
      },
      participants: {
        where: { lines: { some: selectedProducts } },
        select: { participationId: true, lines: { where: selectedProducts, select: { productId: true } } },
      },
    },
  });
  const participationIds = closings.flatMap((row) => row.participants.map((participant) => participant.participationId));
  const consentOf = await frozenConsentScopes(db, participationIds);
  const visibility = new CallVisibility(member.role === UserRole.ADMINISTRADOR);
  const entriesByProduct = new Map(productRefs.map((productRef) => [productRef, [] as ClosedProductHistoryEntry[]]));

  for (const closing of closings) {
    const frozen: ParticipationForVisibility[] = closing.participants.map((row) => ({
      consentScope: consentOf.get(row.participationId) ?? "",
      productIds: row.lines.map((line) => line.productId),
    }));
    for (const line of closing.lines) {
      const participants = frozen.filter((row) => row.productIds.includes(line.productId));
      // Distingue un cero del cierre de una instantánea incompleta.
      const complete = participants.length === line.participantCount && participants.every((row) => row.consentScope);
      const figure = complete
        ? visibility.productTotal(line.totalQuantityBase, line.participantCount, participants, "CLOSING").total_quantity_base
        : null;
      entriesByProduct.get(line.productId)!.push({
        call_id: closing.callId,
        call_name: closing.call.name,
        base_unit: line.baseUnit,
        visibility: figure === null ? "PENDING_CONSENT" : "VISIBLE",
        quantity_base: figure,
      });
    }
  }

  return {
    contractVersion: 1,
    products: [...products].map(([productRef, product]) => {
      const entries = entriesByProduct.get(productRef)!;
      return {
        product_ref: productRef,
        product_name: product.name,
        base_unit: product.baseUnit,
        ...totalOf(entries, product.baseUnit),
        calls: entries,
      };
    }),
  };
}
