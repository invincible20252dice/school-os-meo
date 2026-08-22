import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "./route";

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
        id: "setting-1",
        schoolId: "school-1",
        googleConnected: false,
        googleAccountId: "",
        googleRefreshToken: null,
        selectedGbpLocationId: "",
        googleReviewUrl:
          "https://search.google.com/local/writereview?placeid=ischool",
        lineNotifyEnabled: true,
        lineChannelAccessToken: "line-token",
        lineDestinationId: "U123",
        notifyOnNewReview: true,
        notifyOnLowRating: false,
        instagramConnected: false,
        instagramMetaAppId: "meta-app",
        instagramMetaAppSecret: "meta-secret",
        promptSystemRole: "教室長",
        promptReviewTone: "FRIENDLY",
        promptForbiddenWords: ["保証"],
        promptMustKeywords: ["自習室"],
        updatedAt: new Date("2026-07-30T10:00:00.000Z"),
      })),
      upsert: vi.fn(async ({ update }) => ({
        id: "setting-1",
        schoolId: "school-1",
        googleConnected: update.googleConnected,
        googleAccountId: update.googleAccountId,
        googleRefreshToken: "refresh-token",
        selectedGbpLocationId: update.selectedGbpLocationId,
        googleReviewUrl: update.googleReviewUrl,
        lineNotifyEnabled: update.lineNotifyEnabled,
        lineChannelAccessToken: update.lineChannelAccessToken,
        lineDestinationId: update.lineDestinationId,
        notifyOnNewReview: update.notifyOnNewReview,
        notifyOnLowRating: update.notifyOnLowRating,
        instagramConnected: update.instagramConnected,
        instagramMetaAppId: update.instagramMetaAppId,
        instagramMetaAppSecret: update.instagramMetaAppSecret,
        promptSystemRole: update.promptSystemRole,
        promptReviewTone: update.promptReviewTone,
        promptForbiddenWords: update.promptForbiddenWords,
        promptMustKeywords: update.promptMustKeywords,
        updatedAt: new Date("2026-07-30T11:00:00.000Z"),
      })),
    },
    instagramSetting: {
      findUnique: vi.fn(async () => ({
        metaAppId: "meta-live",
        metaAppSecret: "meta-secret-live",
        instagramAccessToken: "instagram-token",
        instagramBusinessAccountId: "1784",
        updatedAt: new Date("2026-07-30T09:00:00.000Z"),
      })),
    },
  },
}));

