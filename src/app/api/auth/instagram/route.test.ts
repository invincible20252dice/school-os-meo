import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    schoolSetting: {
      findUnique: vi.fn(async () => null),
    },
    instagramSetting: {
      findUnique: vi.fn(async () => null),
    },
  },
}));

const originalEnv = process.env;

describe("GET /api/auth/instagram", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env = {
      ...originalEnv,
      META_APP_ID: "",
      NGROK_URL: "",
      NEXT_PUBLIC_APP_URL: "",
      INSTAGRAM_REDIRECT_URI: "",
    };

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.instagramSetting.findUnique).mockResolvedValue(null);
  });

  it("redirects to Meta OAuth", async () => {
    const response = await GET(
      new Request(
        "https://example.ngrok-free.dev/api/auth/instagram?metaAppId=meta-app-id&schoolId=school-1",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "https://www.facebook.com/v21.0/dialog/oauth",
    );
    expect(response.headers.get("location")).toContain("client_id=meta-app-id");
    expect(new URL(response.headers.get("location") || "").searchParams.get("state")).toBe(
      "school-1",
    );
  });

  it("uses forwarded host for the Meta redirect uri", async () => {
    const response = await GET(
      new Request(
        "https://localhost:3021/api/auth/instagram?metaAppId=meta-app-id&schoolId=school-1",
        {
          headers: {
            "x-forwarded-host": "example.ngrok-free.dev",
            "x-forwarded-proto": "https",
          },
        },
      ),
    );
    const location = new URL(response.headers.get("location") || "");

    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://example.ngrok-free.dev/api/auth/callback/instagram",
    );
  });

  it("forces a secure redirect uri when OAuth starts from local HTTP", async () => {
    const response = await GET(
      new Request(
        "http://127.0.0.1:3030/api/auth/instagram?metaAppId=meta-app-id&schoolId=school-1",
      ),
    );
    const location = new URL(response.headers.get("location") || "");

    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://buffing-sedate-doormat.ngrok-free.dev/api/auth/callback/instagram",
    );
  });

  it("uses saved SchoolSetting Meta App ID when the query value is missing", async () => {
    const { prisma } = await import("@/lib/prisma");
    process.env = { ...process.env, DATABASE_URL: "postgresql://example" };
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue({
      instagramMetaAppId: "saved-school-app-id",
    });

    const response = await GET(
      new Request(
        "https://example.ngrok-free.dev/api/auth/instagram?schoolId=school-1",
      ),
    );
    const location = new URL(response.headers.get("location") || "");

    expect(location.searchParams.get("client_id")).toBe("saved-school-app-id");
  });

  it("uses the fixed fallback App ID when env and DB settings are missing", async () => {
    const response = await GET(
      new Request(
        "https://example.ngrok-free.dev/api/auth/instagram?schoolId=school-1",
      ),
    );
    const location = new URL(response.headers.get("location") || "");

    expect(location.searchParams.get("client_id")).toBe("4340844179393244");
  });

  it("still redirects with the fixed fallback App ID when DATABASE_URL is not configured", async () => {
    const { prisma } = await import("@/lib/prisma");

    const response = await GET(
      new Request(
        "https://example.ngrok-free.dev/api/auth/instagram?schoolId=school-1",
      ),
    );
    const location = new URL(response.headers.get("location") || "");

    expect(response.status).toBe(307);
    expect(location.searchParams.get("client_id")).toBe("4340844179393244");
    expect(prisma.schoolSetting.findUnique).not.toHaveBeenCalled();
    expect(prisma.instagramSetting.findUnique).not.toHaveBeenCalled();
  });

  it("rejects OAuth start when school id is missing", async () => {
    const response = await GET(
      new Request("https://example.ngrok-free.dev/api/auth/instagram"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toContain("校舎");
  });

  it("still redirects with the fixed fallback App ID when DB lookup fails", async () => {
    const { prisma } = await import("@/lib/prisma");
    process.env = { ...process.env, DATABASE_URL: "postgresql://example" };
    vi.mocked(prisma.schoolSetting.findUnique).mockRejectedValue(
      new Error("DB lookup failed"),
    );

    const response = await GET(
      new Request(
        "https://example.ngrok-free.dev/api/auth/instagram?schoolId=school-1",
      ),
    );
    const location = new URL(response.headers.get("location") || "");

    expect(response.status).toBe(307);
    expect(location.searchParams.get("client_id")).toBe("4340844179393244");
  });

  it("uses env Meta App ID when no query or DB App ID is available", async () => {
    process.env = {
      ...process.env,
      META_APP_ID: "env-meta-app-id",
      DATABASE_URL: "",
    };

    const response = await GET(
      new Request(
        "https://example.ngrok-free.dev/api/auth/instagram?schoolId=school-1",
      ),
    );
    const location = new URL(response.headers.get("location") || "");

    expect(location.searchParams.get("client_id")).toBe("env-meta-app-id");
  });
});
