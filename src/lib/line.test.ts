import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLineReviewMessage,
  buildStarRating,
  classifyLineDestination,
  LineApiError,
  maskLineDestination,
  sendLineReviewNotification,
} from "./line";

const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("line", () => {
  it("formats numeric ratings as stars", () => {
    expect(buildStarRating(5)).toBe("★★★★★");
    expect(buildStarRating(3)).toBe("★★★☆☆");
    expect(buildStarRating(0)).toBe("☆☆☆☆☆");
    expect(buildStarRating(8)).toBe("★★★★★");
  });

  it("classifies and masks LINE destination IDs", () => {
    expect(classifyLineDestination("U2e44f216ade5b621ec109c3716c188ea")).toBe(
      "user",
    );
    expect(classifyLineDestination("Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBe(
      "group",
    );
    expect(classifyLineDestination("Rxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBe(
      "room",
    );
    expect(maskLineDestination("U2e44f216ade5b621ec109c3716c188ea")).toBe(
      "U2e44f...88ea",
    );
  });


  it("builds a review notification message with a reply action button", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";

    const message = buildLineReviewMessage({
      reviewId: "review_123",
      schoolName: "青葉ゼミナール",
      rating: 4,
      reviewText: "先生が丁寧でした。",
      aiReplyText: "温かい口コミをありがとうございます。",
    });

    expect(message.type).toBe("flex");
    expect(JSON.stringify(message)).toContain("青葉ゼミナール");
    expect(JSON.stringify(message)).toContain("★★★★☆");
    expect(JSON.stringify(message)).toContain(
      "https://app.example.com/api/gbp/reply?reviewId=review_123",
    );
  });

  it("pushes the notification to LINE Messaging API", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    const fetchMock = vi.fn(
      async () =>
        new Response("{}", {
          status: 200,
          headers: { "x-line-request-id": "line-request-1" },
        }),
    );

    const result = await sendLineReviewNotification(
      {
        to: "line-group-id",
        reviewId: "review_123",
        schoolName: "青葉ゼミナール",
        rating: 5,
        reviewText: "通いやすいです。",
        aiReplyText: "ご投稿ありがとうございます。",
      },
      fetchMock,
    );

    expect(result).toEqual({
      status: 200,
      requestId: "line-request-1",
      destinationType: "unknown",
      destinationPreview: "line-g...p-id",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/push",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer line-token",
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.to).toBe("line-group-id");
    expect(body.messages).toHaveLength(1);
  });

  it("fails fast when LINE token is missing", async () => {
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;

    await expect(
      sendLineReviewNotification(
        {
          to: "line-group-id",
          reviewId: "review_123",
          schoolName: "青葉ゼミナール",
          rating: 5,
          reviewText: "通いやすいです。",
          aiReplyText: "ご投稿ありがとうございます。",
        },
        vi.fn(),
      ),
    ).rejects.toThrow("LINE_CHANNEL_ACCESS_TOKEN is not configured.");
  });

  it("exposes LINE API error details when push fails", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "invalid-line-token";
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            message: "Authentication failed. Confirm that the access token is valid.",
          }),
          { status: 401 },
        ),
    );

    await expect(
      sendLineReviewNotification(
        {
          to: "line-group-id",
          reviewId: "review_123",
          schoolName: "青葉ゼミナール",
          rating: 5,
          reviewText: "通いやすいです。",
          aiReplyText: "ご投稿ありがとうございます。",
        },
        fetchMock,
      ),
    ).rejects.toMatchObject({
      name: "LineApiError",
      status: 401,
      details: {
        message: "Authentication failed. Confirm that the access token is valid.",
      },
    } satisfies Partial<LineApiError>);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "LINE API Error Details:",
      expect.stringContaining("Authentication failed"),
    );
    consoleErrorSpy.mockRestore();
  });
});
