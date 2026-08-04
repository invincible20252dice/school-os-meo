import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    schoolSetting: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
    },
  },
}));

vi.mock("@/lib/google-gbp-oauth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google-gbp-oauth")>(
    "@/lib/google-gbp-oauth",
  );

  return {
    ...actual,
    exchangeGoogleCode: vi.fn(async () => ({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
      scope: "",
      tokenType: "Bearer",
    })),
    fetchGoogleAccountEmail: vi.fn(async () => "owner@example.com"),
  };
});

describe("GET /api/auth/callback/google", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    process.env.NEXT_PUBLIC_APP_URL = "";
    process.env.GOOGLE_REDIRECT_URI = "";

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue(null);
  });

  it("stores refresh token and redirects to Google settings", async () => {
    const { prisma } = await import("@/lib/prisma");

    const response = await GET(
      new Request(
        "https://app.example.com/api/auth/callback/google?code=oauth-code&state=school-1",
      ),
    );
    const location = new URL(response.headers.get("location") || "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/dashboard/settings/google");
    expect(location.searchParams.get("google_connected")).toBe("true");
    expect(prisma.schoolSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "school-1" },
        update: expect.objectContaining({
          googleConnected: true,
          googleAccountId: "owner@example.com",
          googleRefreshToken: "refresh-token",
          selectedGbpLocationId: "",
        }),
      }),
    );
  });

  it("redirects with a Japanese error when code or school id is missing", async () => {
    const noCode = await GET(
      new Request("https://app.example.com/api/auth/callback/google?state=school-1"),
    );
    const noCodeLocation = new URL(noCode.headers.get("location") || "");
    expect(noCodeLocation.searchParams.get("google_error")).toContain(
      "codeがありません",
    );

    const noSchool = await GET(
      new Request("https://app.example.com/api/auth/callback/google?code=oauth-code"),
    );
    const noSchoolLocation = new URL(noSchool.headers.get("location") || "");
    expect(noSchoolLocation.searchParams.get("google_error")).toContain(
      "校舎ID",
    );
  });

  it("passes existing refresh token when Google omits a new one", async () => {
    const { prisma } = await import("@/lib/prisma");
    const google = await import("@/lib/google-gbp-oauth");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue({
      googleRefreshToken: "saved-refresh-token",
    });

    await GET(
      new Request(
        "https://app.example.com/api/auth/callback/google?code=oauth-code&state=school-1",
      ),
    );

    expect(google.exchangeGoogleCode).toHaveBeenCalledWith(
      expect.objectContaining({
        previousRefreshToken: "saved-refresh-token",
      }),
    );
  });

  it("stores a generic account name when Google account email cannot be read", async () => {
    const { prisma } = await import("@/lib/prisma");
    const google = await import("@/lib/google-gbp-oauth");
    vi.mocked(google.fetchGoogleAccountEmail).mockResolvedValueOnce("");

    const response = await GET(
      new Request(
        "https://app.example.com/api/auth/callback/google?code=oauth-code&state=school-1",
      ),
    );
    const location = new URL(response.headers.get("location") || "");

    expect(location.searchParams.get("google_connected")).toBe("true");
    expect(prisma.schoolSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          googleAccountId: "Google Business Profile",
        }),
        update: expect.objectContaining({
          googleAccountId: "Google Business Profile",
        }),
      }),
    );
  });

  it("redirects with an error when token exchange fails", async () => {
    const google = await import("@/lib/google-gbp-oauth");
    vi.mocked(google.exchangeGoogleCode).mockRejectedValueOnce(
      new Error("Google OAuth failed"),
    );

    const response = await GET(
      new Request(
        "https://app.example.com/api/auth/callback/google?code=oauth-code&state=school-1",
      ),
    );
    const location = new URL(response.headers.get("location") || "");

    expect(location.pathname).toBe("/dashboard/settings/google");
    expect(location.searchParams.get("schoolId")).toBe("school-1");
    expect(location.searchParams.get("google_error")).toBe(
      "Google OAuth failed",
    );
  });
});
