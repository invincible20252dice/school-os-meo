import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

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
      update: vi.fn(async () => ({
        id: "school-1",
        name: "iスクール",
        gbpAccountId: "accounts/1",
        gbpLocationId: "locations/100",
      })),
    },
    schoolSetting: {
      upsert: vi.fn(async () => ({
        id: "setting-1",
        schoolId: "school-1",
        googleConnected: true,
        googleAccountId: "accounts/1",
        selectedGbpLocationId: "locations/100",
        updatedAt: new Date("2026-07-30T10:00:00.000Z"),
      })),
    },
  },
}));

describe("POST /api/google/gbp-location-selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("saves selected GBP location to School and SchoolSetting", async () => {
    const { prisma } = await import("@/lib/prisma");

    const response = await POST(
      new Request("https://app.example.com/api/google/gbp-location-selection", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          accountName: "accounts/1",
          locationName: "locations/100",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.school.gbpLocationId).toBe("locations/100");
    expect(prisma.school.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "school-1" },
        data: expect.objectContaining({
          gbpAccountId: "accounts/1",
          gbpLocationId: "locations/100",
        }),
      }),
    );
  });

  it("validates required payload fields", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/google/gbp-location-selection", {
        method: "POST",
        body: JSON.stringify({ schoolId: "school-1" }),
      }),
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

    const response = await POST(
      new Request("https://app.example.com/api/google/gbp-location-selection", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          accountName: "accounts/1",
          locationName: "locations/100",
        }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("rejects managers changing another school", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "school-2",
      effectiveSchoolId: "school-1",
      role: "manager",
      canSwitchSchool: false,
    });

    const response = await POST(
      new Request("https://app.example.com/api/google/gbp-location-selection", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-2",
          accountName: "accounts/1",
          locationName: "locations/100",
        }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("returns a Japanese error when persistence fails", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error("DB down"));

    const response = await POST(
      new Request("https://app.example.com/api/google/gbp-location-selection", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          accountName: "accounts/1",
          locationName: "locations/100",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toContain("保存できませんでした");
  });
});
