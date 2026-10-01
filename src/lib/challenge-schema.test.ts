import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { challengeDocument } from "@/test/challenge-fixtures";

describe("additive challenge migration", () => {
  it("preserves existing data, enforces isolation keys, and rejects duplicate or stale writes", async () => {
    const db = await PGlite.create();
    try {
      await db.exec(`CREATE TABLE public."School" (id TEXT PRIMARY KEY, name TEXT); INSERT INTO public."School" VALUES ('a', '校舎A'), ('b', '校舎B'); CREATE TABLE public."Review" (id TEXT, comment TEXT); INSERT INTO public."Review" VALUES ('review1', '既存口コミ');`);
      const schoolBefore = (await db.query('SELECT * FROM public."School"')).rows;
      const reviewsBefore = (await db.query('SELECT * FROM public."Review"')).rows;
      const sql = readFileSync("prisma/migrations/20261001090000_add_school_challenge/migration.sql", "utf8");
      await db.exec(sql); await db.exec(sql);
      const doc = JSON.stringify(challengeDocument());
      await db.query('INSERT INTO public."SchoolChallenge" ("schoolId", document) VALUES ($1, $2)', ["a", doc]);
      await expect(db.query('INSERT INTO public."SchoolChallenge" ("schoolId", document) VALUES ($1, $2)', ["a", doc])).rejects.toMatchObject({ code: "23505" });
      await expect(db.query('INSERT INTO public."SchoolChallenge" ("schoolId", document) VALUES ($1, $2)', ["missing", doc])).rejects.toMatchObject({ code: "23503" });
      expect((await db.query('SELECT document FROM public."SchoolChallenge" WHERE "schoolId"=$1', ["a"])).rows).toEqual([{ document: challengeDocument() }]);
      expect((await db.query('SELECT document FROM public."SchoolChallenge" WHERE "schoolId"=$1', ["b"])).rows).toEqual([]);
      const update = 'UPDATE public."SchoolChallenge" SET version=version+1 WHERE "schoolId"=$1 AND version=$2 RETURNING version';
      expect((await db.query(update, ["a", 1])).rows).toEqual([{ version: 2 }]);
      expect((await db.query(update, ["a", 1])).rows).toEqual([]);
      expect((await db.query('SELECT * FROM public."School"')).rows).toEqual(schoolBefore);
      expect((await db.query('SELECT * FROM public."Review"')).rows).toEqual(reviewsBefore);
      expect((await db.query("SELECT relrowsecurity FROM pg_class WHERE relname='SchoolChallenge'")).rows).toEqual([{ relrowsecurity: true }]);
    } finally { await db.close(); }
  }, 30000);
});
