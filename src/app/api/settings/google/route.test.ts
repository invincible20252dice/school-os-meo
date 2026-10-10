import { googleAccountFixture, schoolSettingFixture } from "@/test/db-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { RequestAuthenticationError } from "@/lib/request-authentication-error";

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
      source: "profiles",
    },
    isAuthenticated: true,
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
    googleAccount: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async ({ create, update }) => ({
        id: "google-account-1",
        schoolId: "school-1",
        email: update.email || create.email || null,
        refreshToken: null,
        locationId: update.locationId || create.locationId,
        reviewUrl: update.reviewUrl || create.reviewUrl || null,
        status: "CONNECTED",
        updatedAt: update.updatedAt || create.updatedAt,
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

  it("hydrates Google settings from the persisted GoogleAccount record", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.googleAccount.findUnique).mockResolvedValueOnce(googleAccountFixture({
        id: "google-account-1",
        schoolId: "school-1",
        email: "ischool.yobiko@gmail.com",
        refreshToken: "refresh-token",
        locationId: "locations/6467241578381534467",
        reviewUrl: "https://g.page/r/CcECT8Glzr4bEBM/review",
        status: "CONNECTED",
        updatedAt: new Date("2026-07-30T10:00:00.000Z"),
      }));

    const response = await GET(
      new Request("https://app.example.com/api/settings/google?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      googleConnected: true,
      googleAccountId: "ischool.yobiko@gmail.com",
      googleRefreshToken: "********",
      selectedGbpLocationId: "locations/6467241578381534467",
      googleReviewUrl: "https://g.page/r/CcECT8Glzr4bEBM/review",
    });
  });

  it("recognizes a legacy account with a saved location even without status or timestamp", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.googleAccount.findUnique).mockResolvedValueOnce(googleAccountFixture({
      id: "google-account-legacy",
      schoolId: "school-1",
      email: null,
      refreshToken: null,
      locationId: "locations/6467241578381534467",
      reviewUrl: null,
      status: null,
      updatedAt: null,
    }));

    const response = await GET(
      new Request("https://app.example.com/api/settings/google?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      id: "google-account-legacy",
      googleConnected: true,
      googleAccountId: "",
      selectedGbpLocationId: "locations/6467241578381534467",
      googleReviewUrl: "",
      updatedAt: "",
    });
  });

  it("serializes empty Google fields for a newly created setting", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce(schoolSettingFixture({
      id: "setting-1",
      schoolId: "school-1",
      googleConnected: false,
      googleAccountId: null,
      googleRefreshToken: null,
      selectedGbpLocationId: null,
      googleReviewUrl: null,
      updatedAt: new Date("2026-07-30T10:00:00.000Z"),
    }));

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
    expect(prisma.googleAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          locationId: "locations/6467241578381534467",
          status: "CONNECTED",
        }),
        update: expect.objectContaining({
          locationId: "locations/6467241578381534467",
          status: "CONNECTED",
        }),
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


describe("Google settings authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  const requestFor = (method: string, schoolId = "school-1") => new Request(
    `https://app.example.com/api/settings/google?schoolId=${schoolId}&role=admin`,
    { method, headers: { "x-user-role": "admin" }, ...(method === "POST" ? {
      body: JSON.stringify({ schoolId, selectedGbpLocationId: "locations/100" }),
    } : {}) },
  );

  async function assertNoBusinessQueries() {
    const { prisma } = await import("@/lib/prisma");
    for (const operation of [prisma.school.findUnique, prisma.school.update,
      prisma.schoolSetting.findUnique, prisma.schoolSetting.upsert,
      prisma.googleAccount.findUnique, prisma.googleAccount.upsert, prisma.$transaction]) {
      expect(operation).not.toHaveBeenCalled();
    }
  }

  for (const [method, handler] of [["GET", GET], ["POST", POST]] as const) {
    it(`${method} rejects unauthenticated fallback before business queries`, async () => {
      const { resolveRequestAccess } = await import("@/lib/supabase-access");
      const fallback = await resolveRequestAccess(requestFor(method), new URL(requestFor(method).url));
      vi.mocked(resolveRequestAccess).mockResolvedValueOnce({ ...fallback, isAuthenticated: false,
        access: { ...fallback.access, source: "fallback" } });
      expect((await handler(requestFor(method))).status).toBe(401);
      await assertNoBusinessQueries();
    });

    it(`${method} maps invalid/expired sessions to 401`, async () => {
      const { resolveRequestAccess } = await import("@/lib/supabase-access");
      vi.mocked(resolveRequestAccess).mockRejectedValueOnce(new RequestAuthenticationError());
      expect((await handler(requestFor(method))).status).toBe(401);
      await assertNoBusinessQueries();
    });

    it(`${method} keeps auth outages at 500 without logging provider details`, async () => {
      const { resolveRequestAccess } = await import("@/lib/supabase-access");
      vi.mocked(resolveRequestAccess).mockRejectedValueOnce(new Error("private-provider-detail"));
      const response = await handler(requestFor(method));
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("private-provider-detail");
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-provider-detail");
      await assertNoBusinessQueries();
    });

    for (const status of ["pending", "active"] as const) {
      it(`${method} denies ${status === "pending" ? "pending" : "cross-school"} before business queries`, async () => {
        const { resolveRequestAccess, buildScopedSchoolFilter } = await import("@/lib/supabase-access");
        vi.mocked(resolveRequestAccess).mockResolvedValueOnce({ isAuthenticated: true, access: {
          userId: "manager-1", role: "manager", schoolId: "school-1", schoolIds: ["school-1"],
          name: "Manager", email: "manager@example.invalid", status, source: "profiles",
        } });
        // Even a permissive/misresolved scoped filter must not authorize another school.
        const response = await handler(requestFor(method, status === "pending" ? "school-1" : "school-2"));
        expect(response.status).toBe(403);
        expect(resolveRequestAccess).toHaveBeenLastCalledWith(expect.any(Request), expect.any(URL), undefined, { requireActiveProfile: true });
        if (status === "pending") expect(buildScopedSchoolFilter).not.toHaveBeenCalled();
        await assertNoBusinessQueries();
      });
    }

    it(`${method} accepts an active assigned manager and masks stored secrets`, async () => {
      const { resolveRequestAccess } = await import("@/lib/supabase-access");
      vi.mocked(resolveRequestAccess).mockResolvedValueOnce({ isAuthenticated: true, access: {
        userId: "manager-1", role: "manager", schoolId: "school-1", schoolIds: ["school-1"],
        name: "Manager", email: "manager@example.invalid", status: "active", source: "profiles",
      } });
      const response = await handler(requestFor(method));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.setting.googleRefreshToken).toBe("********");
      expect(JSON.stringify(body)).not.toContain("refresh-token");
    });
  }

  it("uses allowlisted Google account reads and minimal unused write result", async () => {
    const { prisma } = await import("@/lib/prisma");
    await GET(requestFor("GET"));
    expect(prisma.googleAccount.findUnique).toHaveBeenCalledWith({ where: { schoolId: "school-1" }, select: {
      id: true, schoolId: true, email: true, refreshToken: true, locationId: true,
      reviewUrl: true, status: true, updatedAt: true,
    } });
    await POST(requestFor("POST"));
    expect(prisma.googleAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({ select: { id: true } }));
  });
});
