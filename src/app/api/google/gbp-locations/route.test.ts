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

vi.mock("@/lib/google-gbp-oauth", () => ({
  GoogleBusinessProfileApiError: class GoogleBusinessProfileApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly responseBody = "",
    ) {
      super(message);
      this.name = "GoogleBusinessProfileApiError";
    }
  },
  refreshGoogleAccessToken: vi.fn(async () => "access-token"),
  fetchGbpAccounts: vi.fn(async () => [
    { name: "accounts/1", accountName: "塾MEO", type: "" },
  ]),
  fetchGbpLocationsForAccounts: vi.fn(async () => [
    {
      accountName: "accounts/1",
      accountDisplayName: "塾MEO",
      name: "locations/100",
      title: "iスクール 本校",
      locationId: "100",
      address: "東京都千代田区",
      placeId: "place-100",
    },
  ]),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    schoolSetting: {
      findUnique: vi.fn(async () => ({
        googleRefreshToken: "refresh-token",
        selectedGbpLocationId: "locations/100",
      })),
    },
    googleAccount: {
      findUnique: vi.fn(async () => null),
    },
  },
}));

describe("GET /api/google/gbp-locations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("returns GBP accounts and locations for connected school", async () => {
    const response = await GET(
      new Request(
        "https://app.example.com/api/google/gbp-locations?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.accounts).toHaveLength(1);
    expect(body.locations[0]).toMatchObject({
      name: "locations/100",
      title: "iスクール 本校",
    });
    expect(body.selectedGbpLocationId).toBe("locations/100");
  });

  it("returns the known location when no Google token is available", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce(null);

    const response = await GET(
      new Request(
        "https://app.example.com/api/google/gbp-locations?schoolId=school-1",
      ),
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      selectedGbpLocationId: "locations/6467241578381534467",
      source: "saved-location",
    });
    expect(body.locations[0]).toMatchObject({
      name: "locations/6467241578381534467",
      title: "iスクール予備校 本校",
      storeCode: "ischool_main",
    });
  });

  it("includes and selects the known location when none is saved", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce({
      googleRefreshToken: "refresh-token",
      selectedGbpLocationId: null,
    });

    const response = await GET(
      new Request(
        "https://app.example.com/api/google/gbp-locations?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.selectedGbpLocationId).toBe("locations/6467241578381534467");
    expect(
      body.locations.map((location: { name: string }) => location.name),
    ).toEqual(["locations/6467241578381534467", "locations/100"]);
  });

  it("uses the location and token from GoogleAccount when SchoolSetting is empty", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.googleAccount.findUnique).mockResolvedValueOnce({
      refreshToken: "account-refresh-token",
      locationId: "6467241578381534467",
    });

    const response = await GET(
      new Request(
        "https://app.example.com/api/google/gbp-locations?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.selectedGbpLocationId).toBe("locations/6467241578381534467");
    expect(body.source).toBe("google-api");
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
      new Request("https://app.example.com/api/google/gbp-locations"),
    );

    expect(response.status).toBe(400);
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
      new Request(
        "https://app.example.com/api/google/gbp-locations?schoolId=school-1",
      ),
    );

    expect(response.status).toBe(403);
  });

  it("returns the saved location when Google API fetch fails", async () => {
    const google = await import("@/lib/google-gbp-oauth");
    vi.mocked(google.fetchGbpAccounts).mockRejectedValueOnce(
      new Error("Google API down"),
    );

    const response = await GET(
      new Request(
        "https://app.example.com/api/google/gbp-locations?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      source: "saved-location",
      selectedGbpLocationId: "locations/100",
    });
    expect(body.locations[0].name).toBe("locations/100");
  });

  it("returns the saved location when the GBP accounts API rejects authorization", async () => {
    const google = await import("@/lib/google-gbp-oauth");
    vi.mocked(google.fetchGbpAccounts).mockRejectedValueOnce(
      new google.GoogleBusinessProfileApiError(
        "Google Business Profile API failed: 403",
        403,
        '{"error":"PERMISSION_DENIED"}',
      ),
    );

    const response = await GET(
      new Request(
        "https://app.example.com/api/google/gbp-locations?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      source: "saved-location",
      selectedGbpLocationId: "locations/100",
    });
  });

  it("normalizes a fully qualified saved location resource", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce({
      googleRefreshToken: "",
      selectedGbpLocationId: "accounts/1/locations/6467241578381534467",
    });

    const response = await GET(
      new Request(
        "https://app.example.com/api/google/gbp-locations?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(body.selectedGbpLocationId).toBe("locations/6467241578381534467");
    expect(body.locations[0].locationId).toBe("6467241578381534467");
  });

  it("returns the known location when the database lookup fails", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.findUnique).mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    const response = await GET(
      new Request(
        "https://app.example.com/api/google/gbp-locations?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      source: "known-location",
      selectedGbpLocationId: "locations/6467241578381534467",
    });
  });
});
