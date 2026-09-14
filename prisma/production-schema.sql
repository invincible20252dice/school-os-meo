-- Idempotent production alignment for the Supabase schema managed alongside auth.* tables.
CREATE SCHEMA IF NOT EXISTS "public";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReviewSource') THEN
    CREATE TYPE "ReviewSource" AS ENUM ('SURVEY', 'GOOGLE', 'MANUAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReviewStatus') THEN
    CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'GENERATED', 'PENDING', 'PENDING_CUSTOM_REPLY', 'APPROVED', 'REVISED', 'REVISED_AND_REPLIED', 'MANUAL', 'COPIED', 'POSTED', 'REPLIED', 'ARCHIVED');
  END IF;
END
$$;

ALTER TYPE "ReviewStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "ReviewStatus" ADD VALUE IF NOT EXISTS 'PENDING_CUSTOM_REPLY';
ALTER TYPE "ReviewStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "ReviewStatus" ADD VALUE IF NOT EXISTS 'REVISED';
ALTER TYPE "ReviewStatus" ADD VALUE IF NOT EXISTS 'REVISED_AND_REPLIED';
ALTER TYPE "ReviewStatus" ADD VALUE IF NOT EXISTS 'MANUAL';

CREATE TABLE IF NOT EXISTS "Survey" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "requiredKeywords" TEXT,
  "minCharCount" INTEGER NOT NULL DEFAULT 100,
  "maxCharCount" INTEGER NOT NULL DEFAULT 300,
  "isValid" BOOLEAN NOT NULL DEFAULT true,
  "benefitType" TEXT,
  "benefitShowTiming" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SurveyItem"
  ADD COLUMN IF NOT EXISTS "placeholder" TEXT;

ALTER TABLE "SchoolSetting"
  ADD COLUMN IF NOT EXISTS "googleReviewUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "promptTargetLength" TEXT NOT NULL DEFAULT '150-250文字',
  ADD COLUMN IF NOT EXISTS "promptAutoReplyApproval" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Review"
  ADD COLUMN IF NOT EXISTS "authorId" TEXT,
  ADD COLUMN IF NOT EXISTS "source" "ReviewSource" NOT NULL DEFAULT 'SURVEY',
  ADD COLUMN IF NOT EXISTS "parentName" TEXT,
  ADD COLUMN IF NOT EXISTS "studentGrade" TEXT,
  ADD COLUMN IF NOT EXISTS "surveyAnswers" JSONB,
  ADD COLUMN IF NOT EXISTS "originalText" TEXT,
  ADD COLUMN IF NOT EXISTS "generatedPatterns" JSONB,
  ADD COLUMN IF NOT EXISTS "selectedReviewText" TEXT,
  ADD COLUMN IF NOT EXISTS "googleReviewId" TEXT,
  ADD COLUMN IF NOT EXISTS "gbpReviewId" TEXT,
  ADD COLUMN IF NOT EXISTS "aiReplyText" TEXT,
  ADD COLUMN IF NOT EXISTS "pendingCustomReply" TEXT,
  ADD COLUMN IF NOT EXISTS "replyText" TEXT,
  ADD COLUMN IF NOT EXISTS "lineUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "aiReplyGeneratedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "copiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "postedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "repliedAt" TIMESTAMP(3);

ALTER TABLE "Review"
  ALTER COLUMN "authorName" DROP NOT NULL,
  ALTER COLUMN "rating" DROP NOT NULL,
  ALTER COLUMN "comment" DROP NOT NULL;

UPDATE "Review"
SET
  "source" = 'GOOGLE',
  "parentName" = COALESCE("parentName", "authorName"),
  "originalText" = COALESCE("originalText", "comment"),
  "selectedReviewText" = COALESCE("selectedReviewText", "comment"),
  "googleReviewId" = COALESCE("googleReviewId", "reviewId"),
  "gbpReviewId" = COALESCE("gbpReviewId", "reviewId"),
  "aiReplyText" = COALESCE("aiReplyText", "aiReplyDraft"),
  "replyText" = COALESCE("replyText", "reply"),
  "postedAt" = COALESCE("postedAt", "createdAt");

INSERT INTO "Survey" (
  "id", "schoolId", "title", "requiredKeywords", "minCharCount", "maxCharCount",
  "isValid", "benefitType", "createdAt", "updatedAt"
)
SELECT
  item_groups."surveyId",
  survey_setting."schoolId",
  survey_setting."title",
  survey_setting."keywords",
  100,
  300,
  COALESCE(survey_setting."status", 'ACTIVE') = 'ACTIVE',
  survey_setting."reward",
  COALESCE(survey_setting."createdAt", CURRENT_TIMESTAMP),
  COALESCE(survey_setting."updatedAt", CURRENT_TIMESTAMP)
FROM (SELECT DISTINCT "surveyId" FROM "SurveyItem") AS item_groups
CROSS JOIN LATERAL (
  SELECT *
  FROM "SurveySetting"
  ORDER BY ("status" = 'ACTIVE') DESC, "updatedAt" DESC NULLS LAST
  LIMIT 1
) AS survey_setting
ON CONFLICT ("id") DO NOTHING;

UPDATE "SchoolSetting" AS setting
SET
  "googleConnected" = true,
  "googleAccountId" = COALESCE(NULLIF(setting."googleAccountId", ''), account."email"),
  "googleRefreshToken" = COALESCE(setting."googleRefreshToken", account."refreshToken"),
  "selectedGbpLocationId" = COALESCE(NULLIF(setting."selectedGbpLocationId", ''), account."locationId"),
  "googleReviewUrl" = COALESCE(NULLIF(setting."googleReviewUrl", ''), account."reviewUrl"),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "GoogleAccount" AS account
WHERE account."schoolId" = setting."schoolId";

CREATE INDEX IF NOT EXISTS "Survey_schoolId_isValid_idx" ON "Survey"("schoolId", "isValid");
CREATE INDEX IF NOT EXISTS "Survey_createdAt_idx" ON "Survey"("createdAt");
CREATE INDEX IF NOT EXISTS "SurveyItem_surveyId_order_idx" ON "SurveyItem"("surveyId", "order");
CREATE INDEX IF NOT EXISTS "Review_gbpReviewId_idx" ON "Review"("gbpReviewId");
CREATE INDEX IF NOT EXISTS "Review_lineUserId_status_idx" ON "Review"("lineUserId", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Survey_schoolId_fkey') THEN
    ALTER TABLE "Survey" ADD CONSTRAINT "Survey_schoolId_fkey"
      FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SurveyItem_surveyId_fkey') THEN
    ALTER TABLE "SurveyItem" ADD CONSTRAINT "SurveyItem_surveyId_fkey"
      FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
