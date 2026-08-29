import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    school: {
      findUnique: vi.fn(),
    },
    targetKeyword: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    keywordRank: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/supabase-access", () => ({
  resolveRequestAccess: vi.fn(async () => ({
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
  })),
  buildScopedSchoolFilter: vi.fn((_access, schoolId) => ({
    requestedSchoolId: schoolId,
    effectiveSchoolId: schoolId || "school-1",
    role: "manager",
    canSwitchSchool: false,
  })),
}));

describe("/api/dashboard/rankings", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.school.findUnique).mockResolvedValue({
      id: "school-1",
      name: "大学受験専門塾 iスクール予備校",
      prefecture: "熊本県",
      city: "熊本市中央区",
      addressLine: "下通1丁目12-27",
      googlePlaceId: "place-ischool",
    });
    vi.mocked(prisma.targetKeyword.findMany).mockResolvedValue([
      {
        id: "keyword-1",
        schoolId: "school-1",
        keyword: "熊本 大学受験 塾",
        location: "熊本市中央区下通",
        nearestStation: "通町筋駅",
        municipality: "熊本市中央区",
        latitude: "32.801600",
        longitude: "130.709500",
        radiusMeters: 1500,
        isActive: true,
        createdAt: new Date("2026-08-29T00:00:00.000Z"),
        updatedAt: new Date("2026-08-29T00:00:00.000Z"),
        rankHistories: [
          {
            id: "rank-1",
            keywordId: "keyword-1",
            rank: 3,
            competitorData: [],
            checkedAt: new Date("2026-08-29T00:00:00.000Z"),
            createdAt: new Date("2026-08-29T00:00:00.000Z"),
            updatedAt: new Date("2026-08-29T00:00:00.000Z"),
          },
        ],
        aioScoreHistories: [],
      },
    ]);
    vi.mocked(prisma.keywordRank.findMany).mockResolvedValue([]);
    vi.mocked(prisma.targetKeyword.create).mockImplementation(async ({ data }) => ({
      id: "keyword-new",
      isActive: true,
      createdAt: new Date("2026-08-29T00:00:00.000Z"),
      updatedAt: new Date("2026-08-29T00:00:00.000Z"),
      ...data,
    }));
  });

  it("returns DB-backed ranking data scoped to the selected school", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/rankings?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.school.name).toBe("大学受験専門塾 iスクール予備校");
    expect(body.currentKeyword).toBe("熊本 大学受験 塾");
    expect(body.currentRank).toBe(3);
    expect(body.searchLabel).toContain("通町筋駅");
    expect(prisma.targetKeyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "school-1" },
      }),
    );
  });

  it("loads all ranking data when no school is selected", async () => {
    const { prisma } = await import("@/lib/prisma");
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: null,
      effectiveSchoolId: undefined,
      role: "admin",
      canSwitchSchool: true,
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/rankings"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(prisma.school.findUnique).not.toHaveBeenCalled();
    expect(prisma.targetKeyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: undefined,
      }),
    );
  });

  it("creates a keyword with explicit location parameters", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/dashboard/rankings", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          keyword: " 熊本 医学部 予備校 ",
          location: "熊本市中央区下通",
          nearestStation: "通町筋駅",
          municipality: "熊本市中央区",
          latitude: "32.8016",
          longitude: "130.7095",
          radiusMeters: "1800",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(prisma.targetKeyword.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        schoolId: "school-1",
        keyword: "熊本 医学部 予備校",
        location: "熊本市中央区下通",
        nearestStation: "通町筋駅",
        municipality: "熊本市中央区",
        latitude: 32.8016,
        longitude: 130.7095,
        radiusMeters: 1800,
      }),
    });
  });

  it("uses school address fields as the measurement location when location text is omitted", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/dashboard/rankings", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          keyword: "熊本 大学受験 塾",
          nearestStation: "通町筋駅",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(prisma.targetKeyword.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        location: "熊本県熊本市中央区下通1丁目12-27",
        municipality: "熊本市中央区",
        radiusMeters: 1500,
      }),
    });
  });

  it("bounds radius and omits blank coordinate values during keyword creation", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/dashboard/rankings", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          keyword: "熊本 高校生 塾",
          location: "熊本市中央区下通",
          nearestStation: "通町筋駅",
          municipality: "熊本市中央区",
          latitude: "",
          longitude: "",
          radiusMeters: 1,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(prisma.targetKeyword.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        latitude: undefined,
        longitude: undefined,
        radiusMeters: 100,
      }),
    });
  });

  it("rejects keyword creation when school id or keyword is missing", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/dashboard/rankings", {
        method: "POST",
        body: JSON.stringify({ schoolId: "school-1", keyword: "" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("schoolId and keyword are required");
  });

  it("rejects keyword creation without location measurement parameters", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/dashboard/rankings", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          keyword: "熊本 大学受験 塾",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("最寄り駅");
  });

  it("returns a clear error when coordinate values are invalid", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/dashboard/rankings", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          keyword: "熊本 大学受験 塾",
          location: "熊本市中央区下通",
          nearestStation: "通町筋駅",
          municipality: "熊本市中央区",
          latitude: "north",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("緯度・経度");
  });

  it("returns a clear error when radius is invalid", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/dashboard/rankings", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          keyword: "熊本 大学受験 塾",
          location: "熊本市中央区下通",
          nearestStation: "通町筋駅",
          municipality: "熊本市中央区",
          radiusMeters: "wide",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("計測半径");
  });

  it("rejects pending users", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      access: {
        userId: "pending-1",
        role: "manager",
        schoolId: "school-1",
        schoolIds: ["school-1"],
        name: "承認待ち",
        email: "pending@example.com",
        status: "pending",
        source: "profiles",
      },
      isAuthenticated: true,
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/rankings?schoolId=school-1"),
    );

    expect(response.status).toBe(403);
  });

  it("rejects pending users before creating keywords", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      access: {
        userId: "pending-1",
        role: "manager",
        schoolId: "school-1",
        schoolIds: ["school-1"],
        name: "承認待ち",
        email: "pending@example.com",
        status: "pending",
        source: "profiles",
      },
      isAuthenticated: true,
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/dashboard/rankings", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          keyword: "熊本 大学受験 塾",
        }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("returns a stable JSON error when ranking data cannot be loaded", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.targetKeyword.findMany).mockRejectedValueOnce("db offline");
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/rankings?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("ランキングデータを取得できませんでした。");
    consoleErrorSpy.mockRestore();
  });

  it("preserves Error messages when ranking data loading fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.keywordRank.findMany).mockRejectedValueOnce(
      new Error("rank table is unavailable"),
    );
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/rankings?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("rank table is unavailable");
    consoleErrorSpy.mockRestore();
  });

  it("returns the default POST message for non-Error create failures", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.targetKeyword.create).mockRejectedValueOnce("db offline");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/dashboard/rankings", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          keyword: "熊本 高校生 塾",
          location: "熊本市中央区下通",
          nearestStation: "通町筋駅",
          municipality: "熊本市中央区",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("キーワードを追加できませんでした。");
    consoleErrorSpy.mockRestore();
  });
});
