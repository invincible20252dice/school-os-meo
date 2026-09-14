import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

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
    $transaction: vi.fn(async (operations) => Promise.all(operations)),
    school: {
      findUnique: vi.fn(async () => ({
        id: "school-1",
        name: "iスクール",
        gbpAccountId: "accounts/1",
        gbpLocationId: "locations/100",
      })),
      update: vi.fn(async ({ data }) => ({
        id: "school-1",
        name: "iスクール",
        gbpAccountId: data.gbpAccountId || "accounts/1",
        gbpLocationId: data.gbpLocationId,
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
      upsert: vi.fn(async ({ create, update }) => ({
        id: "setting-1",
        schoolId: "school-1",
        googleConnected: true,
        googleAccountId:
          update.googleAccountId || create.googleAccountId || "owner@example.com",
        googleRefreshToken: "refresh-token",
        selectedGbpLocationId:
          update.selectedGbpLocationId || create.selectedGbpLocationId,
        googleReviewUrl:
          update.googleReviewUrl === null
            ? null
            : update.googleReviewUrl || create.googleReviewUrl || null,
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

  it("returns an empty setting when a school has not connected Google yet", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce(null);

    const response = await GET(
      new Request("https://app.example.com/api/settings/google?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      schoolId: "school-1",
      googleConnected: false,
      googleAccountId: "",
      selectedGbpLocationId: "",
      googleReviewUrl: "",
    });
  });

  it("keeps loading saved GBP location when the review URL column is not available yet", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique)
      .mockRejectedValueOnce(new Error("P2022: The column `googleReviewUrl` does not exist"))
      .mockResolvedValueOnce({
        id: "setting-1",
        schoolId: "school-1",
        googleConnected: true,
        googleAccountId: "owner@example.com",
        googleRefreshToken: "refresh-token",
        selectedGbpLocationId: "locations/100",
        updatedAt: new Date("2026-07-30T10:00:00.000Z"),
      } as never);

    const response = await GET(
      new Request("https://app.example.com/api/settings/google?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      googleAccountId: "owner@example.com",
      selectedGbpLocationId: "locations/100",
      googleReviewUrl: "",
    });
  });

  it("keeps loading saved GBP location when Prisma reports P2022 as an object", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique)
      .mockRejectedValueOnce({
        code: "P2022",
        message: "The column SchoolSetting.googleReviewUrl does not exist",
      } as never)
      .mockResolvedValueOnce({
        id: "setting-legacy",
        schoolId: "school-1",
        googleConnected: true,
        googleAccountId: "owner@example.com",
        googleRefreshToken: null,
        selectedGbpLocationId: "locations/200",
        updatedAt: new Date("2026-07-30T10:00:00.000Z"),
      } as never);

    const response = await GET(
      new Request("https://app.example.com/api/settings/google?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      id: "setting-legacy",
      googleAccountId: "owner@example.com",
      googleRefreshToken: "",
      selectedGbpLocationId: "locations/200",
      googleReviewUrl: "",
    });
  });

  it("keeps loading saved GBP location when Prisma reports an unknown column message object", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique)
      .mockRejectedValueOnce({
        code: "UNKNOWN",
        message: "Unknown column SchoolSetting.googleReviewUrl",
      } as never)
      .mockResolvedValueOnce({
        id: "setting-legacy",
        schoolId: "school-1",
        googleConnected: true,
        googleAccountId: "owner@example.com",
        googleRefreshToken: "refresh-token",
        selectedGbpLocationId: "locations/300",
        updatedAt: new Date("2026-07-30T10:00:00.000Z"),
      } as never);

    const response = await GET(
      new Request("https://app.example.com/api/settings/google?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      googleRefreshToken: "********",
      selectedGbpLocationId: "locations/300",
      googleReviewUrl: "",
    });
  });

  it("keeps loading saved GBP location when Prisma reports P2022 as text", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique)
      .mockRejectedValueOnce("P2022: SchoolSetting.googleReviewUrl missing")
      .mockResolvedValueOnce({
        id: "setting-legacy",
        schoolId: "school-1",
        googleConnected: true,
        googleAccountId: "owner@example.com",
        googleRefreshToken: null,
        selectedGbpLocationId: "locations/400",
        updatedAt: new Date("2026-07-30T10:00:00.000Z"),
      } as never);

    const response = await GET(
      new Request("https://app.example.com/api/settings/google?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting.selectedGbpLocationId).toBe("locations/400");
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

  it("normalizes and persists a manually entered GBP location id", async () => {
    const { prisma } = await import("@/lib/prisma");
    const response = await POST(
      new Request("https://app.example.com/api/settings/google", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          selectedGbpLocationId: " 6467241578381534467 ",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.account).toMatchObject({
      locationId: "locations/6467241578381534467",
      status: "CONNECTED",
    });
    expect(prisma.school.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { gbpLocationId: "locations/6467241578381534467" },
      }),
    );
    expect(prisma.schoolSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          googleAccountId: null,
          selectedGbpLocationId: "locations/6467241578381534467",
        }),
        update: {
          googleConnected: true,
          selectedGbpLocationId: "locations/6467241578381534467",
        },
      }),
    );
  });

  it("accepts compatibility payload keys and saves a complete review URL", async () => {
    const { prisma } = await import("@/lib/prisma");
    const response = await POST(
      new Request("https://app.example.com/api/settings/google", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          locationId: "accounts/123/locations/456/",
          googleAccountId: "accounts/123",
          reviewUrl: "https://g.page/r/CcECT8Glzr4bEBM/review",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(prisma.school.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          gbpAccountId: "accounts/123",
          gbpLocationId: "locations/456",
        },
      }),
    );
    expect(prisma.schoolSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          googleAccountId: "accounts/123",
          googleReviewUrl: "https://g.page/r/CcECT8Glzr4bEBM/review",
        }),
      }),
    );
  });

  it("validates the school, location, and review URL", async () => {
    const missingLocation = await POST(
      new Request("https://app.example.com/api/settings/google", {
        method: "POST",
        body: JSON.stringify({ schoolId: "school-1" }),
      }),
    );
    const invalidReviewUrl = await POST(
      new Request("https://app.example.com/api/settings/google", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          locationName: "locations/100",
          googleReviewUrl: "http://example.com/review",
        }),
      }),
    );

    expect(missingLocation.status).toBe(400);
    expect(invalidReviewUrl.status).toBe(400);
  });

  it("rejects a manager attempting to update another school", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "school-2",
      effectiveSchoolId: "school-1",
      role: "manager",
      canSwitchSchool: false,
    });

    const response = await POST(
      new Request("https://app.example.com/api/settings/google", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-2",
          locationName: "locations/100",
        }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("rejects pending users and reports persistence errors", async () => {
    const access = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      access: {
        userId: "pending-1",
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
    const pendingResponse = await POST(
      new Request("https://app.example.com/api/settings/google", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          locationName: "locations/100",
        }),
      }),
    );

    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error("DB down"));
    const failedResponse = await POST(
      new Request("https://app.example.com/api/settings/google", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          locationName: "locations/100",
        }),
      }),
    );

    expect(pendingResponse.status).toBe(403);
    expect(failedResponse.status).toBe(500);
  });

  it("exposes GET and POST through the dashboard settings path", async () => {
    const dashboardRoute = await import("../../dashboard/settings/google/route");

    expect(dashboardRoute.GET).toBe(GET);
    expect(dashboardRoute.POST).toBe(POST);
  });
});
