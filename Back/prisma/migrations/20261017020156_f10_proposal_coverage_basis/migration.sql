-- F10-SEC-02 (#45): which rule produced the stored coverage of a draft.
-- Existing drafts keep NULL (the earlier rule, contributors of every cell);
-- nothing is rewritten. New drafts store PUBLISHED_FIGURES.
ALTER TABLE "JointPurchaseProposal" ADD COLUMN "coverageBasis" VARCHAR(24);
ALTER TABLE "JointPurchaseProposal" ADD CONSTRAINT "JointPurchaseProposal_coverage_basis"
  CHECK ("coverageBasis" IS NULL OR "coverageBasis" = 'PUBLISHED_FIGURES');
