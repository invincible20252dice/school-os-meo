import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

vi.mock("@/lib/supabase-access", () => ({
  resolveRequestAccess: vi.fn(async () => ({
    access: {
      userId: "admin-1",
      role: "admin",
      schoolId: "",
      schoolIds: [],
      name: "本部",
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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    school: {
      findUnique: vi.fn(async () => ({
        id: "school-1",
        name: "iスクール予備校",
        status: "ACTIVE",
      })),
    },
    instagramSetting: {
      findUnique: vi.fn(async () => ({
        id: "instagram-setting-1",
        metaAppId: "meta-app-live",
        metaAppSecret: "meta-secret-live",
        instagramAccessToken: "instagram-token",
        instagramBusinessAccountId: "17841400000000000",
        autoSyncEnabled: true,
        lastSyncedAt: new Date("2026-08-22T06:46:00.000Z"),
        updatedAt: new Date("2026-08-22T06:50:00.000Z"),
      })),
      upsert: vi.fn(async ({ create, update }) => ({
        id: "instagram-setting-1",
        schoolId: create?.schoolId || "school-1",
        metaAppId: update.metaAppId,
        metaAppSecret: update.metaAppSecret,
        instagramAccessToken: "instagram-token",
        instagramBusinessAccountId: update.instagramBusinessAccountId,
        autoSyncEnabled: update.autoSyncEnabled,
        lastSyncedAt: null,
        updatedAt: new Date("2026-08-22T07:00:00.000Z"),
      })),
    },
    schoolSetting: {
      findUnique: vi.fn(async () => ({
        instagramConnected: false,
        instagramMetaAppId: "meta-app-school",
        instagramMetaAppSecret: "meta-secret-school",
        updatedAt: new Date("2026-08-22T06:40:00.000Z"),
      })),
      upsert: vi.fn(async ({ create, update }) => ({
        schoolId: create?.schoolId || "school-1",
        instagramConnected: update.instagramConnected,
        instagramMetaAppId: update.instagramMetaAppId,
        instagramMetaAppSecret: update.instagramMetaAppSecret,
        updatedAt: new Date("2026-08-22T07:00:00.000Z"),
      })),
    },
  },
}));

describe("/api/dashboard/settings/instagram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("loads InstagramSetting values with SchoolSetting-compatible keys", async () => {
    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/instagram?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.school).toMatchObject({ id: "school-1", name: "iスクール予備校" });
    expect(body.setting).toMatchObject({
      schoolId: "school-1",
      metaAppId: "meta-app-live",
      instagramMetaAppId: "meta-app-live",
      metaAppSecret: "meta-secret-live",
      instagramMetaAppSecret: "meta-secret-live",
      instagramBusinessAccountId: "17841400000000000",
      instagramAccessToken: "********",
      instagramConnected: true,
      status: "CONNECTED",
    });
  });

  it("returns disconnected defaults when InstagramSetting does not exist yet", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.instagramSetting.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce(null);

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/instagram?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      instagramMetaAppId: "4340844179393244",
      instagramUsername: "アカウント未取得",
      businessAccountLabel: "未取得",
      instagramConnected: false,
      status: "DISCONNECTED",
    });
  });

  it("falls back to SchoolSetting Meta credentials when InstagramSetting is sparse", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.instagramSetting.findUnique).mockResolvedValueOnce({
      id: "instagram-setting-1",
      metaAppId: null,
      metaAppSecret: null,
      instagramAccessToken: "",
      instagramBusinessAccountId: "",
      autoSyncEnabled: false,
      lastSyncedAt: null,
      updatedAt: null,
    });
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce({
      instagramConnected: true,
      instagramMetaAppId: "school-meta-app",
      instagramMetaAppSecret: "school-meta-secret",
      updatedAt: new Date("2026-08-22T06:40:00.000Z"),
    });

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/instagram?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      metaAppId: "school-meta-app",
      metaAppSecret: "school-meta-secret",
      instagramConnected: true,
      instagramAccessToken: "",
      businessAccountStatus: "DISCONNECTED",
    });
  });

  it("saves Meta App credentials to InstagramSetting and mirrors SchoolSetting", async () => {
    const { prisma } = await import("@/lib/prisma");

    const response = await POST(
      new Request("https://app.example.com/api/dashboard/settings/instagram", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          metaAppId: "4340844179393244",
          metaAppSecret: "secret-new",
          instagramBusinessAccountId: "17841400000000000",
          instagramConnected: true,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting.instagramMetaAppSecret).toBe("secret-new");
    expect(prisma.instagramSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "school-1" },
        update: expect.objectContaining({
          metaAppId: "4340844179393244",
          metaAppSecret: "secret-new",
          instagramBusinessAccountId: "17841400000000000",
        }),
      }),
    );
    expect(prisma.schoolSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "school-1" },
        update: expect.objectContaining({
          instagramConnected: true,
          instagramMetaAppId: "4340844179393244",
          instagramMetaAppSecret: "secret-new",
        }),
      }),
    );
  });

  it("accepts SchoolSetting-compatible payload keys and preserves existing business account", async () => {
    const { prisma } = await import("@/lib/prisma");

    const response = await POST(
      new Request("https://app.example.com/api/dashboard/settings/instagram", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          instagramMetaAppId: "school-key-meta",
          instagramMetaAppSecret: "school-key-secret",
          autoSyncEnabled: false,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      instagramMetaAppId: "school-key-meta",
      instagramMetaAppSecret: "school-key-secret",
      instagramBusinessAccountId: "17841400000000000",
    });
    expect(prisma.instagramSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          metaAppId: "school-key-meta",
          metaAppSecret: "school-key-secret",
          instagramAccessToken: "instagram-token",
          instagramBusinessAccountId: "17841400000000000",
          autoSyncEnabled: false,
        }),
        update: expect.objectContaining({
          metaAppId: "school-key-meta",
          metaAppSecret: "school-key-secret",
          instagramBusinessAccountId: "17841400000000000",
          autoSyncEnabled: false,
        }),
      }),
    );
  });

  it("uses defaults for a newly created disconnected Instagram setting", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.instagramSetting.findUnique).mockResolvedValueOnce(null);

    const response = await POST(
      new Request("https://app.example.com/api/dashboard/settings/instagram", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          metaAppSecret: "secret-only",
          instagramConnected: false,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(prisma.instagramSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          metaAppId: "4340844179393244",
          metaAppSecret: "secret-only",
          instagramAccessToken: "",
          instagramBusinessAccountId: "",
          autoSyncEnabled: false,
        }),
        update: expect.objectContaining({
          instagramBusinessAccountId: "",
        }),
      }),
    );
  });

  it("rejects requests without a school id", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "",
      effectiveSchoolId: "",
      role: "admin",
      canSwitchSchool: true,
    });

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/settings/instagram"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toContain("校舎");
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
      new Request(
        "https://app.example.com/api/dashboard/settings/instagram?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toContain("変更できません");
  });

  it("rejects school ids outside the user's scope", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "school-2",
      effectiveSchoolId: "school-1",
      role: "manager",
      canSwitchSchool: false,
    });

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/instagram?schoolId=school-2",
      ),
    );

    expect(response.status).toBe(403);
  });

  it("returns not found when the selected school is inactive", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.school.findUnique).mockResolvedValueOnce({
      id: "school-1",
      name: "iスクール予備校",
      status: "INACTIVE",
    });

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/instagram?schoolId=school-1",
      ),
    );

    expect(response.status).toBe(404);
  });

  it("returns a Japanese server error when DB lookup fails", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.instagramSetting.findUnique).mockRejectedValueOnce(
      new Error("DB down"),
    );

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/instagram?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("Instagram設定を取得できませんでした。");
  });
});
