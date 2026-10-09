import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("applies additive ID-only SQL, preserves existing data and denies client roles", async () => {
  const pg = await PGlite.create();
  try {
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      CREATE TABLE "School" (id TEXT PRIMARY KEY, name TEXT);
      CREATE TABLE "Review" (id TEXT PRIMARY KEY, text TEXT);
      INSERT INTO "School" VALUES ('a','自塾'),('b','別校舎'); INSERT INTO "Review" VALUES ('r','既存口コミ');`);
    const sql = readFileSync("supabase/migrations/20261009091535_aio_places_ids_only.sql", "utf8");
    await pg.exec(sql);
    const columns = (await pg.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name = 'AioPlaceLink' ORDER BY ordinal_position`)).rows.map(r => r.column_name);
    expect(columns).toEqual(["schoolId", "candidateKey", "placeId", "identifiedAt"]);
    const key = "a".repeat(64), id = "00000000-0000-4000-8000-000000000000";
    await pg.query(`INSERT INTO "AioPlaceLink" ("schoolId","candidateKey","placeId") VALUES ($1,$2,$3)`, ["a", key, "ChIJ_fixture"]);
    await pg.query(`INSERT INTO "AioPlacesRequest" ("schoolId","requestId","reservedCalls") VALUES ($1,$2,3)`, ["a", id]);
    await expect(pg.query(`INSERT INTO "AioPlacesRequest" ("schoolId","requestId","reservedCalls") VALUES ($1,$2,3)`, ["a", id])).rejects.toThrow();
    await expect(pg.query(`UPDATE "AioPlacesRequest" SET "actualCalls"=4 WHERE "schoolId"='a'`)).rejects.toThrow();
    await expect(pg.query(`INSERT INTO "AioPlaceLink" ("schoolId","candidateKey","placeId") VALUES ($1,$2,$3)`, ["foreign", key, "ChIJ_fixture"])).rejects.toThrow();
    expect((await pg.query(`SELECT * FROM "AioPlaceLink" WHERE "schoolId"='b'`)).rows).toEqual([]);
    expect((await pg.query(`SELECT * FROM "Review"`)).rows).toEqual([{ id: "r", text: "既存口コミ" }]);
    expect((await pg.query(`SELECT count(*)::int AS n FROM "School"`)).rows).toEqual([{ n: 2 }]);
    expect((await pg.query(`SELECT relrowsecurity FROM pg_class WHERE relname IN ('AioPlaceLink','AioPlacesRequest')`)).rows).toEqual([{ relrowsecurity: true }, { relrowsecurity: true }]);
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`SET ROLE ${role}`);
      await expect(pg.query(`SELECT * FROM "AioPlaceLink"`)).rejects.toThrow();
      await expect(pg.query(`SELECT * FROM "AioPlacesRequest"`)).rejects.toThrow();
      await pg.exec("RESET ROLE");
    }
  } finally { await pg.close(); }
}, 30000);
