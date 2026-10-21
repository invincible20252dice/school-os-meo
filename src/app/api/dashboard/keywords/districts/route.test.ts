import { beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { GET, POST, PATCH, DELETE } from "./route";
import { prisma } from "@/lib/prisma";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { isApprovedAccess } from "@/lib/access-control";
import { canAccessSchool } from "@/lib/auth-access";
vi.mock("@/lib/prisma", () => ({ prisma: { targetDistrict: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() } } }));
vi.mock("@/lib/supabase-access", () => ({ resolveRequestAccess: vi.fn() }));
vi.mock("@/lib/access-control", () => ({ isApprovedAccess: vi.fn() }));
vi.mock("@/lib/auth-access", () => ({ canAccessSchool: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); vi.mocked(resolveRequestAccess).mockResolvedValue({ isAuthenticated: true, access: {} } as never); vi.mocked(isApprovedAccess).mockReturnValue(true); vi.mocked(canAccessSchool).mockReturnValue(true); });
function req(method = "GET", query = "schoolId=s1", body?: unknown) { return new Request(`https://example.com/api/dashboard/keywords/districts?${query}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }); }
it("lists only authorized school records", async () => {
  vi.mocked(prisma.targetDistrict.findMany).mockResolvedValue([]);
  expect((await GET(req())).status).toBe(200);
  expect(prisma.targetDistrict.findMany).toHaveBeenCalledWith({ where: { schoolId: "s1" }, select: { id: true, name: true, focusPoint: true, aiMessage: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
});
it.each(["POST", "PATCH", "DELETE"])("scopes %s mutations", async method => {
  vi.mocked(prisma.targetDistrict.create).mockResolvedValue({ id: "d1" } as never);
  vi.mocked(prisma.targetDistrict.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(prisma.targetDistrict.deleteMany).mockResolvedValue({ count: 1 });
  const response = await POST(req(method, "schoolId=s1&id=d1", method === "DELETE" ? undefined : { name: " マリスト周辺 ", focusPoint: " 通学 ", aiMessage: " 訴求 " }));
  expect(response.status).toBe(method === "POST" ? 201 : 200);
  if (method === "POST") expect(prisma.targetDistrict.create).toHaveBeenCalledWith({ data: { schoolId: "s1", name: "マリスト周辺", focusPoint: "通学", aiMessage: "訴求" } });
  else expect(method === "PATCH" ? prisma.targetDistrict.updateMany : prisma.targetDistrict.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolId: "s1", id: "d1" } }));
});
it("accepts body school and optional fields", async () => { vi.mocked(prisma.targetDistrict.create).mockResolvedValue({} as never); expect((await POST(req("POST", "", { schoolId: "s1", name: "帯山中" }))).status).toBe(201); });
it.each(["PATCH", "DELETE"])("reports missing or foreign ID for %s", async method => {
  expect((await PATCH(req(method, "schoolId=s1", { name: "x" }))).status).toBe(400);
  vi.mocked(prisma.targetDistrict.updateMany).mockResolvedValue({ count: 0 }); vi.mocked(prisma.targetDistrict.deleteMany).mockResolvedValue({ count: 0 });
  expect((await DELETE(req(method, "schoolId=s1&id=foreign", { name: "x" }))).status).toBe(404);
});
it.each([{}, null, { name: " " }, { name: "x".repeat(101) }, { name: "x", focusPoint: 2 }, { name: "x", focusPoint: "x".repeat(2001) }, { name: "x", aiMessage: false }, { name: "x", aiMessage: "x".repeat(4001) }])("validates input", async body => { expect((await POST(req("POST", "schoolId=s1", body))).status).toBe(400); });
it.each(["", "schoolId=all"])("requires concrete school", async query => { expect((await GET(req("GET", query))).status).toBe(400); });
it("rejects malformed JSON", async () => { expect((await POST(new Request("https://example.com?schoolId=s1", { method: "POST", body: "{" }))).status).toBe(400); });
it("enforces auth, approval and scope without DB access", async () => {
  vi.mocked(resolveRequestAccess).mockResolvedValueOnce({ isAuthenticated: false } as never);
  expect((await GET(req())).status).toBe(401);
  vi.mocked(isApprovedAccess).mockReturnValueOnce(false); expect((await GET(req())).status).toBe(403);
  vi.mocked(canAccessSchool).mockReturnValueOnce(false); expect((await DELETE(req("DELETE", "schoolId=other&id=x"))).status).toBe(403);
  expect(prisma.targetDistrict.deleteMany).not.toHaveBeenCalled();
});
it.each([new Error("secret"), new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6" })])("reports errors safely", async error => {
  vi.mocked(prisma.targetDistrict.create).mockRejectedValue(error);
  const response = await POST(req("POST", "schoolId=s1", { name: "x" }));
  expect(response.status).toBe(error instanceof Prisma.PrismaClientKnownRequestError ? 409 : 500);
  expect(await response.text()).not.toContain("secret");
});

it.each([GET, POST, PATCH, DELETE])("rejects expired sessions without district reads or writes", async handler => {
 const { RequestAuthenticationError } = await import("@/lib/request-authentication-error");
 vi.mocked(resolveRequestAccess).mockRejectedValue(new RequestAuthenticationError());
 expect((await handler(req())).status).toBe(401);
 for (const method of Object.values(prisma.targetDistrict)) expect(method).not.toHaveBeenCalled();
});
