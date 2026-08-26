import { afterEach, describe, expect, it, vi } from "vitest";
import { handleLineWebhookEvents } from "./line-webhook";

const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

function buildReview(overrides: Record<string, unknown> = {}) {
  return {
    id: "review-1",
    schoolId: "school-1",
    status: "PENDING",
    googleReviewId: "google-review-1",
    gbpReviewId: "google-review-1",
    aiReplyText: "温かい口コミをありがとうございます。",
    aiReplyDraft: "温かい口コミをありがとうございます。",
    pendingCustomReply: null,
    replyText: null,
    school: {
      gbpAccountId: "accounts/1",
      gbpLocationId: "locations/100",
      schoolSetting: {
        googleRefreshToken: null,
        selectedGbpLocationId: "locations/100",
        lineChannelAccessToken: "school-line-token",
      },
    },
    ...overrides,
  };
}

describe("line-webhook", () => {
  it("posts an approved AI draft to GBP from a LINE postback", async () => {
    process.env.GBP_API_ACCESS_TOKEN = "gbp-token";
    const review = buildReview();
    const prisma = {
      review: {
        findUnique: vi.fn(async () => review),
        findFirst: vi.fn(),
        update: vi.fn(async ({ data }) => ({ ...review, ...data })),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "line-reply-token",
          source: { userId: "U-review-admin" },
          postback: { data: "action=approve_reply&reviewId=review-1" },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["approved"] });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://mybusiness.googleapis.com/v4/accounts/1/locations/100/reviews/google-review-1/reply",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ Authorization: "Bearer gbp-token" }),
        body: JSON.stringify({ comment: "温かい口コミをありがとうございます。" }),
      }),
    );
    expect(prisma.review.update).toHaveBeenCalledWith({
      where: { id: "review-1" },
      data: expect.objectContaining({
        replyText: "温かい口コミをありがとうございます。",
        status: "APPROVED",
        repliedAt: expect.any(Date),
      }),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer school-line-token",
        }),
        body: expect.stringContaining(
          "AI返信ドラフトの内容でGoogleマップに返信を投稿しました",
        ),
      }),
    );
  });

  it("stores a revised LINE text message and replies with a confirmation Flex Message", async () => {
    process.env.GBP_API_ACCESS_TOKEN = "gbp-token";
    const review = buildReview({ lineUserId: "C-review-group" });
    const prisma = {
      review: {
        findUnique: vi.fn(),
        findFirst: vi.fn(async () => review),
        update: vi.fn(async ({ data }) => ({ ...review, ...data })),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "message",
          replyToken: "line-reply-token",
          source: { userId: "U-review-admin", groupId: "C-review-group" },
          message: { type: "text", text: "修正した返信文です。" },
        },
      ],
    });

    expect(result).toEqual({
      processed: 1,
      results: ["custom_reply_confirmation_sent"],
    });
    expect(prisma.review.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          lineUserId: { in: ["C-review-group", "U-review-admin"] },
          status: {
            notIn: [
              "APPROVED",
              "REVISED",
              "REVISED_AND_REPLIED",
              "REPLIED",
              "POSTED",
              "ARCHIVED",
            ],
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
    );
    expect(prisma.review.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({
          comment: expect.anything(),
          gbpReviewId: expect.anything(),
        }),
      }),
    );
    expect(prisma.review.update).toHaveBeenCalledWith({
      where: { id: "review-1" },
      data: expect.objectContaining({
        pendingCustomReply: "修正した返信文です。",
        status: "PENDING_CUSTOM_REPLY",
      }),
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("mybusiness.googleapis.com"),
      expect.anything(),
    );

    const lineReplyCall = fetchMock.mock.calls.find(
      ([url]) => url === "https://api.line.me/v2/bot/message/reply",
    );
    const body = JSON.parse(String(lineReplyCall?.[1]?.body));
    expect(body.messages[0]).toMatchObject({
      type: "flex",
      altText: "投稿内容の確認",
    });
    const footerActions = body.messages[0].contents.footer.contents.map(
      (content: { action: { data: string } }) => JSON.parse(content.action.data),
    );
    expect(footerActions).toEqual([
      { action: "confirm_custom_reply", reviewId: "review-1" },
      { action: "request_edit_text", reviewId: "review-1" },
    ]);
  });

  it("posts the pending custom reply to GBP after LINE confirmation", async () => {
    process.env.GBP_API_ACCESS_TOKEN = "gbp-token";
    const review = buildReview({
      status: "PENDING_CUSTOM_REPLY",
      pendingCustomReply: "確認済みの修正返信文です。",
    });
    const prisma = {
      review: {
        findUnique: vi.fn(async () => review),
        findFirst: vi.fn(),
        update: vi.fn(async ({ data }) => ({ ...review, ...data })),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "line-reply-token",
          source: { groupId: "C-review-group" },
          postback: { data: "action=confirm_custom_reply&reviewId=review-1" },
        },
      ],
    });

    expect(result).toEqual({
      processed: 1,
      results: ["custom_reply_confirmed"],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://mybusiness.googleapis.com/v4/accounts/1/locations/100/reviews/google-review-1/reply",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ comment: "確認済みの修正返信文です。" }),
      }),
    );
    expect(prisma.review.update).toHaveBeenCalledWith({
      where: { id: "review-1" },
      data: expect.objectContaining({
        pendingCustomReply: null,
        replyText: "確認済みの修正返信文です。",
        aiReplyText: "確認済みの修正返信文です。",
        aiReplyDraft: "確認済みの修正返信文です。",
        status: "REVISED_AND_REPLIED",
        repliedAt: expect.any(Date),
      }),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({
        body: expect.stringContaining(
          "【投稿された返信文】\\n確認済みの修正返信文です。",
        ),
      }),
    );
  });

  it("does not post a custom confirmation when the review is already replied", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    process.env.GBP_API_ACCESS_TOKEN = "gbp-token";
    const review = buildReview({
      status: "REVISED_AND_REPLIED",
      pendingCustomReply: "再投稿しない返信文です。",
    });
    const prisma = {
      review: {
        findUnique: vi.fn(async () => review),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "line-reply-token",
          postback: {
            data: JSON.stringify({
              action: "confirm_custom_reply",
              reviewId: "review-1",
            }),
          },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["already_replied"] });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({ body: expect.stringContaining("既に返信済み") }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("mybusiness.googleapis.com"),
      expect.anything(),
    );
    expect(prisma.review.update).not.toHaveBeenCalled();
  });

  it("completes the mock custom reply confirmation without posting to GBP", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const prisma = {
      review: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "line-reply-token",
          postback: {
            data: JSON.stringify({
              action: "confirm_custom_reply",
              reviewId: "mock",
              text: "確認した修正文です。",
            }),
          },
        },
      ],
    });

    expect(result).toEqual({
      processed: 1,
      results: ["custom_reply_confirmed_mock"],
    });
    expect(prisma.review.findUnique).not.toHaveBeenCalled();
    expect(prisma.review.update).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({
        body: expect.stringContaining("テスト用の確認フローが完了しました"),
      }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("mybusiness.googleapis.com"),
      expect.anything(),
    );
  });

  it("does not post a duplicate reply for already replied reviews", async () => {
    const review = buildReview({ status: "APPROVED" });
    const prisma = {
      review: {
        findUnique: vi.fn(async () => review),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "line-reply-token",
          postback: { data: "action=approve_reply&reviewId=review-1" },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["already_replied"] });
    expect(prisma.review.update).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({ body: expect.stringContaining("既に返信済み") }),
    );
  });

  it("replies with a mock confirmation Flex Message when no pending review matches a revision message", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const prisma = {
      review: {
        findUnique: vi.fn(),
        findFirst: vi.fn(async () => null),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "message",
          replyToken: "line-reply-token",
          source: { userId: "U-no-review" },
          message: { type: "text", text: "修正文です。" },
        },
      ],
    });

    expect(result).toEqual({
      processed: 1,
      results: ["custom_reply_confirmation_sent_mock"],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({
        body: expect.stringContaining("こちらの文章で投稿してよろしいですか？"),
      }),
    );
    const lineReplyCall = fetchMock.mock.calls.find(
      ([url]) => url === "https://api.line.me/v2/bot/message/reply",
    );
    const body = JSON.parse(String(lineReplyCall?.[1]?.body));
    const confirmAction = body.messages[0].contents.footer.contents[0].action;
    expect(confirmAction).toMatchObject({
      type: "postback",
      label: "この内容で確定して投稿",
      displayText: "この内容で確定して投稿します",
    });
    expect(JSON.parse(confirmAction.data)).toEqual({
      action: "confirm_custom_reply",
      reviewId: "mock",
      text: "修正文です。",
    });
  });

  it("replies with a mock confirmation Flex Message even when text source IDs are absent", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const prisma = {
      review: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "message",
          replyToken: "line-reply-token",
          message: { type: "text", text: " sourceなしでも確認したい返信文 " },
        },
      ],
    });

    expect(result).toEqual({
      processed: 1,
      results: ["custom_reply_confirmation_sent_mock"],
    });
    expect(prisma.review.findFirst).not.toHaveBeenCalled();
    const lineReplyCall = fetchMock.mock.calls.find(
      ([url]) => url === "https://api.line.me/v2/bot/message/reply",
    );
    const body = JSON.parse(String(lineReplyCall?.[1]?.body));
    expect(body.messages[0]).toMatchObject({
      type: "flex",
      altText: "投稿内容の確認",
    });
    expect(JSON.stringify(body.messages[0])).toContain(
      "sourceなしでも確認したい返信文",
    );
  });

  it("falls back to a diagnostic text reply when the confirmation Flex Message is rejected", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const prisma = {
      review: {
        findUnique: vi.fn(),
        findFirst: vi.fn(async () => null),
        update: vi.fn(),
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "A message (messages[0]) in the request body is invalid",
          }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "message",
          replyToken: "line-reply-token",
          source: { groupId: "C-review-group" },
          message: { type: "text", text: "修正文です。" },
        },
      ],
    });

    expect(result).toEqual({
      processed: 1,
      results: ["custom_reply_confirmation_sent_mock"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallbackBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(fallbackBody.messages[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("HTTPステータス: 400"),
    });
    expect(fallbackBody.messages[0].text).toContain("request body is invalid");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[LINE Webhook] Failed to reply Flex Message.",
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();
  });

  it("falls back to a generic diagnostic text reply when Flex delivery throws before LINE responds", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const prisma = {
      review: {
        findUnique: vi.fn(),
        findFirst: vi.fn(async () => null),
        update: vi.fn(),
      },
    };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "message",
          replyToken: "line-reply-token",
          source: { roomId: "R-review-room" },
          message: { type: "text", text: "roomからの修正文です。" },
        },
      ],
    });

    expect(result).toEqual({
      processed: 1,
      results: ["custom_reply_confirmation_sent_mock"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallbackBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(fallbackBody.messages[0]).toMatchObject({
      type: "text",
      text: "確認メッセージの送信に失敗しました。Webhookログを確認してください。",
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[LINE Webhook] Failed to reply Flex Message.",
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();
  });

  it("logs when both Flex and diagnostic text replies fail", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const prisma = {
      review: {
        findUnique: vi.fn(),
        findFirst: vi.fn(async () => null),
        update: vi.fn(),
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Flex message is invalid" }), {
          status: 400,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Reply token expired" }), {
          status: 400,
        }),
      );

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "message",
          replyToken: "line-reply-token",
          source: {},
          message: { type: "text", text: "修正文です。" },
        },
      ],
    });

    expect(result).toEqual({
      processed: 1,
      results: ["custom_reply_confirmation_sent_mock"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[LINE Webhook] Failed to reply diagnostic text message.",
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();
  });

  it("reports missing reviews and missing drafts without posting to GBP", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const reviewWithoutDraft = buildReview({ aiReplyText: "", aiReplyDraft: null });
    const prisma = {
      review: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(reviewWithoutDraft)
          .mockResolvedValueOnce(null),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "missing-review-token",
          postback: { data: "action=approve_reply&reviewId=missing-review" },
        },
        {
          type: "postback",
          replyToken: "missing-draft-token",
          postback: { data: "action=approve_reply&reviewId=review-without-draft" },
        },
        {
          type: "postback",
          replyToken: "missing-custom-token",
          postback: {
            data: "action=confirm_custom_reply&reviewId=missing-review",
          },
        },
      ],
    });

    expect(result).toEqual({
      processed: 3,
      results: ["not_found", "missing_draft", "not_found"],
    });
    expect(prisma.review.update).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({
        body: expect.stringContaining("対象の口コミが見つかりません"),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({
        body: expect.stringContaining("AI返信ドラフトが見つかりません"),
      }),
    );
  });

  it("asks for another revision when a confirmation has no pending custom reply", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const review = buildReview({
      status: "PENDING_CUSTOM_REPLY",
      pendingCustomReply: "   ",
    });
    const prisma = {
      review: {
        findUnique: vi.fn(async () => review),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "line-reply-token",
          postback: { data: "action=confirm_custom_reply&reviewId=review-1" },
        },
      ],
    });

    expect(result).toEqual({
      processed: 1,
      results: ["missing_pending_custom_reply"],
    });
    expect(prisma.review.update).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({
        body: expect.stringContaining("もう一度、返信文を送信してください"),
      }),
    );
  });

  it("prompts the LINE user to send another custom reply text", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const review = buildReview({ status: "PENDING_CUSTOM_REPLY" });
    const prisma = {
      review: {
        findUnique: vi.fn(async () => review),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "line-reply-token",
          postback: { data: "action=request_edit_text&reviewId=review-1" },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["request_edit_text"] });
    expect(prisma.review.update).not.toHaveBeenCalled();
    const lineReplyCall = fetchMock.mock.calls.find(
      ([url]) => url === "https://api.line.me/v2/bot/message/reply",
    );
    const body = JSON.parse(String(lineReplyCall?.[1]?.body));
    expect(body.messages).toEqual([
      {
        type: "text",
        text: "📝 【返信文の編集】\n以下の文章をコピーして編集し、このチャットにそのまま送信してください。\n送信された内容でGoogleマップに返信が投稿されます。",
      },
      { type: "text", text: "温かい口コミをありがとうございます。" },
    ]);
  });

  it("replies with a fallback edit draft for local test review IDs without a DB record", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const prisma = {
      review: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "line-reply-token",
          postback: {
            data: "action=request_edit_text&reviewId=local_test_review_123",
          },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["request_edit_text"] });
    expect(prisma.review.findUnique).not.toHaveBeenCalled();
    const lineReplyCall = fetchMock.mock.calls.find(
      ([url]) => url === "https://api.line.me/v2/bot/message/reply",
    );
    const body = JSON.parse(String(lineReplyCall?.[1]?.body));
    expect(body.messages).toEqual([
      {
        type: "text",
        text: "📝 【返信文の編集】\n以下の文章をコピーして編集し、このチャットにそのまま送信してください。\n送信された内容でGoogleマップに返信が投稿されます。",
      },
      {
        type: "text",
        text: expect.stringContaining("青葉ゼミナール 本校への温かい口コミ"),
      },
    ]);
  });

  it("uses the latest DB LINE token when env token is missing for test edit postbacks", async () => {
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const prisma = {
      review: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      schoolSetting: {
        findFirst: vi.fn(async () => ({
          lineChannelAccessToken: "db-line-token",
        })),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "line-reply-token",
          postback: {
            data: JSON.stringify({
              action: "request_edit_text",
              reviewId: "local_test_review_123",
            }),
          },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["request_edit_text"] });
    expect(prisma.schoolSetting.findFirst).toHaveBeenCalledWith({
      where: { lineChannelAccessToken: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { lineChannelAccessToken: true },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer db-line-token",
        }),
      }),
    );
  });

  it("skips LINE verification dummy reply tokens", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const prisma = {
      review: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "00000000000000000000000000000000",
          postback: {
            data: JSON.stringify({
              action: "request_edit_text",
              reviewId: "local_test_review_123",
            }),
          },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["request_edit_text"] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call LINE Reply API when no token can be resolved", async () => {
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const prisma = {
      review: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      schoolSetting: {
        findFirst: vi.fn(async () => null),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "line-reply-token",
          postback: {
            data: JSON.stringify({
              action: "request_edit_text",
              reviewId: "local_test_review_123",
            }),
          },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["request_edit_text"] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call LINE Reply API for real reviews when no token source exists", async () => {
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const review = buildReview({
      school: {
        gbpAccountId: "accounts/1",
        gbpLocationId: "locations/100",
        schoolSetting: {
          googleRefreshToken: null,
          selectedGbpLocationId: "locations/100",
          lineChannelAccessToken: "",
        },
      },
    });
    const prisma = {
      review: {
        findUnique: vi.fn(async () => review),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "line-reply-token",
          postback: {
            data: JSON.stringify({
              action: "request_edit_text",
              reviewId: "review-1",
            }),
          },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["request_edit_text"] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a generic edit prompt when a real review has no draft", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const review = buildReview({ aiReplyText: "", aiReplyDraft: "" });
    const prisma = {
      review: {
        findUnique: vi.fn(async () => review),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "line-reply-token",
          postback: {
            data: JSON.stringify({
              action: "request_edit_text",
              reviewId: "review-1",
            }),
          },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["request_edit_text"] });
    const lineReplyCall = fetchMock.mock.calls.find(
      ([url]) => url === "https://api.line.me/v2/bot/message/reply",
    );
    const body = JSON.parse(String(lineReplyCall?.[1]?.body));
    expect(body.messages[1]).toEqual({
      type: "text",
      text: "AI返信ドラフトが見つかりませんでした。返信文を入力して送信してください。",
    });
  });

  it("ignores malformed JSON postback data", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const prisma = {
      review: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "line-reply-token",
          postback: { data: "{" },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["ignored"] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("replies to JSON postback data for edit requests", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const review = buildReview();
    const prisma = {
      review: {
        findUnique: vi.fn(async () => review),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "line-reply-token",
          postback: {
            data: JSON.stringify({
              action: "request_edit_text",
              reviewId: "review-1",
            }),
          },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["request_edit_text"] });
    expect(prisma.review.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "review-1" },
        select: expect.not.objectContaining({
          comment: expect.anything(),
          gbpReviewId: expect.anything(),
        }),
      }),
    );
    const lineReplyCall = fetchMock.mock.calls.find(
      ([url]) => url === "https://api.line.me/v2/bot/message/reply",
    );
    const body = JSON.parse(String(lineReplyCall?.[1]?.body));
    expect(body.messages).toEqual([
      {
        type: "text",
        text: "📝 【返信文の編集】\n以下の文章をコピーして編集し、このチャットにそのまま送信してください。\n送信された内容でGoogleマップに返信が投稿されます。",
      },
      { type: "text", text: "温かい口コミをありがとうございます。" },
    ]);
  });

  it("handles edit requests for missing or already replied reviews", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const alreadyRepliedReview = buildReview({ status: "REPLIED" });
    const prisma = {
      review: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(alreadyRepliedReview),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "missing-review-token",
          postback: { data: "action=request_edit_text&reviewId=missing-review" },
        },
        {
          type: "postback",
          replyToken: "already-replied-token",
          postback: { data: "action=request_edit_text&reviewId=review-1" },
        },
      ],
    });

    expect(result).toEqual({
      processed: 2,
      results: ["not_found", "already_replied"],
    });
    expect(prisma.review.update).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({
        body: expect.stringContaining("対象の口コミが見つかりません"),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({
        body: expect.stringContaining("既に返信済み"),
      }),
    );
  });

  it("returns the edit prompt result without consuming LINE reply when reply token is absent", async () => {
    const review = buildReview();
    const prisma = {
      review: {
        findUnique: vi.fn(async () => review),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          postback: { data: "action=request_edit_text&reviewId=review-1" },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["request_edit_text"] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores unsupported LINE events and malformed postbacks", async () => {
    const prisma = {
      review: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        { type: "follow" },
        { type: "postback", postback: { data: "action=approve_reply" } },
        { type: "postback", postback: { data: "action=confirm_custom_reply" } },
        { type: "postback", postback: { data: "action=request_edit_text" } },
        {
          type: "postback",
          postback: { data: "action=unknown&reviewId=review-1" },
        },
        { type: "message", message: { type: "image" } },
      ],
    });

    expect(result).toEqual({
      processed: 6,
      results: [
        "ignored",
        "missing_review_id",
        "missing_review_id",
        "request_edit_text",
        "ignored",
        "ignored",
      ],
    });
    expect(prisma.review.findUnique).not.toHaveBeenCalled();
    expect(prisma.review.findFirst).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts mock confirmation for source-less text and ignores blank revision text", async () => {
    const prisma = {
      review: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "message",
          source: {},
          message: { type: "text", text: "修正文です。" },
        },
        {
          type: "message",
          source: { userId: "U-review-admin" },
          message: { type: "text", text: "   " },
        },
      ],
    });

    expect(result).toEqual({
      processed: 2,
      results: ["custom_reply_confirmation_sent_mock", "ignored"],
    });
    expect(prisma.review.findFirst).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the school setting GBP location and skips LINE reply when reply token is absent", async () => {
    process.env.GBP_API_ACCESS_TOKEN = "gbp-token";
    const review = buildReview({
      school: {
        gbpAccountId: "accounts/1",
        gbpLocationId: null,
        schoolSetting: {
          googleRefreshToken: null,
          selectedGbpLocationId: "locations/from-setting",
          lineChannelAccessToken: "school-line-token",
        },
      },
    });
    const prisma = {
      review: {
        findUnique: vi.fn(async () => review),
        findFirst: vi.fn(),
        update: vi.fn(async ({ data }) => ({ ...review, ...data })),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          postback: { data: "action=approve_reply&reviewId=review-1" },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["approved"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://mybusiness.googleapis.com/v4/accounts/1/locations/from-setting/reviews/google-review-1/reply",
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
