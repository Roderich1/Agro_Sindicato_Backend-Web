-- F02-B is an EXPAND-only migration. It introduces a trusted registration
-- capability without changing the legacy SyncOperation.clientId contract.
CREATE TYPE "ClientRegistrationStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "ClientRegistration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "clientIdHash" TEXT NOT NULL,
    "status" "ClientRegistrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ClientRegistration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientRegistration_tenantId_memberId_clientIdHash_key"
ON "ClientRegistration"("tenantId", "memberId", "clientIdHash");

CREATE INDEX "ClientRegistration_tenantId_memberId_idx"
ON "ClientRegistration"("tenantId", "memberId");

CREATE INDEX "ClientRegistration_tenantId_memberId_status_idx"
ON "ClientRegistration"("tenantId", "memberId", "status");

ALTER TABLE "ClientRegistration" ADD CONSTRAINT "ClientRegistration_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClientRegistration" ADD CONSTRAINT "ClientRegistration_memberId_fkey"
FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
