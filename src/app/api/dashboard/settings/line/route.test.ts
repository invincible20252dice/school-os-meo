import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(async () => []),
    school: {
      findUnique: vi.fn(async () => ({
        id: "school-1",
        name: "iスクール予備校",
        status: "ACTIVE",
      })),
    },
    schoolSetting: {
      findUnique: vi.fn(async () => ({
        lineNotifyEnabled: true,
        lineChannelAccessToken: "line-token",
        lineDestinationId: "U123",
        notifyOnNewReview: true,
        notifyOnLowRating: false,
        updatedAt: new Date("2026-08-22T06:46:00.000Z"),
      })),
      findFirst: vi.fn(async () => null),
      upsert: vi.fn(async ({ create, update }) => ({
        ...create,
        ...update,
        updatedAt: new Date("2026-08-22T06:46:00.000Z"),
      })),
    },
  },
}));

describe("/api/dashboard/settings/line", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([]);
    vi.mocked(prisma.schoolSetting.findFirst).mockResolvedValue(null);
  });

  it("returns canonical and alias keys for saved LINE settings", async () => {
    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/line?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      channelAccessToken: "line-token",
      lineAccessToken: "line-token",
      lineUserId: "U123",
      targetId: "U123",
      groupId: "U123",
      enabled: true,
      notifyOnNewReview: true,
      notifyOnLowRating: false,
    });
    expect(body.setting).toMatchObject({
      schoolId: "school-1",
      lineNotifyEnabled: true,
      lineChannelAccessToken: "line-token",
      channelAccessToken: "line-token",
      lineAccessToken: "line-token",
      lineDestinationId: "U123",
      lineUserId: "U123",
      targetId: "U123",
      groupId: "U123",
      updatedAt: "2026-08-22 06:46",
    });
  });

  it("returns safe defaults when no LINE setting exists", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce(null);

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/line?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      lineNotifyEnabled: false,
      lineChannelAccessToken: "",
      lineDestinationId: "",
      notifyOnNewReview: true,
      notifyOnLowRating: true,
      updatedAt: "",
    });
  });

  it("syncs the latest existing SchoolSetting credentials to the requested school", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.schoolSetting.findFirst).mockResolvedValueOnce({
      lineNotifyEnabled: true,
      lineChannelAccessToken: "latest-school-token",
      lineDestinationId: "latest-school-user",
      notifyOnNewReview: true,
      notifyOnLowRating: false,
      updatedAt: new Date("2026-08-22T06:46:00.000Z"),
    });

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/line?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      syncedFromFallback: true,
      channelAccessToken: "latest-school-token",
      lineUserId: "latest-school-user",
    });
    expect(prisma.schoolSetting.upsert).toHaveBeenCalledWith({
      where: { schoolId: "school-1" },
      create: expect.objectContaining({
        schoolId: "school-1",
        lineChannelAccessToken: "latest-school-token",
        lineDestinationId: "latest-school-user",
      }),
      update: expect.objectContaining({
        lineChannelAccessToken: "latest-school-token",
        lineDestinationId: "latest-school-user",
      }),
    });
  });

  it("hydrates saved values from legacy raw SchoolSetting columns", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce({
      lineNotifyEnabled: true,
      lineChannelAccessToken: null,
      lineDestinationId: null,
      notifyOnNewReview: true,
      notifyOnLowRating: true,
      updatedAt: new Date("2026-08-22T06:46:00.000Z"),
    });
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([
        { column_name: "schoolId" },
        { column_name: "channelAccessToken" },
        { column_name: "lineUserId" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          schoolId: "school-1",
          channelAccessToken: "legacy-school-token",
          lineUserId: "legacy-school-user",
        },
      ])
      .mockResolvedValue([]);

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/line?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      lineChannelAccessToken: "legacy-school-token",
      lineDestinationId: "legacy-school-user",
    });
  });

  it("prefers the dedicated LineSetting table when it contains saved values", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce({
      lineNotifyEnabled: true,
      lineChannelAccessToken: null,
      lineDestinationId: null,
      notifyOnNewReview: false,
      notifyOnLowRating: false,
      updatedAt: new Date("2026-08-22T06:46:00.000Z"),
    });
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { column_name: "schoolId" },
        { column_name: "lineAccessToken" },
        { column_name: "targetId" },
        { column_name: "enabled" },
        { column_name: "notifyOnNewReview" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          schoolId: "school-1",
          lineAccessToken: "line-setting-token",
          targetId: "line-setting-target",
          enabled: true,
          notifyOnNewReview: true,
        },
      ])
      .mockResolvedValue([]);

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/line?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      channelAccessToken: "line-setting-token",
      lineUserId: "line-setting-target",
      enabled: true,
      notifyOnNewReview: true,
      notifyOnLowRating: false,
    });
  });

  it("hydrates values from snake_case line_settings records", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { column_name: "school_id" },
        { column_name: "channel_access_token" },
        { column_name: "line_user_id" },
        { column_name: "updated_at" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          school_id: "school-1",
          channel_access_token: "snake-token",
          line_user_id: "snake-user",
          updated_at: "2026-08-22T06:46:00.000Z",
        },
      ]);

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/line?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      lineChannelAccessToken: "snake-token",
      lineDestinationId: "snake-user",
      updatedAt: "2026-08-22 06:46",
    });
  });

  it("syncs fallback values from global settings tables", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { column_name: "channelAccessToken" },
        { column_name: "lineUserId" },
        { column_name: "updatedAt" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          channelAccessToken: "global-token",
          lineUserId: "global-user",
          updatedAt: new Date("2026-08-22T06:46:00.000Z"),
        },
      ]);

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/line?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      syncedFromFallback: true,
      channelAccessToken: "global-token",
      lineUserId: "global-user",
    });
    expect(prisma.schoolSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "school-1" },
        update: expect.objectContaining({
          lineChannelAccessToken: "global-token",
          lineDestinationId: "global-user",
        }),
      }),
    );
  });

  it("skips raw lookup errors and keeps canonical values", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    vi.mocked(prisma.$queryRawUnsafe)
      .mockRejectedValueOnce(new Error("information_schema unavailable"))
      .mockResolvedValue([]);

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/line?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      lineChannelAccessToken: "line-token",
      lineDestinationId: "U123",
    });
  });

  it("skips fallback lookup errors when no reusable setting exists", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("fallback lookup down"))
      .mockResolvedValue([]);

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/line?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      syncedFromFallback: false,
      channelAccessToken: "",
      lineUserId: "",
    });
    expect(prisma.schoolSetting.upsert).not.toHaveBeenCalled();
  });

  it("keeps explicit disabled notification flags from the database", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce({
      lineNotifyEnabled: false,
      lineChannelAccessToken: "",
      lineDestinationId: "",
      notifyOnNewReview: false,
      notifyOnLowRating: false,
      updatedAt: new Date("2026-08-22T06:46:00.000Z"),
    });

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/line?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      lineNotifyEnabled: false,
      enabled: false,
      notifyOnNewReview: false,
      notifyOnLowRating: false,
    });
  });

  it("rejects pending authenticated users", async () => {
    const { resolveRequestAccess } = await import("@/lib/supabase-access");
    vi.mocked(resolveRequestAccess).mockResolvedValueOnce({
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

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/line?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      message: "この校舎のLINE通知設定は表示できません。",
    });
  });

  it("requires a concrete school id for all-school requests", async () => {
    const { buildScopedSchoolFilter } = await import("@/lib/supabase-access");
    vi.mocked(buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "all",
      effectiveSchoolId: undefined,
      role: "admin",
      canSwitchSchool: true,
    });

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/settings/line"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      message: "LINE通知設定を取得する校舎を選択してください。",
    });
  });

  it("rejects manager access to another school", async () => {
    const { buildScopedSchoolFilter } = await import("@/lib/supabase-access");
    vi.mocked(buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "school-2",
      effectiveSchoolId: "school-1",
      role: "manager",
      canSwitchSchool: false,
    });

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/line?schoolId=school-2",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      message: "この校舎のLINE通知設定は表示できません。",
    });
  });

  it("returns a Japanese 404 when the school is inactive", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.school.findUnique).mockResolvedValueOnce({
      id: "school-1",
      name: "停止校舎",
      status: "INACTIVE",
    });

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/line?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      message: "対象校舎が見つかりませんでした。",
    });
  });

  it("returns a Japanese 500 when DB lookup fails", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    vi.mocked(prisma.schoolSetting.findUnique).mockRejectedValueOnce(
      new Error("DB down"),
    );

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/line?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      message: "LINE通知設定を取得できませんでした。",
    });
  });
});
