import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";

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
        status: "ACTIVE",
      })),
    },
    schoolSetting: {
      upsert: vi.fn(async ({ create, update }) => ({
        id: "setting-1",
        schoolId: "school-1",
        googleReviewUrl: update.googleReviewUrl ?? create.googleReviewUrl,
        updatedAt: new Date("2026-08-20T08:00:00.000Z"),
      })),
    },
  },
}));

describe("PATCH /api/settings/google-review-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves only the Google review URL for the active school", async () => {
    const { prisma } = await import("@/lib/prisma");
    const response = await PATCH(
      new Request("https://app.example.com/api/settings/google-review-url", {
        method: "PATCH",
        body: JSON.stringify({
          schoolId: "school-1",
          googleReviewUrl:
            " https://search.google.com/local/writereview?placeid=ischool ",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting.googleReviewUrl).toBe(
      "https://search.google.com/local/writereview?placeid=ischool",
    );
    expect(prisma.schoolSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "school-1" },
        update: {
          googleReviewUrl:
            "https://search.google.com/local/writereview?placeid=ischool",
        },
      }),
    );
  });

  it("does not require LINE settings when creating the row", async () => {
    const { prisma } = await import("@/lib/prisma");
    await PATCH(
      new Request("https://app.example.com/api/settings/google-review-url", {
        method: "PATCH",
        body: JSON.stringify({
          schoolId: "school-1",
          googleReviewUrl:
            "https://search.google.com/local/writereview?placeid=ischool",
        }),
      }),
    );

    expect(prisma.schoolSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          schoolId: "school-1",
          promptForbiddenWords: [],
          promptMustKeywords: [],
        }),
      }),
    );
  });

  it("rejects invalid URLs without saving", async () => {
    const { prisma } = await import("@/lib/prisma");
    const response = await PATCH(
      new Request("https://app.example.com/api/settings/google-review-url", {
        method: "PATCH",
        body: JSON.stringify({
          schoolId: "school-1",
          googleReviewUrl: "javascript:alert(1)",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.message).toContain("形式");
    expect(prisma.schoolSetting.upsert).not.toHaveBeenCalled();
  });

  it("clears the saved URL when an empty value is submitted", async () => {
    const { prisma } = await import("@/lib/prisma");
    const response = await PATCH(
      new Request("https://app.example.com/api/settings/google-review-url", {
        method: "PATCH",
        body: JSON.stringify({
          schoolId: "school-1",
          googleReviewUrl: " ",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting.googleReviewUrl).toBe("");
    expect(prisma.schoolSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { googleReviewUrl: "" },
      }),
    );
  });

  it("requires a selected school id", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "all",
      effectiveSchoolId: undefined,
      role: "admin",
      canSwitchSchool: true,
    });

    const response = await PATCH(
      new Request("https://app.example.com/api/settings/google-review-url", {
        method: "PATCH",
        body: JSON.stringify({ googleReviewUrl: "" }),
      }),
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

    const response = await PATCH(
      new Request("https://app.example.com/api/settings/google-review-url", {
        method: "PATCH",
        body: JSON.stringify({
          schoolId: "school-1",
          googleReviewUrl:
            "https://search.google.com/local/writereview?placeid=ischool",
        }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("returns not found when the school is missing or archived", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.school.findUnique).mockResolvedValueOnce(null);

    const missingResponse = await PATCH(
      new Request("https://app.example.com/api/settings/google-review-url", {
        method: "PATCH",
        body: JSON.stringify({ schoolId: "school-1", googleReviewUrl: "" }),
      }),
    );
    expect(missingResponse.status).toBe(404);

    vi.mocked(prisma.school.findUnique).mockResolvedValueOnce({
      id: "school-1",
      status: "ARCHIVED",
    });

    const archivedResponse = await PATCH(
      new Request("https://app.example.com/api/settings/google-review-url", {
        method: "PATCH",
        body: JSON.stringify({ schoolId: "school-1", googleReviewUrl: "" }),
      }),
    );
    expect(archivedResponse.status).toBe(404);
  });

  it("rejects schools outside the manager scope", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "school-2",
      effectiveSchoolId: "school-1",
      role: "manager",
      canSwitchSchool: false,
    });

    const response = await PATCH(
      new Request("https://app.example.com/api/settings/google-review-url", {
        method: "PATCH",
        body: JSON.stringify({
          schoolId: "school-2",
          googleReviewUrl:
            "https://search.google.com/local/writereview?placeid=ischool",
        }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("returns a Japanese error when DB save fails", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.schoolSetting.upsert).mockRejectedValueOnce(
      new Error("DB down"),
    );

    const response = await PATCH(
      new Request("https://app.example.com/api/settings/google-review-url", {
        method: "PATCH",
        body: JSON.stringify({
          schoolId: "school-1",
          googleReviewUrl:
            "https://search.google.com/local/writereview?placeid=ischool",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toContain("保存できませんでした");
  });
});
