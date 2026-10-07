DO $$ BEGIN
CREATE TABLE IF NOT EXISTS "TargetDistrict" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT NOT NULL REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "focusPoint" TEXT NOT NULL DEFAULT '',
  "aiMessage" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "TargetDistrict_schoolId_name_key" ON "TargetDistrict"("schoolId", "name");
END $$;
