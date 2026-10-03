import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
// @ts-expect-error The one-off deployment runner is a native Node module.
import { applyGoogleResultsSchema } from "../../scripts/apply-google-results-schema.mjs";

it("applies additive migration to PostgreSQL, preserves metrics and enforces integrity", async () => {
  const db = await PGlite.create();
  try {
    await db.exec('CREATE TABLE "School" ("id" TEXT PRIMARY KEY); INSERT INTO "School" VALUES (\'a\'), (\'b\'); CREATE TABLE "GbpMetric" ("id" TEXT PRIMARY KEY, "websiteClicks" INTEGER); INSERT INTO "GbpMetric" VALUES (\'old\', 7);');
    await db.exec(readFileSync("prisma/migrations/20261003030000_add_google_leads/migration.sql", "utf8"));
    expect((await db.query('SELECT * FROM "GbpMetric"')).rows).toEqual([{ id: "old", websiteClicks: 7, performanceFetchedAt: null, performanceLocationId: null }]);
    const insert = (id: string, school: string, channel: string, key: string) => db.query('INSERT INTO "GoogleLead" ("id","schoolId","channel","idempotencyKey","updatedAt") VALUES ($1,$2,$3,$4,now())', [id, school, channel, key]);
    await insert("1", "a", "line", "retry");
    await expect(insert("2", "a", "line", "retry")).rejects.toThrow();
    await insert("3", "b", "phone", "retry");
    await expect(insert("4", "a", "bad", "new")).rejects.toThrow();
    await expect(insert("5", "unknown", "web", "new")).rejects.toThrow();
    await expect(db.exec('UPDATE "GoogleLead" SET status=\'meeting\' WHERE id=\'1\'')).rejects.toThrow();
    await db.exec('UPDATE "GoogleLead" SET status=\'meeting\', "meetingAt"=now(), version=version+1 WHERE id=\'1\' AND version=1');
    expect((await db.query('SELECT status, version FROM "GoogleLead" WHERE id=\'1\'')).rows).toEqual([{ status: "meeting", version: 2 }]);
    expect((await db.query('SELECT relrowsecurity FROM pg_class WHERE relname=\'GoogleLead\'')).rows).toEqual([{ relrowsecurity: true }]);
    await expect(db.exec('DELETE FROM "School" WHERE id=\'a\'')).rejects.toThrow();
  } finally { await db.close(); }
}, 30000);

it("runs the exact deployment transaction once, replays safely and rejects partial schemas", async () => {
  const db = await PGlite.create();
  try {
    await db.exec('CREATE TABLE "School" ("id" TEXT PRIMARY KEY); CREATE TABLE "GbpMetric" ("id" TEXT PRIMARY KEY);');
    const client = { $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      await db.exec("BEGIN");
      try {
        const result = await callback({
          $queryRawUnsafe: async (sql: string) => (await db.query(sql)).rows,
          $executeRawUnsafe: async (sql: string) => { await db.exec(sql); return 0; },
        });
        await db.exec("COMMIT"); return result;
      } catch (error) { await db.exec("ROLLBACK"); throw error; }
    } };
    expect(await applyGoogleResultsSchema(client)).toBe("applied");
    expect(await applyGoogleResultsSchema(client)).toBe("already-present");
    await db.exec('ALTER TABLE "GoogleLead" DROP COLUMN grade');
    await expect(applyGoogleResultsSchema(client)).rejects.toThrow("Partial schema");
    await db.exec('DROP TABLE "GoogleLead"; DROP TABLE "School"');
    await expect(applyGoogleResultsSchema(client)).rejects.toThrow("Required base");
  } finally { await db.close(); }
}, 30000);
