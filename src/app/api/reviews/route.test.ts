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
    $queryRawUnsafe: vi.fn(),
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

  it("recovers from Review column drift by reading only columns that exist in the DB", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.review.findMany).mockRejectedValueOnce({
      code: "P2022",
      message: "The column `Review.comment` does not exist in the current database.",
    });
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([
        { column_name: "id" },
        { column_name: "schoolId" },
        { column_name: "status" },
        { column_name: "authorName" },
        { column_name: "rating" },
        { column_name: "comment" },
        { column_name: "aiReplyDraft" },
        { column_name: "replyText" },
        { column_name: "googleReviewName" },
        { column_name: "gbpReviewId" },
        { column_name: "createdAt" },
      ])
      .mockResolvedValueOnce([{ column_name: "id" }, { column_name: "name" }])
      .mockResolvedValueOnce([
        {
          id: "review-real-1",
          schoolId: "school-1",
          source: null,
          status: "PENDING",
          parentName: null,
          reviewerName: null,
          authorName: "佐藤英樹",
          rating: 5,
          starRating: null,
          originalText: null,
          comment: "実際の口コミ本文です。",
          content: null,
          text: null,
          googleReviewId: null,
          googleReviewName: "accounts/1/locations/2/reviews/3",
          gbpReviewId: "3",
          aiReplyText: null,
          aiReplyDraft: "返信案です。",
          draftReply: null,
          replyText: "",
          aiReplyGeneratedAt: null,
          repliedAt: null,
          createdAt: new Date("2026-08-23T00:00:00.000Z"),
          schoolName: "iスクール予備校",
        },
      ]);

    const response = await GET(
      new Request("https://app.example.com/api/reviews?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.reviews[0]).toMatchObject({
      id: "review-real-1",
      schoolName: "iスクール予備校",
      parentName: "佐藤英樹",
      authorName: "佐藤英樹",
      originalText: "実際の口コミ本文です。",
      comment: "実際の口コミ本文です。",
      aiReplyText: "返信案です。",
      aiReplyDraft: "返信案です。",
      googleReviewId: "accounts/1/locations/2/reviews/3",
      googleReviewName: "accounts/1/locations/2/reviews/3",
      gbpReviewId: "3",
      status: "PENDING",
    });
    expect(prisma.$queryRawUnsafe).toHaveBeenLastCalledWith(
      expect.stringContaining('FROM "Review" r LEFT JOIN "School" s'),
      "school-1",
    );
    consoleErrorSpy.mockRestore();
  });

  it("serializes legacy raw review columns when the production DB has not been fully migrated", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
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
    vi.mocked(prisma.review.findMany).mockRejectedValueOnce({
      code: "P2022",
      message: "The column `Review.authorName` does not exist.",
    });
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([
        { column_name: "id" },
        { column_name: "parentName" },
        { column_name: "reviewerName" },
        { column_name: "starRating" },
        { column_name: "content" },
        { column_name: "text" },
        { column_name: "draftReply" },
        { column_name: "replyText" },
        { column_name: "createdAt" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "review-legacy-1",
          schoolId: null,
          source: null,
          status: "",
          parentName: null,
          reviewerName: "一ノ瀬大輝",
          authorName: null,
          rating: null,
          starRating: "4.8",
          originalText: null,
          comment: null,
          content: "移行前テーブルの口コミです。",
          text: null,
          googleReviewId: null,
          googleReviewName: null,
          gbpReviewId: "legacy-gbp-review",
          aiReplyText: null,
          aiReplyDraft: null,
          draftReply: "移行前テーブルの返信案です。",
          replyText: "返信済みです。",
          aiReplyGeneratedAt: "invalid-date",
          repliedAt: "2026-08-24T00:00:00.000Z",
          createdAt: null,
          schoolName: null,
        },
        {
          id: "review-legacy-2",
          schoolId: null,
          source: null,
          status: "",
          parentName: "保護者B",
          reviewerName: "",
          authorName: null,
          rating: null,
          starRating: "評価なし",
          originalText: null,
          comment: null,
          content: "",
          text: "text列だけに残っている口コミです。",
          googleReviewId: null,
          googleReviewName: null,
          gbpReviewId: "",
          aiReplyText: null,
          aiReplyDraft: null,
          draftReply: "",
          replyText: "",
          aiReplyGeneratedAt: null,
          repliedAt: null,
          createdAt: "2026-08-25T00:00:00.000Z",
          schoolName: "",
        },
        {
          id: "review-legacy-3",
          schoolId: null,
          source: null,
          status: null,
          parentName: "",
          reviewerName: "",
          authorName: "",
          rating: null,
          starRating: null,
          originalText: null,
          comment: null,
          content: null,
          text: null,
          googleReviewId: null,
          googleReviewName: null,
          gbpReviewId: null,
          aiReplyText: null,
          aiReplyDraft: null,
          draftReply: null,
          replyText: null,
          aiReplyGeneratedAt: null,
          repliedAt: null,
          createdAt: null,
          schoolName: null,
        },
        { id: null },
      ]);

    const response = await GET(new Request("https://app.example.com/api/reviews"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reviews).toHaveLength(3);
    expect(body.reviews[0]).toMatchObject({
      id: "review-legacy-1",
      schoolName: "校舎未設定",
      parentName: "一ノ瀬大輝",
      rating: 4,
      originalText: "移行前テーブルの口コミです。",
      googleReviewId: "legacy-gbp-review",
      aiReplyText: "移行前テーブルの返信案です。",
      replyText: "返信済みです。",
      status: "REPLIED",
      aiReplyGeneratedAt: "invalid-date",
      repliedAt: "2026-08-24T00:00:00.000Z",
      createdAt: "",
    });
    expect(body.reviews[1]).toMatchObject({
      id: "review-legacy-2",
      schoolName: "校舎未設定",
      parentName: "保護者B",
      rating: null,
      originalText: "text列だけに残っている口コミです。",
      status: "PENDING",
      createdAt: "2026-08-25T00:00:00.000Z",
    });
    expect(body.reviews[2]).toMatchObject({
      id: "review-legacy-3",
      parentName: "Googleユーザー",
      authorName: "Googleユーザー",
      originalText: "",
      aiReplyText: "",
      status: "PENDING",
    });
    expect(prisma.$queryRawUnsafe).toHaveBeenLastCalledWith(
      expect.not.stringContaining("LEFT JOIN"),
    );
    consoleErrorSpy.mockRestore();
  });

  it("returns an empty successful list when the raw P2022 recovery query also fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.review.findMany).mockRejectedValueOnce({
      code: "P2022",
      message: "The column `Review.gbpReviewId` does not exist.",
    });
    vi.mocked(prisma.$queryRawUnsafe).mockRejectedValueOnce(
      new Error("information_schema unavailable"),
    );

    const response = await GET(
      new Request("https://app.example.com/api/reviews?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.reviews).toEqual([]);
    consoleErrorSpy.mockRestore();
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
