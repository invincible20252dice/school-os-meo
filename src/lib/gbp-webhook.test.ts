import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFallbackGbpReply,
  fetchGbpReviews,
  generateGbpReviewReply,
  processGbpReviews,
} from "./gbp-webhook";

const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("gbp-webhook", () => {
  it("builds a polite fallback reply when OpenAI is not configured", async () => {
    delete process.env.OPENAI_API_KEY;

    const reply = await buildFallbackGbpReply({
      schoolName: "青葉ゼミナール",
      rating: 5,
      reviewText: "先生が丁寧でした。",
    });

    expect(reply).toContain("青葉ゼミナール");
    expect(reply).toContain("ありがとうございます");
  });

  it("builds an improvement-oriented fallback reply for low-rated reviews", async () => {
    delete process.env.OPENAI_API_KEY;

    const reply = await buildFallbackGbpReply({
      schoolName: "青葉ゼミナール",
      rating: 2,
      reviewText: "対応に不安がありました。",
    });

    expect(reply).toContain("貴重なご意見");
    expect(reply).toContain("真摯に受け止め");
  });

  it("uses OpenAI generated review replies when configured", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ output_text: "  丁寧な返信案です。  " }), {
        status: 200,
      }),
    );

    const reply = await generateGbpReviewReply(
      {
        schoolName: "青葉ゼミナール",
        rating: 5,
        reviewText: "よかったです。",
      },
      fetchMock,
    );

    expect(reply).toBe("丁寧な返信案です。");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer openai-key",
        }),
      }),
    );
  });

  it("injects school prompt settings into OpenAI reply generation", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ output_text: "設定を反映した返信案です。" }), {
        status: 200,
      }),
    );

    await generateGbpReviewReply(
      {
        schoolName: "iスクール予備校",
        rating: 5,
        reviewText: "先生が親切でした。",
        promptSetting: {
          promptSystemRole: "校舎責任者として返信してください。",
          promptReviewTone: "丁寧・誠実・保護者目線",
          promptMustKeywords: ["自習室", "大学受験"],
          promptForbiddenWords: ["絶対合格"],
          promptTargetLength: "160-220文字",
          promptAutoReplyApproval: false,
        },
      },
      fetchMock,
    );

    const payload = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as {
      input: Array<{ role: string; content: string }>;
    };
    const systemPrompt = payload.input.find(
      (item) => item.role === "system",
    )?.content;

    expect(systemPrompt).toContain("校舎責任者として返信してください。");
    expect(systemPrompt).toContain("丁寧・誠実・保護者目線");
    expect(systemPrompt).toContain("自習室, 大学受験");
    expect(systemPrompt).toContain("絶対合格");
    expect(systemPrompt).toContain("160-220文字");
  });

  it("falls back when OpenAI returns an empty reply", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ output_text: "   " }), { status: 200 }),
    );

    const reply = await generateGbpReviewReply(
      {
        schoolName: "青葉ゼミナール",
        rating: 5,
        reviewText: "よかったです。",
      },
      fetchMock,
    );

    expect(reply).toContain("温かい口コミ");
  });

  it("throws when OpenAI reply generation fails", async () => {
    process.env.OPENAI_API_KEY = "openai-key";

    await expect(
      generateGbpReviewReply(
        {
          schoolName: "青葉ゼミナール",
          rating: 4,
          reviewText: "よかったです。",
        },
        vi.fn(async () => new Response("{}", { status: 503 })),
      ),
    ).rejects.toThrow("OpenAI reply generation failed: 503");
  });

  it("saves new GBP reviews and sends LINE notifications", async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    process.env.LINE_DEFAULT_TO_ID = "default-line-group";

    const prisma = {
      school: {
        findFirst: vi.fn(async () => ({
          id: "school_1",
          name: "青葉ゼミナール",
          googlePlaceId: "place_1",
          gbpLocationId: "location_1",
          lineChannelId: "school-line-group",
          schoolSetting: {
            lineNotifyEnabled: true,
            lineChannelAccessToken: "school-line-token",
            lineDestinationId: "school-line-user",
            notifyOnNewReview: true,
            notifyOnLowRating: true,
          },
        })),
      },
      review: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({ id: "review_db_1", ...data })),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await processGbpReviews({
      reviews: [
        {
          googleReviewId: "google_review_1",
          googlePlaceId: "place_1",
          gbpLocationId: "location_1",
          reviewerName: "保護者A",
          rating: 5,
          reviewText: "先生が丁寧でした。",
          reviewUrl: "https://maps.example/review",
        },
      ],
      prisma,
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({ received: 1, saved: 1, notified: 1, skipped: 0 });
    expect(prisma.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: "school_1",
          googleReviewId: "google_review_1",
          gbpReviewId: "google_review_1",
          source: "GOOGLE",
          status: "PENDING",
          authorName: "保護者A",
          rating: 5,
          originalText: "先生が丁寧でした。",
          comment: "先生が丁寧でした。",
          aiReplyDraft: expect.stringContaining("青葉ゼミナール"),
          lineUserId: "school-line-user",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/push",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer school-line-token",
        }),
        body: expect.stringContaining("school-line-user"),
      }),
    );
  });

  it("updates existing GBP reviews without creating duplicates", async () => {
    delete process.env.OPENAI_API_KEY;

    const prisma = {
      school: {
        findFirst: vi.fn(async () => ({
          id: "school_1",
          name: "青葉ゼミナール",
          lineChannelId: null,
          schoolSetting: {
            lineNotifyEnabled: false,
            lineChannelAccessToken: "line-token",
            lineDestinationId: "line-group",
            notifyOnNewReview: true,
            notifyOnLowRating: true,
          },
        })),
      },
      review: {
        findFirst: vi.fn(async () => ({ id: "review_db_1" })),
        create: vi.fn(),
        update: vi.fn(async ({ data }) => ({ id: "review_db_1", ...data })),
      },
    };

    const result = await processGbpReviews({
      reviews: [
        {
          googleReviewId: "google_review_1",
          googlePlaceId: "place_1",
          rating: 4,
          reviewText: "質問しやすいです。",
        },
      ],
      prisma,
      fetchImpl: vi.fn(),
    });

    expect(result).toEqual({ received: 1, saved: 1, notified: 0, skipped: 0 });
    expect(prisma.review.create).not.toHaveBeenCalled();
    expect(prisma.review.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "review_db_1" },
        data: expect.objectContaining({
          status: "PENDING",
          aiReplyDraft: expect.any(String),
        }),
      }),
    );
  });

  it("does not send LINE notifications when school settings disable them", async () => {
    delete process.env.OPENAI_API_KEY;

    const prisma = {
      school: {
        findFirst: vi.fn(async () => ({
          id: "school_1",
          name: "青葉ゼミナール",
          lineChannelId: "school-line-group",
          schoolSetting: {
            lineNotifyEnabled: false,
            lineChannelAccessToken: "line-token",
            lineDestinationId: "line-group",
            notifyOnNewReview: true,
            notifyOnLowRating: true,
          },
        })),
      },
      review: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({ id: "review_db_1", ...data })),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn();

    const result = await processGbpReviews({
      reviews: [
        {
          googleReviewId: "google_review_1",
          gbpLocationId: "location_1",
          rating: 4,
          reviewText: "助かりました。",
        },
      ],
      prisma,
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({ received: 1, saved: 1, notified: 0, skipped: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips reviews when a school cannot be matched", async () => {
    const prisma = {
      school: {
        findFirst: vi.fn(async () => null),
      },
      review: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    const result = await processGbpReviews({
      reviews: [
        {
          googleReviewId: "google_review_1",
          googlePlaceId: "unknown",
          rating: 2,
          reviewText: "確認が必要です。",
        },
      ],
      prisma,
      fetchImpl: vi.fn(),
    });

    expect(result).toEqual({ received: 1, saved: 0, notified: 0, skipped: 1 });
  });

  it("skips reviews without Google place or GBP location identifiers", async () => {
    const prisma = {
      school: {
        findFirst: vi.fn(),
      },
      review: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    const result = await processGbpReviews({
      reviews: [
        {
          googleReviewId: "google_review_1",
          rating: 5,
          reviewText: "よかったです。",
        },
      ],
      prisma,
      fetchImpl: vi.fn(),
    });

    expect(result).toEqual({ received: 1, saved: 0, notified: 0, skipped: 1 });
    expect(prisma.school.findFirst).not.toHaveBeenCalled();
  });

  it("uses the default LINE recipient when school-specific recipient is absent", async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    process.env.LINE_DEFAULT_TO_ID = "default-line-group";

    const prisma = {
      school: {
        findFirst: vi.fn(async () => ({
          id: "school_1",
          name: "青葉ゼミナール",
          lineChannelId: null,
        })),
      },
      review: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({ id: "review_db_1", ...data })),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await processGbpReviews({
      reviews: [
        {
          googleReviewId: "google_review_1",
          gbpLocationId: "location_1",
          rating: 4,
          reviewText: "助かりました。",
          reviewedAt: "2026-07-21T00:00:00.000Z",
        },
      ],
      prisma,
      fetchImpl: fetchMock,
    });

    expect(result.notified).toBe(1);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns no GBP reviews when the fetch URL is not configured", async () => {
    delete process.env.GBP_API_REVIEWS_URL;

    await expect(fetchGbpReviews(vi.fn())).resolves.toEqual([]);
  });

  it("fetches GBP reviews with an access token", async () => {
    process.env.GBP_API_REVIEWS_URL = "https://gbp.example/reviews";
    process.env.GBP_API_ACCESS_TOKEN = "gbp-token";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          reviews: [
            {
              googleReviewId: "google_review_1",
              rating: 5,
              reviewText: "よかったです。",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const reviews = await fetchGbpReviews(fetchMock);

    expect(reviews).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith("https://gbp.example/reviews", {
      headers: { Authorization: "Bearer gbp-token" },
    });
  });

  it("normalizes official GBP review fields into stored review identifiers and author names", async () => {
    process.env.GBP_API_REVIEWS_URL =
      "https://mybusiness.googleapis.com/v4/accounts/10/locations/20/reviews";
    process.env.GBP_API_ACCESS_TOKEN = "gbp-token";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          reviews: [
            {
              name: "accounts/10/locations/20/reviews/encrypted-review-30",
              reviewId: "encrypted-review-30",
              reviewer: {
                displayName: "佐藤英樹",
                profilePhotoUrl: "https://lh3.googleusercontent.com/photo",
                isAnonymous: false,
              },
              starRating: "FIVE",
              comment: "丁寧に見てもらえました。",
              reviewReplyUrl: "https://business.google.com/reviews/reply",
              createTime: "2026-08-20T00:00:00Z",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const reviews = await fetchGbpReviews(fetchMock);

    expect(reviews).toEqual([
      expect.objectContaining({
        googleReviewId: "accounts/10/locations/20/reviews/encrypted-review-30",
        gbpReviewId: "encrypted-review-30",
        gbpLocationId: "accounts/10/locations/20",
        reviewerName: "佐藤英樹",
        authorPhotoUrl: "https://lh3.googleusercontent.com/photo",
        rating: 5,
        reviewText: "丁寧に見てもらえました。",
        reviewUrl: "https://business.google.com/reviews/reply",
        reviewedAt: "2026-08-20T00:00:00Z",
      }),
    ]);
  });

  it("normalizes anonymous and legacy-shaped GBP review fields safely", async () => {
    process.env.GBP_API_REVIEWS_URL = "https://gbp.example/reviews";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          reviews: [
            {
              name: "accounts/10/locations/20/reviews/no-review-id",
              reviewer: { isAnonymous: true },
              starRating: "STAR_RATING_UNSPECIFIED",
              reviewText: "本文だけがある口コミです。",
              reviewUrl: "https://maps.example/review",
              updateTime: "2026-08-21T00:00:00Z",
            },
            {
              reviewId: "legacy-review-id",
              authorName: "一ノ瀬大輝",
              rating: 6.8,
              comment: "数値評価の口コミです。",
              gbpLocationId: "locations/20",
            },
            {
              reviewer: { displayName: "IDなし投稿者" },
              comment: "IDがないため同期対象外です。",
            },
            null,
          ],
        }),
        { status: 200 },
      ),
    );

    const reviews = await fetchGbpReviews(fetchMock);

    expect(reviews).toEqual([
      expect.objectContaining({
        googleReviewId: "accounts/10/locations/20/reviews/no-review-id",
        gbpReviewId: "no-review-id",
        reviewerName: "Googleユーザー",
        rating: 0,
        reviewText: "本文だけがある口コミです。",
        reviewUrl: "https://maps.example/review",
        reviewedAt: "2026-08-21T00:00:00Z",
      }),
      expect.objectContaining({
        googleReviewId: "legacy-review-id",
        gbpReviewId: "legacy-review-id",
        reviewerName: "一ノ瀬大輝",
        rating: 5,
        reviewText: "数値評価の口コミです。",
        gbpLocationId: "locations/20",
      }),
    ]);
  });

  it("persists official GBP review names for reliable reply posting", async () => {
    delete process.env.OPENAI_API_KEY;

    const prisma = {
      school: {
        findFirst: vi.fn(async () => ({
          id: "school_1",
          name: "iスクール予備校",
          gbpLocationId: "locations/20",
          lineChannelId: null,
          schoolSetting: {
            lineNotifyEnabled: false,
            lineChannelAccessToken: null,
            lineDestinationId: null,
            notifyOnNewReview: true,
            notifyOnLowRating: true,
          },
        })),
      },
      review: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({ id: "review_db_1", ...data })),
        update: vi.fn(),
      },
    };

    await processGbpReviews({
      reviews: [
        {
          googleReviewId: "accounts/10/locations/20/reviews/encrypted-review-30",
          gbpReviewId: "encrypted-review-30",
          gbpLocationId: "locations/20",
          reviewerName: "一ノ瀬大輝",
          rating: 5,
          reviewText: "質問しやすかったです。",
        },
      ],
      prisma,
      fetchImpl: vi.fn(),
    });

    expect(prisma.review.findFirst).toHaveBeenCalledWith({
      where: {
        schoolId: "school_1",
        OR: [
          { googleReviewId: "accounts/10/locations/20/reviews/encrypted-review-30" },
          { gbpReviewId: "encrypted-review-30" },
        ],
      },
    });
    expect(prisma.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentName: "一ノ瀬大輝",
          authorName: "一ノ瀬大輝",
          googleReviewId: "accounts/10/locations/20/reviews/encrypted-review-30",
          gbpReviewId: "encrypted-review-30",
        }),
      }),
    );
  });

  it("matches schools by Google place id without adding location alternatives", async () => {
    delete process.env.OPENAI_API_KEY;

    const prisma = {
      school: {
        findFirst: vi.fn(async () => ({
          id: "school_1",
          name: "iスクール予備校",
          googlePlaceId: "place_1",
          gbpLocationId: null,
          lineChannelId: null,
          schoolSetting: {
            lineNotifyEnabled: false,
            lineChannelAccessToken: null,
            lineDestinationId: null,
            notifyOnNewReview: true,
            notifyOnLowRating: true,
          },
        })),
      },
      review: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({ id: "review_db_1", ...data })),
        update: vi.fn(),
      },
    };

    await processGbpReviews({
      reviews: [
        {
          googleReviewId: "google_review_1",
          googlePlaceId: "place_1",
          reviewerName: "佐藤英樹",
          rating: 5,
          reviewText: "丁寧でした。",
        },
      ],
      prisma,
      fetchImpl: vi.fn(),
    });

    expect(prisma.school.findFirst).toHaveBeenCalledWith({
      where: { googlePlaceId: "place_1" },
      include: { schoolSetting: true },
    });
  });

  it("returns an empty list when GBP response does not contain an array", async () => {
    process.env.GBP_API_REVIEWS_URL = "https://gbp.example/reviews";
    delete process.env.GBP_API_ACCESS_TOKEN;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ reviews: null }), { status: 200 }),
    );

    await expect(fetchGbpReviews(fetchMock)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith("https://gbp.example/reviews", {
      headers: undefined,
    });
  });

  it("throws when GBP review fetch fails", async () => {
    process.env.GBP_API_REVIEWS_URL = "https://gbp.example/reviews";

    await expect(
      fetchGbpReviews(vi.fn(async () => new Response("{}", { status: 500 }))),
    ).rejects.toThrow("GBP reviews fetch failed: 500");
  });
});
