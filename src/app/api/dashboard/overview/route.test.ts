import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { prisma } from "@/lib/prisma";
import { resolveRequestAccess } from "@/lib/supabase-access";

vi.mock("@/lib/prisma", () => ({ prisma: { school: { findMany: vi.fn() }, review: { findMany: vi.fn() }, targetKeyword: { findMany: vi.fn() }, searchQueryLog: { findMany: vi.fn() }, churnAlert: { findMany: vi.fn() } } }));
vi.mock("@/lib/supabase-access", () => ({ resolveRequestAccess: vi.fn() }));
const access = { isAuthenticated: true, access: { userId: "u1", role: "manager" as const, schoolId: "school-1", schoolIds: ["school-1"], status: "active" as const, name: "担当者", email: "manager@example.com", source: "profiles" as const } };
const request = (query = "") => new Request(`https://example.com/api/dashboard/overview${query}`);
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(resolveRequestAccess).mockResolvedValue(access);
  vi.mocked(prisma.school.findMany).mockResolvedValue([{ id: "school-1", name: "iスクール予備校" }] as never);
  for (const model of [prisma.review, prisma.targetKeyword, prisma.searchQueryLog, prisma.churnAlert]) vi.mocked(model.findMany).mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

describe("GET dashboard overview", () => {
  it.each(["", "?schoolId=all", "?schoolId=school-1"])("scopes every query to the manager's assigned school (%s)", async query => {
    const response = await GET(request(query));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toMatchObject({ success: true, schoolId: "school-1", schoolName: "iスクール予備校", summary: { reviews: { count: 0, rating: null }, meo: null, aio: null } });
    for (const model of [prisma.review, prisma.targetKeyword, prisma.searchQueryLog, prisma.churnAlert]) expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ schoolId: { in: ["school-1"] } }) }));
    expect(prisma.review.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { not: "ARCHIVED" } }), select: { rating: true, status: true, repliedAt: true, postedAt: true, createdAt: true } }));
    expect(prisma.targetKeyword.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ isActive: true }), select: expect.objectContaining({ rankHistories: expect.objectContaining({ take: 2 }), aioScoreHistories: expect.objectContaining({ take: 1 }) }) }));
  });
  it("returns computed review metrics, not demonstration values", async () => {
    vi.mocked(prisma.review.findMany).mockResolvedValue([{ rating: 5, status: "PENDING", repliedAt: null, postedAt: null, createdAt: new Date() }, { rating: 3, status: "REPLIED", repliedAt: new Date(), postedAt: null, createdAt: new Date() }] as never);
    const body = await (await GET(request())).json();
    expect(body.summary.reviews).toMatchObject({ count: 2, rating: 4, monthlyCount: 2 });
    expect(body.summary.pendingCount).toBe(1);
  });
  it.each(["", "?schoolId=all"])("aggregates only active schools for an authenticated admin (%s)", async query => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, role: "admin" } });
    vi.mocked(prisma.school.findMany).mockResolvedValue([{ id: "a", name: "校舎A" }, { id: "b", name: "校舎B" }] as never);
    const body = await (await GET(request(query))).json();
    expect(body).toMatchObject({ schoolId: null, schoolName: "全校舎", schoolCount: 2 });
    expect(prisma.school.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "ACTIVE" } }));
    expect(prisma.review.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ schoolId: { in: ["a", "b"] } }) }));
  });
  it("allows an admin to select a specific school", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, role: "admin" } });
    expect((await GET(request("?schoolId=school-1"))).status).toBe(200);
    expect(prisma.school.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "school-1" } }));
  });
  it("returns empty aggregates without widening an empty school scope", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, role: "admin" } });
    vi.mocked(prisma.school.findMany).mockResolvedValue([]);
    expect((await (await GET(request())).json()).schoolCount).toBe(0);
    expect(prisma.review.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ schoolId: { in: [] } }) }));
  });
  it("rejects a forged admin header without a session", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, isAuthenticated: false, access: { ...access.access, role: "admin" } });
    expect((await GET(request("?role=admin"))).status).toBe(401);
    expect(prisma.school.findMany).not.toHaveBeenCalled();
  });
  it("rejects unapproved users", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, status: "pending" } });
    expect((await GET(request())).status).toBe(403);
    expect(prisma.school.findMany).not.toHaveBeenCalled();
  });
  it("rejects cross-school requests before querying data", async () => {
    expect((await GET(request("?schoolId=other"))).status).toBe(403);
    expect(prisma.school.findMany).not.toHaveBeenCalled();
  });
  it.each(["", "other"])("rejects missing or inconsistent school assignment (%s)", async schoolId => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, schoolId, schoolIds: [] } });
    expect((await GET(request())).status).toBe(403);
    expect(prisma.school.findMany).not.toHaveBeenCalled();
  });
  it("uses the validated school membership when the primary assignment is absent", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, schoolId: "" } });
    expect((await GET(request())).status).toBe(200);
  });
  it("does not substitute another school for a missing school", async () => {
    vi.mocked(prisma.school.findMany).mockResolvedValue([]);
    expect((await GET(request())).status).toBe(404);
    expect(prisma.review.findMany).not.toHaveBeenCalled();
  });
  it.each([{ code: "P2022", message: "secret connection string" }, new Error("secret"), null])("fails explicitly and redacts database failures (case %#)", async error => {
    vi.mocked(prisma.review.findMany).mockRejectedValue(error);
    const response = await GET(request());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/secret|P2022/);
    expect(body.summary).toBeUndefined();
  });
});
