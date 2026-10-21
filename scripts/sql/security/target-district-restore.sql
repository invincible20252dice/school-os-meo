-- APPROVAL REQUIRED. Restore only the recorded pre-change grants for this one table.
BEGIN;
SET LOCAL lock_timeout='3s';
GRANT ALL PRIVILEGES ON TABLE public."TargetDistrict" TO anon, authenticated;
COMMIT;
