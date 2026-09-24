import { UserRole } from "@prisma/client";

/** Current authorization state resolved from the database for this request. */
export interface AuthenticatedPrincipal {
  sub: string;
  email: string;
  tenantId: string;
  role: UserRole;
  memberId: string;
  tokenVersion: 1 | 2;
  /** Kept only for existing V2 consumers; never a source of authorization. */
  ver?: 2;
  sessionId?: string;
  clientRegistrationId?: string | null;
}
