import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadAioMeasurements, runAioMeasurement } from "./aio-measurement";

let pg: PGlite;
type Args = { where: Record<string, any>; data: Record<string, any>; select?: unknown; orderBy?: unknown };
// Test-only Prisma boundary adapter: production domain writes execute as real PostgreSQL.
// PGlite is single-process; distributed reservation locking is covered separately.
const rows = async (sql: string, args: unknown[] = []) => (await pg.query<Record<string, any>>(sql, args)).rows;
const first = async (sql: string, args: unknown[] = []) => (await rows(sql, args))[0] || null;
let adapter: PrismaClient;
beforeEach(async () => {
  vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    model: "gpt-4.1-mini", status: "completed", output: [
      { type: "web_search_call", status: "completed" },
      { type: "message", content: [{ type: "output_text", text: "他の塾をおすすめします。", annotations: [{ type: "url_citation", url: "https://example.org", title: "出典" }] }] },
    ],
  }))));
  pg = await PGlite.create();
  await pg.exec(`CREATE TABLE "School" (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE "TargetKeyword" (id TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, keyword TEXT, municipality TEXT, "nearestStation" TEXT, "isActive" BOOLEAN DEFAULT true, "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO "School" VALUES ('a','検証A塾'), ('b','検証B塾');
    INSERT INTO "TargetKeyword" (id,"schoolId",keyword,municipality,"nearestStation") VALUES ('ka','a','塾','市','駅'), ('kb','b','塾','市','駅');
    CREATE TABLE "AioScoreHistory" (id TEXT PRIMARY KEY, "schoolId" TEXT, "totalScore" INTEGER);
    INSERT INTO "AioScoreHistory" VALUES ('legacy','a',99);`);
  await pg.exec(readFileSync("supabase/migrations/20261008120000_aio_live_pilot.sql", "utf8"));
  const measurements = {
    findFirst: ({ where }: Args) => first('SELECT * FROM "AioMeasurement" WHERE "schoolId"=$1 AND provider=$2 AND source=$3 AND status <> $4 ORDER BY "createdAt", id LIMIT 1', [where.schoolId, where.provider, where.source, where.status.not]),
    findUnique: ({ where }: Args) => first('SELECT * FROM "AioMeasurement" WHERE "schoolId"=$1 AND "requestId"=$2', [where.schoolId_requestId.schoolId, where.schoolId_requestId.requestId]),
    findMany: ({ where }: Args) => rows('SELECT * FROM "AioMeasurement" WHERE "schoolId"=$1 AND provider=$2 AND source=$3 AND "createdAt">=$4', [where.schoolId, where.provider, where.source, where.createdAt.gte]),
    create: async ({ data }: Args) => {
      const value = { id: randomUUID(), ...data };
      return first(`INSERT INTO "AioMeasurement" (${Object.keys(value).map(k => '"' + k + '"').join(",")}) VALUES (${Object.keys(value).map((_, i) => "$" + (i + 1)).join(",")}) RETURNING *`, Object.values(value));
    },
    update: ({ where, data }: Args) => {
      const values = Object.entries(data).map(([key, value]) => key === "citations" ? JSON.stringify(value) : value);
      return first(`UPDATE "AioMeasurement" SET ${Object.keys(data).map((key, i) => '"' + key + '"=$' + (i + 1)).join(",")} WHERE id=$${values.length + 1} RETURNING *`, [...values, where.id]);
    },
    updateMany: ({ where }: Args) => pg.query('UPDATE "AioMeasurement" SET status=\'FAILED\', "errorCode"=\'INTERRUPTED\' WHERE "schoolId"=$1 AND status=\'RUNNING\' AND "createdAt"<$2', [where.schoolId, where.createdAt.lt]),
  };
  const db = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: (callback: (tx: unknown) => Promise<unknown>) => callback(db),
    aioMeasurement: measurements,
    targetKeyword: {
      findFirst: async ({ where }: Args) => {
        const keyword = await first('SELECT * FROM "TargetKeyword" WHERE id=$1 AND "schoolId"=$2 AND "isActive"=true', [where.id, where.schoolId]);
        return keyword ? { ...keyword, school: await first('SELECT name FROM "School" WHERE id=$1', [where.schoolId]) } : null;
      },
      findMany: async ({ where }: Args) => {
        const keywords = await rows('SELECT * FROM "TargetKeyword" WHERE "schoolId"=$1 AND "isActive"=true', [where.schoolId]);
        for (const keyword of keywords) keyword.aioMeasurements = await rows('SELECT * FROM "AioMeasurement" WHERE "keywordId"=$1 AND provider=$2 AND source=$3 ORDER BY "createdAt" DESC, id DESC LIMIT 1', [keyword.id, "openai-web-search", "openai-search-v1"]);
        return keywords;
      },
    },
  };
  adapter = db as unknown as PrismaClient;
}, 30000);
afterEach(async () => { await pg.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("runs the provider adapter, saves genuine zero and rereads it without touching another school or legacy samples", async () => {
  const id = randomUUID();
  expect((await loadAioMeasurements(adapter, "a")).keywords[0].latest).toBeNull();
  const result = await runAioMeasurement(adapter, "a", "ka", id);
  expect(result).toMatchObject({ status: "SUCCESS", recommended: false, brandDetected: false, score: 0 });
  const reload = await loadAioMeasurements(adapter, "a");
  expect(reload.keywords[0].latest).toMatchObject({ id: result.id, status: "SUCCESS", response: "他の塾をおすすめします。", score: 0 });
  expect((await loadAioMeasurements(adapter, "b")).keywords[0].latest).toBeNull();
  expect(await rows('SELECT * FROM "AioScoreHistory"')).toEqual([{ id: "legacy", schoolId: "a", totalScore: 99 }]);
  expect((await runAioMeasurement(adapter, "a", "ka", id)).id).toBe(result.id);
  expect(fetch).toHaveBeenCalledTimes(1);
  await expect(runAioMeasurement(adapter, "a", "kb", randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("persists quota failure with NULL metrics, not successful zero", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: { code: "insufficient_quota", message: "redacted" } }), { status: 429 }));
  await runAioMeasurement(adapter, "a", "ka", randomUUID());
  expect((await loadAioMeasurements(adapter, "a")).keywords[0].latest).toMatchObject({ status: "FAILED", errorCode: "QUOTA", score: null, recommended: null, measuredAt: null });
});
it("leaves older interrupted records byte-for-byte unchanged", async () => {
  await pg.exec(`INSERT INTO "AioMeasurement" (id,"schoolId","keywordId","requestId",provider,source,model,status,query,"schoolName","createdAt")
    VALUES ('older','a','ka','older-request','openai-web-search','openai-search-v1','test','RUNNING','old query','old school',CURRENT_TIMESTAMP - INTERVAL '10 minutes');`);
  const before = await rows('SELECT * FROM "AioMeasurement" WHERE id=\'older\'');
  await runAioMeasurement(adapter, "a", "ka", randomUUID());
  expect(await rows('SELECT * FROM "AioMeasurement" WHERE id=\'older\'')).toEqual(before);
  expect(await rows('SELECT count(*)::int AS count FROM "AioMeasurement"')).toEqual([{ count: 2 }]);
});
it("persists missing settings without sending requests", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const result = await runAioMeasurement(adapter, "a", "ka", randomUUID());
  expect(result).toMatchObject({ status: "CONFIG_REQUIRED", score: null, errorCode: "NOT_CONFIGURED" });
  expect(fetch).not.toHaveBeenCalled();
});
it("database constraints independently reject cross-school and false-zero records", async () => {
  expect(await rows("SELECT relrowsecurity FROM pg_class WHERE relname='AioMeasurement'")).toEqual([{ relrowsecurity: true }]);
  const insert = (keyword: string, status: string, score: number | null) => pg.query('INSERT INTO "AioMeasurement" (id,"schoolId","keywordId","requestId",provider,source,model,status,query,"schoolName",score) VALUES ($1,\'a\',$2,$3,\'openai-web-search\',\'openai-search-v1\',\'test\',$4,\'query\',\'school\',$5)', [randomUUID(), keyword, randomUUID(), status, score]);
  await expect(insert("kb", "FAILED", null)).rejects.toThrow();
  await expect(insert("ka", "FAILED", 0)).rejects.toThrow();
  await expect(insert("ka", "SUCCESS", 0)).rejects.toThrow();
  await expect(insert("ka", "unknown", null)).rejects.toThrow();
});
it("keeps the reviewed Supabase SQL in sync without altering existing columns or legacy rows", async () => {
  const sql = readFileSync("supabase/migrations/20261008120000_aio_live_pilot.sql", "utf8");
  expect(sql).toContain(readFileSync("prisma/migrations/20261008120000_add_aio_measurement/migration.sql", "utf8").trim());
  expect(sql).toContain("SET LOCAL lock_timeout = '3s'");
  expect(await rows('SELECT count(*)::int AS count FROM "School"')).toEqual([{ count: 2 }]);
  expect(await rows('SELECT count(*)::int AS count FROM "TargetKeyword"')).toEqual([{ count: 2 }]);
  expect(await rows('SELECT * FROM "AioScoreHistory"')).toEqual([{ id: "legacy", schoolId: "a", totalScore: 99 }]);
});
