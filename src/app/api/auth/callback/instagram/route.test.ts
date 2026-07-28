import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    instagramSetting: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
    },
    schoolSetting: {
      findUnique: vi.fn(async () => ({
        instagramMetaAppId: "saved-meta-app-id",
        instagramMetaAppSecret: "saved-meta-secret",
      })),
      updateMany: vi.fn(async () => ({})),
    },
  },
}));

vi.mock("@/lib/instagram-oauth", () => ({
  DEFAULT_META_APP_ID: "4340844179393244",
  DEFAULT_META_APP_SECRET: "REPLACE_WITH_META_APP_SECRET",
  getForwardedOrigin: vi.fn(() => undefined),
  getInstagramRedirectUri: vi.fn(() => "https://example.ngrok-free.dev/api/auth/callback/instagram"),
  exchangeInstagramCode: vi.fn(async () => "instagram-access-token"),
  fetchInstagramBusinessAccountId: vi.fn(async () => "ig-business-id"),
}));

const originalEnv = process.env;

describe("GET /api/auth/callback/instagram", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, META_APP_ID: "", META_APP_SECRET: "" };

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.instagramSetting.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue({
      instagramMetaAppId: "saved-meta-app-id",
      instagramMetaAppSecret: "saved-meta-secret",
    });
  });

  it("saves Instagram token and redirects to settings", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { exchangeInstagramCode } = await import("@/lib/instagram-oauth");
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "https://example.ngrok-free.dev/api/auth/callback/instagram?code=oauth-code&state=school-1",
      ),
    );

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") || "");

    expect(location.pathname).toBe("/dashboard/settings/instagram");
    expect(location.searchParams.get("instagram_connected")).toBe("true");
    expect(exchangeInstagramCode).toHaveBeenCalledWith(
      expect.objectContaining({
        metaAppId: "4340844179393244",
        metaAppSecret: "saved-meta-secret",
      }),
    );
    expect(prisma.instagramSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "school-1" },
        create: expect.objectContaining({
          instagramAccessToken: "instagram-access-token",
          instagramBusinessAccountId: "ig-business-id",
          metaAppId: "4340844179393244",
          metaAppSecret: "saved-meta-secret",
        }),
      }),
    );
  });

  it("uses the fixed App ID and saved DB secret before env secrets", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { exchangeInstagramCode } = await import("@/lib/instagram-oauth");
    const { GET } = await import("./route");
    process.env = {
      ...process.env,
      META_APP_ID: "env-app-id",
      META_APP_SECRET: "env-secret",
    };
    vi.mocked(prisma.instagramSetting.findUnique).mockResolvedValue({
      metaAppId: "instagram-setting-app-id",
      metaAppSecret: "instagram-setting-secret",
    });
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue({
      instagramMetaAppId: "school-setting-app-id",
      instagramMetaAppSecret: "school-setting-secret",
    });

    await GET(
      new Request(
        "https://example.ngrok-free.dev/api/auth/callback/instagram?code=oauth-code&state=school-1",
      ),
    );

    expect(exchangeInstagramCode).toHaveBeenCalledWith(
      expect.objectContaining({
        metaAppId: "4340844179393244",
        metaAppSecret: "school-setting-secret",
      }),
    );
  });

  it("falls back to env secret when DB secrets are missing", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { exchangeInstagramCode } = await import("@/lib/instagram-oauth");
    const { GET } = await import("./route");
    process.env = {
      ...process.env,
      META_APP_ID: "env-app-id",
      META_APP_SECRET: "env-secret",
    };
    vi.mocked(prisma.instagramSetting.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue(null);

    await GET(
      new Request(
        "https://example.ngrok-free.dev/api/auth/callback/instagram?code=oauth-code&state=school-1",
      ),
    );

    expect(exchangeInstagramCode).toHaveBeenCalledWith(
      expect.objectContaining({
        metaAppId: "4340844179393244",
        metaAppSecret: "env-secret",
      }),
    );
  });

  it("uses NEXT_PUBLIC_META_APP_SECRET when server secret and DB secrets are missing", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { exchangeInstagramCode } = await import("@/lib/instagram-oauth");
    const { GET } = await import("./route");
    process.env = {
      ...process.env,
      META_APP_ID: "ignored-env-app-id",
      META_APP_SECRET: "",
      NEXT_PUBLIC_META_APP_SECRET: "public-env-secret",
    };
    vi.mocked(prisma.instagramSetting.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue(null);

    await GET(
      new Request(
        "https://example.ngrok-free.dev/api/auth/callback/instagram?code=oauth-code&state=school-1",
      ),
    );

    expect(exchangeInstagramCode).toHaveBeenCalledWith(
      expect.objectContaining({
        metaAppId: "4340844179393244",
        metaAppSecret: "public-env-secret",
      }),
    );
  });

  it("falls back to the fixed Meta App ID when DB and env app IDs are missing", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { exchangeInstagramCode } = await import("@/lib/instagram-oauth");
    const { GET } = await import("./route");
    process.env = {
      ...process.env,
      META_APP_ID: "",
      META_APP_SECRET: "env-secret",
    };
    vi.mocked(prisma.instagramSetting.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue(null);

    await GET(
      new Request(
        "https://example.ngrok-free.dev/api/auth/callback/instagram?code=oauth-code&state=school-1",
      ),
    );

    expect(exchangeInstagramCode).toHaveBeenCalledWith(
      expect.objectContaining({
        metaAppId: "4340844179393244",
        metaAppSecret: "env-secret",
      }),
    );
  });

  it("falls back to the hardcoded Meta App Secret when env and DB secrets are missing", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { exchangeInstagramCode } = await import("@/lib/instagram-oauth");
    const { GET } = await import("./route");
    vi.mocked(prisma.instagramSetting.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue(null);

    const response = await GET(
      new Request(
        "https://example.ngrok-free.dev/api/auth/callback/instagram?code=oauth-code&state=school-1",
      ),
    );
    const location = new URL(response.headers.get("location") || "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/dashboard/settings/instagram");
    expect(location.searchParams.get("instagram_connected")).toBe("true");
    expect(exchangeInstagramCode).toHaveBeenCalledWith(
      expect.objectContaining({
        metaAppId: "4340844179393244",
        metaAppSecret: "REPLACE_WITH_META_APP_SECRET",
      }),
    );
  });

  it("requires state to identify the school before reading DB settings", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "https://example.ngrok-free.dev/api/auth/callback/instagram?code=oauth-code",
      ),
    );
    const location = new URL(response.headers.get("location") || "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/dashboard/settings/instagram");
    expect(location.searchParams.get("instagram_error")).toContain("校舎ID");
    expect(prisma.schoolSetting.findUnique).not.toHaveBeenCalled();
  });

  it("requires OAuth code before reading DB settings", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "https://example.ngrok-free.dev/api/auth/callback/instagram?state=school-1",
      ),
    );
    const location = new URL(response.headers.get("location") || "");

    expect(response.status).toBe(307);
    expect(location.searchParams.get("instagram_error")).toBe(
      "Instagram OAuth codeがありません。",
    );
    expect(prisma.schoolSetting.findUnique).not.toHaveBeenCalled();
  });

  it("redirects with an OAuth error message when token exchange fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const oauth = await import("@/lib/instagram-oauth");
    vi.mocked(oauth.exchangeInstagramCode).mockRejectedValueOnce(
      new Error("OAuth exchange failed"),
    );
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "https://example.ngrok-free.dev/api/auth/callback/instagram?code=oauth-code&state=school-1",
      ),
    );
    const location = new URL(response.headers.get("location") || "");

    expect(response.status).toBe(307);
    expect(location.searchParams.get("instagram_error")).toBe(
      "OAuth exchange failed",
    );
    consoleErrorSpy.mockRestore();
  });

  it("redirects with a generic OAuth error for non-Error failures", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const oauth = await import("@/lib/instagram-oauth");
    vi.mocked(oauth.exchangeInstagramCode).mockRejectedValueOnce(
      "unknown failure",
    );
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "https://example.ngrok-free.dev/api/auth/callback/instagram?code=oauth-code&state=school-1",
      ),
    );
    const location = new URL(response.headers.get("location") || "");

    expect(response.status).toBe(307);
    expect(location.searchParams.get("instagram_error")).toBe(
      "Instagram連携の保存に失敗しました。",
    );
    consoleErrorSpy.mockRestore();
  });
});
