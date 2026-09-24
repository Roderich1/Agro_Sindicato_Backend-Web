-- F02-C is EXPAND + PARALLEL CONTRACT. V1 refresh rows remain valid and
-- are not assigned synthetic sessions.
CREATE TYPE "AuthSessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'COMPROMISED');
CREATE TYPE "AuthRefreshTransport" AS ENUM ('COOKIE', 'BODY');

CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "clientRegistrationId" TEXT,
    "status" "AuthSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "refreshTransport" "AuthRefreshTransport" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "compromisedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- The DEFAULT is the deterministic backfill for all existing legacy rows.
ALTER TABLE "RefreshToken"
ADD COLUMN "sessionId" TEXT,
ADD COLUMN "contractVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "consumedAt" TIMESTAMP(3);

CREATE INDEX "AuthSession_memberId_status_idx"
ON "AuthSession"("memberId", "status");

CREATE INDEX "AuthSession_clientRegistrationId_status_idx"
ON "AuthSession"("clientRegistrationId", "status");

CREATE INDEX "AuthSession_expiresAt_idx"
ON "AuthSession"("expiresAt");

CREATE INDEX "RefreshToken_sessionId_idx"
ON "RefreshToken"("sessionId");

CREATE INDEX "RefreshToken_contractVersion_sessionId_idx"
ON "RefreshToken"("contractVersion", "sessionId");

ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_memberId_fkey"
FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_clientRegistrationId_fkey"
FOREIGN KEY ("clientRegistrationId") REFERENCES "ClientRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
