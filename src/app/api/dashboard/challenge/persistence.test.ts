import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GET, POST } from "./route";
import { prisma } from "@/lib/prisma";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { loadChallengeData } from "@/lib/challenge-data";
import { challengeDocument, completeCommand, snapshot } from "@/test/challenge-fixtures";
import { dayProgress } from "@/lib/challenge-progress";

vi.mock("@/lib/prisma", () => ({ prisma: { school: { findUnique: vi.fn() }, schoolChallenge: { findUnique: vi.fn(), updateMany: vi.fn() } } }));
vi.mock("@/lib/supabase-access", () => ({ resolveRequestAccess: vi.fn() }));
vi.mock("@/lib/challenge-data", () => ({ loadChallengeData: vi.fn() }));
let db: PGlite;
const request = (body?: unknown, schoolId = "a") => new Request(`https://example.com/api/dashboard/challenge?schoolId=${schoolId}`, body ? { method: "POST", body: JSON.stringify(body) } : {});

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`CREATE TABLE public."School" (id TEXT PRIMARY KEY, name TEXT); INSERT INTO public."School" VALUES ('a', '校舎A'), ('b', '校舎B');`);
  await db.exec(readFileSync("prisma/migrations/20261001090000_add_school_challenge/migration.sql", "utf8"));
}, 30000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  vi.resetAllMocks();
  await db.exec('DELETE FROM public."SchoolChallenge"');
  for (const schoolId of ["a", "b"]) await db.query('INSERT INTO public."SchoolChallenge" ("schoolId", document) VALUES ($1, $2)', [schoolId, JSON.stringify(challengeDocument())]);
  vi.mocked(resolveRequestAccess).mockResolvedValue({ isAuthenticated: true, access: { userId: "u", role: "manager", schoolIds: ["a"], schoolId: "a", status: "active", name: "担当", email: "", source: "profiles" } });
  vi.mocked(loadChallengeData).mockResolvedValue({ snapshot: snapshot(), surveys: [] });
  (prisma.school.findUnique as unknown as Mock).mockImplementation(async (args: { where: { id: string } }) => (await db.query('SELECT * FROM public."School" WHERE id=$1', [args.where.id])).rows[0]);
  (prisma.schoolChallenge.findUnique as unknown as Mock).mockImplementation(async (args: { where: { schoolId: string } }) => (await db.query('SELECT * FROM public."SchoolChallenge" WHERE "schoolId"=$1', [args.where.schoolId])).rows[0]);
  // Run the same school/version predicate and JSON write used by Prisma against PostgreSQL.
  (prisma.schoolChallenge.updateMany as unknown as Mock).mockImplementation(async (args: { data: { document: unknown }; where: { schoolId: string; version: number } }) => {
    const result = await db.query('UPDATE public."SchoolChallenge" SET document=$1, version=version+1, "updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$2 AND version=$3 RETURNING version', [JSON.stringify(args!.data.document), args!.where!.schoolId, args!.where!.version]);
    return { count: result.rows.length };
  });
});

describe("DAY1 API to PostgreSQL persistence", () => {
  it("persists a grounded plan and reconciles execution history without touching another tenant", async () => {
    expect((await POST(request({ action: "next-action", key: "check-1-website", status: "IN_PROGRESS", note: "", version: 1 }))).status).toBe(200);
    const active = await (await GET(request())).json();
    expect(active.document.nextActionHistory[0]).toMatchObject({ status: "IN_PROGRESS", key: "check-1-website" });
    expect((await POST(request({ ...completeCommand(1), version: active.version }))).status).toBe(200);
    const completed = await (await GET(request())).json();
    expect(completed.document.nextActionHistory[0]).toMatchObject({ status: "COMPLETED", completedAt: snapshot().at });
    expect((await POST(request({ action: "adopt-request-target", version: completed.version }))).status).toBe(200);
    const adopted = await (await GET(request())).json();
    expect(adopted.document.requestTarget.count).toBe(5);
    expect((await POST(request({ ...completeCommand(3), evidence: { requested: 5 }, version: adopted.version }))).status).toBe(200);
    const final = await (await GET(request())).json();
    expect(dayProgress(final.document.missions[2], final.document.additionalTarget, snapshot(), final.document.requestTarget.count)).toMatchObject({ cleared: true, percent: 100, total: 5 });
    expect((await db.query('SELECT version, document FROM public."SchoolChallenge" WHERE "schoolId"=$1', ["b"])).rows).toEqual([{ version: 1, document: challengeDocument() }]);
  });
  it.each(["確認済み", "修正済み", "後で対応", "要改善"])("persists %s answers and reads the saved state without changing another school", async answer => {
    const before = await (await GET(request())).json();
    expect(before.document.missions[0]).toMatchObject({ status: "NOT_STARTED", completedAt: null, evidence: {} });
    const command = completeCommand(1);
    command.evidence.hours = answer;
    command.note = ["確認済み", "修正済み"].includes(answer) ? "" : "営業時間を来週再確認";
    const response = await POST(request({ ...command, version: before.version }));
    expect(response.status).toBe(200);
    const latest = await (await GET(request())).json();
    expect(latest.version).toBe(2);
    expect(latest.document.missions[0]).toMatchObject({ day: 1, status: "COMPLETED", evidence: command.evidence, note: command.note, completedAt: snapshot().at, updatedAt: snapshot().at, actorId: "u" });
    expect(dayProgress(latest.document.missions[0], 10, snapshot())).toMatchObject({ cleared: true, percent: command.note ? 92 : 100 });
    expect((await db.query('SELECT version, document FROM public."SchoolChallenge" WHERE "schoolId"=$1', ["b"])).rows).toEqual([{ version: 1, document: challengeDocument() }]);
    expect((await POST(request({ ...command, version: 1 }))).status).toBe(409);
    expect((await GET(request(undefined, "b"))).status).toBe(403);
  });
  it("rejects incomplete critical checks before writing, but allows recording them as in progress", async () => {
    const command = completeCommand(1); command.evidence.website = "後で対応";
    expect((await POST(request({ ...command, version: 1 }))).status).toBe(400);
    expect(prisma.schoolChallenge.updateMany).not.toHaveBeenCalled();
    expect((await (await GET(request())).json()).version).toBe(1);
    expect((await POST(request({ ...command, status: "IN_PROGRESS", version: 1 }))).status).toBe(200);
    const latest = await (await GET(request())).json();
    expect(latest.document.missions[0]).toMatchObject({ status: "IN_PROGRESS", completedAt: null, evidence: command.evidence });
    expect(dayProgress(latest.document.missions[0], 10, snapshot())).toMatchObject({ cleared: false, percent: 72 });
  });
});
