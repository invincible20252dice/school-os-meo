import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/supabase-access", () => ({
  resolveRequestAccess: vi.fn(async () => ({
    access: {
      userId: "admin-1",
      role: "admin",
      schoolId: "",
      schoolIds: [],
      name: "Admin",
      email: "admin@example.com",
      status: "active",
      source: "fallback",
    },
    isAuthenticated: false,
  })),
  buildScopedSchoolFilter: vi.fn((_access, schoolId) => ({
    requestedSchoolId: schoolId || "all",
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
        name: "iスクール",
        gbpAccountId: "accounts/1",
        gbpLocationId: "locations/100",
      })),
    },
    schoolSetting: {
      findUnique: vi.fn(async () => ({
        id: "setting-1",
        schoolId: "school-1",
        googleConnected: true,
        googleAccountId: "owner@example.com",
        googleRefreshToken: "refresh-token",
        selectedGbpLocationId: "locations/100",
        googleReviewUrl:
          "https://search.google.com/local/writereview?placeid=ischool",
        updatedAt: new Date("2026-07-30T10:00:00.000Z"),
      })),
    },
  },
}));

describe("GET /api/settings/google", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("returns Google setting with masked refresh token", async () => {
    const response = await GET(
      new Request("https://app.example.com/api/settings/google?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      schoolId: "school-1",
      googleConnected: true,
      googleRefreshToken: "********",
      selectedGbpLocationId: "locations/100",
      googleReviewUrl:
        "https://search.google.com/local/writereview?placeid=ischool",
    });
  });

  it("rejects pending authenticated users", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      access: {
        userId: "manager-1",
        role: "manager",
        schoolId: "school-1",
        schoolIds: ["school-1"],
        name: "Manager",
        email: "manager@example.com",
        status: "pending",
        source: "profiles",
      },
      isAuthenticated: true,
    });

    const response = await GET(
      new Request("https://app.example.com/api/settings/google?schoolId=school-1"),
    );

    expect(response.status).toBe(403);
  });

  it("requires a selected school", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "all",
      effectiveSchoolId: undefined,
      role: "admin",
      canSwitchSchool: true,
    });

    const response = await GET(
      new Request("https://app.example.com/api/settings/google"),
    );

    expect(response.status).toBe(400);
  });

  it("returns not found when school is missing", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.school.findUnique).mockResolvedValueOnce(null);

    const response = await GET(
      new Request("https://app.example.com/api/settings/google?schoolId=school-1"),
    );

    expect(response.status).toBe(404);
  });

  it("returns null setting when a school has not connected Google yet", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce(null);

    const response = await GET(
      new Request("https://app.example.com/api/settings/google?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toBeNull();
  });

  it("serializes empty Google fields for a newly created setting", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce({
      id: "setting-1",
      schoolId: "school-1",
      googleConnected: false,
      googleAccountId: null,
      googleRefreshToken: null,
      selectedGbpLocationId: null,
      googleReviewUrl: null,
      updatedAt: new Date("2026-07-30T10:00:00.000Z"),
    });

    const response = await GET(
      new Request("https://app.example.com/api/settings/google?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      googleAccountId: "",
      googleRefreshToken: "",
      selectedGbpLocationId: "",
      googleReviewUrl: "",
    });
  });

  it("returns a Japanese error when DB lookup fails", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.school.findUnique).mockRejectedValueOnce(new Error("DB down"));

    const response = await GET(
      new Request("https://app.example.com/api/settings/google?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toContain("取得できませんでした");
  });
});
