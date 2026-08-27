import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

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
    review: {
      findMany: vi.fn(async () => [
        {
          id: "review-1",
          schoolId: "school-1",
          source: "GOOGLE",
          status: "GENERATED",
          parentName: "保護者A",
          authorName: "佐藤英樹",
          rating: 5,
          originalText: "先生が丁寧でした。",
          googleReviewId: "google-review-1",
          aiReplyText: "ありがとうございます。",
          aiReplyGeneratedAt: new Date("2026-08-01T10:00:00.000Z"),
          repliedAt: null,
          createdAt: new Date("2026-08-01T09:00:00.000Z"),
          school: { name: "iスクール予備校" },
        },
      ]),
    },
  },
}));

describe("/api/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns DB-backed reviews scoped to the active school", async () => {
    const { prisma } = await import("@/lib/prisma");

    const response = await GET(
      new Request("https://app.example.com/api/reviews?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reviews[0]).toMatchObject({
      id: "review-1",
      schoolName: "iスクール予備校",
      status: "GENERATED",
      aiReplyText: "ありがとうございます。",
      parentName: "佐藤英樹",
    });
    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "school-1" },
        select: expect.not.objectContaining({
          comment: expect.anything(),
          gbpReviewId: expect.anything(),
          aiReplyDraft: expect.anything(),
        }),
      }),
    );
  });

  it("returns pending user access errors without querying reviews", async () => {
    const access = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      access: {
        userId: "pending-1",
        role: "manager",
        schoolId: "school-1",
        schoolIds: ["school-1"],
        name: "承認待ち",
        email: "pending@example.com",
        status: "pending",
        source: "profiles",
      },
      isAuthenticated: true,
    });

    const response = await GET(new Request("https://app.example.com/api/reviews"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toBe("アカウント承認後に口コミ一覧を確認できます。");
    expect(prisma.review.findMany).not.toHaveBeenCalled();
  });

  it("allows admin users to list all schools when no effective school is selected", async () => {
    const access = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
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
    });
    vi.mocked(access.buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "all",
      effectiveSchoolId: undefined,
      role: "admin",
      canSwitchSchool: true,
    });

    const response = await GET(new Request("https://app.example.com/api/reviews"));

    expect(response.status).toBe(200);
    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      }),
    );
  });

  it("exposes the same safe review list through the dashboard API path", async () => {
    const { prisma } = await import("@/lib/prisma");
    const dashboardReviews = await import("../dashboard/reviews/route");

    const response = await dashboardReviews.GET(
      new Request("https://app.example.com/api/dashboard/reviews?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reviews[0].id).toBe("review-1");
    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({
          comment: expect.anything(),
          gbpReviewId: expect.anything(),
          aiReplyDraft: expect.anything(),
        }),
      }),
    );
  });

  it("serializes sparse review values safely", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.review.findMany).mockResolvedValueOnce([
      {
        id: "review-2",
        schoolId: "school-1",
        source: "GOOGLE",
        status: "GENERATED",
        parentName: null,
        rating: null,
        originalText: null,
        authorName: null,
        googleReviewId: null,
        aiReplyText: null,
        aiReplyGeneratedAt: null,
        repliedAt: new Date("2026-08-01T11:00:00.000Z"),
        createdAt: new Date("2026-08-01T09:00:00.000Z"),
        school: { name: "iスクール予備校" },
      },
    ]);

    const response = await GET(new Request("https://app.example.com/api/reviews"));
    const body = await response.json();

    expect(body.reviews[0]).toMatchObject({
      parentName: "Googleユーザー",
      originalText: "",
      googleReviewId: "",
      aiReplyText: "",
      aiReplyGeneratedAt: "",
      repliedAt: "2026-08-01T11:00:00.000Z",
    });
  });

  it("falls back to the legacy parent name when author name is absent", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.review.findMany).mockResolvedValueOnce([
      {
        id: "review-3",
        schoolId: "school-1",
        source: "GOOGLE",
        status: "GENERATED",
        parentName: "一ノ瀬大輝",
        authorName: null,
        rating: 5,
        originalText: "通いやすいです。",
        googleReviewId: "accounts/1/locations/2/reviews/3",
        aiReplyText: "ありがとうございます。",
        aiReplyGeneratedAt: null,
        repliedAt: null,
        createdAt: new Date("2026-08-01T09:00:00.000Z"),
        school: { name: "iスクール予備校" },
      },
    ]);

    const response = await GET(new Request("https://app.example.com/api/reviews"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reviews[0].parentName).toBe("一ノ瀬大輝");
  });

  it("returns a Japanese error when DB lookup fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.review.findMany).mockRejectedValueOnce(new Error("db failed"));

    const response = await GET(new Request("https://app.example.com/api/reviews"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("口コミ一覧を取得できませんでした。");
    consoleErrorSpy.mockRestore();
  });
});
