-- Additive enum changes must commit before the new values can be used by a column.
DO $$
DECLARE
  label text;
  expected_labels text[] := ARRAY['DRAFT', 'GENERATED', 'PENDING', 'PENDING_CUSTOM_REPLY',
    'APPROVED', 'REVISED', 'REVISED_AND_REPLIED', 'MANUAL', 'COPIED', 'POSTED', 'REPLIED', 'ARCHIVED'];
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF EXISTS (SELECT 1 FROM public."Review" WHERE status IS NULL OR NOT (status::text = ANY(expected_labels))) THEN
    RAISE EXCEPTION 'Review.status contains null or unsupported values; alignment aborted';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'ReviewStatus'
  ) THEN
    CREATE TYPE public."ReviewStatus" AS ENUM ('DRAFT', 'GENERATED', 'PENDING', 'PENDING_CUSTOM_REPLY',
      'APPROVED', 'REVISED', 'REVISED_AND_REPLIED', 'MANUAL', 'COPIED', 'POSTED', 'REPLIED', 'ARCHIVED');
  ELSE
    FOREACH label IN ARRAY expected_labels LOOP
      EXECUTE format('ALTER TYPE public."ReviewStatus" ADD VALUE IF NOT EXISTS %L', label);
    END LOOP;
  END IF;
END
$$;
