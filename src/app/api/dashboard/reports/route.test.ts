import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    school: {
      findUnique: vi.fn(),
    },
    monthlyReport: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    searchQueryLog: {
      findMany: vi.fn(),
    },
    review: {
      findMany: vi.fn(),
    },
    targetKeyword: {
      findMany: vi.fn(),
    },
    aioScoreHistory: {
      findMany: vi.fn(),
    },
    gbpMetric: {
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

describe("GET /api/dashboard/reports", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.school.findUnique).mockResolvedValue({
      id: "school-1",
      name: "大学受験専門塾 iスクール予備校",
    });
    vi.mocked(prisma.monthlyReport.findUnique).mockResolvedValue({
      id: "report-1",
      schoolId: "school-1",
      targetMonth: "2026-08",
      totalReviews: 2,
      averageRating: 5,
      top3RankingRate: 85,
      aioScore: 78,
      searchImpression: 1420,
      actionCount: 186,
      aiAnalysisSummary: "大学受験関連の検索露出が高水準で推移しています。",
      createdAt: new Date("2026-08-31T00:00:00.000Z"),
      updatedAt: new Date("2026-08-31T00:00:00.000Z"),
    } as never);
    vi.mocked(prisma.monthlyReport.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.searchQueryLog.findMany).mockResolvedValue([
      {
        id: "query-1",
        schoolId: "school-1",
        targetMonth: "2026-08",
        query: "熊本 大学受験 塾",
        impressionCount: 420,
        clickCount: 58,
        growthRate: "+24%",
        intent: "地域",
        createdAt: new Date("2026-08-31T00:00:00.000Z"),
        updatedAt: new Date("2026-08-31T00:00:00.000Z"),
      },
    ] as never);
    vi.mocked(prisma.review.findMany).mockResolvedValue([]);
    vi.mocked(prisma.targetKeyword.findMany).mockResolvedValue([]);
    vi.mocked(prisma.aioScoreHistory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.gbpMetric.findMany).mockResolvedValue([]);
  });

  it("returns DB-backed monthly report and search query logs scoped to the selected school", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/reports?schoolId=school-1&month=2026-08",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.school.name).toBe("大学受験専門塾 iスクール予備校");
    expect(body.report.raw.totalReviews).toBe(2);
    expect(body.report.score).toBe(85);
    expect(body.queries[0]).toMatchObject({
      query: "熊本 大学受験 塾",
      impressionCount: 420,
      clickCount: 58,
    });
    expect(prisma.monthlyReport.findUnique).toHaveBeenCalledWith({
      where: {
        schoolId_targetMonth: {
          schoolId: "school-1",
          targetMonth: "2026-08",
        },
      },
    });
    expect(prisma.searchQueryLog.findMany).toHaveBeenCalledWith({
      where: { schoolId: "school-1", targetMonth: "2026-08" },
      orderBy: [{ targetMonth: "desc" }, { impressionCount: "desc" }],
      take: 50,
    });
  });

  it("uses the latest MonthlyReport when a month is not explicitly selected", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.monthlyReport.findUnique).mockClear();
    vi.mocked(prisma.monthlyReport.findFirst).mockResolvedValueOnce({
      id: "report-latest",
      schoolId: "school-1",
      targetMonth: "2026-08",
      totalReviews: 2,
      averageRating: 5,
      top3RankingRate: 85,
      aioScore: 78,
      searchImpression: 2386,
      actionCount: 348,
      aiAnalysisSummary: "最新月の実績です。",
      createdAt: new Date("2026-08-31T00:00:00.000Z"),
      updatedAt: new Date("2026-08-31T00:00:00.000Z"),
    } as never);
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/reports?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.targetMonth).toBe("2026-08");
    expect(body.report.raw.searchImpression).toBe(2386);
    expect(prisma.monthlyReport.findUnique).not.toHaveBeenCalled();
    expect(prisma.monthlyReport.findFirst).toHaveBeenCalledWith({
      where: { schoolId: "school-1" },
      orderBy: { targetMonth: "desc" },
    });
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
      new Request("https://app.example.com/api/dashboard/reports?schoolId=school-1"),
    );

    expect(response.status).toBe(403);
  });

  it("keeps the report page usable before new report tables are pushed", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.monthlyReport.findUnique).mockRejectedValueOnce({
      code: "P2021",
      message: "The table MonthlyReport does not exist",
    } as never);
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/reports?schoolId=school-1&month=2026-08",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.report.schoolName).toBe("大学受験専門塾 iスクール予備校");
    expect(body.queries).toEqual([]);
  });

  it("aggregates report KPI from existing operational tables when MonthlyReport is missing", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.monthlyReport.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.monthlyReport.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.review.findMany).mockResolvedValueOnce([
      { rating: 5 },
      { rating: 5 },
    ] as never);
    vi.mocked(prisma.targetKeyword.findMany).mockResolvedValueOnce([
      { id: "kw-1", rankHistories: [{ rank: 1 }] },
      { id: "kw-2", rankHistories: [{ rank: 4 }] },
    ] as never);
    vi.mocked(prisma.aioScoreHistory.findMany).mockResolvedValueOnce([
      { totalScore: 80 },
      { totalScore: 76 },
    ] as never);
    vi.mocked(prisma.gbpMetric.findMany).mockResolvedValueOnce([
      {
        views: 1000,
        searches: 386,
        websiteClicks: 100,
        phoneCalls: 20,
        routeRequests: 30,
      },
    ] as never);
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/reports?schoolId=school-1&month=2026-08",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.raw).toMatchObject({
      totalReviews: 2,
      averageRating: 5,
      top3RankingRate: 50,
      aioScore: 78,
      searchImpression: 1386,
      actionCount: 150,
    });
  });

  it("uses the default report school and current month when query parameters are omitted", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.buildScopedSchoolFilter).mockImplementationOnce((_access, schoolId) => ({
      requestedSchoolId: schoolId,
      effectiveSchoolId: schoolId,
      role: "admin",
      canSwitchSchool: true,
    }));
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/reports"),
    );

    expect(response.status).toBe(200);
    expect(prisma.school.findUnique).toHaveBeenCalledWith({
      where: { id: "cms5tnzlr0001jt04qh0lluva" },
      select: { id: true, name: true },
    });
    expect(prisma.monthlyReport.findFirst).toHaveBeenCalledWith({
      where: { schoolId: "cms5tnzlr0001jt04qh0lluva" },
      orderBy: { targetMonth: "desc" },
    });
  });

  it("normalizes all-school selection to the default report school", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/reports?schoolId=all&month=2026-08"),
    );

    expect(response.status).toBe(200);
    expect(prisma.school.findUnique).toHaveBeenCalledWith({
      where: { id: "cms5tnzlr0001jt04qh0lluva" },
      select: { id: true, name: true },
    });
  });

  it("returns a server error when report table lookup fails for non-schema reasons", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.monthlyReport.findUnique).mockRejectedValueOnce(
      new Error("connection refused"),
    );
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/reports?schoolId=school-1&month=2026-08",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("connection refused");
  });

  it("returns a generic server error when access resolution throws a non-Error value", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.resolveRequestAccess).mockRejectedValueOnce("access failed");
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/reports?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("レポートデータを取得できませんでした。");
  });

  it("returns a server error for non-schema database failures", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.school.findUnique).mockRejectedValueOnce(new Error("DB down"));
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/reports?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe("DB down");
  });
});
