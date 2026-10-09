-- Review and apply this file alone after production approval. No content columns.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE public."AioPlaceLink" (
  "schoolId" TEXT NOT NULL REFERENCES public."School"(id) ON DELETE RESTRICT,
  "candidateKey" TEXT NOT NULL CHECK ("candidateKey" ~ '^[a-f0-9]{64}$'),
  "placeId" TEXT NOT NULL CHECK ("placeId" ~ '^[A-Za-z0-9_-]{1,255}$'),
  "identifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("schoolId", "candidateKey")
);
CREATE TABLE public."AioPlacesRequest" (
  "schoolId" TEXT NOT NULL REFERENCES public."School"(id) ON DELETE RESTRICT,
  "requestId" TEXT NOT NULL CHECK ("requestId" ~ '^[a-fA-F0-9-]{36}$'),
  "reservedCalls" INTEGER NOT NULL CHECK ("reservedCalls" BETWEEN 1 AND 11),
  "actualCalls" INTEGER NOT NULL DEFAULT 0 CHECK ("actualCalls" BETWEEN 0 AND "reservedCalls"),
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED')),
  "errorCode" TEXT CHECK ("errorCode" IS NULL OR "errorCode" ~ '^[A-Z_]{1,40}$'),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  PRIMARY KEY ("schoolId", "requestId")
);
CREATE INDEX "AioPlacesRequest_schoolId_createdAt_idx" ON public."AioPlacesRequest" ("schoolId", "createdAt");
ALTER TABLE public."AioPlaceLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AioPlacesRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."AioPlaceLink", public."AioPlacesRequest" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public."AioPlaceLink", public."AioPlacesRequest" TO service_role;
COMMIT;
