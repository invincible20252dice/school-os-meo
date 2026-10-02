import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { prisma } from "@/lib/prisma";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { loadChallengeData } from "@/lib/challenge-data";
import { challengeDocument, completeCommand, snapshot } from "@/test/challenge-fixtures";
vi.mock("@/lib/prisma", () => ({ prisma: { school: { findUnique: vi.fn() }, schoolChallenge: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() } } }));
vi.mock("@/lib/supabase-access", () => ({ resolveRequestAccess: vi.fn() }));
vi.mock("@/lib/challenge-data", () => ({ loadChallengeData: vi.fn() }));
const access = { isAuthenticated: true, access: { userId: "u", role: "manager" as const, schoolIds: ["a"], schoolId: "a", status: "active" as const, name: "担当", email: "", source: "profiles" as const } };
const request = (body?: unknown, school = "a") => new Request(`https://example.com/api/dashboard/challenge?schoolId=${school}`, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
const stored = () => ({ schoolId: "a", version: 1, document: challengeDocument(), createdAt: new Date(), updatedAt: new Date() });
beforeEach(() => {
  vi.resetAllMocks(); vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(resolveRequestAccess).mockResolvedValue(access);
  vi.mocked(prisma.school.findUnique).mockResolvedValue({ id: "a", name: "校舎A" } as never);
  vi.mocked(prisma.schoolChallenge.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.schoolChallenge.create).mockResolvedValue(stored() as never);
  vi.mocked(prisma.schoolChallenge.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(loadChallengeData).mockResolvedValue({ snapshot: snapshot(), surveys: [] });
});
afterEach(() => vi.restoreAllMocks());
describe("authenticated school challenge API", () => {
  it("loads an unstarted school without writing records", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ success: true, document: null, version: 0, actions: [], school: { id: "a" } });
    expect(prisma.schoolChallenge.create).not.toHaveBeenCalled();
    expect(loadChallengeData).toHaveBeenCalledWith("a", null);
  });
  it("loads saved progress and weekly actions", async () => {
    vi.mocked(prisma.schoolChallenge.findUnique).mockResolvedValue(stored() as never);
    const body = await (await GET(request())).json();
    expect(body.document).toEqual(challengeDocument()); expect(body.actions.length).toBeGreaterThan(0);
    expect(loadChallengeData).toHaveBeenCalledWith("a", challengeDocument().startedAt);
  });
  it.each([GET, POST])("requires authentication and approval for both operations", async handler => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, isAuthenticated: false });
    expect((await handler(request({}))).status).toBe(401);
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, status: "pending" } });
    expect((await handler(request({}))).status).toBe(403);
    expect(prisma.school.findUnique).not.toHaveBeenCalled();
  });
  it.each([GET, POST])("rejects another school before any DB query", async handler => {
    expect((await handler(request({}, "b"))).status).toBe(403);
    expect(prisma.school.findUnique).not.toHaveBeenCalled();
  });
  it.each(["", "all"])("requires a concrete school %s", async school => expect((await GET(request(undefined, school))).status).toBe(400));
  it("does not substitute a school when missing", async () => {
    vi.mocked(prisma.school.findUnique).mockResolvedValue(null);
    expect((await GET(request())).status).toBe(404);
  });
  it("permits authenticated admin access but still requires the requested school", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, role: "admin" } });
    vi.mocked(prisma.school.findUnique).mockResolvedValue({ id: "b", name: "校舎B" } as never);
    expect((await GET(request(undefined, "b"))).status).toBe(200);
    expect(prisma.schoolChallenge.findUnique).toHaveBeenCalledWith({ where: { schoolId: "b" } });
  });
  it("starts once with server-owned baseline, school and timestamps", async () => {
    const res = await POST(request({ action: "start", additionalTarget: 12, schoolId: "b", baseline: { reviews: 100 } }));
    expect(res.status).toBe(200);
    expect(prisma.schoolChallenge.create).toHaveBeenCalledWith({ data: { schoolId: "a", document: { ...challengeDocument(), additionalTarget: 12 } } });
    vi.mocked(prisma.schoolChallenge.findUnique).mockResolvedValue(stored() as never);
    expect((await POST(request({ action: "start", additionalTarget: 12 }))).status).toBe(409);
    expect(prisma.schoolChallenge.create).toHaveBeenCalledTimes(1);
  });
  it("updates only a matching school version, preserving evidence and baseline", async () => {
    vi.mocked(prisma.schoolChallenge.findUnique).mockResolvedValue(stored() as never);
    expect((await POST(request({ ...completeCommand(3), version: 1 }))).status).toBe(200);
    expect(prisma.schoolChallenge.updateMany).toHaveBeenCalledWith({ where: { schoolId: "a", version: 1 }, data: { version: { increment: 1 }, document: expect.objectContaining({ baseline: snapshot(), missions: expect.arrayContaining([expect.objectContaining({ day: 3, status: "COMPLETED", actorId: "u" })]) }) } });
  });
  it.each([{ action: "next-action", key: "pending-replies", status: "IN_PROGRESS", note: "" }, { action: "adopt-request-target" }])("saves server-derived plans through the existing school CAS boundary", async command => {
    vi.mocked(prisma.schoolChallenge.findUnique).mockResolvedValue(stored() as never);
    expect((await POST(request({ ...command, version: 1, schoolId: "b" }))).status).toBe(200);
    const call = vi.mocked(prisma.schoolChallenge.updateMany).mock.calls[0][0]!;
    expect(call.where).toEqual({ schoolId: "a", version: 1 });
    expect(call.data.document).toMatchObject(command.action === "next-action" ? { nextActionHistory: [expect.objectContaining({ key: "pending-replies", actorId: "u" })] } : { requestTarget: { count: 5, actorId: "u" } });
  });
  it("rejects concurrent saves and stale replays rather than overwriting", async () => {
    vi.mocked(prisma.schoolChallenge.findUnique).mockResolvedValue(stored() as never);
    expect((await POST(request({ ...completeCommand(3), version: 0 }))).status).toBe(409);
    expect(prisma.schoolChallenge.updateMany).not.toHaveBeenCalled();
    vi.mocked(prisma.schoolChallenge.updateMany).mockResolvedValue({ count: 0 });
    expect((await POST(request({ ...completeCommand(3), version: 1 }))).status).toBe(409);
  });
  it("rejects malformed requests, incomplete evidence, and saves before starting", async () => {
    expect((await POST(new Request("https://example.com/api/dashboard/challenge?schoolId=a", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await POST(request({ action: "mission" }))).status).toBe(409);
    expect((await POST(request({ action: "start", additionalTarget: 0 }))).status).toBe(400);
    vi.mocked(prisma.schoolChallenge.findUnique).mockResolvedValue(stored() as never);
    expect((await POST(request({ ...completeCommand(3), evidence: {}, version: 1 }))).status).toBe(400);
    expect(prisma.schoolChallenge.updateMany).not.toHaveBeenCalled();
  });
  it.each([{ code: "P2002", status: 409 }, { code: "P2021", status: 503 }, { code: "P2022", status: 503 }])("does not hide storage failures %s", async error => {
    vi.mocked(prisma.schoolChallenge.create).mockRejectedValue({ ...error, message: "secret" });
    const response = await POST(request({ action: "start", additionalTarget: 10 }));
    expect(response.status).toBe(error.status); expect(await response.text()).not.toContain("secret");
  });
  it.each([null, new Error("secret")])("redacts unexpected failures %#", async error => {
    vi.mocked(resolveRequestAccess).mockRejectedValue(error);
    const response = await GET(request()); expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
  });
});
