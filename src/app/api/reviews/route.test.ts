import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/supabase-access", async () => ({
  ...await vi.importActual<typeof import("@/lib/supabase-access")>("@/lib/supabase-access"),
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
  school: {
    name: "iスクール予備校",
    schoolSetting: { selectedGbpLocationId: "locations/6467241578381534467" },
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: {
      findMany: vi.fn(async () => [reviewRow]),
      findUnique: vi.fn(async () => ({
        id: reviewRow.id,
        schoolId: reviewRow.schoolId,
        source: reviewRow.source,
      })),
      update: vi.fn(async () => ({
        id: reviewRow.id,
        status: "REPLIED",
        replyText: reviewRow.aiReplyDraft,
        repliedAt: new Date("2026-08-01T12:00:00.000Z"),
      })),
    },
  },
}));

describe("GET /api/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    { schoolId: "", schoolIds: [] },
    { schoolId: "all", schoolIds: [] },
    { schoolId: "school-2", schoolIds: ["school-1"] },
  ])("denies inconsistent manager assignments without broadening the database query (%j)", async assignment => {
    const access = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    const current = await access.resolveRequestAccess(new Request("https://app.example.com"));
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({ ...current, access: { ...current.access, ...assignment } });
    const response = await GET(new Request("https://app.example.com/api/reviews?schoolId=all"));
    expect(response.status).toBe(403);
    expect(prisma.review.findMany).not.toHaveBeenCalled();
  });

  it.each(["", "?schoolId=all", "?schoolId=school-1"])("uses the real scope resolver to restrict managers (%s)", async query => {
    const { prisma } = await import("@/lib/prisma");
    expect((await GET(new Request(`https://app.example.com/api/reviews${query}`))).status).toBe(200);
    expect(prisma.review.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolId: "school-1" } }));
  });

  it("rejects a manager's explicit request for another school", async () => {
    const { prisma } = await import("@/lib/prisma");
    expect((await GET(new Request("https://app.example.com/api/reviews?schoolId=school-2"))).status).toBe(403);
    expect(prisma.review.findMany).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated listing before reading review data", async () => {
    const { resolveRequestAccess } = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    const authenticated = await resolveRequestAccess(new Request("https://app.example.com"));
    vi.mocked(resolveRequestAccess).mockResolvedValueOnce({ ...authenticated, isAuthenticated: false });
    const response = await GET(new Request("https://app.example.com/api/reviews?role=admin"));
    expect(response.status).toBe(401);
    expect(prisma.review.findMany).not.toHaveBeenCalled();
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
      googleReviewManagementUrl: "https://business.google.com/n/6467241578381534467/reviews",
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
          school: { select: {
            name: true,
            schoolSetting: { select: { selectedGbpLocationId: true } },
          } },
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

  it("returns actual line breaks for stored escaped drafts and replies", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.review.findMany).mockResolvedValueOnce([
      { ...reviewRow, aiReplyDraft: "佐藤様\\n\\nありがとうございます。", replyText: "冒頭\\r\\n本文" },
      { ...reviewRow, id: "review-2", aiReplyDraft: null, aiReplyText: "一ノ瀬様\\n\\nありがとうございます。" },
    ]);

    const response = await GET(new Request("https://app.example.com/api/reviews"));
    const body = await response.json();
    expect(body.reviews[0]).toMatchObject({
      aiReplyText: "佐藤様\n\nありがとうございます。",
      aiReplyDraft: "佐藤様\n\nありがとうございます。",
      replyText: "冒頭\n本文",
    });
    expect(body.reviews[1].aiReplyText).toBe("一ノ瀬様\n\nありがとうございます。");
  });

  it("binds each review link to its own school and leaves unconfigured schools unset", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.review.findMany).mockResolvedValueOnce([
      reviewRow,
      { ...reviewRow, id: "review-2", schoolId: "school-2", school: {
        name: "別校舎", schoolSetting: { selectedGbpLocationId: "locations/987" },
      } },
      { ...reviewRow, id: "review-3", schoolId: "school-3", school: {
        name: "未設定校舎", schoolSetting: null,
      } },
    ]);

    const response = await GET(new Request("https://app.example.com/api/reviews"));
    const body = await response.json();
    expect(body.reviews.map((row: { googleReviewManagementUrl: string | null }) => row.googleReviewManagementUrl)).toEqual([
      "https://business.google.com/n/6467241578381534467/reviews",
      "https://business.google.com/n/987/reviews",
      null,
    ]);
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
    const current = await access.resolveRequestAccess(new Request("https://app.example.com"));
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({ ...current, access: { ...current.access, role: "admin", schoolId: "", schoolIds: [] } });

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

