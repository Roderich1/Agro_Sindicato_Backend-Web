import type { RequestErrorCode } from "../domain/ack";

/** Request failure with the closed error body of contract §9. */
export class SyncV1HttpError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: RequestErrorCode,
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(errorCode);
  }
}

/** Effective context derived from the authenticated session (contract §3). */
export interface SyncV1Context {
  tenantId: string;
  memberId: string;
}
