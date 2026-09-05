import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    searchQueryLog: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/supabase-access", () => ({
  resolveRequestAccess: vi.fn(async () => ({
    access: {
      userId: "admin-1",
      role: "admin",
      schoolId: "",
      schoolIds: [],
      name: "Admin",
      email: "admin@example.com",
      status: "active",
      source: "profiles",
    },
    isAuthenticated: true,
  })),
  buildScopedSchoolFilter: vi.fn((_access, schoolId) => ({
    requestedSchoolId: schoolId,
    effectiveSchoolId: schoolId,
    role: "admin",
    canSwitchSchool: true,
  })),
}));

describe("GET /api/dashboard/analytics/queries", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.searchQueryLog.findMany).mockResolvedValue([
      {
        id: "query-1",
        schoolId: "school-1",
        targetMonth: "2026-08",
        query: "熊本 大学受験 塾",
        impressionCount: 420,
        clickCount: 58,
        growthRate: "+24%",
        intent: "学年",
        createdAt: new Date("2026-08-31T00:00:00.000Z"),
        updatedAt: new Date("2026-08-31T00:00:00.000Z"),
      },
      {
        id: "query-2",
        schoolId: "school-1",
        targetMonth: "2026-08",
        query: "通町筋 予備校",
        impressionCount: 310,
        clickCount: 42,
        growthRate: "+15%",
        intent: "地域",
        createdAt: new Date("2026-08-31T00:00:00.000Z"),
        updatedAt: new Date("2026-08-31T00:00:00.000Z"),
      },
    ] as never);
  });

  it("returns DB-backed query analytics scoped to school and month", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/analytics/queries?schoolId=school-1&month=2026-08",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.summary).toEqual({
      totalQueries: 2,
      totalImpressions: 730,
      totalClicks: 100,
      avgCtr: "13.7%",
    });
    expect(body.categories).toEqual([
      expect.objectContaining({ intent: "学年", impressionCount: 420 }),
      expect.objectContaining({ intent: "地域", impressionCount: 310 }),
    ]);
    expect(body.advice[0]).toContain("熊本 大学受験 塾");
    expect(prisma.searchQueryLog.findMany).toHaveBeenCalledWith({
      where: { schoolId: "school-1", targetMonth: "2026-08" },
      orderBy: [{ targetMonth: "desc" }, { impressionCount: "desc" }],
      take: 100,
    });
  });

  it("uses latest month logs when month is omitted", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.searchQueryLog.findMany).mockResolvedValueOnce([
      {
        id: "query-new",
        schoolId: "school-1",
        targetMonth: "2026-09",
        query: "熊本 予備校",
        impressionCount: 500,
        clickCount: 50,
        growthRate: "+10%",
        intent: "地域",
      },
      {
        id: "query-old",
        schoolId: "school-1",
        targetMonth: "2026-08",
        query: "熊本 塾",
        impressionCount: 900,
        clickCount: 40,
        growthRate: "+2%",
        intent: "地域",
      },
    ] as never);
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/analytics/queries?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.targetMonth).toBe("2026-09");
    expect(body.queries).toHaveLength(1);
    expect(body.queries[0].query).toBe("熊本 予備校");
    expect(prisma.searchQueryLog.findMany).toHaveBeenCalledWith({
      where: { schoolId: "school-1" },
      orderBy: [{ targetMonth: "desc" }, { impressionCount: "desc" }],
      take: 100,
    });
  });

  it("normalizes all-school selection to the default school", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/analytics/queries?schoolId=all&month=2026-08",
      ),
    );

    expect(response.status).toBe(200);
    expect(prisma.searchQueryLog.findMany).toHaveBeenCalledWith({
      where: {
        schoolId: "cms5tnzlr0001jt04qh0lluva",
        targetMonth: "2026-08",
      },
      orderBy: [{ targetMonth: "desc" }, { impressionCount: "desc" }],
      take: 100,
    });
  });

  it("uses an empty target month when no logs exist and month is omitted", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.searchQueryLog.findMany).mockResolvedValueOnce([]);
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/analytics/queries?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.targetMonth).toBe("");
    expect(body.summary.totalQueries).toBe(0);
  });

  it("rejects pending authenticated users", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      access: {
        userId: "pending-1",
        role: "manager",
        schoolId: "school-1",
        schoolIds: ["school-1"],
        name: "Pending",
        email: "pending@example.com",
        status: "pending",
        source: "profiles",
      },
      isAuthenticated: true,
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/analytics/queries?schoolId=school-1"),
    );

    expect(response.status).toBe(403);
  });

  it("returns an empty analytics payload before SearchQueryLog is pushed", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.searchQueryLog.findMany).mockRejectedValueOnce({
      code: "P2021",
      message: "The table SearchQueryLog does not exist",
    } as never);
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/analytics/queries?schoolId=school-1&month=2026-08",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.totalQueries).toBe(0);
    expect(body.queries).toEqual([]);
  });

  it("handles missing SearchQueryLog column errors reported as plain text", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.searchQueryLog.findMany).mockRejectedValueOnce(
      "P2022: Unknown column SearchQueryLog.intent",
    );
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/analytics/queries?schoolId=school-1&month=2026-08",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.targetMonth).toBe("2026-08");
    expect(body.queries).toEqual([]);
  });

  it("returns server errors for non-schema database failures", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.searchQueryLog.findMany).mockRejectedValueOnce(
      new Error("DB down"),
    );
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/analytics/queries?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("DB down");
  });

  it("returns a generic server error when access resolution throws a non-Error value", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.resolveRequestAccess).mockRejectedValueOnce("access failed");
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/analytics/queries?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("流入語句分析を取得できませんでした。");
  });
});
