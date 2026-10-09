import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET, POST, PATCH, DELETE } from "@/app/api/dashboard/google-results/route";
import { resolveRequestAccess } from "./supabase-access";

const transport = vi.hoisted(() => ({ school: { findUnique: vi.fn() }, googleLead: { findMany: vi.fn(), upsert: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() } }));
vi.mock("./prisma", () => ({ prisma: transport }));
vi.mock("./supabase-access", () => ({ resolveRequestAccess: vi.fn() }));
let db: PGlite;
type Fields = Record<string, unknown>;
// Test-only Prisma transport. Compile supplied predicates rather than injecting
// school/deleted/version filters: an omitted production filter must remain omitted.
const column = (key: string) => {
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) throw new Error(`Unsupported column: ${key}`);
  return `"${key}"`;
};
function predicate(where: Fields, values: unknown[]): string {
  return Object.entries(where).map(([key, value]) => {
    if (key === "OR") return `(${(value as Fields[]).map(item => predicate(item, values)).join(" OR ")})`;
    if (value === null) return `${column(key)} IS NULL`;
    if (typeof value === "object" && !(value instanceof Date)) {
      return Object.entries(value as Fields).map(([operator, operand]) => {
        const sql = { gte: ">=", lt: "<" }[operator];
        if (!sql) throw new Error(`Unsupported operator: ${operator}`);
        values.push(operand); return `${column(key)} ${sql} $${values.length}`;
      }).join(" AND ");
    }
    values.push(value); return `${column(key)} = $${values.length}`;
  }).join(" AND ");
}
async function select(table: string, args: { where: Fields; select?: Fields; orderBy?: Fields[]; take?: number }) {
  const values: unknown[] = [];
  const fields = args.select ? Object.keys(args.select).filter(key => args.select?.[key]).map(column).join(",") : "*";
  const where = predicate(args.where, values);
  const order = args.orderBy?.map(item => Object.entries(item).map(([key, direction]) => {
    if (direction !== "desc" && direction !== "asc") throw new Error("Unsupported order");
    return `${column(key)} ${direction}`;
  }).join(",")).join(",");
  const limit = args.take === undefined ? "" : (values.push(args.take), ` LIMIT $${values.length}`);
  return (await db.query(`SELECT ${fields} FROM ${column(table)} WHERE ${where}${order ? ` ORDER BY ${order}` : ""}${limit}`, values)).rows;
}
const identity = (schoolId: string) => ({ isAuthenticated: true, access: { userId: `user-${schoolId}`, role: "manager" as const, schoolIds: [schoolId], schoolId, status: "active" as const, name: "担当", email: "", source: "profiles" as const } });
const request = (body?: unknown, school = "a", period = "month") => new Request(`https://example.test/api/dashboard/google-results?schoolId=${school}&period=${period}`, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
const clock = (iso: string) => vi.setSystemTime(new Date(iso));
const read = async (school = "a", period = "month") => {
  const response = await GET(request(undefined, school, period));
  expect(response.status).toBe(200);
  return response.json();
};
const create = async (key = "retry", school = "a") => {
  const response = await POST(request({ channel: "line", idempotencyKey: key }, school));
  expect(response.status).toBe(200);
  return (await response.json()).lead;
};

beforeEach(async () => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  // Prisma stores timestamp-without-time-zone values as UTC; PGlite's default
  // parser instead uses the host timezone. Match the production boundary.
  db = await PGlite.create({ parsers: { 1114: value => new Date(`${value}Z`) } });
  await db.exec('CREATE TABLE "School" (id TEXT PRIMARY KEY, name TEXT); INSERT INTO "School" VALUES (\'a\',\'校舎A\'),(\'b\',\'校舎B\'); CREATE TABLE "GbpMetric" (id TEXT PRIMARY KEY);');
  await db.exec(readFileSync("prisma/migrations/20261003030000_add_google_leads/migration.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261009104049_google_lead_lifecycle.sql", "utf8"));
  vi.mocked(resolveRequestAccess).mockResolvedValue(identity("a"));
  transport.school.findUnique.mockImplementation(async args => (await select("School", args as never))[0] as never ?? null);
  transport.googleLead.findMany.mockImplementation(async args => await select("GoogleLead", args as never) as never);
  transport.googleLead.findFirst.mockImplementation(async args => (await select("GoogleLead", args as never))[0] as never ?? null);
  transport.googleLead.upsert.mockImplementation(async args => {
    expect(args.update).toEqual({});
    const data = { id: randomUUID(), ...args.create, updatedAt: new Date() };
    const entries = Object.entries(data);
    await db.query(`INSERT INTO "GoogleLead" (${entries.map(([key]) => column(key)).join(",")}) VALUES (${entries.map((_, i) => `$${i + 1}`).join(",")}) ON CONFLICT ("schoolId","idempotencyKey") DO NOTHING`, entries.map(([, value]) => value));
    return (await select("GoogleLead", { where: args.where.schoolId_idempotencyKey as unknown as Fields }))[0] as never;
  });
  transport.googleLead.updateMany.mockImplementation(async args => {
    const values: unknown[] = [];
    const assignments = Object.entries({ ...args.data, updatedAt: new Date() }).map(([key, value]) => {
      if (value && typeof value === "object" && "increment" in value) {
        values.push(value.increment); return `${column(key)} = ${column(key)} + $${values.length}`;
      }
      values.push(value); return `${column(key)} = $${values.length}`;
    });
    const where = predicate(args.where as Fields, values);
    const result = await db.query(`UPDATE "GoogleLead" SET ${assignments.join(",")} WHERE ${where} RETURNING id`, values);
    return { count: result.rows.length };
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  clock("2026-10-09T01:00:00Z");
}, 30000);
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await db?.close(); });

