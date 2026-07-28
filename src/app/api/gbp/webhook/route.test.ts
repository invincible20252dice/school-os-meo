import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    school: {
      findFirst: vi.fn(),
    },
    review: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/gbp-webhook", () => ({
  fetchGbpReviews: vi.fn(),
  processGbpReviews: vi.fn(async () => ({
    received: 0,
    saved: 0,
    notified: 0,
    skipped: 0,
  })),
}));

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe("POST /api/gbp/webhook", () => {
  it("rejects requests when webhook secret does not match", async () => {
    process.env.GBP_WEBHOOK_SECRET = "expected-secret";
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/gbp/webhook", {
        method: "POST",
        headers: { "x-gbp-webhook-secret": "wrong-secret" },
        body: JSON.stringify({ reviews: [] }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("processes reviews from request body when authorized", async () => {
    process.env.GBP_WEBHOOK_SECRET = "expected-secret";
    const webhook = await import("@/lib/gbp-webhook");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/gbp/webhook", {
        method: "POST",
        headers: { "x-gbp-webhook-secret": "expected-secret" },
        body: JSON.stringify({
          reviews: [
            {
              googleReviewId: "review_1",
              googlePlaceId: "place_1",
              rating: 5,
              reviewText: "丁寧でした。",
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(webhook.processGbpReviews).toHaveBeenCalledWith(
      expect.objectContaining({
        reviews: [
          {
            googleReviewId: "review_1",
            googlePlaceId: "place_1",
            rating: 5,
            reviewText: "丁寧でした。",
          },
        ],
      }),
    );
  });

  it("fetches reviews when the request body does not include a reviews array", async () => {
    delete process.env.GBP_WEBHOOK_SECRET;
    const webhook = await import("@/lib/gbp-webhook");
    vi.mocked(webhook.fetchGbpReviews).mockResolvedValueOnce([
      {
        googleReviewId: "review_2",
        googlePlaceId: "place_2",
        rating: 4,
        reviewText: "安心して通えました。",
      },
    ]);
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/gbp/webhook", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(200);
    expect(webhook.fetchGbpReviews).toHaveBeenCalledOnce();
    expect(webhook.processGbpReviews).toHaveBeenCalledWith(
      expect.objectContaining({
        reviews: [
          {
            googleReviewId: "review_2",
            googlePlaceId: "place_2",
            rating: 4,
            reviewText: "安心して通えました。",
          },
        ],
      }),
    );
  });

  it("recovers from invalid JSON by fetching reviews", async () => {
    delete process.env.GBP_WEBHOOK_SECRET;
    const webhook = await import("@/lib/gbp-webhook");
    vi.mocked(webhook.fetchGbpReviews).mockResolvedValueOnce([]);
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/gbp/webhook", {
        method: "POST",
        body: "{",
      }),
    );

    expect(response.status).toBe(200);
    expect(webhook.fetchGbpReviews).toHaveBeenCalledOnce();
  });

  it("returns 500 when GBP review processing fails", async () => {
    delete process.env.GBP_WEBHOOK_SECRET;
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const webhook = await import("@/lib/gbp-webhook");
    vi.mocked(webhook.processGbpReviews).mockRejectedValueOnce(
      new Error("webhook failed"),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/gbp/webhook", {
        method: "POST",
        body: JSON.stringify({ reviews: [] }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("GBP口コミの処理に失敗しました。");
    consoleErrorSpy.mockRestore();
  });
});