describe("PATCH /api/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows headquarters to confirm a reply without a school assignment", async () => {
    const { PATCH } = await import("./route");
    const access = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    const current = await access.resolveRequestAccess(new Request("https://app.example.com"));
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({ ...current, access: { ...current.access, role: "admin", schoolId: "", schoolIds: [] } });
    const response = await PATCH(new Request("https://app.example.com/api/reviews", { method: "PATCH", body: JSON.stringify({ reviewId: "review-1", replyText: "投稿済み本文" }) }));
    expect(response.status).toBe(200);
    expect(prisma.review.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "review-1" }, data: expect.objectContaining({ replyText: "投稿済み本文" }) }));
  });

  it.each([
    { schoolId: "", schoolIds: [] },
    { schoolId: "all", schoolIds: [] },
    { schoolId: "school-1", schoolIds: ["school-2"] },
  ])("does not allow incomplete or inconsistent memberships to update reply status (%j)", async assignment => {
    const { PATCH } = await import("./route");
    const access = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    const current = await access.resolveRequestAccess(new Request("https://app.example.com"));
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({ ...current, access: { ...current.access, ...assignment } });
    const response = await PATCH(new Request("https://app.example.com/api/reviews", { method: "PATCH", body: JSON.stringify({ reviewId: "review-1", replyText: "投稿済み本文" }) }));
    expect(response.status).toBe(403);
    expect(prisma.review.update).not.toHaveBeenCalled();
  });

  it("marks a Google review as replied with the edited draft", async () => {
    const { PATCH } = await import("./route");
    const { prisma } = await import("@/lib/prisma");
    const response = await PATCH(
      new Request("https://app.example.com/api/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewId: "review-1",
          replyText: "  佐藤様\\n\\nGoogleで投稿した返信です。  ",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      message: "Googleでの返信完了を記録しました。",
      review: {
        id: "review-1",
        status: "REPLIED",
        repliedAt: "2026-08-01T12:00:00.000Z",
      },
    });
    expect(prisma.review.update).toHaveBeenCalledWith({
      where: { id: "review-1" },
      data: expect.objectContaining({
        aiReplyText: "佐藤様\n\nGoogleで投稿した返信です。",
        aiReplyDraft: "佐藤様\n\nGoogleで投稿した返信です。",
        replyText: "佐藤様\n\nGoogleで投稿した返信です。",
        status: "REPLIED",
        repliedAt: expect.any(Date),
      }),
      select: {
        id: true,
        status: true,
        replyText: true,
        repliedAt: true,
      },
    });
  });

  it.each([
    [{ replyText: "返信です。" }],
    [{ reviewId: "review-1", replyText: "   " }],
  ])("rejects incomplete update payloads", async (payload) => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("https://app.example.com/api/reviews", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects pending users", async () => {
    const { PATCH } = await import("./route");
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

    const response = await PATCH(
      new Request("https://app.example.com/api/reviews", {
        method: "PATCH",
        body: JSON.stringify({ reviewId: "review-1", replyText: "返信です。" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(prisma.review.update).not.toHaveBeenCalled();
  });

  it("requires authentication before changing reply status", async () => {
    const { PATCH } = await import("./route");
    const access = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      access: {
        userId: "demo-user",
        role: "admin",
        schoolId: "",
        schoolIds: [],
        name: "Demo User",
        email: "",
        status: "active",
        source: "fallback",
      },
      isAuthenticated: false,
    });

    const response = await PATCH(
      new Request("https://app.example.com/api/reviews", {
        method: "PATCH",
        body: JSON.stringify({ reviewId: "review-1", replyText: "返信です。" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.message).toBe("ログイン後に口コミの状態を更新してください。");
    expect(prisma.review.findUnique).not.toHaveBeenCalled();
    expect(prisma.review.update).not.toHaveBeenCalled();
  });

  it("rejects a missing review", async () => {
    const { PATCH } = await import("./route");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.review.findUnique).mockResolvedValueOnce(null);

    const response = await PATCH(
      new Request("https://app.example.com/api/reviews", {
        method: "PATCH",
        body: JSON.stringify({ reviewId: "review-1", replyText: "返信です。" }),
      }),
    );

    expect(response.status).toBe(404);
    expect(prisma.review.update).not.toHaveBeenCalled();
  });

  it("enforces the manager school scope", async () => {
    const { PATCH } = await import("./route");
    const access = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    const current = await access.resolveRequestAccess(new Request("https://app.example.com"));
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({ ...current, access: { ...current.access, schoolId: "school-2", schoolIds: ["school-2"] } });

    const response = await PATCH(
      new Request("https://app.example.com/api/reviews", {
        method: "PATCH",
        body: JSON.stringify({ reviewId: "review-1", replyText: "返信です。" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(prisma.review.update).not.toHaveBeenCalled();
  });

  it("returns a Japanese error when the update fails", async () => {
    const { PATCH } = await import("./route");
    const { prisma } = await import("@/lib/prisma");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(prisma.review.update).mockRejectedValueOnce(new Error("DB down"));

    const response = await PATCH(
      new Request("https://app.example.com/api/reviews", {
        method: "PATCH",
        body: JSON.stringify({ reviewId: "review-1", replyText: "返信です。" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("口コミの返信状態を更新できませんでした。");
    consoleErrorSpy.mockRestore();
  });
});
