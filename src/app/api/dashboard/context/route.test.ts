import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/supabase-access", () => ({
  resolveRequestAccess: vi.fn(async () => ({
    access: {
      userId: "admin-1",
      role: "admin",
      schoolId: "",
      schoolIds: [],
      name: "本部",
      email: "admin@example.com",
      status: "active",
      source: "profiles",
    },
    isAuthenticated: true,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    school: {
      findMany: vi.fn(async () => [
        { id: "school-1", name: "iスクール予備校" },
        { id: "school-2", name: "iスクール駅前校" },
      ]),
    },
  },
}));

describe("GET /api/dashboard/context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("returns DB schools and selected school for admin", async () => {
    const { prisma } = await import("@/lib/prisma");
    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/context?schoolId=school-2",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.schools).toEqual([
      { id: "school-1", name: "iスクール予備校" },
      { id: "school-2", name: "iスクール駅前校" },
    ]);
    expect(body.currentSchoolId).toBe("school-2");
    expect(prisma.school.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "ACTIVE" },
      }),
    );
  });

  it("filters schools to manager assigned school ids", async () => {
    const access = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      access: {
        userId: "manager-1",
        role: "manager",
        schoolId: "school-1",
        schoolIds: ["school-1"],
        name: "教室長",
        email: "manager@example.com",
        status: "active",
        source: "profiles",
      },
      isAuthenticated: true,
    });

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/context"),
    );

    expect(response.status).toBe(200);
    expect(prisma.school.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "ACTIVE", id: { in: ["school-1"] } },
      }),
    );
  });

  it("uses manager single school id when school_ids is empty", async () => {
    const access = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      access: {
        userId: "manager-1",
        role: "manager",
        schoolId: "school-1",
        schoolIds: [],
        name: "教室長",
        email: "manager@example.com",
        status: "active",
        source: "profiles",
      },
      isAuthenticated: true,
    });

    await GET(new Request("https://app.example.com/api/dashboard/context"));

    expect(prisma.school.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "ACTIVE", id: { in: ["school-1"] } },
      }),
    );
  });

  it("returns no schools for manager without assigned school ids", async () => {
    const access = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      access: {
        userId: "manager-1",
        role: "manager",
        schoolId: "",
        schoolIds: [],
        name: "教室長",
        email: "manager@example.com",
        status: "active",
        source: "profiles",
      },
      isAuthenticated: true,
    });

    await GET(new Request("https://app.example.com/api/dashboard/context"));

    expect(prisma.school.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "ACTIVE", id: { in: [] } },
      }),
    );
  });

  it("rejects pending authenticated users", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      access: {
        userId: "manager-1",
        role: "manager",
        schoolId: "",
        schoolIds: [],
        name: "未承認",
        email: "pending@example.com",
        status: "pending",
        source: "profiles",
      },
      isAuthenticated: true,
    });

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/context"),
    );

    expect(response.status).toBe(403);
  });

  it("returns a Japanese error when context cannot be loaded", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.school.findMany).mockRejectedValueOnce(new Error("DB down"));

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/context"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toContain("校舎情報を取得できませんでした");
  });
});
