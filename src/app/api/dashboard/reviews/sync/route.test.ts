import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
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
    effectiveSchoolId: schoolId,
    role: "manager",
    canSwitchSchool: false,
  })),
}));

vi.mock("@/lib/gbp-reviews-sync", async () => ({
  ...await vi.importActual<typeof import("@/lib/gbp-reviews-sync")>("@/lib/gbp-reviews-sync"),
  syncGbpReviewsForSchool: vi.fn(async () => ({
    success: true,
    count: 2,
    schoolId: "school-1",
  })),
}));

describe("POST /api/dashboard/reviews/sync", () => {
  it.each(["", "all", "school-2"])("rejects invalid or unauthorized school %s without syncing", async schoolId => {
    const { POST } = await import("./route");
    const { syncGbpReviewsForSchool } = await import("@/lib/gbp-reviews-sync");
    const response = await POST(new Request("https://app.example.com/api/dashboard/reviews/sync", { method: "POST", body: JSON.stringify({ schoolId }) }));
    expect(response.status).toBe(schoolId === "school-2" ? 403 : 400);
    expect(syncGbpReviewsForSchool).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    const access = await import("@/lib/supabase-access");
    const current = await access.resolveRequestAccess(new Request("https://app.example.com"), new URL("https://app.example.com"));
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({ ...current, isAuthenticated: false });
    const { POST } = await import("./route");
    expect((await POST(new Request("https://app.example.com/api/dashboard/reviews/sync", { method: "POST", body: "{}" }))).status).toBe(401);
  });

  it.each([403, 429, 502])("reports Google failure %s without a fabricated success", async status => {
    const { GbpSyncError, syncGbpReviewsForSchool } = await import("@/lib/gbp-reviews-sync");
    vi.mocked(syncGbpReviewsForSchool).mockRejectedValueOnce(new GbpSyncError(status));
    const { POST } = await import("./route");
    const response = await POST(new Request("https://app.example.com/api/dashboard/reviews/sync", { method: "POST", body: JSON.stringify({ schoolId: "school-1" }) }));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ success: false, code: "GOOGLE_SYNC_FAILED" });
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs reviews for the scoped selected school", async () => {
    const { syncGbpReviewsForSchool } = await import("@/lib/gbp-reviews-sync");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/dashboard/reviews/sync", {
        method: "POST",
        body: JSON.stringify({ schoolId: "school-1" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, count: 2, schoolId: "school-1" });
    expect(syncGbpReviewsForSchool).toHaveBeenCalledWith({
      prisma: {},
      schoolId: "school-1",
    });
  });

  it("also accepts schoolId from the query string", async () => {
    const { syncGbpReviewsForSchool } = await import("@/lib/gbp-reviews-sync");
    const { POST } = await import("./route");

    const response = await POST(
      new Request(
        "https://app.example.com/api/dashboard/reviews/sync?schoolId=school-1",
        {
          method: "POST",
          body: "{invalid-json",
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(syncGbpReviewsForSchool).toHaveBeenCalledWith({
      prisma: {},
      schoolId: "school-1",
    });
  });

  it("rejects pending users before calling the sync service", async () => {
    const access = await import("@/lib/supabase-access");
    const { syncGbpReviewsForSchool } = await import("@/lib/gbp-reviews-sync");
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
      new Request("https://app.example.com/api/dashboard/reviews/sync", {
        method: "POST",
        body: JSON.stringify({ schoolId: "school-1" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("アカウント承認後にGoogle口コミ同期を実行できます。");
    expect(syncGbpReviewsForSchool).not.toHaveBeenCalled();
  });

  it("returns a stable JSON validation error when Google settings are incomplete", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { syncGbpReviewsForSchool } = await import("@/lib/gbp-reviews-sync");
    vi.mocked(syncGbpReviewsForSchool).mockRejectedValueOnce(
      new Error("Google連携設定（ロケーションID）が見つかりません。設定画面をご確認ください。"),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/dashboard/reviews/sync", {
        method: "POST",
        body: JSON.stringify({ schoolId: "school-1" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain("ロケーションID");
    consoleErrorSpy.mockRestore();
  });

  it("returns a server error for unexpected sync failures", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { syncGbpReviewsForSchool } = await import("@/lib/gbp-reviews-sync");
    vi.mocked(syncGbpReviewsForSchool).mockRejectedValueOnce(
      new Error("Google API timeout"),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/dashboard/reviews/sync", {
        method: "POST",
        body: JSON.stringify({ schoolId: "school-1" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ success: false, error: "Google API timeout" });
    consoleErrorSpy.mockRestore();
  });

  it("returns the default message for non-Error sync failures", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { syncGbpReviewsForSchool } = await import("@/lib/gbp-reviews-sync");
    vi.mocked(syncGbpReviewsForSchool).mockRejectedValueOnce("unexpected");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/dashboard/reviews/sync", {
        method: "POST",
        body: JSON.stringify({ schoolId: "school-1" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: "Google口コミ一覧を同期できませんでした。",
    });
    consoleErrorSpy.mockRestore();
  });
});
