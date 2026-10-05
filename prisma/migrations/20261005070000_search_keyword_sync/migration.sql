-- Add only. Historical query counts and timestamps are never reset.
ALTER TABLE "SearchQueryLog" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
CREATE TABLE IF NOT EXISTS "GoogleSearchKeywordMonth" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT NOT NULL REFERENCES "School"("id") ON DELETE RESTRICT,
  "locationId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "rows" JSONB NOT NULL DEFAULT '[]',
  "diagnostic" JSONB NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fetchedAt" TIMESTAMP(3),
  UNIQUE ("schoolId", "locationId", "month")
);
ALTER TABLE "GoogleSearchKeywordMonth" ENABLE ROW LEVEL SECURITY;
