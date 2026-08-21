import { beforeEach, describe, expect, it, vi } from "vitest";

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
    requestedSchoolId: schoolId,
    effectiveSchoolId: schoolId,
    role: "manager",
    canSwitchSchool: false,
  })),
}));

vi.mock("@/lib/gbp-reply", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gbp-reply")>(
    "@/lib/gbp-reply",
  );

  return {
    ...actual,
    resolveGbpAccessToken: vi.fn(async () => "access-token"),
    postGbpReviewReply: vi.fn(async () => ({ comment: "ありがとうございます。" })),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: {
      findUnique: vi.fn(async () => ({
        id: "review-1",
        schoolId: "school-1",
        googleReviewId: "google-review-1",
        school: {
          gbpAccountId: "accounts/1",
          gbpLocationId: "locations/100",
          schoolSetting: {
            googleRefreshToken: "refresh-token",
            selectedGbpLocationId: "locations/100",
          },
        },
      })),
      update: vi.fn(async ({ data }) => ({
        id: "review-1",
        ...data,
      })),
    },
  },
}));

describe("/api/gbp/reply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects GET requests from LINE to the dashboard review screen", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/gbp/reply?reviewId=review-1"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/dashboard/reviews?reviewId=review-1",
    );
  });

  it("redirects GET requests without review id to reviews top", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/gbp/reply"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/dashboard/reviews",
    );
  });

  it("posts an approved AI reply to GBP and marks the review as replied", async () => {
    const { prisma } = await import("@/lib/prisma");
    const gbpReply = await import("@/lib/gbp-reply");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/gbp/reply", {
        method: "POST",
        body: JSON.stringify({
          reviewId: "review-1",
          replyText: "ありがとうございます。",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Google口コミへ返信を投稿しました。");
    expect(gbpReply.resolveGbpAccessToken).toHaveBeenCalledWith({
      googleRefreshToken: "refresh-token",
    });
    expect(gbpReply.postGbpReviewReply).toHaveBeenCalledWith({
      gbpAccountId: "accounts/1",
      gbpLocationId: "locations/100",
      googleReviewId: "google-review-1",
      replyText: "ありがとうございます。",
      accessToken: "access-token",
    });
    expect(prisma.review.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "review-1" },
        data: expect.objectContaining({
          aiReplyText: "ありがとうございます。",
          status: "REPLIED",
        }),
      }),
    );
  });

  it("returns a clear validation error when reply text is missing", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/gbp/reply", {
        method: "POST",
        body: JSON.stringify({ reviewId: "review-1", replyText: " " }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("返信する口コミと返信文を確認してください。");
  });

  it("returns a validation error when review id is missing", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/gbp/reply", {
        method: "POST",
        body: JSON.stringify({ replyText: "ありがとうございます。" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("返信する口コミと返信文を確認してください。");
  });

  it("returns not found when the review does not exist", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.review.findUnique).mockResolvedValueOnce(null);
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/gbp/reply", {
        method: "POST",
        body: JSON.stringify({
          reviewId: "missing-review",
          replyText: "ありがとうございます。",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.message).toBe("対象の口コミが見つかりませんでした。");
  });

  it("rejects users outside the review school scope", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "school-1",
      effectiveSchoolId: "other-school",
      role: "manager",
      canSwitchSchool: false,
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/gbp/reply", {
        method: "POST",
        body: JSON.stringify({
          reviewId: "review-1",
          replyText: "ありがとうございます。",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toBe("この口コミには返信できません。");
  });

  it("rejects pending users before posting to GBP", async () => {
    const access = await import("@/lib/supabase-access");
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
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/gbp/reply", {
        method: "POST",
        body: JSON.stringify({
          reviewId: "review-1",
          replyText: "ありがとうございます。",
        }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("uses selected GBP location from school setting when school location is blank", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.review.findUnique).mockResolvedValueOnce({
      id: "review-1",
      schoolId: "school-1",
      googleReviewId: "google-review-1",
      school: {
        gbpAccountId: "accounts/1",
        gbpLocationId: null,
        schoolSetting: {
          googleRefreshToken: "refresh-token",
          selectedGbpLocationId: "locations/setting-100",
        },
      },
    });
    const gbpReply = await import("@/lib/gbp-reply");
    const { POST } = await import("./route");

    await POST(
      new Request("https://app.example.com/api/gbp/reply", {
        method: "POST",
        body: JSON.stringify({
          reviewId: "review-1",
          replyText: "ありがとうございます。",
        }),
      }),
    );

    expect(gbpReply.postGbpReviewReply).toHaveBeenCalledWith(
      expect.objectContaining({
        gbpLocationId: "locations/setting-100",
      }),
    );
  });

  it("returns a Google integration error when GBP posting fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const gbpReply = await import("@/lib/gbp-reply");
    vi.mocked(gbpReply.postGbpReviewReply).mockRejectedValueOnce(
      new gbpReply.GbpReplyError(403, "forbidden"),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/gbp/reply", {
        method: "POST",
        body: JSON.stringify({
          reviewId: "review-1",
          replyText: "ありがとうございます。",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.message).toBe(
      "Google Business Profileへの返信投稿に失敗しました。Google連携設定を確認してください。",
    );
    consoleErrorSpy.mockRestore();
  });
});
