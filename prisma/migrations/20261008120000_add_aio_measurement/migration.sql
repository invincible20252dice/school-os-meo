-- Additive only. Legacy AioScoreHistory is deliberately not copied or modified.
CREATE UNIQUE INDEX "TargetKeyword_schoolId_id_key" ON "TargetKeyword"("schoolId", "id");
CREATE TABLE "AioMeasurement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "keywordId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "schoolName" TEXT NOT NULL,
  "response" TEXT,
  "citations" JSONB,
  "evidence" TEXT,
  "brandDetected" BOOLEAN,
  "recommended" BOOLEAN,
  "score" INTEGER,
  "measuredAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AioMeasurement_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AioMeasurement_keyword_fkey" FOREIGN KEY ("schoolId", "keywordId") REFERENCES "TargetKeyword"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AioMeasurement_status_check" CHECK ("status" IN ('RUNNING', 'SUCCESS', 'FAILED', 'CONFIG_REQUIRED')),
  CONSTRAINT "AioMeasurement_result_check" CHECK (
    ("status" = 'SUCCESS' AND "response" IS NOT NULL AND "brandDetected" IS NOT NULL
      AND "recommended" IS NOT NULL AND "score" IS NOT NULL AND "measuredAt" IS NOT NULL
      AND "errorCode" IS NULL AND "score" = CASE WHEN "recommended" THEN 100 ELSE 0 END
      AND (NOT "recommended" OR "brandDetected"))
    OR
    ("status" <> 'SUCCESS' AND "brandDetected" IS NULL AND "recommended" IS NULL AND "score" IS NULL AND "measuredAt" IS NULL)
  )
);
CREATE UNIQUE INDEX "AioMeasurement_schoolId_requestId_key" ON "AioMeasurement"("schoolId", "requestId");
CREATE INDEX "AioMeasurement_schoolId_provider_createdAt_idx" ON "AioMeasurement"("schoolId", "provider", "createdAt");
CREATE INDEX "AioMeasurement_keywordId_provider_createdAt_idx" ON "AioMeasurement"("keywordId", "provider", "createdAt");
-- Browser Supabase roles have no policy; access is via the authenticated server API.
ALTER TABLE "AioMeasurement" ENABLE ROW LEVEL SECURITY;
