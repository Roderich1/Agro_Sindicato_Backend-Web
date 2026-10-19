-- F08-BKP-06 (#40): retention of private backups.
-- purgePending: the row is DELETED or FAILED and the storage has not yet
-- confirmed that no byte of its key remains. Never true on AVAILABLE rows.
-- deletionReason: who retired a DELETED copy (its owner or the retention).
-- Existing rows keep the defaults: no value is back-filled.

-- AlterTable
ALTER TABLE "BackupMetadata" ADD COLUMN "purgePending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deletionReason" VARCHAR(16);

-- AddCheck
ALTER TABLE "BackupMetadata" ADD CONSTRAINT "BackupMetadata_purgePending_check"
  CHECK (NOT "purgePending" OR "status" IN ('DELETED', 'FAILED'));

-- AddCheck
ALTER TABLE "BackupMetadata" ADD CONSTRAINT "BackupMetadata_deletionReason_check"
  CHECK ("deletionReason" IS NULL OR ("status" = 'DELETED' AND "deletionReason" IN ('OWNER', 'RETENTION')));
