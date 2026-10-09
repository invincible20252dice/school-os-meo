-- APPROVAL REQUIRED. Archive only the exact synthetic fixture schools.
-- Preserve rows for audit; no physical deletion and no customer record changes.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
DO $$ BEGIN
  IF (SELECT count(*) FROM public."School" WHERE id IN ('codex-google-lifecycle-20261009-a','codex-google-lifecycle-20261009-b')
      AND "ownerId"='codex-google-lifecycle-20261009-owner'
      AND name IN ('CODEX検証専用・顧客用ではありません A','CODEX検証専用・顧客用ではありません B')
      AND "googlePlaceId"='' AND "gbpLocationId" IS NULL AND "instagramUserId" IS NULL) <> 2 THEN
    RAISE EXCEPTION 'Fixture identity differs; stop cleanup and inspect.';
  END IF;
  IF (SELECT count(*) FROM public."GoogleLead" WHERE "schoolId" IN ('codex-google-lifecycle-20261009-a','codex-google-lifecycle-20261009-b')) > 10 THEN
    RAISE EXCEPTION 'More than the approved ten synthetic leads; stop cleanup and inspect.';
  END IF;
END $$;
UPDATE public."GoogleLead" SET "deletedAt"=now(),version=version+1,"updatedAt"=now()
WHERE "schoolId" IN ('codex-google-lifecycle-20261009-a','codex-google-lifecycle-20261009-b') AND "deletedAt" IS NULL;
UPDATE public."School" SET status='ARCHIVED',"updatedAt"=now()
WHERE id IN ('codex-google-lifecycle-20261009-a','codex-google-lifecycle-20261009-b') AND "ownerId"='codex-google-lifecycle-20261009-owner';
COMMIT;
