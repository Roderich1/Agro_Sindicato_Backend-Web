-- CreateEnum
CREATE TYPE "ProductIdentificationStatus" AS ENUM ('PENDING', 'LINKED');

-- CreateEnum
CREATE TYPE "ProductIdentificationResolution" AS ENUM ('LINKED_EXISTING', 'CREATED_PRODUCT');

-- CreateEnum
CREATE TYPE "ProductIdentificationPhotoState" AS ENUM ('NONE', 'STORED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ProductIdentificationEventKind" AS ENUM ('RECEIVED', 'UPDATED', 'PHOTO_RECEIVED', 'PHOTO_REPLACED', 'PHOTO_REMOVED', 'LINKED', 'RELINKED', 'PRODUCT_CREATED', 'NOTE');

-- CreateTable
CREATE TABLE "ProductIdentificationRequest" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "clientRequestId" UUID NOT NULL,
    "localName" VARCHAR(120) NOT NULL,
    "activeIngredient" VARCHAR(120),
    "unit" VARCHAR(2) NOT NULL,
    "baseUnit" "SyncV1BaseUnit" NOT NULL,
    "status" "ProductIdentificationStatus" NOT NULL DEFAULT 'PENDING',
    "resolution" "ProductIdentificationResolution",
    "productId" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionReason" VARCHAR(280),
    "pendingNote" VARCHAR(280),
    "pendingNoteByUserId" TEXT,
    "pendingNoteAt" TIMESTAMP(3),
    "photoState" "ProductIdentificationPhotoState" NOT NULL DEFAULT 'NONE',
    "photoStorageKey" UUID,
    "photoSha256" CHAR(64),
    "photoContentType" VARCHAR(16),
    "photoSizeBytes" INTEGER,
    "photoWidth" INTEGER,
    "photoHeight" INTEGER,
    "photoConsentVersion" VARCHAR(16),
    "photoConsentAt" TIMESTAMP(3),
    "photoStoredAt" TIMESTAMP(3),
    "photoRemovedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductIdentificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductIdentificationEvent" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "ProductIdentificationEventKind" NOT NULL,
    "actorUserId" TEXT,
    "productId" TEXT,
    "detail" VARCHAR(280),

    CONSTRAINT "ProductIdentificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductIdentificationRequest_photoStorageKey_key" ON "ProductIdentificationRequest"("photoStorageKey");

-- CreateIndex
CREATE INDEX "ProductIdentificationRequest_tenantId_status_receivedAt_idx" ON "ProductIdentificationRequest"("tenantId", "status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductIdentificationRequest_tenantId_memberId_clientReques_key" ON "ProductIdentificationRequest"("tenantId", "memberId", "clientRequestId");

-- CreateIndex
CREATE INDEX "ProductIdentificationEvent_requestId_at_idx" ON "ProductIdentificationEvent"("requestId", "at");

-- AddForeignKey
ALTER TABLE "ProductIdentificationRequest" ADD CONSTRAINT "ProductIdentificationRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProductIdentificationRequest" ADD CONSTRAINT "ProductIdentificationRequest_tenantId_memberId_fkey" FOREIGN KEY ("tenantId", "memberId") REFERENCES "Member"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProductIdentificationRequest" ADD CONSTRAINT "ProductIdentificationRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProductIdentificationRequest" ADD CONSTRAINT "ProductIdentificationRequest_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProductIdentificationRequest" ADD CONSTRAINT "ProductIdentificationRequest_pendingNoteByUserId_fkey" FOREIGN KEY ("pendingNoteByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProductIdentificationEvent" ADD CONSTRAINT "ProductIdentificationEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ProductIdentificationRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProductIdentificationEvent" ADD CONSTRAINT "ProductIdentificationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProductIdentificationEvent" ADD CONSTRAINT "ProductIdentificationEvent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- E1 §3: unidad cerrada y base derivada; estado, resolución y producto
-- coherentes; la foto STORED siempre tiene clave y huella.
ALTER TABLE "ProductIdentificationRequest"
  ADD CONSTRAINT "ProductIdentificationRequest_unit" CHECK ("unit" IN ('L', 'KG')),
  ADD CONSTRAINT "ProductIdentificationRequest_base_unit" CHECK (
    ("unit" = 'L' AND "baseUnit" = 'ML') OR ("unit" = 'KG' AND "baseUnit" = 'G')
  ),
  ADD CONSTRAINT "ProductIdentificationRequest_linked_product" CHECK (
    ("status" = 'LINKED') = ("productId" IS NOT NULL)
    AND ("status" = 'LINKED') = ("resolution" IS NOT NULL)
  ),
  ADD CONSTRAINT "ProductIdentificationRequest_photo_stored" CHECK (
    ("photoState" = 'STORED') = ("photoStorageKey" IS NOT NULL)
    AND ("photoState" = 'STORED') = ("photoSha256" IS NOT NULL)
  ),
  ADD CONSTRAINT "ProductIdentificationRequest_photo_type" CHECK (
    "photoContentType" IS NULL OR "photoContentType" IN ('image/jpeg', 'image/png')
  );

-- E1-D13: el historial de una solicitud no se borra ni se reescribe.
CREATE FUNCTION "product_identification_event_guard"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ProductIdentificationEvent no admite % (historial inmutable)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "product_identification_event_guard"
  BEFORE UPDATE OR DELETE ON "ProductIdentificationEvent"
  FOR EACH ROW EXECUTE FUNCTION "product_identification_event_guard"();
