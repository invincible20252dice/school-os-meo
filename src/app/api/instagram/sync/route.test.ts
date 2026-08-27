import { afterEach, describe, expect, it, vi } from "vitest";

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
    requestedSchoolId: schoolId || "school-1",
    effectiveSchoolId: schoolId || "school-1",
    role: "manager",
    canSwitchSchool: false,
  })),
}));

vi.mock("@/lib/instagram-sync", () => ({
  syncInstagramPosts: vi.fn(async () => ({
    settings: 1,
    fetched: 1,
    posted: 1,
    skipped: 0,
  })),
}));

describe("POST /api/instagram/sync", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("runs real Instagram sync flow", async () => {
    const { syncInstagramPosts } = await import("@/lib/instagram-sync");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/instagram/sync?schoolId=school-1", {
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary.posted).toBe(1);
    expect(syncInstagramPosts).toHaveBeenCalledWith({
      prisma: {},
      schoolId: "school-1",
    });
  });

  it("returns a pending account error before running sync", async () => {
    const access = await import("@/lib/supabase-access");
    const { syncInstagramPosts } = await import("@/lib/instagram-sync");
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
      new Request("https://app.example.com/api/instagram/sync?schoolId=school-1", {
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toBe("アカウント承認後にInstagram同期を実行できます。");
    expect(syncInstagramPosts).not.toHaveBeenCalled();
  });

  it("can run without a requested school when access resolves to an all-school scope", async () => {
    const access = await import("@/lib/supabase-access");
    const { syncInstagramPosts } = await import("@/lib/instagram-sync");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      access: {
        userId: "admin-demo",
        role: "admin",
        schoolId: "",
        schoolIds: [],
        name: "本部",
        email: "",
        status: "active",
        source: "fallback",
      },
      isAuthenticated: false,
    });
    vi.mocked(access.buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "all",
      effectiveSchoolId: undefined,
      role: "admin",
      canSwitchSchool: true,
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/instagram/sync", {
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.access.effectiveSchoolId).toBe("");
    expect(syncInstagramPosts).toHaveBeenCalledWith({
      prisma: {},
      schoolId: undefined,
    });
  });

  it("returns the thrown error message when Instagram sync fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { syncInstagramPosts } = await import("@/lib/instagram-sync");
    vi.mocked(syncInstagramPosts).mockRejectedValueOnce(
      new Error("Instagram token expired"),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/instagram/sync?schoolId=school-1", {
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      ok: false,
      message: "Instagram token expired",
    });
    consoleErrorSpy.mockRestore();
  });

  it("returns the generic message for non-Error failures", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { syncInstagramPosts } = await import("@/lib/instagram-sync");
    vi.mocked(syncInstagramPosts).mockRejectedValueOnce("unknown failure");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/instagram/sync?schoolId=school-1", {
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("Instagram実同期に失敗しました。");
    consoleErrorSpy.mockRestore();
  });
});
