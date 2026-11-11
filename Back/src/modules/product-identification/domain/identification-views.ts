import type {
  ProductIdentificationEventKind,
  ProductIdentificationPhotoState,
  ProductIdentificationResolution,
  ProductIdentificationStatus,
  SyncV1BaseUnit,
} from "@prisma/client";
import { baseUnitForCentralUnit } from "@/modules/sync-v1/domain/units";

export const IDENTIFICATION_CONTRACT_VERSION = 1;

/**
 * Fields a view may read. The Member, tenant and resolver of a request are
 * deliberately absent: neither view can carry the farmer's identity (E1-D5)
 * nor, towards the farmer, the name of who decided.
 */
export interface IdentificationRow {
  id: string;
  clientRequestId: string;
  status: ProductIdentificationStatus;
  localName: string;
  activeIngredient: string | null;
  unit: string;
  baseUnit: SyncV1BaseUnit;
  receivedAt: Date;
  updatedAt: Date;
  resolution: ProductIdentificationResolution | null;
  resolvedAt: Date | null;
  pendingNote: string | null;
  pendingNoteAt: Date | null;
  photoState: ProductIdentificationPhotoState;
  photoSha256: string | null;
  photoContentType: string | null;
  photoWidth: number | null;
  photoHeight: number | null;
  photoStoredAt: Date | null;
  photoConsentVersion: string | null;
  product: { id: string; name: string; unit: string; isActive: boolean } | null;
}

export interface ResolutionView {
  kind: ProductIdentificationResolution;
  product_ref: string;
  product_name: string;
  unit: string;
  base_unit: SyncV1BaseUnit | null;
  is_active: boolean;
  resolved_at: string;
}

export interface FarmerPhotoView {
  state: ProductIdentificationPhotoState;
  sha256: string | null;
  consent_version: string | null;
}

export interface FarmerRequestView {
  contractVersion: 1;
  request_id: string;
  status: ProductIdentificationStatus;
  local_name: string;
  active_ingredient: string | null;
  unit: string;
  base_unit: SyncV1BaseUnit;
  received_at: string;
  updated_at: string;
  photo: FarmerPhotoView;
  resolution: ResolutionView | null;
  pending_note: { text: string; at: string } | null;
}

export interface InstitutionalPhotoView extends FarmerPhotoView {
  content_type: string | null;
  width: number | null;
  height: number | null;
  stored_at: string | null;
}

export interface InstitutionalRequestView extends Omit<FarmerRequestView, "photo"> {
  id: string;
  photo: InstitutionalPhotoView;
}

function resolutionOf(row: IdentificationRow): ResolutionView | null {
  if (row.status !== "LINKED" || !row.product || !row.resolution || !row.resolvedAt) return null;
  return {
    kind: row.resolution,
    product_ref: row.product.id,
    product_name: row.product.name,
    unit: row.product.unit,
    base_unit: baseUnitForCentralUnit(row.product.unit),
    is_active: row.product.isActive,
    resolved_at: row.resolvedAt.toISOString(),
  };
}

function stored(row: IdentificationRow): boolean {
  return row.photoState === "STORED";
}

/** The farmer's own request (E1 §4.1). The author of a note is never named. */
export function toFarmerView(row: IdentificationRow): FarmerRequestView {
  return {
    contractVersion: IDENTIFICATION_CONTRACT_VERSION,
    request_id: row.clientRequestId,
    status: row.status,
    local_name: row.localName,
    active_ingredient: row.activeIngredient,
    unit: row.unit,
    base_unit: row.baseUnit,
    received_at: row.receivedAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    photo: {
      state: row.photoState,
      sha256: stored(row) ? row.photoSha256 : null,
      consent_version: row.photoConsentVersion,
    },
    resolution: resolutionOf(row),
    pending_note:
      row.pendingNote !== null && row.pendingNoteAt !== null
        ? { text: row.pendingNote, at: row.pendingNoteAt.toISOString() }
        : null,
  };
}

/**
 * The institutional view (E1 §4.2): the farmer's view plus the server id and
 * photo metadata. Built field by field: no Member, user, device or tenant
 * value of the farmer can reach it.
 */
export function toInstitutionalView(row: IdentificationRow): InstitutionalRequestView {
  const farmer = toFarmerView(row);
  return {
    contractVersion: farmer.contractVersion,
    id: row.id,
    request_id: farmer.request_id,
    status: farmer.status,
    local_name: farmer.local_name,
    active_ingredient: farmer.active_ingredient,
    unit: farmer.unit,
    base_unit: farmer.base_unit,
    received_at: farmer.received_at,
    updated_at: farmer.updated_at,
    photo: {
      ...farmer.photo,
      content_type: stored(row) ? row.photoContentType : null,
      width: stored(row) ? row.photoWidth : null,
      height: stored(row) ? row.photoHeight : null,
      stored_at: stored(row) ? (row.photoStoredAt?.toISOString() ?? null) : null,
    },
    resolution: farmer.resolution,
    pending_note: farmer.pending_note,
  };
}

export interface IdentificationEventRow {
  at: Date;
  kind: ProductIdentificationEventKind;
  detail: string | null;
  productId: string | null;
  actor: { name: string } | null;
  product: { name: string } | null;
}

export interface HistoryEntryView {
  at: string;
  kind: ProductIdentificationEventKind;
  actor: { name: string } | null;
  product_ref: string | null;
  product_name: string | null;
  detail: string | null;
}

/**
 * One history entry. `actor` only for institutional decisions; the farmer's
 * events have no actor (`actorUserId` null) and are never attributed.
 */
export function toHistoryEntry(row: IdentificationEventRow): HistoryEntryView {
  return {
    at: row.at.toISOString(),
    kind: row.kind,
    actor: row.actor ? { name: row.actor.name } : null,
    product_ref: row.productId,
    product_name: row.product?.name ?? null,
    detail: row.detail,
  };
}
