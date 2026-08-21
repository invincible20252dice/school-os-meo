import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/gbp-webhook", () => ({
  fetchGbpReviews: vi.fn(async () => [
    {
      googleReviewId: "google-review-1",
      gbpLocationId: "locations/100",
      rating: 5,
      reviewText: "丁寧でした。",
    },
  ]),
  processGbpReviews: vi.fn(async () => ({
    received: 1,
    saved: 1,
    notified: 1,
    skipped: 0,
  })),
}));

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe("POST /api/cron/fetch-reviews", () => {
  it("rejects requests when cron secret does not match", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/cron/fetch-reviews", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      }),
    );

    expect(response.status).toBe(401);
  });

  it("fetches GBP reviews and processes AI replies when authorized", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const webhook = await import("@/lib/gbp-webhook");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/cron/fetch-reviews", {
        method: "POST",
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      received: 1,
      saved: 1,
      notified: 1,
      skipped: 0,
    });
    expect(webhook.fetchGbpReviews).toHaveBeenCalledOnce();
    expect(webhook.processGbpReviews).toHaveBeenCalledOnce();
  });

  it("returns a Japanese error when review collection fails", async () => {
    delete process.env.CRON_SECRET;
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const webhook = await import("@/lib/gbp-webhook");
    vi.mocked(webhook.fetchGbpReviews).mockRejectedValueOnce(new Error("failed"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://app.example.com/api/cron/fetch-reviews", {
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("GBP口コミの取得に失敗しました。");
    consoleErrorSpy.mockRestore();
  });
});
