import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
it("applies additively and idempotently with school foreign key and duplicate protection", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "School" (id TEXT PRIMARY KEY); INSERT INTO "School" VALUES ('s1');`);
    const sql = readFileSync("prisma/migrations/20261007020000_add_target_district/migration.sql", "utf8");
    await db.exec(sql); await db.exec(sql);
    await db.exec(`INSERT INTO "TargetDistrict" (id,"schoolId",name,"updatedAt") VALUES ('d1','s1','帯山中',NOW());`);
    await expect(db.exec(`INSERT INTO "TargetDistrict" (id,"schoolId",name,"updatedAt") VALUES ('d2','s1','帯山中',NOW());`)).rejects.toThrow();
    await expect(db.exec(`INSERT INTO "TargetDistrict" (id,"schoolId",name,"updatedAt") VALUES ('d3','other','校区',NOW());`)).rejects.toThrow();
    expect((await db.query('SELECT * FROM "School"')).rows).toHaveLength(1);
    expect((await db.query('SELECT * FROM "TargetDistrict"')).rows).toHaveLength(1);
  } finally { await db.close(); }
});
