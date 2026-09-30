import { PGlite } from "@electric-sql/pglite";
import { ReviewStatus } from "@prisma/client";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const alignment = readFileSync("prisma/review-status-alignment.sql", "utf8");
const statuses = Object.values(ReviewStatus);
let db: PGlite;
const list = 'SELECT id, status::text AS status FROM public."Review" WHERE status NOT IN ($1::public."ReviewStatus", $2::public."ReviewStatus", $3::public."ReviewStatus") ORDER BY id';
const excluded = ["DRAFT", "GENERATED", "ARCHIVED"];

beforeAll(async () => { db = await PGlite.create(); }, 30000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await db.exec(`CREATE TYPE public."ReviewStatus" AS ENUM (${statuses.map(s => `'${s}'`).join(",")});`);
});

describe("Review.status production schema alignment", () => {
  it.each(["text", "varchar(40)"])("reproduces 42883 for %s and repairs real SQL comparisons without altering reviews", async type => {
    await db.exec(`CREATE TABLE public."Review" (id text PRIMARY KEY, status ${type} NOT NULL DEFAULT 'PENDING', comment text, "replyText" text);
      CREATE INDEX review_status_idx ON public."Review" (status);`);
    for (const status of statuses) {
      await db.query('INSERT INTO public."Review" VALUES ($1,$2,$3,$4)', [status, status, `${status} 本文`, `${status} 返信`]);
    }
    const before = (await db.query('SELECT * FROM public."Review" ORDER BY id')).rows;
    await expect(db.query(list, excluded)).rejects.toMatchObject({ code: "42883" });
    await db.exec(alignment);
    expect((await db.query('SELECT * FROM public."Review" ORDER BY id')).rows).toEqual(before);
    expect((await db.query<{ id: string }>(list, excluded)).rows.map(r => r.id)).toEqual(statuses.filter(s => !excluded.includes(s)).sort());
    await db.query('UPDATE public."Review" SET status=$1::public."ReviewStatus" WHERE id=$2', ["REPLIED", "PENDING"]);
    expect((await db.query('SELECT status FROM public."Review" WHERE id=$1', ["PENDING"])).rows).toEqual([{ status: "REPLIED" }]);
    await db.exec(alignment);
    await db.query('INSERT INTO public."Review" (id) VALUES ($1)', ["new"]);
    expect((await db.query('SELECT status FROM public."Review" WHERE id=$1', ["new"])).rows).toEqual([{ status: "DRAFT" }]);
    expect((await db.query("SELECT udt_name, is_nullable FROM information_schema.columns WHERE table_name='Review' AND column_name='status'")).rows)
      .toEqual([{ udt_name: "ReviewStatus", is_nullable: "NO" }]);
  });

  it("is repeatable on an already aligned enum column", async () => {
    await db.exec('CREATE TABLE public."Review" (id text, status public."ReviewStatus" NOT NULL DEFAULT \'DRAFT\');');
    await db.query('INSERT INTO public."Review" VALUES ($1,$2)', ["existing", "APPROVED"]);
    await db.exec(alignment);
    await db.exec(alignment);
    expect((await db.query(list, excluded)).rows).toEqual([{ id: "existing", status: "APPROVED" }]);
  });

  it("creates the schema enum for an empty legacy table", async () => {
    await db.exec('DROP TYPE public."ReviewStatus"; CREATE TABLE public."Review" (id text, status text);');
    await db.exec(alignment);
    expect((await db.query(list, excluded)).rows).toEqual([]);
    expect((await db.query<{ value: string }>('SELECT unnest(enum_range(NULL::public."ReviewStatus"))::text AS value')).rows.map(r => r.value)).toEqual(statuses);
  });

  it.each([null, "UNKNOWN", "replied", ""])("aborts atomically for unsupported value %j rather than assigning a made-up state", async status => {
    await db.exec('CREATE TABLE public."Review" (id text, status text DEFAULT \'PENDING\');');
    await db.query('INSERT INTO public."Review" VALUES ($1,$2),($3,$4)', ["valid", "PENDING", "invalid", status]);
    const before = (await db.query('SELECT * FROM public."Review" ORDER BY id')).rows;
    await expect(db.exec(alignment)).rejects.toThrow("null or unsupported values");
    expect((await db.query('SELECT * FROM public."Review" ORDER BY id')).rows).toEqual(before);
    expect((await db.query("SELECT udt_name FROM information_schema.columns WHERE table_name='Review' AND column_name='status'")).rows).toEqual([{ udt_name: "text" }]);
  });

  it("does not proceed when the database enum and generated Prisma enum differ", async () => {
    await db.exec('DROP TYPE public."ReviewStatus"; CREATE TYPE public."ReviewStatus" AS ENUM (\'PENDING\'); CREATE TABLE public."Review" (status text);');
    await expect(db.exec(alignment)).rejects.toThrow("enum differs from the Prisma schema");
  });

  it.each(["integer", "missing"])("rejects unexpected status column definition: %s", async type => {
    await db.exec(`CREATE TABLE public."Review" (${type === "missing" ? "id text" : "status integer"});`);
    await expect(db.exec(alignment)).rejects.toThrow("Unexpected Review.status type");
  });
});
