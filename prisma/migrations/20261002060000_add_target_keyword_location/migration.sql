-- Empty text represents an unconfigured measurement location, never a guessed address.
ALTER TABLE public."TargetKeyword"
  ADD COLUMN IF NOT EXISTS "location" TEXT NOT NULL DEFAULT '';
