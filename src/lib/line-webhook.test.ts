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
    status: "PENDING",
    googleReviewId: "google-review-1",
    aiReplyText: "温かい口コミをありがとうございます。",
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
  it("posts an approved AI draft to GBP from approve_reply postback", async () => {
    process.env.GBP_API_ACCESS_TOKEN = "gbp-token";
    const review = buildReview();
    const prisma = {
      review: {
        findUnique: vi.fn(async () => review),
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
          postback: { data: "action=approve_reply&reviewId=review-1" },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["approved"] });
    expect(prisma.review.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "review-1" },
        select: expect.not.objectContaining({
          comment: expect.anything(),
          gbpReviewId: expect.anything(),
          aiReplyDraft: expect.anything(),
          pendingCustomReply: expect.anything(),
        }),
      }),
    );
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
        aiReplyText: "温かい口コミをありがとうございます。",
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

  it("supports JSON postback data for approve_reply", async () => {
    process.env.GBP_API_ACCESS_TOKEN = "gbp-token";
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const review = buildReview({
      school: {
        gbpAccountId: "accounts/1",
        gbpLocationId: null,
        schoolSetting: {
          googleRefreshToken: null,
          selectedGbpLocationId: "locations/200",
          lineChannelAccessToken: null,
        },
      },
    });
    const prisma = {
      review: {
        findUnique: vi.fn(async () => review),
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
              action: "approve_reply",
              reviewId: "review-1",
            }),
          },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["approved"] });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://mybusiness.googleapis.com/v4/accounts/1/locations/200/reviews/google-review-1/reply",
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer line-token" }),
      }),
    );
  });

  it("ignores LINE text messages without touching Review records", async () => {
    const prisma = {
      review: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn();

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "message",
          replyToken: "line-reply-token",
          source: { groupId: "C-review-group" },
          message: { type: "text", text: "編集した返信文です。" },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["ignored_message"] });
    expect(prisma.review.findUnique).not.toHaveBeenCalled();
    expect(prisma.review.update).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores non-approve postbacks without touching Review records", async () => {
    const prisma = {
      review: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };

    const result = await handleLineWebhookEvents({
      prisma,
      events: [
        {
          type: "postback",
          replyToken: "line-reply-token",
          postback: { data: "action=request_edit_text&reviewId=review-1" },
        },
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

    expect(result).toEqual({
      processed: 2,
      results: ["ignored_postback", "ignored_postback"],
    });
    expect(prisma.review.findUnique).not.toHaveBeenCalled();
    expect(prisma.review.update).not.toHaveBeenCalled();
  });

  it("reports missing reviews and duplicate replies without posting to GBP", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
    const prisma = {
      review: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(buildReview({ status: "REPLIED" })),
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
          replyToken: "already-replied-token",
          postback: { data: "action=approve_reply&reviewId=review-1" },
        },
      ],
    });

    expect(result).toEqual({
      processed: 2,
      results: ["not_found", "already_replied"],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({ body: expect.stringContaining("見つかりません") }),
    );
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

  it("does not call LINE Reply API when reply token is a LINE verification dummy", async () => {
    process.env.GBP_API_ACCESS_TOKEN = "gbp-token";
    const review = buildReview();
    const prisma = {
      review: {
        findUnique: vi.fn(async () => review),
        update: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "00000000000000000000000000000000",
          postback: { data: "action=approve_reply&reviewId=review-1" },
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("mybusiness.googleapis.com"),
      expect.anything(),
    );
  });

  it("returns stable results for malformed postbacks and unsupported events", async () => {
    const prisma = {
      review: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };

    const result = await handleLineWebhookEvents({
      prisma,
      events: [
        { type: "follow" },
        { type: "postback", postback: { data: "{invalid-json" } },
        { type: "postback", postback: { data: "action=approve_reply" } },
        { type: "message", message: { type: "image" } },
      ],
    });

    expect(result).toEqual({
      processed: 4,
      results: [
        "ignored",
        "ignored_postback",
        "missing_review_id",
        "ignored_message",
      ],
    });
  });

  it("uses DB LINE token fallback when no review or env token is available", async () => {
    const prisma = {
      review: {
        findUnique: vi.fn(async () => null),
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
          postback: { data: "action=approve_reply&reviewId=missing-review" },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["not_found"] });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer db-line-token" }),
      }),
    );
  });

  it("logs token lookup failures and keeps webhook processing successful", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const prisma = {
      review: {
        findUnique: vi.fn(async () => null),
        update: vi.fn(),
      },
      schoolSetting: {
        findFirst: vi.fn(async () => {
          throw new Error("schema mismatch");
        }),
      },
    };
    const fetchMock = vi.fn();

    const result = await handleLineWebhookEvents({
      prisma,
      fetchImpl: fetchMock,
      events: [
        {
          type: "postback",
          replyToken: "line-reply-token",
          postback: { data: "action=approve_reply&reviewId=missing-review" },
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: ["not_found"] });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[LINE Webhook] Failed to resolve LINE token from DB.",
      expect.any(Error),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[LINE Webhook] Channel Access Token not found.",
    );
    consoleErrorSpy.mockRestore();
  });
});
