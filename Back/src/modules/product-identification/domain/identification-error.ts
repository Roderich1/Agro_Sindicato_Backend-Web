/**
 * Closed error codes of `/api/v1/catalog/identification-requests` (E1 §4).
 * The body is always `{ errorCode }`: nothing from the request is echoed.
 */
export type IdentificationErrorCode =
  | "PAYLOAD_INVALID"
  | "AUTH_REQUIRED"
  | "AUTH_CONTEXT_FORBIDDEN"
  | "REQUEST_NOT_FOUND"
  | "REQUEST_ID_CONFLICT"
  | "REQUEST_ALREADY_LINKED"
  | "UNIT_UNSUPPORTED"
  | "UNIT_IMMUTABLE"
  | "PHOTO_CONSENT_REQUIRED"
  | "PHOTO_NOT_FOUND"
  | "PHOTO_STORAGE_UNAVAILABLE"
  | "PHOTO_INTEGRITY_FAILED"
  | "IMAGE_INVALID"
  | "IMAGE_TOO_LARGE"
  | "CONTENT_HASH_MISMATCH"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "CONFIRMATION_REQUIRED"
  | "REASON_REQUIRED"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_INACTIVE"
  | "PRODUCT_NAME_TAKEN"
  | "UNIT_DIMENSION_MISMATCH"
  | "RATE_LIMITED"
  | "TEMPORARILY_UNAVAILABLE";

export class IdentificationHttpError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: IdentificationErrorCode,
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(errorCode);
  }
}

/** Owner of a farmer request: taken from the authenticated session only. */
export interface FarmerContext {
  tenantId: string;
  memberId: string;
}
