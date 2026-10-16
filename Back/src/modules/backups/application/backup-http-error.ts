/** Closed error codes of `/api/v1/me/backups`. Nothing from the request is echoed. */
export type BackupErrorCode =
  | "INVALID_REQUEST"
  | "AUTH_REQUIRED"
  | "AUTH_CONTEXT_FORBIDDEN"
  | "BACKUP_NOT_FOUND"
  | "BACKUP_QUOTA_EXCEEDED"
  | "BACKUP_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "BACKUP_SHA256_MISMATCH"
  | "BACKUP_TRANSFER_INCOMPLETE"
  | "RATE_LIMITED"
  | "BACKUP_INTEGRITY_FAILED"
  | "BACKUP_STORAGE_UNAVAILABLE";

export class BackupHttpError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: BackupErrorCode,
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(errorCode);
  }
}

/**
 * Owner of a request, derived only from the authenticated Auth V2 session:
 * never from a path, header or body value.
 */
export interface BackupOwnerContext {
  tenantId: string;
  memberId: string;
}
