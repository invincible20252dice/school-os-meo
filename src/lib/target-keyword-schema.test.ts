import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const migration = readFileSync("prisma/migrations/20261002060000_add_target_keyword_location/migration.sql", "utf8");
let db: PGlite;
beforeAll(async () => { db = await PGlite.create(); }, 30000);
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); });

describe("TargetKeyword location additive alignment", () => {
  it("reproduces the missing column, preserves records and repairs reads idempotently", async () => {
    await db.exec('CREATE TABLE public."TargetKeyword" (id text PRIMARY KEY, "schoolId" text NOT NULL, keyword text NOT NULL);');
    await db.query('INSERT INTO public."TargetKeyword" VALUES ($1,$2,$3),($4,$5,$6)', ["k1", "s1", "大学受験", "k2", "s2", "個別指導"]);
    const before = (await db.query('SELECT * FROM public."TargetKeyword" ORDER BY id')).rows;
    await expect(db.query('SELECT location FROM public."TargetKeyword"')).rejects.toMatchObject({ code: "42703" });
    await db.exec(migration);
    await db.exec(migration);
    expect((await db.query('SELECT id, "schoolId", keyword FROM public."TargetKeyword" ORDER BY id')).rows).toEqual(before);
    expect((await db.query('SELECT location FROM public."TargetKeyword"')).rows).toEqual([{ location: "" }, { location: "" }]);
    await db.query('UPDATE public."TargetKeyword" SET location=$1 WHERE id=$2', ["実際の計測地点", "k1"]);
    await db.exec(migration);
    expect((await db.query('SELECT location FROM public."TargetKeyword" WHERE id=$1', ["k1"])).rows).toEqual([{ location: "実際の計測地点" }]);
    expect((await db.query("SELECT data_type, is_nullable FROM information_schema.columns WHERE table_name='TargetKeyword' AND column_name='location'")).rows).toEqual([{ data_type: "text", is_nullable: "NO" }]);
  });

  it("never replaces an existing location or unrelated columns", async () => {
    await db.exec('CREATE TABLE public."TargetKeyword" (id text, location text NOT NULL, "currentRank" integer);');
    await db.query('INSERT INTO public."TargetKeyword" VALUES ($1,$2,$3)', ["existing", "保存済み地点", 4]);
    await db.exec(migration);
    expect((await db.query('SELECT * FROM public."TargetKeyword"')).rows).toEqual([{ id: "existing", location: "保存済み地点", currentRank: 4 }]);
  });

  it("fails closed for a missing table instead of inventing records", async () => {
    await expect(db.exec(migration)).rejects.toMatchObject({ code: "42P01" });
  });
});
