import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("adds the missing column without inventing timestamps, preserving all historical rows", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`CREATE TABLE "School" (id TEXT PRIMARY KEY); INSERT INTO "School" VALUES ('a'); CREATE TABLE "SearchQueryLog" (id TEXT PRIMARY KEY, query TEXT, "impressionCount" INT); INSERT INTO "SearchQueryLog" VALUES ('old', '以前の検索', 42);`);
    const sql = readFileSync("prisma/migrations/20261005070000_search_keyword_sync/migration.sql", "utf8");
    await db.exec(sql); await db.exec(sql);
    expect((await db.query('SELECT * FROM "SearchQueryLog"')).rows).toEqual([{ id: "old", query: "以前の検索", impressionCount: 42, updatedAt: null }]);
    const insert = `INSERT INTO "GoogleSearchKeywordMonth" (id,"schoolId","locationId",month,status,diagnostic) VALUES ($1,$2,$3,$4,'EMPTY','{}')`;
    await db.query(insert, ["1", "a", "123", "2026-09"]);
    await expect(db.query(insert, ["2", "a", "123", "2026-09"])).rejects.toMatchObject({ code: "23505" });
    await expect(db.query(insert, ["3", "other", "123", "2026-09"])).rejects.toMatchObject({ code: "23503" });
    expect((await db.query("SELECT relrowsecurity FROM pg_class WHERE relname='GoogleSearchKeywordMonth'")).rows).toEqual([{ relrowsecurity: true }]);
  } finally { await db.close(); }
}, 30000);
