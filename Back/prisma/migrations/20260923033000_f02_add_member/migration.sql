-- F02-A is an EXPAND + BACKFILL migration. User remains the compatible
-- account table and its legacy tenantId, role and isActive columns remain authoritative.
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- The initial Member reuses User.id only to make the historical backfill
-- deterministic. Member and User remain separate entities; future memberships
-- receive independent IDs from the Prisma model default.
INSERT INTO "Member" ("id", "tenantId", "userId", "role", "isActive", "createdAt", "updatedAt")
SELECT "id", "tenantId", "id", "role", "isActive", "createdAt", "updatedAt"
FROM "User";

CREATE UNIQUE INDEX "Member_tenantId_userId_key" ON "Member"("tenantId", "userId");
CREATE INDEX "Member_tenantId_idx" ON "Member"("tenantId");
CREATE INDEX "Member_userId_idx" ON "Member"("userId");
CREATE INDEX "Member_tenantId_isActive_idx" ON "Member"("tenantId", "isActive");

ALTER TABLE "Member" ADD CONSTRAINT "Member_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Member" ADD CONSTRAINT "Member_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
