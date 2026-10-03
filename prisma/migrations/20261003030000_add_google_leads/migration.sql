-- Additive only: no backfill or changes to existing business records.
CREATE TABLE "GoogleLead" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT NOT NULL REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "source" TEXT NOT NULL DEFAULT 'google' CHECK ("source" = 'google'),
  "channel" TEXT NOT NULL CHECK ("channel" IN ('line', 'phone', 'web', 'other')),
  "grade" TEXT CHECK ("grade" IN ('elementary', 'junior_high', 'high_school', 'other')),
  "status" TEXT NOT NULL DEFAULT 'inquiry' CHECK ("status" IN ('inquiry', 'meeting', 'lost')),
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "meetingAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "idempotencyKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK (("status" = 'meeting') = ("meetingAt" IS NOT NULL)),
  CHECK (("status" = 'lost') = ("closedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "GoogleLead_schoolId_idempotencyKey_key" ON "GoogleLead"("schoolId", "idempotencyKey");
CREATE INDEX "GoogleLead_schoolId_occurredAt_idx" ON "GoogleLead"("schoolId", "occurredAt");
CREATE INDEX "GoogleLead_schoolId_meetingAt_idx" ON "GoogleLead"("schoolId", "meetingAt");
ALTER TABLE "GoogleLead" ENABLE ROW LEVEL SECURITY;
-- No public policies: only the authenticated, school-scoped server API can access leads.
ALTER TABLE "GbpMetric" ADD COLUMN "performanceFetchedAt" TIMESTAMP(3);
ALTER TABLE "GbpMetric" ADD COLUMN "performanceLocationId" TEXT;
