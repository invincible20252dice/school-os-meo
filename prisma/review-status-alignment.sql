-- Atomic repair of the legacy TEXT column. Never substitute or rewrite status values.
DO $$
DECLARE
  status_type text;
  expected_labels text[] := ARRAY['DRAFT', 'GENERATED', 'PENDING', 'PENDING_CUSTOM_REPLY',
    'APPROVED', 'REVISED', 'REVISED_AND_REPLIED', 'MANUAL', 'COPIED', 'POSTED', 'REPLIED', 'ARCHIVED'];
  actual_labels text[];
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  LOCK TABLE public."Review" IN ACCESS EXCLUSIVE MODE;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'ReviewStatus'
  ) THEN
    CREATE TYPE public."ReviewStatus" AS ENUM ('DRAFT', 'GENERATED', 'PENDING', 'PENDING_CUSTOM_REPLY',
      'APPROVED', 'REVISED', 'REVISED_AND_REPLIED', 'MANUAL', 'COPIED', 'POSTED', 'REPLIED', 'ARCHIVED');
  END IF;

  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) INTO actual_labels
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname = 'ReviewStatus';
  IF actual_labels IS DISTINCT FROM expected_labels THEN
    RAISE EXCEPTION 'ReviewStatus enum differs from the Prisma schema; alignment aborted';
  END IF;

  SELECT udt_schema || '.' || udt_name INTO status_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'Review' AND column_name = 'status';
  IF status_type IS NULL OR status_type NOT IN ('pg_catalog.text', 'pg_catalog.varchar', 'public.ReviewStatus') THEN
    RAISE EXCEPTION 'Unexpected Review.status type; alignment aborted';
  END IF;
  IF EXISTS (SELECT 1 FROM public."Review" WHERE status IS NULL OR NOT (status::text = ANY(expected_labels))) THEN
    RAISE EXCEPTION 'Review.status contains null or unsupported values; alignment aborted';
  END IF;

  IF status_type <> 'public.ReviewStatus' THEN
    ALTER TABLE public."Review" ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE public."Review" ALTER COLUMN status TYPE public."ReviewStatus"
      USING status::text::public."ReviewStatus";
  END IF;
  ALTER TABLE public."Review" ALTER COLUMN status SET NOT NULL;
  ALTER TABLE public."Review" ALTER COLUMN status SET DEFAULT 'DRAFT'::public."ReviewStatus";
END
$$;
