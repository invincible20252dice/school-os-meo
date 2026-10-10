-- SEPARATE CANDIDATE. Do not combine with TargetDistrict rollout.
-- Preserve self-row policies, SELECT and server administrative privileges.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
REVOKE UPDATE ON TABLE public.profiles FROM anon, authenticated;
REVOKE UPDATE (id,role,school_id,school_ids,full_name,created_at,updated_at,status) ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;
DO $$ BEGIN
 IF EXISTS (
  SELECT 1 FROM pg_attribute WHERE attrelid='public.profiles'::regclass AND attnum>0 AND NOT attisdropped
  AND (has_column_privilege('anon','public.profiles',attname,'UPDATE')
    OR (attname<>'full_name' AND has_column_privilege('authenticated','public.profiles',attname,'UPDATE')))
 ) OR NOT has_column_privilege('authenticated','public.profiles','full_name','UPDATE')
 OR NOT has_table_privilege('service_role','public.profiles','UPDATE')
 THEN RAISE EXCEPTION 'Unexpected profile permissions; transaction aborted'; END IF;
END $$;
COMMIT;
