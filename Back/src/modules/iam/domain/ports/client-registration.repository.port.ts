export const CLIENT_REGISTRATION_REPOSITORY = Symbol(
  "CLIENT_REGISTRATION_REPOSITORY",
);

export type ClientRegistrationStatusValue = "ACTIVE" | "REVOKED";

export interface ClientRegistrationRecord {
  id: string;
  status: ClientRegistrationStatusValue;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}

export interface AuthenticatedClientContext {
  tenantId: string;
  userId: string;
}

export type RegisterClientResult =
  | {
      outcome: "registered" | "existing";
      registration: ClientRegistrationRecord;
    }
  | { outcome: "revoked"; registration: ClientRegistrationRecord }
  | { outcome: "inactive-context" };

export type ListClientsResult =
  | { outcome: "ok"; registrations: ClientRegistrationRecord[] }
  | { outcome: "inactive-context" };

export type RevokeClientResult =
  | {
      outcome: "revoked" | "already-revoked";
      registration: ClientRegistrationRecord;
    }
  | { outcome: "not-found" }
  | { outcome: "inactive-context" };

export interface ClientRegistrationRepositoryPort {
  register(
    context: AuthenticatedClientContext,
    clientIdHash: string,
    now: Date,
  ): Promise<RegisterClientResult>;
  list(context: AuthenticatedClientContext): Promise<ListClientsResult>;
  revoke(
    context: AuthenticatedClientContext,
    registrationId: string,
    now: Date,
  ): Promise<RevokeClientResult>;
}
