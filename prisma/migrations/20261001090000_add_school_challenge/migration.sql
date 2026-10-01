-- Additive only. Existing school/review/survey/settings rows are never rewritten.
DO $$
BEGIN
IF to_regclass('public."SchoolChallenge"') IS NULL THEN
CREATE TABLE public."SchoolChallenge" (
  "schoolId" TEXT PRIMARY KEY REFERENCES public."School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "document" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public."SchoolChallenge" ENABLE ROW LEVEL SECURITY;
END IF;
IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public."SchoolChallenge"'::regclass) THEN
  RAISE EXCEPTION 'SchoolChallenge row level security is required';
END IF;
END
$$;
-- No public policies: access is through the authenticated, school-scoped server API.
