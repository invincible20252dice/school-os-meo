-- APPROVAL REQUIRED. Synthetic acceptance fixtures in existing School OS only.
-- No auth.users/profiles/session/credential rows are created or changed.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public."User" WHERE id = 'codex-google-lifecycle-20261009-owner')
     OR EXISTS (SELECT 1 FROM public."School" WHERE id IN ('codex-google-lifecycle-20261009-a','codex-google-lifecycle-20261009-b')) THEN
    RAISE EXCEPTION 'Fixture ID already exists. Inspect before rerunning; do not reuse customer data.';
  END IF;
END $$;
INSERT INTO public."User" (id,name,role,"updatedAt")
VALUES ('codex-google-lifecycle-20261009-owner','CODEX lifecycle acceptance - no login','OWNER',now());
INSERT INTO public."School" (id,"ownerId",name,status,"googlePlaceId","updatedAt") VALUES
('codex-google-lifecycle-20261009-a','codex-google-lifecycle-20261009-owner','CODEX検証専用・顧客用ではありません A','ACTIVE','',now()),
('codex-google-lifecycle-20261009-b','codex-google-lifecycle-20261009-owner','CODEX検証専用・顧客用ではありません B','ACTIVE','',now());
COMMIT;