it("persists inquiry and meeting through real handlers, SQL and fresh aggregate reads", async () => {
  const lead = await create();
  expect(lead.occurredAt).toBe("2026-10-09T01:00:00.000Z");
  clock("2026-10-09T02:00:00Z");
  expect(await read()).toMatchObject({ inquiriesCount: 1, meetingsCount: 0, meetingRate: 0 });
  expect((await PATCH(request({ id: lead.id, version: 1, status: "meeting" }))).status).toBe(200);
  clock("2026-10-09T03:00:00Z");
  for (let i = 0; i < 2; i++) expect(await read()).toMatchObject({ inquiriesCount: 1, meetingsCount: 1, convertedCount: 1, meetingRate: 100, recent: [{ id: lead.id, version: 2, status: "meeting" }] });
  expect((await db.query('SELECT "schoolId", source, status, version FROM "GoogleLead"')).rows).toEqual([{ schoolId: "a", source: "google", status: "meeting", version: 2 }]);
});

it("deduplicates concurrent submissions and rejects key reuse with different content or deletion", async () => {
  const leads = await Promise.all([create(), create()]);
  expect(leads[0].id).toBe(leads[1].id);
  expect((await POST(request({ channel: "phone", idempotencyKey: "retry" }))).status).toBe(409);
  clock("2026-10-09T02:00:00Z");
  expect(await read()).toMatchObject({ inquiriesCount: 1, meetingsCount: 0 });
  expect((await DELETE(request({ id: leads[0].id, version: 1 }))).status).toBe(200);
  expect((await POST(request({ channel: "line", idempotencyKey: "retry" }))).status).toBe(409);
  expect(await read()).toMatchObject({ inquiriesCount: 0, meetingsCount: 0, meetingRate: null, recent: [] });
  expect((await db.query('SELECT version, "deletedAt" IS NOT NULL AS deleted FROM "GoogleLead"')).rows).toEqual([{ version: 2, deleted: true }]);
});

