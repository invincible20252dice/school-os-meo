import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

const originalEnv = process.env;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: {},
  },
}));

vi.mock("@/lib/line-webhook", () => ({
  handleLineWebhookEvents: vi.fn(async ({ events }) => ({
    processed: events.length,
    results: ["approved"],
  })),
}));

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe("POST /api/line/webhook", () => {
  it("passes LINE events to the webhook handler", async () => {
    const lineWebhook = await import("@/lib/line-webhook");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://app.example.com/api/line/webhook", {
        method: "POST",
        body: JSON.stringify({
          events: [
            {
              type: "postback",
              replyToken: "reply-token",
              postback: { data: "action=approve_reply&reviewId=review-1" },
            },
          ],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ processed: 1, results: ["approved"] });
    expect(lineWebhook.handleLineWebhookEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        events: [expect.objectContaining({ type: "postback" })],
      }),
    );
  });

  it("rejects requests when LINE_WEBHOOK_SECRET does not match", async () => {
    process.env.LINE_WEBHOOK_SECRET = "secret";
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://app.example.com/api/line/webhook", {
        method: "POST",
        headers: { "x-line-webhook-secret": "wrong" },
        body: JSON.stringify({ events: [] }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("accepts requests when LINE_WEBHOOK_SECRET matches", async () => {
    process.env.LINE_WEBHOOK_SECRET = "secret";
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://app.example.com/api/line/webhook", {
        method: "POST",
        headers: { "x-line-webhook-secret": "secret" },
        body: JSON.stringify({ events: [] }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ processed: 0, results: ["approved"] });
  });

  it("accepts requests with a valid LINE signature", async () => {
    process.env.LINE_CHANNEL_SECRET = "line-channel-secret";
    const rawBody = JSON.stringify({ events: [] });
    const signature = createHmac("sha256", "line-channel-secret")
      .update(rawBody)
      .digest("base64");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://app.example.com/api/line/webhook", {
        method: "POST",
        headers: { "x-line-signature": signature },
        body: rawBody,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ processed: 0, results: ["approved"] });
  });

  it("rejects requests with an invalid LINE signature", async () => {
    process.env.LINE_CHANNEL_SECRET = "line-channel-secret";
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://app.example.com/api/line/webhook", {
        method: "POST",
        headers: { "x-line-signature": "invalid-signature" },
        body: JSON.stringify({ events: [] }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects requests when LINE channel secret is configured but no signature or custom secret matches", async () => {
    process.env.LINE_CHANNEL_SECRET = "line-channel-secret";
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://app.example.com/api/line/webhook", {
        method: "POST",
        body: JSON.stringify({ events: [] }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("accepts an empty webhook body as an empty event list", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://app.example.com/api/line/webhook", {
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ processed: 0, results: ["approved"] });
  });

  it("treats invalid JSON and non-array events as an empty LINE event list", async () => {
    const lineWebhook = await import("@/lib/line-webhook");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://app.example.com/api/line/webhook", {
        method: "POST",
        body: "{invalid-json",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, handled: false });
    expect(lineWebhook.handleLineWebhookEvents).not.toHaveBeenCalled();
  });

  it("keeps LINE webhook responses successful when handling fails", async () => {
    const lineWebhook = await import("@/lib/line-webhook");
    vi.mocked(lineWebhook.handleLineWebhookEvents).mockRejectedValueOnce(
      new Error("LINE down"),
    );
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://app.example.com/api/line/webhook", {
        method: "POST",
        body: JSON.stringify({ events: [] }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, handled: false });
  });
});
