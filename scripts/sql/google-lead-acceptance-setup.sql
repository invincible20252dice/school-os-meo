-- Approval required for each production run. Reuse the existing system owner.
-- Create no User/Auth/profile/session; TEST place markers are not real Google IDs.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public."User" WHERE id='system-user' AND role='HEADQUARTERS' AND email='system@school-os.local' AND "passwordHash" IS NULL) THEN
  RAISE EXCEPTION 'Existing system owner differs; stop';
 END IF;
 IF EXISTS (SELECT 1 FROM public."School" WHERE id IN ('codex-google-lifecycle-20261009-a','codex-google-lifecycle-20261009-b')) THEN
  RAISE EXCEPTION 'Fixture ID already exists; stop';
 END IF;
END $$;
INSERT INTO public."School" (id,"ownerId",name,status,"googlePlaceId","updatedAt") VALUES
('codex-google-lifecycle-20261009-a','system-user','CODEX検証専用・顧客用ではありません A','ACTIVE','CODEX_TEST_NOT_A_GOOGLE_PLACE_A',now()),
('codex-google-lifecycle-20261009-b','system-user','CODEX検証専用・顧客用ではありません B','ACTIVE','CODEX_TEST_NOT_A_GOOGLE_PLACE_B',now());
COMMIT;
