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

const reviewRow = {
  id: "review-1",
  schoolId: "school-1",
  source: "GOOGLE",
  status: "PENDING",
  parentName: "旧投稿者名",
  authorName: "佐藤英樹",
  rating: 5,
  originalText: "先生が丁寧でした。",
  comment: "旧口コミ本文",
  googleReviewId: "accounts/1/locations/2/reviews/3",
  gbpReviewId: "3",
  aiReplyText: "旧返信案",
  aiReplyDraft: "佐藤様、口コミをありがとうございます。",
  replyText: null,
  aiReplyGeneratedAt: new Date("2026-08-01T10:00:00.000Z"),
  repliedAt: null,
  createdAt: new Date("2026-08-01T09:00:00.000Z"),
  school: { name: "iスクール予備校" },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: {
      findMany: vi.fn(async () => [reviewRow]),
    },
  },
}));

describe("GET /api/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns real review fields scoped to the active school", async () => {
    const { prisma } = await import("@/lib/prisma");
    const response = await GET(
      new Request("https://app.example.com/api/reviews?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reviews[0]).toMatchObject({
      id: "review-1",
      schoolName: "iスクール予備校",
      parentName: "佐藤英樹",
      rating: 5,
      originalText: "先生が丁寧でした。",
      googleReviewName: "accounts/1/locations/2/reviews/3",
      gbpReviewId: "3",
      aiReplyText: "佐藤様、口コミをありがとうございます。",
      aiReplyDraft: "佐藤様、口コミをありがとうございます。",
    });
    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "school-1" },
        select: expect.objectContaining({
          comment: true,
          gbpReviewId: true,
          aiReplyDraft: true,
          replyText: true,
        }),
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("uses the current schema fallback fields only when canonical values are empty", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.review.findMany).mockResolvedValueOnce([
      {
        ...reviewRow,
        id: "review-2",
        authorName: null,
        originalText: null,
        googleReviewId: null,
        aiReplyDraft: null,
        replyText: "返信済みです。",
        repliedAt: new Date("2026-08-01T11:00:00.000Z"),
      },
    ]);

    const response = await GET(new Request("https://app.example.com/api/reviews"));
    const body = await response.json();

    expect(body.reviews[0]).toMatchObject({
      parentName: "旧投稿者名",
      originalText: "旧口コミ本文",
      googleReviewId: "3",
      aiReplyText: "旧返信案",
      replyText: "返信済みです。",
      repliedAt: "2026-08-01T11:00:00.000Z",
    });
  });

  it("serializes nullable review data without inventing school data", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.review.findMany).mockResolvedValueOnce([
      {
        ...reviewRow,
        authorName: null,
        parentName: null,
        rating: null,
        originalText: null,
        comment: null,
        googleReviewId: null,
        gbpReviewId: null,
        aiReplyText: null,
        aiReplyDraft: null,
        replyText: null,
        aiReplyGeneratedAt: null,
      },
    ]);

    const response = await GET(new Request("https://app.example.com/api/reviews"));
    const body = await response.json();

    expect(body.reviews[0]).toMatchObject({
      parentName: "Googleユーザー",
      originalText: "",
      googleReviewId: "",
      aiReplyText: "",
      replyText: "",
      aiReplyGeneratedAt: "",
    });
  });

  it("allows admins to list all schools when no school is selected", async () => {
    const access = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(access.buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "all",
      effectiveSchoolId: undefined,
      role: "admin",
      canSwitchSchool: true,
    });

    const response = await GET(new Request("https://app.example.com/api/reviews"));

    expect(response.status).toBe(200);
    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it("rejects pending authenticated users", async () => {
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

    expect(response.status).toBe(403);
    expect(prisma.review.findMany).not.toHaveBeenCalled();
  });

  it("exposes the same implementation through the dashboard API", async () => {
    const dashboardRoute = await import("../dashboard/reviews/route");
    const response = await dashboardRoute.GET(
      new Request("https://app.example.com/api/dashboard/reviews?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reviews[0].schoolName).toBe("iスクール予備校");
  });

  it("returns a Japanese error when the database query fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.review.findMany).mockRejectedValueOnce(new Error("DB down"));

    const response = await GET(new Request("https://app.example.com/api/reviews"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("口コミ一覧を取得できませんでした。");
    consoleErrorSpy.mockRestore();
  });
});
