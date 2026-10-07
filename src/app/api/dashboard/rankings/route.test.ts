import { schoolFixture } from "@/test/db-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, type TargetKeyword } from "@prisma/client";

const createKeyword = vi.hoisted(() => vi.fn<(args: { data: Prisma.TargetKeywordUncheckedCreateInput }) => Promise<TargetKeyword>>());
const findKeywords = vi.hoisted(() => vi.fn<(args: Prisma.TargetKeywordFindManyArgs) => Promise<Prisma.TargetKeywordGetPayload<{ include: { rankHistories: true; aioScoreHistories: true } }>[]>>());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    school: {
      findUnique: vi.fn(),
    },
    targetKeyword: {
      findMany: findKeywords,
      create: createKeyword,
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    keywordRank: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/supabase-access", async () => ({
  ...await vi.importActual<typeof import("@/lib/supabase-access")>("@/lib/supabase-access"),
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
}));

describe("/api/dashboard/rankings", () => {
  it("locks before lookup and reactivates the existing ID without replacing history", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { POST } = await import("./route");
    vi.mocked(prisma.targetKeyword.findFirst).mockResolvedValue({ id: "existing" } as never);
    vi.mocked(prisma.targetKeyword.update).mockResolvedValue({ id: "existing", isActive: true } as never);
    const response = await POST(new Request("https://app.example.com/api/dashboard/keywords", { method: "POST", body: JSON.stringify({ schoolId: "school-1", keyword: " 同じ語句 ", location: "地点A", municipality: "市", nearestStation: "駅" }) }));
    expect(response.status).toBe(200);
    expect(prisma.$executeRaw).toHaveBeenCalledWith(expect.any(Array), JSON.stringify(["school-1", "同じ語句", "地点A"]));
    expect(prisma.targetKeyword.findFirst).toHaveBeenCalledWith({ where: { schoolId: "school-1", keyword: "同じ語句", location: "地点A" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
    expect(prisma.targetKeyword.update).toHaveBeenCalledWith({ where: { id: "existing", schoolId: "school-1" }, data: { isActive: true, municipality: "市", nearestStation: "駅" } });
    expect(createKeyword).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.$executeRaw).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(prisma.targetKeyword.findFirst).mock.invocationCallOrder[0]);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 15000 });
  });
  it("does not write if the lock fails", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { POST } = await import("./route");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.$executeRaw).mockRejectedValueOnce(new Error("database secret"));
    const response = await POST(new Request("https://app.example.com/api/dashboard/keywords", { method: "POST", body: JSON.stringify({ schoolId: "school-1", keyword: "語句", location: "地点", municipality: "市", nearestStation: "駅" }) }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("database secret");
    expect(prisma.targetKeyword.findFirst).not.toHaveBeenCalled();
    expect(createKeyword).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.$transaction).mockImplementation(async callback => (callback as (tx: typeof prisma) => Promise<unknown>)(prisma));
    vi.mocked(prisma.$executeRaw).mockResolvedValue(1);
    vi.mocked(prisma.targetKeyword.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.school.findUnique).mockResolvedValue(schoolFixture({
      id: "school-1",
      name: "大学受験専門塾 iスクール予備校",
      prefecture: "熊本県",
      city: "熊本市中央区",
      addressLine: "下通1丁目12-27",
      googlePlaceId: "place-ischool",
    }));
    findKeywords.mockResolvedValue([
      {
        id: "keyword-1",
        schoolId: "school-1",
        keyword: "熊本 大学受験 塾",
        location: "熊本市中央区下通",
        nearestStation: "通町筋駅",
        municipality: "熊本市中央区",
        latitude: new Prisma.Decimal("32.801600"),
        longitude: new Prisma.Decimal("130.709500"),
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
    createKeyword.mockImplementation(async ({ data }) => ({
      ...data,
      id: "keyword-new",
      isActive: true,
      createdAt: new Date("2026-08-29T00:00:00.000Z"),
      updatedAt: new Date("2026-08-29T00:00:00.000Z"),
      latitude: data.latitude == null ? null : new Prisma.Decimal(data.latitude.toString()),
      longitude: data.longitude == null ? null : new Prisma.Decimal(data.longitude.toString()),
      radiusMeters: data.radiusMeters ?? 1500,
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

  it("requires admins to select a school instead of mixing every school's rankings", async () => {
    const { prisma } = await import("@/lib/prisma");
    const access = await import("@/lib/supabase-access");
    const identity = await access.resolveRequestAccess(new Request("https://example.com"), new URL("https://example.com"));
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({ ...identity, access: { ...identity.access, role: "admin" } });
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/rankings"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(prisma.school.findUnique).not.toHaveBeenCalled();
    expect(prisma.targetKeyword.findMany).not.toHaveBeenCalled();
  });

  it.each(["GET", "POST"])("rejects unauthenticated %s before DB access", async method => {
    const access = await import("@/lib/supabase-access");
    const identity = await access.resolveRequestAccess(new Request("https://example.com"), new URL("https://example.com"));
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({ ...identity, isAuthenticated: false });
    const routes = await import("./route");
    const response = await (method === "GET" ? routes.GET : routes.POST)(new Request("https://example.com/api/dashboard/rankings", { method, ...(method === "POST" ? { body: JSON.stringify({ schoolId: "school-1", keyword: "test" }) } : {}) }));
    expect(response.status).toBe(401);
    expect(findKeywords).not.toHaveBeenCalled();
    expect(createKeyword).not.toHaveBeenCalled();
  });

  it.each(["GET", "POST"])("rejects another school's %s request using real scope logic", async method => {
    const routes = await import("./route");
    const response = await (method === "GET" ? routes.GET : routes.POST)(new Request("https://example.com/api/dashboard/rankings?schoolId=other-school", { method, ...(method === "POST" ? { body: JSON.stringify({ schoolId: "other-school", keyword: "test" }) } : {}) }));
    expect(response.status).toBe(403);
    expect(findKeywords).not.toHaveBeenCalled();
    expect(createKeyword).not.toHaveBeenCalled();
  });

  it("supports the ranking alias and returns 404 for an unknown keyword", async () => {
    const { GET } = await import("../keywords/ranking/route");
    const response = await GET(new Request("https://example.com/api/dashboard/keywords/ranking?schoolId=school-1&keywordId=unknown"));
    expect(response.status).toBe(404);
  });

  it("returns 404 for an unknown school", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.school.findUnique).mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    expect((await GET(new Request("https://example.com/api/dashboard/rankings?schoolId=school-1"))).status).toBe(404);
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

  it("does not expose database details when ranking data loading fails", async () => {
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
    expect(body.error).toBe("ランキングデータを取得できませんでした。");
    expect(body.code).toBe("RANKING_FETCH_FAILED");
    consoleErrorSpy.mockRestore();
  });

  it.each(["P2022", "P2021"])("handles schema mismatch %s without fake results or retrying with guessed columns", async code => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    findKeywords.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("TargetKeyword.location is missing; private database details", { code, clientVersion: "6.19.3" }));
    const { GET } = await import("./route");
    const response = await GET(new Request("https://example.com/api/dashboard/rankings?schoolId=school-1"));
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body).toMatchObject({ success: false, code: "RANKING_SCHEMA_UNAVAILABLE" });
    expect(body.error).not.toContain("private");
    expect(body).not.toHaveProperty("keywords");
    expect(findKeywords).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
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
    expect(body.error).toBe("キーワードを保存できませんでした。時間をおいて再試行してください。");
    consoleErrorSpy.mockRestore();
  });
});