describe("/api/settings/school", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads DB-backed school setting for active school id", async () => {
    const response = await GET(
      new Request("https://app.example.com/api/settings/school?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.school).toMatchObject({ id: "school-1", name: "iスクール予備校" });
    expect(body.setting).toMatchObject({
      schoolId: "school-1",
      lineChannelAccessToken: "line-token",
      instagramBusinessAccountId: "1784",
      instagramAccessToken: "********",
    });
  });

  it("falls back to Instagram OAuth setting values when SchoolSetting is sparse", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce({
      id: "setting-1",
      schoolId: "school-1",
      googleConnected: false,
      googleAccountId: null,
      googleRefreshToken: "refresh-token",
      selectedGbpLocationId: null,
      googleReviewUrl: null,
      lineNotifyEnabled: false,
      lineChannelAccessToken: null,
      lineDestinationId: null,
      notifyOnNewReview: false,
      notifyOnLowRating: false,
      instagramConnected: false,
      instagramMetaAppId: null,
      instagramMetaAppSecret: null,
      promptSystemRole: null,
      promptReviewTone: "",
      promptForbiddenWords: [],
      promptMustKeywords: [],
      updatedAt: new Date("2026-07-30T10:00:00.000Z"),
    });

    const response = await GET(
      new Request("https://app.example.com/api/settings/school?schoolId=school-1"),
    );
    const body = await response.json();

    expect(body.setting).toMatchObject({
      googleRefreshToken: "********",
      lineNotifyEnabled: false,
      instagramConnected: true,
      instagramMetaAppId: "meta-live",
      promptReviewTone: "FRIENDLY",
    });
  });

  it("keeps Instagram fields empty when neither setting has credentials", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce({
      id: "setting-1",
      schoolId: "school-1",
      googleConnected: false,
      googleAccountId: null,
      googleRefreshToken: null,
      selectedGbpLocationId: null,
      googleReviewUrl: null,
      lineNotifyEnabled: true,
      lineChannelAccessToken: null,
      lineDestinationId: null,
      notifyOnNewReview: true,
      notifyOnLowRating: true,
      instagramConnected: false,
      instagramMetaAppId: null,
      instagramMetaAppSecret: null,
      promptSystemRole: null,
      promptReviewTone: "FRIENDLY",
      promptForbiddenWords: [],
      promptMustKeywords: [],
      updatedAt: new Date("2026-07-30T10:00:00.000Z"),
    });
    vi.mocked(prisma.instagramSetting.findUnique).mockResolvedValueOnce({
      metaAppId: null,
      metaAppSecret: null,
      instagramAccessToken: "",
      instagramBusinessAccountId: "",
      updatedAt: new Date("2026-07-30T09:00:00.000Z"),
    });

    const response = await GET(
      new Request("https://app.example.com/api/settings/school?schoolId=school-1"),
    );
    const body = await response.json();

    expect(body.setting).toMatchObject({
      instagramConnected: false,
      instagramMetaAppId: "",
      instagramMetaAppSecret: "",
      instagramBusinessAccountId: "",
      instagramAccessToken: "",
    });
  });

  it("saves settings with upsert for the active school id", async () => {
    const { prisma } = await import("@/lib/prisma");
    const response = await PATCH(
      new Request("https://app.example.com/api/settings/school", {
        method: "PATCH",
        body: JSON.stringify({
          schoolId: "school-1",
          googleConnected: false,
          selectedGbpLocationId: "",
          googleReviewUrl: " https://g.page/r/CcECT8Glzr4bEBM/review ",
          lineNotifyEnabled: true,
          lineChannelAccessToken: "new-line-token",
          lineDestinationId: "C123",
          notifyOnNewReview: true,
          notifyOnLowRating: true,
          instagramConnected: true,
          instagramMetaAppId: "meta-app",
          instagramMetaAppSecret: "meta-secret",
          promptSystemRole: "本部",
          promptReviewTone: "FORMAL",
          promptForbiddenWords: ["保証"],
          promptMustKeywords: ["定期テスト"],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting.lineChannelAccessToken).toBe("new-line-token");
    expect(body.setting.googleReviewUrl).toBe(
      "https://g.page/r/CcECT8Glzr4bEBM/review",
    );
    expect(prisma.schoolSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "school-1" },
        update: expect.objectContaining({
          googleReviewUrl: "https://g.page/r/CcECT8Glzr4bEBM/review",
          lineDestinationId: "C123",
          promptReviewTone: "FORMAL",
        }),
      }),
    );
  });

  it("rejects attempts to save another manager school", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "school-2",
      effectiveSchoolId: "school-1",
      role: "manager",
      canSwitchSchool: false,
    });

    const response = await PATCH(
      new Request("https://app.example.com/api/settings/school", {
        method: "PATCH",
        body: JSON.stringify({ schoolId: "school-2" }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("requires a selected school id", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "all",
      effectiveSchoolId: undefined,
      role: "admin",
      canSwitchSchool: true,
    });

    const response = await GET(
      new Request("https://app.example.com/api/settings/school"),
    );

    expect(response.status).toBe(400);
  });

  it("treats schoolId=all as missing for writes", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "all",
      effectiveSchoolId: undefined,
      role: "admin",
      canSwitchSchool: true,
    });

    const response = await PATCH(
      new Request("https://app.example.com/api/settings/school", {
        method: "PATCH",
        body: JSON.stringify({
          schoolId: "all",
          googleReviewUrl: "https://g.page/r/CcECT8Glzr4bEBM/review",
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects pending authenticated users", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      access: {
        userId: "pending-1",
        role: "manager",
        schoolId: "school-1",
        schoolIds: ["school-1"],
        name: "未承認",
        email: "pending@example.com",
        status: "pending",
        source: "profiles",
      },
      isAuthenticated: true,
    });

    const response = await GET(
      new Request("https://app.example.com/api/settings/school?schoolId=school-1"),
    );

    expect(response.status).toBe(403);
  });

  it("returns not found when the school is missing or archived", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.school.findUnique).mockResolvedValueOnce(null);

    const missingResponse = await GET(
      new Request("https://app.example.com/api/settings/school?schoolId=school-1"),
    );
    expect(missingResponse.status).toBe(404);

    vi.mocked(prisma.school.findUnique).mockResolvedValueOnce({
      id: "school-1",
      name: "iスクール予備校",
      status: "ARCHIVED",
    });

    const archivedResponse = await GET(
      new Request("https://app.example.com/api/settings/school?schoolId=school-1"),
    );
    expect(archivedResponse.status).toBe(404);
  });

  it("returns an empty setting when DB rows are not created yet", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.instagramSetting.findUnique).mockResolvedValueOnce(null);

    const response = await GET(
      new Request("https://app.example.com/api/settings/school?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      schoolId: "school-1",
      googleConnected: false,
      lineChannelAccessToken: "",
    });
  });

  it("returns a Japanese error when DB save fails", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.upsert).mockRejectedValueOnce(new Error("DB down"));

    const response = await PATCH(
      new Request("https://app.example.com/api/settings/school", {
        method: "PATCH",
        body: JSON.stringify({ schoolId: "school-1" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toContain("保存できませんでした");
  });
});
