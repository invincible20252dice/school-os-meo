-- Additive only: legacy meeting records remain unclassified. No backfill.
-- Short lock timeout makes contention fail rather than blocking customer writes.
SET LOCAL lock_timeout = '3s';
ALTER TABLE public."GoogleLead"
  ADD COLUMN "meetingScheduledAt" TIMESTAMP(3),
  ADD COLUMN "meetingHeldAt" TIMESTAMP(3),
  ADD COLUMN "enrolledAt" TIMESTAMP(3),
  ADD CONSTRAINT "GoogleLead_scheduled_after_inquiry" CHECK ("meetingScheduledAt" IS NULL OR "meetingScheduledAt" >= "occurredAt"),
  ADD CONSTRAINT "GoogleLead_held_after_inquiry" CHECK ("meetingHeldAt" IS NULL OR "meetingHeldAt" >= "occurredAt"),
  ADD CONSTRAINT "GoogleLead_held_after_scheduled" CHECK ("meetingScheduledAt" IS NULL OR "meetingHeldAt" IS NULL OR "meetingHeldAt" >= "meetingScheduledAt"),
  ADD CONSTRAINT "GoogleLead_enrolled_after_held" CHECK ("enrolledAt" IS NULL OR ("meetingHeldAt" IS NOT NULL AND "enrolledAt" >= "meetingHeldAt"));
CREATE INDEX "GoogleLead_schoolId_meetingScheduledAt_idx" ON public."GoogleLead" ("schoolId", "meetingScheduledAt");
CREATE INDEX "GoogleLead_schoolId_meetingHeldAt_idx" ON public."GoogleLead" ("schoolId", "meetingHeldAt");
CREATE INDEX "GoogleLead_schoolId_enrolledAt_idx" ON public."GoogleLead" ("schoolId", "enrolledAt");
-- Existing status constraints, rows, RLS and grants are unchanged.
