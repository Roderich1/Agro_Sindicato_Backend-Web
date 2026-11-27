CREATE TABLE "ProductIdentificationClarificationResponse" (
    "requestId" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "noteAt" TIMESTAMP(3) NOT NULL,
    "note" VARCHAR(280) NOT NULL,
    "localName" VARCHAR(120) NOT NULL,
    "activeIngredient" VARCHAR(120),
    "photoSha256" CHAR(64),
    "photoConsentVersion" VARCHAR(16),
    "photoConsentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    CONSTRAINT "ProductIdentificationClarificationResponse_pkey" PRIMARY KEY ("requestId", "operationId"),
    CONSTRAINT "IdentificationClarificationResponse_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ProductIdentificationRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "IdentificationClarificationResponse_photo_consent_check" CHECK (
      ("photoSha256" IS NULL AND "photoConsentVersion" IS NULL AND "photoConsentAt" IS NULL)
      OR ("photoSha256" IS NOT NULL AND "photoConsentVersion" IS NOT NULL AND "photoConsentAt" IS NOT NULL)
    )
);

CREATE INDEX "IdentificationClarificationResponse_note_received_idx"
  ON "ProductIdentificationClarificationResponse"("requestId", "noteAt", "receivedAt");

CREATE UNIQUE INDEX "IdentificationClarificationResponse_one_received_per_note"
  ON "ProductIdentificationClarificationResponse"("requestId", "noteAt") WHERE "receivedAt" IS NOT NULL;
