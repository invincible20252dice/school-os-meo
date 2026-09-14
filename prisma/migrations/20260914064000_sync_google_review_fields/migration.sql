-- Keep the production schema aligned with the fields used by Google and review integrations.
ALTER TYPE "ReviewStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "ReviewStatus" ADD VALUE IF NOT EXISTS 'PENDING_CUSTOM_REPLY';
ALTER TYPE "ReviewStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "ReviewStatus" ADD VALUE IF NOT EXISTS 'REVISED';
ALTER TYPE "ReviewStatus" ADD VALUE IF NOT EXISTS 'REVISED_AND_REPLIED';
ALTER TYPE "ReviewStatus" ADD VALUE IF NOT EXISTS 'MANUAL';

ALTER TABLE "SurveyItem"
  ADD COLUMN IF NOT EXISTS "placeholder" TEXT;

ALTER TABLE "SchoolSetting"
  ADD COLUMN IF NOT EXISTS "googleReviewUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "promptTargetLength" TEXT NOT NULL DEFAULT '150-250文字',
  ADD COLUMN IF NOT EXISTS "promptAutoReplyApproval" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Review"
  ADD COLUMN IF NOT EXISTS "comment" TEXT,
  ADD COLUMN IF NOT EXISTS "gbpReviewId" TEXT,
  ADD COLUMN IF NOT EXISTS "authorName" TEXT,
  ADD COLUMN IF NOT EXISTS "aiReplyDraft" TEXT,
  ADD COLUMN IF NOT EXISTS "pendingCustomReply" TEXT,
  ADD COLUMN IF NOT EXISTS "replyText" TEXT,
  ADD COLUMN IF NOT EXISTS "lineUserId" TEXT;

CREATE INDEX IF NOT EXISTS "Review_gbpReviewId_idx" ON "Review"("gbpReviewId");
CREATE INDEX IF NOT EXISTS "Review_lineUserId_status_idx" ON "Review"("lineUserId", "status");
