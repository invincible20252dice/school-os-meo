-- CANDIDATE ONLY. Explicit production approval and runtime DB-role verification required.
-- One table, no row changes; never run as part of build/migration/seed.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
REVOKE ALL PRIVILEGES ON TABLE public."TargetDistrict" FROM anon, authenticated;
DO $$ BEGIN
 IF EXISTS (
  SELECT 1 FROM unnest(ARRAY['anon','authenticated']) r,
    unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
  WHERE has_table_privilege(r,'public."TargetDistrict"',p)
 ) OR EXISTS (
  SELECT 1 FROM unnest(ARRAY['anon','authenticated']) r,
    unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p
  WHERE has_any_column_privilege(r,'public."TargetDistrict"',p)
 ) OR EXISTS (
  SELECT 1 FROM unnest(ARRAY['service_role','postgres']) r,
    unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p
  WHERE NOT has_table_privilege(r,'public."TargetDistrict"',p)
 ) THEN RAISE EXCEPTION 'Unexpected effective permissions; transaction aborted'; END IF;
END $$;
COMMIT;
