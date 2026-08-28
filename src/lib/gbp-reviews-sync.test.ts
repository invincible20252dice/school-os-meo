import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGbpReviewsListEndpoint,
  normalizeGbpReviewsApiItem,
  ratingFromGbpStarRating,
  syncGbpReviewsForSchool,
} from "./gbp-reviews-sync";

const originalEnv = process.env;

vi.mock("./google-gbp-oauth", () => ({
  refreshGoogleAccessToken: vi.fn(async () => "access-token"),
}));

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe("gbp-reviews-sync", () => {
  it("builds the GBP reviews endpoint from formal SchoolSetting columns", () => {
    expect(
      buildGbpReviewsListEndpoint({
        googleAccountId: "accounts/123",
        selectedGbpLocationId: "locations/456",
      }),
    ).toBe("https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews");
  });

  it("normalizes numeric account and location ids", () => {
    expect(
      buildGbpReviewsListEndpoint({
        googleAccountId: "123",
        selectedGbpLocationId: "456",
      }),
    ).toBe("https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews");
  });

  it("uses the account resource embedded in a full GBP location resource", () => {
    expect(
      buildGbpReviewsListEndpoint({
        googleAccountId: "",
        selectedGbpLocationId: "/accounts/123/locations/456/",
      }),
    ).toBe("https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews");
  });

  it("requires location and account settings", () => {
    expect(() =>
      buildGbpReviewsListEndpoint({
        googleAccountId: "accounts/123",
        selectedGbpLocationId: "",
      }),
    ).toThrow("ロケーションID");

    expect(() =>
      buildGbpReviewsListEndpoint({
        googleAccountId: "",
        selectedGbpLocationId: "locations/456",
      }),
    ).toThrow("アカウントID");

    expect(() =>
      buildGbpReviewsListEndpoint({
        googleAccountId: "owner@example.com",
        selectedGbpLocationId: "locations/456",
      }),
    ).toThrow("アカウントID");
  });

  it("normalizes GBP review items with the real reviewer display name", () => {
    expect(
      normalizeGbpReviewsApiItem({
        name: "accounts/123/locations/456/reviews/789",
        reviewer: {
          displayName: "佐藤英樹",
          profilePhotoUrl: "https://example.com/photo.jpg",
        },
        starRating: "FOUR",
        comment: "丁寧でした。",
      }),
    ).toMatchObject({
      googleReviewId: "accounts/123/locations/456/reviews/789",
      gbpReviewId: "789",
      authorName: "佐藤英樹",
      rating: 4,
      originalText: "丁寧でした。",
      status: "PENDING",
    });
  });

  it("maps unknown star ratings to a usable five-star default", () => {
    expect(ratingFromGbpStarRating(8)).toBe(5);
    expect(ratingFromGbpStarRating(0)).toBe(1);
    expect(ratingFromGbpStarRating(3.8)).toBe(3);
    expect(ratingFromGbpStarRating("THREE")).toBe(3);
    expect(ratingFromGbpStarRating("unexpected")).toBe(5);
  });

  it("normalizes sparse GBP review items without leaking undefined values", () => {
    expect(
      normalizeGbpReviewsApiItem({
        reviewId: "short-1",
        authorName: "投稿者名",
        rating: "TWO",
        updateTime: "not-a-date",
      }),
    ).toEqual({
      googleReviewId: "short-1",
      gbpReviewId: "short-1",
      authorName: "投稿者名",
      rating: 2,
      originalText: "",
      replyText: null,
      status: "PENDING",
      postedAt: null,
    });
  });

  it("falls back to a generic author and extracted review id when reviewer fields are absent", () => {
    expect(
      normalizeGbpReviewsApiItem({
        name: "/accounts/123/locations/456/reviews/review-without-author/",
        starRating: Number.NaN,
        createTime: "2026-08-28T00:00:00.000Z",
      }),
    ).toMatchObject({
      googleReviewId: "accounts/123/locations/456/reviews/review-without-author",
      gbpReviewId: "review-without-author",
      authorName: "Googleユーザー",
      rating: 5,
      originalText: "",
      replyText: null,
      status: "PENDING",
      postedAt: new Date("2026-08-28T00:00:00.000Z"),
    });
  });

  it("fetches GBP reviews and stores them with existing Review columns", async () => {
    const prisma = {
      schoolSetting: {
        findFirst: vi.fn(async () => ({
          schoolId: "school-1",
          googleAccountId: "accounts/123",
          googleRefreshToken: "refresh-token",
          selectedGbpLocationId: "locations/456",
          school: { name: "大学受験専門塾 iスクール予備校" },
        })),
      },
      review: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({ id: "review-db-1", ...data })),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          reviews: [
            {
              name: "accounts/123/locations/456/reviews/789",
              reviewId: "789",
              reviewer: { displayName: "一ノ瀬大輝" },
              starRating: "FIVE",
              comment: "質問しやすかったです。",
              createTime: "2026-08-20T01:00:00.000Z",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await syncGbpReviewsForSchool({
      prisma,
      schoolId: "school-1",
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({ success: true, count: 1, schoolId: "school-1" });
    expect(prisma.schoolSetting.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "school-1" },
        select: expect.objectContaining({
          selectedGbpLocationId: true,
          googleAccountId: true,
          googleRefreshToken: true,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews",
      expect.objectContaining({
        headers: { Authorization: "Bearer access-token" },
      }),
    );
    expect(prisma.review.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        schoolId: "school-1",
        source: "GOOGLE",
        status: "PENDING",
        parentName: "一ノ瀬大輝",
        authorName: "一ノ瀬大輝",
        rating: 5,
        originalText: "質問しやすかったです。",
        comment: "質問しやすかったです。",
        googleReviewId: "accounts/123/locations/456/reviews/789",
        gbpReviewId: "789",
        aiReplyText: expect.stringContaining("iスクール予備校"),
        aiReplyDraft: expect.stringContaining("iスクール予備校"),
      }),
    });
  });

  it("updates existing synced reviews instead of creating duplicates", async () => {
    const prisma = {
      schoolSetting: {
        findFirst: vi.fn(async () => ({
          schoolId: "school-1",
          googleAccountId: "accounts/123",
          googleRefreshToken: "refresh-token",
          selectedGbpLocationId: "locations/456",
          school: { name: "大学受験専門塾 iスクール予備校" },
        })),
      },
      review: {
        findFirst: vi.fn(async () => ({ id: "review-db-1" })),
        create: vi.fn(),
        update: vi.fn(async ({ data }) => ({ id: "review-db-1", ...data })),
      },
    };
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          reviews: [
            {
              name: "accounts/123/locations/456/reviews/789",
              reviewer: { displayName: "佐藤英樹" },
              starRating: "FIVE",
              comment: "安心できます。",
              reviewReply: { comment: "ありがとうございます。" },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await syncGbpReviewsForSchool({
      prisma,
      schoolId: "school-1",
      fetchImpl: fetchMock,
    });

    expect(prisma.review.create).not.toHaveBeenCalled();
    expect(prisma.review.update).toHaveBeenCalledWith({
      where: { id: "review-db-1" },
      data: expect.objectContaining({
        status: "REPLIED",
        replyText: "ありがとうございます。",
        aiReplyText: "",
        aiReplyDraft: "",
      }),
    });
  });

  it("surfaces Google API errors with the response message", async () => {
    const prisma = {
      schoolSetting: {
        findFirst: vi.fn(async () => ({
          schoolId: "school-1",
          googleAccountId: "accounts/123",
          googleRefreshToken: "refresh-token",
          selectedGbpLocationId: "locations/456",
          school: { name: "大学受験専門塾 iスクール予備校" },
        })),
      },
      review: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    await expect(
      syncGbpReviewsForSchool({
        prisma,
        schoolId: "school-1",
        fetchImpl: vi.fn(
          async () =>
            new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
              status: 429,
            }),
        ),
      }),
    ).rejects.toThrow("quota exceeded");
  });

  it("surfaces non-JSON Google API errors without hiding the upstream response", async () => {
    const prisma = {
      schoolSetting: {
        findFirst: vi.fn(async () => ({
          schoolId: "school-1",
          googleAccountId: "accounts/123",
          googleRefreshToken: "refresh-token",
          selectedGbpLocationId: "locations/456",
          school: null,
        })),
      },
      review: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    await expect(
      syncGbpReviewsForSchool({
        prisma,
        schoolId: "school-1",
        fetchImpl: vi.fn(async () => new Response("upstream unavailable", { status: 503 })),
      }),
    ).rejects.toThrow("upstream unavailable");
  });

  it("returns a zero-count sync when Google returns an empty body", async () => {
    const prisma = {
      schoolSetting: {
        findFirst: vi.fn(async () => ({
          schoolId: "school-1",
          googleAccountId: "accounts/123",
          googleRefreshToken: "refresh-token",
          selectedGbpLocationId: "locations/456",
          school: null,
        })),
      },
      review: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    const result = await syncGbpReviewsForSchool({
      prisma,
      fetchImpl: vi.fn(async () => new Response("", { status: 200 })),
    });

    expect(result).toEqual({ success: true, count: 0, schoolId: "school-1" });
    expect(prisma.schoolSetting.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: undefined,
      }),
    );
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it("requires a SchoolSetting record with selectedGbpLocationId before calling Google", async () => {
    const prisma = {
      schoolSetting: {
        findFirst: vi.fn(async () => null),
      },
      review: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn();

    await expect(
      syncGbpReviewsForSchool({
        prisma,
        schoolId: "school-1",
        fetchImpl: fetchMock,
      }),
    ).rejects.toThrow("ロケーションID");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
