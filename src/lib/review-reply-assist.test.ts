import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleReviewManagementUrl,
  copyReviewReply,
  formatDraftText,
  submitDirectReviewReply,
} from "./review-reply-assist";

describe("submitDirectReviewReply", () => {
  const input = { reviewId: "review-1", schoolId: "school-1", replyText: "  返信\\n本文  ", headers: { authorization: "Bearer session-token" } };
  afterEach(() => vi.unstubAllGlobals());

  it("submits the edited text with the review's school and authenticated session", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ success: true, googlePosted: true, message: "送信しました" }));
    expect(await submitDirectReviewReply(input, fetchMock)).toBe("送信しました");
    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard/reviews/reply", {
      method: "POST", headers: { authorization: "Bearer session-token", "Content-Type": "application/json" },
      body: JSON.stringify({ reviewId: "review-1", schoolId: "school-1", replyText: "返信\n本文" }),
    });
  });

  it("does not submit an empty draft", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(submitDirectReviewReply({ ...input, replyText: " \\n " }, fetchMock)).rejects.toThrow("返信文を入力");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [200, { success: true, googlePosted: false }],
    [200, { success: false, googlePosted: true }],
    [200, { success: true }],
    [200, { success: "false", googlePosted: true }],
    [401, { success: true, googlePosted: true }],
    [200, null],
  ])("does not report an unconfirmed Google post as successful (case %#)", async (status, body) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body, { status }));
    await expect(submitDirectReviewReply(input, fetchMock)).rejects.toThrow("Googleへの返信送信を確認できませんでした");
  });

  it("preserves the distinct remote-success/database-failure message", async () => {
    const message = "Googleへの送信は完了しましたが、管理画面への保存に失敗しました。";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ success: false, googlePosted: true, message }, { status: 500 }));
    await expect(submitDirectReviewReply(input, fetchMock)).rejects.toThrow(message);
  });

  it("reports invalid JSON as an unconfirmed post", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("gateway failure", { status: 502 }));
    await expect(submitDirectReviewReply(input, fetchMock)).rejects.toThrow("Googleへの返信送信を確認できませんでした");
  });

  it("uses browser fetch and the default confirmed-success message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: true, googlePosted: true })));
    expect(await submitDirectReviewReply(input)).toBe("Googleへ返信を送信しました。");
  });
});

describe("buildGoogleReviewManagementUrl", () => {
  it.each([
    "6467241578381534467",
    " locations/6467241578381534467 ",
    "accounts/123/locations/6467241578381534467",
  ])("opens the exact configured location's reviews: %s", (locationId) => {
    expect(buildGoogleReviewManagementUrl(locationId)).toBe(
      "https://business.google.com/n/6467241578381534467/reviews",
    );
  });

  it.each([
    null, undefined, "", " ", "manual-123", "ChIJabc", "school-1",
    "https://example.com", "locations/123?redirect=evil", "locations/../456",
    "accounts/123/456", "accounts/123/locations/456/reviews/789",
  ])("does not invent a destination for invalid identifiers: %s", (locationId) => {
    expect(buildGoogleReviewManagementUrl(locationId)).toBeNull();
  });
});

describe("formatDraftText", () => {
  it.each([
    [null, ""], [undefined, ""], ["", ""],
    ["本文です。", "本文です。"],
    ["佐藤様\\n\\nありがとうございます。", "佐藤様\n\nありがとうございます。"],
    ["冒頭\\r\\n本文\r\n結び", "冒頭\n本文\n結び"],
    ["既存の\n改行と\\n文字列", "既存の\n改行と\n文字列"],
    ["引用 \\\"本文\\\" と \\t は変更しない", "引用 \\\"本文\\\" と \\t は変更しない"],
  ])("normalizes only line breaks: %s", (input, expected) => {
    expect(formatDraftText(input)).toBe(expected);
    expect(formatDraftText(formatDraftText(input))).toBe(expected);
  });
});

describe("copyReviewReply", () => {
  it("copies the normalized draft", async () => {
    const writeText = vi.fn(async () => undefined);

    const result = await copyReviewReply("  佐藤様\\n\\n返信案です。  ", {
      writeText,
    });

    expect(writeText).toHaveBeenCalledWith("佐藤様\n\n返信案です。");
    expect(result).toBe("佐藤様\n\n返信案です。");
  });

  it("rejects empty drafts without touching the clipboard", async () => {
    const writeText = vi.fn(async () => undefined);
    await expect(
      copyReviewReply(" \\n\\r\\n  ", {
        writeText,
      }),
    ).rejects.toThrow("REPLY_REQUIRED");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("uses the browser copy fallback when clipboard permission is denied", async () => {
    const writeTextFallback = vi.fn();

    const result = await copyReviewReply("返信案", {
      writeText: vi.fn(async () => {
        throw new Error("clipboard denied");
      }),
      writeTextFallback,
    });

    expect(writeTextFallback).toHaveBeenCalledWith("返信案");
    expect(result).toBe("返信案");
  });

  it("reports an error when both copy methods fail", async () => {
    await expect(
      copyReviewReply("返信案", {
        writeText: vi.fn(async () => {
          throw new Error("clipboard denied");
        }),
        writeTextFallback: vi.fn(() => {
          throw new Error("fallback denied");
        }),
      }),
    ).rejects.toThrow("fallback denied");
  });

  it("preserves a clipboard failure when no fallback is available", async () => {
    await expect(copyReviewReply("返信案", {
      writeText: vi.fn().mockRejectedValue(new Error("clipboard denied")),
    })).rejects.toThrow("clipboard denied");
  });
});