it("isolates reads, guessed IDs, body school/source spoofing and same keys across schools", async () => {
  const a = await create();
  for (const handler of [GET, POST, PATCH, DELETE]) expect((await handler(request({ id: a.id, version: 1, status: "meeting", channel: "line", idempotencyKey: "retry" }, "b"))).status).toBe(403);
  vi.mocked(resolveRequestAccess).mockResolvedValue(identity("b"));
  const b = await create("retry", "b");
  expect(b.id).not.toBe(a.id);
  for (const handler of [PATCH, DELETE]) expect((await handler(request({ id: a.id, version: 1, status: "meeting" }, "b"))).status).toBe(404);
  expect((await POST(request({ schoolId: "a", source: "other", channel: "web", idempotencyKey: "spoof" }, "b"))).status).toBe(200);
  clock("2026-10-09T02:00:00Z");
  expect(await read("b")).toMatchObject({ inquiriesCount: 2, meetingsCount: 0 });
  vi.mocked(resolveRequestAccess).mockResolvedValue(identity("a"));
  expect(await read()).toMatchObject({ inquiriesCount: 1, recent: [{ id: a.id, version: 1 }] });
  expect((await db.query('SELECT DISTINCT source FROM "GoogleLead"')).rows).toEqual([{ source: "google" }]);
});

it("allows only one concurrent version update and retains one meeting after a stale retry", async () => {
  const lead = await create();
  clock("2026-10-09T02:00:00Z");
  const original = transport.googleLead.findFirst.getMockImplementation()!;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  transport.googleLead.findFirst.mockImplementation(async args => {
    const row = await original(args);
    if (++reads === 2) release();
    await barrier;
    return row;
  });
  const responses = await Promise.all([PATCH(request({ id: lead.id, version: 1, status: "meeting" })), PATCH(request({ id: lead.id, version: 1, status: "meeting" }))]);
  expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
  clock("2026-10-09T03:00:00Z");
  expect(await read()).toMatchObject({ inquiriesCount: 1, meetingsCount: 1, recent: [{ version: 2 }] });
  expect((await PATCH(request({ id: lead.id, version: 1, status: "meeting" }))).status).toBe(409);
});

it("recovers from failed reads and ambiguous committed writes without duplicate counts", async () => {
  const original = transport.googleLead.upsert.getMockImplementation()!;
  transport.googleLead.upsert.mockImplementationOnce(async args => { await original(args); throw new Error("transport lost after commit"); });
  expect((await POST(request({ channel: "line", idempotencyKey: "retry" }))).status).toBe(503);
  const lead = await create();
  clock("2026-10-09T02:00:00Z");
  transport.googleLead.findMany.mockRejectedValueOnce(new Error("read unavailable"));
  const unavailable = await GET(request());
  expect(unavailable.status).toBe(503);
  expect(await unavailable.json()).not.toHaveProperty("inquiriesCount");
  expect(await read()).toMatchObject({ inquiriesCount: 1, meetingsCount: 0 });
  // A real SQL constraint failure rejects the entire update before any version change.
  await db.exec('ALTER TABLE "GoogleLead" ADD CONSTRAINT test_reject_meeting CHECK (status <> \'meeting\')');
  expect((await PATCH(request({ id: lead.id, version: 1, status: "meeting" }))).status).toBe(503);
  expect(await read()).toMatchObject({ inquiriesCount: 1, meetingsCount: 0, recent: [{ version: 1, status: "inquiry" }] });
});

it("separates JST inquiry cohorts from current meeting dates and removes lost status from meetings", async () => {
  clock("2026-09-30T14:59:59Z");
  const previous = await create("previous");
  clock("2026-09-30T15:00:00Z");
  await create("current");
  clock("2026-10-09T02:00:00Z");
  expect((await PATCH(request({ id: previous.id, version: 1, status: "meeting" }))).status).toBe(200);
  clock("2026-10-09T03:00:00Z");
  expect(await read()).toMatchObject({ inquiriesCount: 1, meetingsCount: 1, convertedCount: 0, meetingRate: 0 });
  expect(await read("a", "previous")).toMatchObject({ inquiriesCount: 1, meetingsCount: 0, convertedCount: 1, meetingRate: 100 });
  expect(await read("a", "six")).toMatchObject({ inquiriesCount: 2, meetingsCount: 1, meetingRate: 50 });
  expect((await PATCH(request({ id: previous.id, version: 2, status: "lost" }))).status).toBe(200);
  expect(await read()).toMatchObject({ meetingsCount: 0 });
  expect((await db.query('SELECT status, "meetingAt", "closedAt" IS NOT NULL AS closed FROM "GoogleLead" WHERE id=$1', [previous.id])).rows).toEqual([{ status: "lost", meetingAt: null, closed: true }]);
});

