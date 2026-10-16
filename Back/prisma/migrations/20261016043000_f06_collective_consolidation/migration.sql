-- CreateTable
CREATE TABLE "ProductCanonicalAssociation" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "canonicalProductId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "actorUserId" TEXT NOT NULL,
    "reason" VARCHAR(280) NOT NULL,
    "closedByUserId" TEXT,
    "closeReason" VARCHAR(280),

    CONSTRAINT "ProductCanonicalAssociation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectiveRelease" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "canonicalProductId" TEXT NOT NULL,
    "projectionType" "SyncV1ProjectionType" NOT NULL,
    "baseUnit" "SyncV1BaseUnit" NOT NULL,
    "totalBase" BIGINT NOT NULL,
    "contributorCount" INTEGER NOT NULL,
    "dataAsOf" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "CollectiveRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectiveReleaseItem" (
    "releaseId" UUID NOT NULL,
    "contributionId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "CollectiveReleaseItem_pkey" PRIMARY KEY ("releaseId","contributionId")
);

-- CreateIndex
CREATE INDEX "ProductCanonicalAssociation_tenantId_productId_validTo_idx" ON "ProductCanonicalAssociation"("tenantId", "productId", "validTo");

-- CreateIndex
CREATE INDEX "ProductCanonicalAssociation_tenantId_canonicalProductId_val_idx" ON "ProductCanonicalAssociation"("tenantId", "canonicalProductId", "validTo");

-- CreateIndex
CREATE INDEX "CollectiveRelease_tenantId_campaignId_canonicalProductId_pr_idx" ON "CollectiveRelease"("tenantId", "campaignId", "canonicalProductId", "projectionType", "baseUnit", "releasedAt");

-- AddForeignKey
ALTER TABLE "ProductCanonicalAssociation" ADD CONSTRAINT "ProductCanonicalAssociation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProductCanonicalAssociation" ADD CONSTRAINT "ProductCanonicalAssociation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProductCanonicalAssociation" ADD CONSTRAINT "ProductCanonicalAssociation_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProductCanonicalAssociation" ADD CONSTRAINT "ProductCanonicalAssociation_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProductCanonicalAssociation" ADD CONSTRAINT "ProductCanonicalAssociation_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CollectiveRelease" ADD CONSTRAINT "CollectiveRelease_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CollectiveRelease" ADD CONSTRAINT "CollectiveRelease_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CollectiveRelease" ADD CONSTRAINT "CollectiveRelease_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CollectiveReleaseItem" ADD CONSTRAINT "CollectiveReleaseItem_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "CollectiveRelease"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CollectiveReleaseItem" ADD CONSTRAINT "CollectiveReleaseItem_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "SyncV1Contribution"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- F07-REC-01 (#108): una sola asociación vigente por producto, sin
-- autoasociación ni cierre incoherente.
CREATE UNIQUE INDEX "ProductCanonicalAssociation_one_active_per_product"
  ON "ProductCanonicalAssociation"("tenantId", "productId") WHERE "validTo" IS NULL;

ALTER TABLE "ProductCanonicalAssociation"
  ADD CONSTRAINT "ProductCanonicalAssociation_not_self" CHECK ("productId" <> "canonicalProductId"),
  ADD CONSTRAINT "ProductCanonicalAssociation_closed_consistently" CHECK (
    ("validTo" IS NULL) = ("closedByUserId" IS NULL)
    AND ("validTo" IS NULL) = ("closeReason" IS NULL)
    AND ("validTo" IS NULL OR "validTo" >= "validFrom")
  );

-- Historial inmutable (RF-34, RNF-12): no se borra; sólo se cierra una vigente.
CREATE FUNCTION "product_canonical_association_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ProductCanonicalAssociation no admite borrado';
  END IF;
  IF OLD."validTo" IS NOT NULL
     OR NEW."validTo" IS NULL
     OR NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."productId" IS DISTINCT FROM OLD."productId"
     OR NEW."canonicalProductId" IS DISTINCT FROM OLD."canonicalProductId"
     OR NEW."validFrom" IS DISTINCT FROM OLD."validFrom"
     OR NEW."actorUserId" IS DISTINCT FROM OLD."actorUserId"
     OR NEW."reason" IS DISTINCT FROM OLD."reason" THEN
    RAISE EXCEPTION 'ProductCanonicalAssociation: sólo se puede cerrar una asociación vigente';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "product_canonical_association_guard"
  BEFORE UPDATE OR DELETE ON "ProductCanonicalAssociation"
  FOR EACH ROW EXECUTE FUNCTION "product_canonical_association_guard"();

-- F06 #21: una divulgación sólo se retira; nunca cambia su cifra ni sus
-- contribuciones, y no se borra.
ALTER TABLE "CollectiveRelease"
  ADD CONSTRAINT "CollectiveRelease_values" CHECK (
    "totalBase" >= 0 AND "contributorCount" > 0
    AND ("withdrawnAt" IS NULL OR "withdrawnAt" >= "releasedAt")
  );

CREATE FUNCTION "collective_release_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CollectiveRelease no admite borrado';
  END IF;
  IF OLD."withdrawnAt" IS NOT NULL
     OR NEW."withdrawnAt" IS NULL
     OR (to_jsonb(NEW) - 'withdrawnAt') IS DISTINCT FROM (to_jsonb(OLD) - 'withdrawnAt') THEN
    RAISE EXCEPTION 'CollectiveRelease: sólo se puede retirar una divulgación vigente';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "collective_release_guard"
  BEFORE UPDATE OR DELETE ON "CollectiveRelease"
  FOR EACH ROW EXECUTE FUNCTION "collective_release_guard"();

CREATE FUNCTION "collective_release_item_guard"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CollectiveReleaseItem es inmutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "collective_release_item_guard"
  BEFORE UPDATE OR DELETE ON "CollectiveReleaseItem"
  FOR EACH ROW EXECUTE FUNCTION "collective_release_item_guard"();
