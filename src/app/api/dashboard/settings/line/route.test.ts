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
    },
  },
}));

describe("/api/dashboard/settings/line", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      lineNotifyEnabled: true,
      lineChannelAccessToken: "",
      lineDestinationId: "",
      notifyOnNewReview: true,
      notifyOnLowRating: true,
      updatedAt: "",
    });
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
