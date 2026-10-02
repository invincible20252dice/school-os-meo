-- Empty text represents an unconfigured measurement location, never a guessed address.
ALTER TABLE public."TargetKeyword"
  ADD COLUMN IF NOT EXISTS "location" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "nearestStation" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "municipality" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "latitude" DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS "longitude" DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS "radiusMeters" INTEGER NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
