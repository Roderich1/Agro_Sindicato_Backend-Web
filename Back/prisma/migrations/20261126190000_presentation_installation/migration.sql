CREATE TABLE "PresentationInstallation" (
    "id" INTEGER NOT NULL,
    "installation" TEXT NOT NULL,
    "databaseName" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantSlug" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "referenceDate" DATE NOT NULL,
    "loadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manifest" JSONB NOT NULL,
    CONSTRAINT "PresentationInstallation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PresentationInstallation_singleton" CHECK ("id" = 1)
);

CREATE UNIQUE INDEX "PresentationInstallation_tenantId_key" ON "PresentationInstallation"("tenantId");

ALTER TABLE "PresentationInstallation"
    ADD CONSTRAINT "PresentationInstallation_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