it("includes meetings from inquiries older than the six-month trend without inventing a cohort rate", async () => {
  clock("2025-12-01T01:00:00Z");
  const old = await create("old");
  clock("2026-10-09T02:00:00Z");
  expect((await PATCH(request({ id: old.id, version: 1, status: "meeting" }))).status).toBe(200);
  clock("2026-10-09T03:00:00Z");
  expect(await read()).toMatchObject({ inquiriesCount: 0, meetingsCount: 1, meetingRate: null, recent: [] });
  expect(await read("a", "six")).toMatchObject({ inquiriesCount: 0, meetingsCount: 1, meetingRate: null });
});

it("persists the full explicit lifecycle and leaves old meeting rows unknown until confirmed", async () => {
  const lead = await create("lifecycle");
  expect((await PATCH(request({ id: lead.id, version: 1, stage: "enrolled" }))).status).toBe(400);
  for (const [i, stage] of ["scheduled", "held", "enrolled"].entries()) {
    clock(`2026-10-09T0${i + 2}:00:00Z`);
    expect((await PATCH(request({ id: lead.id, version: i + 1, stage }))).status).toBe(200);
    expect((await PATCH(request({ id: lead.id, version: i + 1, stage }))).status).toBe(409);
  }
  clock("2026-10-09T06:00:00Z");
  for (let i = 0; i < 2; i++) expect(await read()).toMatchObject({ lifecycle: { scheduledCount: 1, heldCount: 1, enrolledCount: 1, heldRate: 100, enrollmentRate: 100, legacyMeetingCount: 0 }, recent: [{ id: lead.id, version: 4 }] });
  expect((await PATCH(request({ id: lead.id, version: 4, stage: "held" }, "b"))).status).toBe(403);
  const legacy = await create("legacy");
  expect((await PATCH(request({ id: legacy.id, version: 1, status: "meeting" }))).status).toBe(200);
  clock("2026-10-09T07:00:00Z");
  expect(await read()).toMatchObject({ lifecycle: { legacyMeetingCount: 1, heldCount: 1, enrolledCount: 1 } });
  expect((await PATCH(request({ id: legacy.id, version: 2, stage: "held" }))).status).toBe(200);
  clock("2026-10-09T08:00:00Z");
  expect(await read()).toMatchObject({ lifecycle: { legacyMeetingCount: 0, heldCount: 2, enrolledCount: 1 } });
  expect((await PATCH(request({ id: legacy.id, version: 3, stage: "lost" }))).status).toBe(200);
  expect(await read()).toMatchObject({ lifecycle: { heldCount: 2 } });
  expect((await PATCH(request({ id: legacy.id, version: 4, stage: "inquiry" }))).status).toBe(200);
  expect(await read()).toMatchObject({ lifecycle: { heldCount: 1 } });
});

it("rejects mixed stage/legacy commands and inquiry dates after confirmed milestones", async () => {
  const lead = await create();
  clock("2026-10-09T02:00:00Z");
  expect((await PATCH(request({ id: lead.id, version: 1, stage: "scheduled", status: "meeting" }))).status).toBe(400);
  expect((await PATCH(request({ id: lead.id, version: 1, stage: "scheduled", grade: "high_school" }))).status).toBe(200);
  clock("2026-10-09T04:00:00Z");
  expect((await PATCH(request({ id: lead.id, version: 2, occurredAt: "2026-10-09T03:00:00Z" }))).status).toBe(400);
  expect((await PATCH(request({ id: lead.id, version: 2, stage: "inquiry" }))).status).toBe(200);
  expect(await read()).toMatchObject({ lifecycle: { scheduledCount: 0, heldCount: 0 }, recent: [{ version: 3, meetingScheduledAt: null }] });
});
