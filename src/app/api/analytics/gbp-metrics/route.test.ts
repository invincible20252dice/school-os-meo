import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/analytics", () => ({
  buildLookerStudioRows: vi.fn(async () => [
    {
      schoolId: "school_1",
      schoolName: "青葉ゼミナール",
      date: "2026-07-21",
      views: 100,
      searches: 20,
      websiteClicks: 7,
      phoneCalls: 3,
      routeRequests: 4,
    },
  ]),
}));

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe("GET /api/analytics/gbp-metrics", () => {
  it("requires ownerId for row-level scoping", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/analytics/gbp-metrics"),
    );

    expect(response.status).toBe(400);
  });

  it("rejects requests when analytics secret does not match", async () => {
    process.env.ANALYTICS_API_SECRET = "analytics-secret";
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/analytics/gbp-metrics?ownerId=user_1", {
        headers: { authorization: "Bearer wrong" },
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns Looker Studio rows scoped by owner and date range", async () => {
    process.env.ANALYTICS_API_SECRET = "analytics-secret";
    const analytics = await import("@/lib/analytics");
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "http://localhost/api/analytics/gbp-metrics?ownerId=user_1&from=2026-07-01&to=2026-07-31",
        {
          headers: { authorization: "Bearer analytics-secret" },
        },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.rows).toHaveLength(1);
    expect(analytics.buildLookerStudioRows).toHaveBeenCalledWith(
      {},
      {
        ownerId: "user_1",
        schoolId: undefined,
        from: "2026-07-01",
        to: "2026-07-31",
      },
    );
  });

  it("forces staff users to their assigned school even when another school is requested", async () => {
    const analytics = await import("@/lib/analytics");
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "http://localhost/api/analytics/gbp-metrics?ownerId=user_1&schoolId=school_other",
        {
          headers: {
            "x-user-role": "staff",
            "x-user-school-id": "school_own",
          },
        },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.access).toEqual({
      requestedSchoolId: "school_other",
      effectiveSchoolId: "school_own",
      role: "staff",
    });
    expect(analytics.buildLookerStudioRows).toHaveBeenCalledWith(
      {},
      {
        ownerId: "user_1",
        schoolId: "school_own",
        from: undefined,
        to: undefined,
      },
    );
  });

  it("allows admin users to request all-school summaries", async () => {
    const analytics = await import("@/lib/analytics");
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "http://localhost/api/analytics/gbp-metrics?ownerId=user_1&schoolId=all",
        {
          headers: {
            "x-user-role": "admin",
            "x-user-school-id": "school_own",
          },
        },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.access.effectiveSchoolId).toBe("all");
    expect(analytics.buildLookerStudioRows).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        ownerId: "user_1",
        schoolId: undefined,
      }),
    );
  });

  it("returns 500 when analytics row building fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const analytics = await import("@/lib/analytics");
    vi.mocked(analytics.buildLookerStudioRows).mockRejectedValueOnce(
      new Error("analytics failed"),
    );
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/analytics/gbp-metrics?ownerId=user_1"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("GBPインサイト分析データの取得に失敗しました。");
    consoleErrorSpy.mockRestore();
  });
});
