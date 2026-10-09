import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const setup = readFileSync("scripts/sql/google-lead-acceptance-setup.sql", "utf8");
const cleanup = readFileSync("scripts/sql/google-lead-acceptance-cleanup.sql", "utf8");
const a = "codex-google-lifecycle-20261009-a";
async function database() {
  const db = await PGlite.create();
  await db.exec(`CREATE TABLE "User" (id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,"passwordHash" TEXT,"updatedAt" TIMESTAMP);
    CREATE TABLE "School" (id TEXT PRIMARY KEY,"ownerId" TEXT REFERENCES "User"(id),name TEXT,status TEXT,"googlePlaceId" TEXT NOT NULL UNIQUE,"gbpLocationId" TEXT,"instagramUserId" TEXT,"updatedAt" TIMESTAMP);
    INSERT INTO "User" (id,name,role,"updatedAt") VALUES ('customer-owner','existing','OWNER',now());
    INSERT INTO "User" (id,email,role,"updatedAt") VALUES ('system-user','system@school-os.local','HEADQUARTERS',now());
    INSERT INTO "School" (id,"ownerId",name,status,"googlePlaceId") VALUES ('customer','customer-owner','existing customer','ACTIVE','customer-place');
    CREATE TABLE "GbpMetric" (id TEXT);`);
  await db.exec(readFileSync("prisma/migrations/20261003030000_add_google_leads/migration.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261009104049_google_lead_lifecycle.sql", "utf8"));
  return db;
}
it("sets up isolated no-login fixtures and archives only their leads, preserving customer rows", async () => {
  const db = await database();
  try {
    const owners = (await db.query('SELECT row_to_json(u) AS row FROM "User" u ORDER BY id')).rows;
    await db.exec(setup);
    await db.query('INSERT INTO "GoogleLead" (id,"schoolId",channel,"idempotencyKey","updatedAt") VALUES (\'customer-lead\',\'customer\',\'line\',\'real\',now()),(\'fixture-lead\',$1,\'web\',\'test\',now())', [a]);
    const before = (await db.query('SELECT row_to_json(g) AS row FROM "GoogleLead" g WHERE "schoolId"=\'customer\'')).rows;
    await expect(db.exec(setup)).rejects.toThrow("Fixture ID already exists");
    await db.exec("ROLLBACK");
    await db.exec(cleanup);
    await db.exec(cleanup);
    expect((await db.query('SELECT row_to_json(g) AS row FROM "GoogleLead" g WHERE "schoolId"=\'customer\'')).rows).toEqual(before);
    expect((await db.query('SELECT status FROM "School" WHERE id=\'customer\'')).rows).toEqual([{ status: "ACTIVE" }]);
    expect((await db.query('SELECT status FROM "School" WHERE "ownerId"=\'system-user\'')).rows).toEqual([{ status: "ARCHIVED" }, { status: "ARCHIVED" }]);
    expect((await db.query('SELECT row_to_json(u) AS row FROM "User" u ORDER BY id')).rows).toEqual(owners);
    expect((await db.query('SELECT "deletedAt" IS NOT NULL AS archived,version FROM "GoogleLead" WHERE id=\'fixture-lead\'')).rows).toEqual([{ archived: true, version: 2 }]);
  } finally { await db.close(); }
}, 30000);
it("refuses cleanup on changed identity or excess records without widening scope", async () => {
  const db = await database();
  try {
    await db.exec(setup);
    await db.query('UPDATE "School" SET "googlePlaceId"=\'connected\' WHERE id=$1', [a]);
    await expect(db.exec(cleanup)).rejects.toThrow("Fixture identity differs");
    await db.exec("ROLLBACK");
    await db.query('UPDATE "School" SET "googlePlaceId"=\'CODEX_TEST_NOT_A_GOOGLE_PLACE_A\' WHERE id=$1', [a]);
    for (let i = 0; i < 11; i++) await db.query('INSERT INTO "GoogleLead" (id,"schoolId",channel,"idempotencyKey","updatedAt") VALUES ($1,$2,\'web\',$1,now())', [`test-${i}`, a]);
    await expect(db.exec(cleanup)).rejects.toThrow("approved ten");
    await db.exec("ROLLBACK");
    expect((await db.query('SELECT count(*)::int AS count FROM "GoogleLead" WHERE "deletedAt" IS NULL')).rows).toEqual([{ count: 11 }]);
  } finally { await db.close(); }
}, 30000);
it("refuses a changed system owner without changing users or creating schools", async () => {
  const db = await database();
  try {
    await db.exec('UPDATE "User" SET role=\'OWNER\' WHERE id=\'system-user\'');
    await expect(db.exec(setup)).rejects.toThrow("Existing system owner differs");
    await db.exec("ROLLBACK");
    expect((await db.query('SELECT count(*)::int AS count FROM "School"')).rows).toEqual([{ count: 1 }]);
    expect((await db.query('SELECT role FROM "User" WHERE id=\'system-user\'')).rows).toEqual([{ role: "OWNER" }]);
  } finally { await db.close(); }
}, 30000);
