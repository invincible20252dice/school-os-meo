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
          source: "GOOGLE",
          status: "GENERATED",
          rating: 5,
          originalText: "先生が丁寧でした。",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("updates existing GBP reviews without creating duplicates", async () => {
    delete process.env.OPENAI_API_KEY;

    const prisma = {
      school: {
        findFirst: vi.fn(async () => ({
          id: "school_1",
          name: "青葉ゼミナール",
          lineChannelId: null,
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
      }),
    );
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
