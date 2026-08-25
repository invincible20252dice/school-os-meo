import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLineCustomReplyConfirmationMessage,
  buildLineReviewMessage,
  buildStarRating,
  classifyLineDestination,
  LineApiError,
  maskLineDestination,
  replyLineFlexMessage,
  replyLineMessage,
  replyLineTextMessages,
  sendLineReviewNotification,
} from "./line";

const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

function getFooterActions(message: ReturnType<typeof buildLineReviewMessage>) {
  const footer = message.contents.footer as {
    contents: Array<{ action: Record<string, string> }>;
  };
  return footer.contents.map((content) => content.action);
}

function parsePostbackAction(action: Record<string, string>) {
  return JSON.parse(action.data) as { action: string; reviewId: string };
}

describe("line", () => {
  it("formats numeric ratings as stars", () => {
    expect(buildStarRating(5)).toBe("★★★★★");
    expect(buildStarRating(3)).toBe("★★★☆☆");
    expect(buildStarRating(0)).toBe("☆☆☆☆☆");
    expect(buildStarRating(8)).toBe("★★★★★");
    expect(buildStarRating(2.6)).toBe("★★★☆☆");
    expect(buildStarRating(-2)).toBe("☆☆☆☆☆");
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
    expect(classifyLineDestination("line-group-id")).toBe("unknown");
    expect(maskLineDestination("short")).toBe("short");
  });


  it("builds a review notification message with approval and edit action buttons", () => {
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
    expect(JSON.stringify(message)).toContain("この内容でGBPに投稿");
    expect(JSON.stringify(message)).toContain("✏️ 返信文を編集");
    expect(JSON.stringify(message)).toContain("修正したい返信文をそのまま返信");
    expect(JSON.stringify(message)).not.toContain("管理画面で確認");
    const actions = getFooterActions(message);
    expect(actions[0]).toMatchObject({
      type: "postback",
      label: "この内容でGBPに投稿",
    });
    expect(parsePostbackAction(actions[0])).toEqual({
      action: "approve_reply",
      reviewId: "review_123",
    });
    expect(actions[1]).toMatchObject({
      type: "postback",
      label: "✏️ 返信文を編集",
      displayText: "返信文を編集します",
    });
    expect(actions[1].type).not.toBe("message");
    expect(parsePostbackAction(actions[1])).toEqual({
      action: "request_edit_text",
      reviewId: "review_123",
    });
  });

  it("builds message links from Vercel URL and includes Google review action", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_URL = "school-os-meo.vercel.app/";

    const message = buildLineReviewMessage({
      reviewId: "review with spaces",
      schoolName: "青葉ゼミナール",
      rating: 4,
      reviewText: "先生が丁寧でした。",
      aiReplyText: "温かい口コミをありがとうございます。",
      googleReviewUrl: "https://google.example.com/review",
    });
    const serialized = JSON.stringify(message);

    const actions = getFooterActions(message);
    expect(parsePostbackAction(actions[1])).toEqual({
      action: "request_edit_text",
      reviewId: "review with spaces",
    });
    expect(serialized).toContain("Google口コミを開く");
    expect(serialized).toContain("https://google.example.com/review");
  });

  it("builds a custom reply confirmation Flex Message", () => {
    const message = buildLineCustomReplyConfirmationMessage({
      reviewId: "review with spaces",
      userCustomText: "確認してから投稿したい返信文です。",
    });
    const serialized = JSON.stringify(message);

    expect(message.altText).toBe("返信文の投稿確認");
    expect(serialized).toContain("こちらの文章で投稿してよろしいですか？");
    expect(serialized).toContain("確認してから投稿したい返信文です。");
    const footer = message.contents.footer as {
      contents: Array<{ action: Record<string, string> }>;
    };
    expect(parsePostbackAction(footer.contents[0].action)).toEqual({
      action: "confirm_custom_reply",
      reviewId: "review with spaces",
    });
    expect(parsePostbackAction(footer.contents[1].action)).toEqual({
      action: "request_edit_text",
      reviewId: "review with spaces",
    });
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

  it("replies with a Flex Message through LINE Messaging API", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const message = buildLineCustomReplyConfirmationMessage({
      reviewId: "review-1",
      userCustomText: "修正後の返信文です。",
    });
    const fetchMock = vi.fn(
      async () =>
        new Response("{}", {
          status: 200,
          headers: { "x-line-request-id": "reply-request-1" },
        }),
    );

    const result = await replyLineFlexMessage({
      replyToken: "line-reply-token",
      message,
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({ status: 200, requestId: "reply-request-1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer line-token",
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.replyToken).toBe("line-reply-token");
    expect(body.messages[0]).toEqual(message);
  });

  it("replies with a plain text message through LINE Messaging API", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const fetchMock = vi.fn(
      async () =>
        new Response("{}", {
          status: 200,
          headers: { "x-line-request-id": "text-reply-request-1" },
        }),
    );

    const result = await replyLineMessage({
      replyToken: "line-reply-token",
      text: "返信文を受け付けました。",
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({
      status: 200,
      requestId: "text-reply-request-1",
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({
      replyToken: "line-reply-token",
      messages: [{ type: "text", text: "返信文を受け付けました。" }],
    });
  });

  it("replies with multiple plain text messages through LINE Messaging API", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const fetchMock = vi.fn(
      async () =>
        new Response("{}", {
          status: 200,
          headers: { "x-line-request-id": "multi-text-reply-request-1" },
        }),
    );

    const result = await replyLineTextMessages({
      replyToken: "line-reply-token",
      texts: ["以下の文章をコピーして編集してください。", "AI返信ドラフトです。"],
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({
      status: 200,
      requestId: "multi-text-reply-request-1",
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages).toEqual([
      { type: "text", text: "以下の文章をコピーして編集してください。" },
      { type: "text", text: "AI返信ドラフトです。" },
    ]);
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

  it("fails fast when replying with a Flex Message and LINE token is missing", async () => {
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;

    await expect(
      replyLineFlexMessage({
        replyToken: "line-reply-token",
        message: buildLineCustomReplyConfirmationMessage({
          reviewId: "review-1",
          userCustomText: "修正文です。",
        }),
        fetchImpl: vi.fn(),
      }),
    ).rejects.toThrow("LINE_CHANNEL_ACCESS_TOKEN is not configured.");
  });

  it("fails fast when replying with text and LINE token is missing", async () => {
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;

    await expect(
      replyLineMessage({
        replyToken: "line-reply-token",
        text: "返信文です。",
        fetchImpl: vi.fn(),
      }),
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

  it("wraps plain text LINE API errors", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "invalid-line-token";
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => new Response("plain error", { status: 429 }));

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
      status: 429,
      details: { message: "plain error" },
    });
    consoleErrorSpy.mockRestore();
  });

  it("wraps LINE API errors when replying with a Flex Message", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "invalid-line-token";
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "Invalid reply token" }), {
          status: 400,
        }),
    );

    await expect(
      replyLineFlexMessage({
        replyToken: "line-reply-token",
        message: buildLineCustomReplyConfirmationMessage({
          reviewId: "review-1",
          userCustomText: "修正文です。",
        }),
        fetchImpl: fetchMock,
      }),
    ).rejects.toMatchObject({
      name: "LineApiError",
      status: 400,
      details: { message: "Invalid reply token" },
    } satisfies Partial<LineApiError>);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "LINE API Error Details:",
      expect.stringContaining("Invalid reply token"),
    );
    consoleErrorSpy.mockRestore();
  });

  it("wraps LINE API errors when replying with text", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "invalid-line-token";
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "Expired reply token" }), {
          status: 400,
        }),
    );

    await expect(
      replyLineMessage({
        replyToken: "line-reply-token",
        text: "返信文です。",
        fetchImpl: fetchMock,
      }),
    ).rejects.toMatchObject({
      name: "LineApiError",
      status: 400,
      details: { message: "Expired reply token" },
    } satisfies Partial<LineApiError>);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "LINE API Error Details:",
      expect.stringContaining("Expired reply token"),
    );
    consoleErrorSpy.mockRestore();
  });

  it("wraps empty LINE API error responses with the status", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "invalid-line-token";
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => new Response("", { status: 500 }));

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
      status: 500,
      details: { message: "LINE API returned 500" },
    });
    consoleErrorSpy.mockRestore();
  });
});
