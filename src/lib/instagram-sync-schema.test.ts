import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { instagramSyncSchemaQuery } from "./instagram-sync-readiness";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE "School" (id text PRIMARY KEY, name text NOT NULL, "gbpLocationId" text);
    CREATE TABLE "InstagramSetting" (id text PRIMARY KEY, "schoolId" text UNIQUE,
      "instagramAccessToken" text, "instagramBusinessAccountId" text, "autoSyncEnabled" boolean,
      "lastSyncedAt" timestamp, "updatedAt" timestamp NOT NULL);
    CREATE TABLE "SyncedPost" (id text PRIMARY KEY, "schoolId" text, "instagramMediaId" text,
      "gbpPostId" text, "instagramUrl" text, "gbpPostUrl" text, caption text, "formattedText" text,
      "syncedAt" timestamp DEFAULT CURRENT_TIMESTAMP, "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" timestamp);
    CREATE UNIQUE INDEX media_identity ON "SyncedPost" ("schoolId", "instagramMediaId");
    CREATE ROLE sync_role;
    GRANT SELECT ON "School", "InstagramSetting", "SyncedPost" TO sync_role;
    GRANT INSERT ON "SyncedPost" TO sync_role;
    GRANT UPDATE ("lastSyncedAt", "updatedAt") ON "InstagramSetting" TO sync_role;
  `);
}, 10000);
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.exec("BEGIN"); });
afterEach(async () => { await db.exec("ROLLBACK"); });
async function ready() {
  return (await db.query<{ ready: boolean }>(instagramSyncSchemaQuery.text, [...instagramSyncSchemaQuery.values])).rows[0].ready;
}
it("accepts the complete schema under the least required column privileges", async () => {
  await db.exec("SET LOCAL ROLE sync_role"); expect(await ready()).toBe(true);
});
it("rejects a missing SyncedPost.createdAt default used by create", async () => {
  await db.exec('ALTER TABLE "SyncedPost" ALTER COLUMN "createdAt" DROP DEFAULT');
  expect(await ready()).toBe(false);
});
it.each([
  ["InstagramSetting", "id"], ["InstagramSetting", "schoolId"], ["InstagramSetting", "autoSyncEnabled"],
  ["InstagramSetting", "instagramAccessToken"], ["InstagramSetting", "instagramBusinessAccountId"], ["InstagramSetting", "lastSyncedAt"],
  ["InstagramSetting", "updatedAt"],
  ["School", "id"], ["School", "name"], ["School", "gbpLocationId"],
  ["SyncedPost", "id"], ["SyncedPost", "schoolId"], ["SyncedPost", "instagramMediaId"],
  ["SyncedPost", "gbpPostId"], ["SyncedPost", "instagramUrl"], ["SyncedPost", "gbpPostUrl"],
  ["SyncedPost", "caption"], ["SyncedPost", "formattedText"], ["SyncedPost", "syncedAt"],
  ["SyncedPost", "createdAt"], ["SyncedPost", "updatedAt"],
])("rejects missing %s.%s, including writes after GBP posting", async (table, column) => {
  await db.exec(`ALTER TABLE "${table}" DROP COLUMN "${column}" CASCADE`);
  expect(await ready()).toBe(false);
});
it("rejects the actual legacy column shape without trying to map credentials", async () => {
  await db.exec(`ALTER TABLE "InstagramSetting" RENAME COLUMN "instagramAccessToken" TO "accessToken";
    ALTER TABLE "InstagramSetting" RENAME COLUMN "instagramBusinessAccountId" TO "businessAccountId";
    ALTER TABLE "InstagramSetting" DROP COLUMN "autoSyncEnabled", DROP COLUMN "lastSyncedAt";`);
  expect(await ready()).toBe(false);
});
it("rejects a missing table", async () => { await db.exec('DROP TABLE "SyncedPost"'); expect(await ready()).toBe(false); });
it("rejects incompatible column types", async () => {
  await db.exec('ALTER TABLE "InstagramSetting" ALTER COLUMN "autoSyncEnabled" TYPE text'); expect(await ready()).toBe(false);
});
it("rejects an incompatible implicit InstagramSetting.updatedAt write type", async () => {
  await db.exec('ALTER TABLE "InstagramSetting" ALTER COLUMN "updatedAt" TYPE text');
  expect(await ready()).toBe(false);
});
it.each([
  'REVOKE INSERT ON "SyncedPost" FROM sync_role',
  'REVOKE UPDATE ("lastSyncedAt") ON "InstagramSetting" FROM sync_role',
  'REVOKE UPDATE ("updatedAt") ON "InstagramSetting" FROM sync_role',
  'REVOKE SELECT ON "School" FROM sync_role',
])("rejects absent runtime-role privileges: %s", async sql => {
  await db.exec(sql + '; SET LOCAL ROLE sync_role'); expect(await ready()).toBe(false);
});
it("rejects active RLS when write policies cannot be established without effects", async () => {
  await db.exec('ALTER TABLE "SyncedPost" ENABLE ROW LEVEL SECURITY; SET LOCAL ROLE sync_role'); expect(await ready()).toBe(false);
});
it.each([
  '',
  'CREATE INDEX replacement ON "SyncedPost" ("schoolId", "instagramMediaId")',
  'CREATE UNIQUE INDEX replacement ON "SyncedPost" ("schoolId", "instagramMediaId") WHERE "schoolId" IS NOT NULL',
  'CREATE UNIQUE INDEX replacement ON "SyncedPost" ("schoolId", "gbpPostId")',
])("requires a nonpartial unique media identity: %s", async replacement => {
  await db.exec('DROP INDEX media_identity;' + replacement); expect(await ready()).toBe(false);
});
it("accepts an equivalent reverse-order unique index", async () => {
  await db.exec('DROP INDEX media_identity; CREATE UNIQUE INDEX replacement ON "SyncedPost" ("instagramMediaId", "schoolId")');
  expect(await ready()).toBe(true);
});
it.each(["School", "InstagramSetting", "SyncedPost"])("requires %s primary identity uniqueness", async table => {
  await db.exec(`ALTER TABLE "${table}" DROP CONSTRAINT "${table}_pkey"`); expect(await ready()).toBe(false);
});
it("rejects a new required insert column without a default before posting", async () => {
  await db.exec('ALTER TABLE "SyncedPost" ADD COLUMN unknown_required text NOT NULL'); expect(await ready()).toBe(false);
});
it("allows extra optional or defaulted insert columns", async () => {
  await db.exec(`ALTER TABLE "SyncedPost" ADD COLUMN optional text, ADD COLUMN defaulted text NOT NULL DEFAULT ''`);
  expect(await ready()).toBe(true);
});
