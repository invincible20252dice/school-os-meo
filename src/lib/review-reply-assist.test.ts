import { describe, expect, it, vi } from "vitest";
import {
  GBP_REVIEWS_MANAGEMENT_URL,
  copyReviewReplyAndOpenGbp,
} from "./review-reply-assist";

describe("copyReviewReplyAndOpenGbp", () => {
  it("copies the normalized draft and opens GBP in a separate tab", async () => {
    const openedWindow = { opener: "current-window", close: vi.fn() };
    const writeText = vi.fn(async () => undefined);
    const openWindow = vi.fn(() => openedWindow);

    const result = await copyReviewReplyAndOpenGbp("  返信案です。  ", {
      writeText,
      openWindow,
    });

    expect(writeText).toHaveBeenCalledWith("返信案です。");
    expect(openWindow).toHaveBeenCalledWith(GBP_REVIEWS_MANAGEMENT_URL, "_blank");
    expect(openedWindow.opener).toBeNull();
    expect(result).toEqual({
      replyText: "返信案です。",
      targetUrl: GBP_REVIEWS_MANAGEMENT_URL,
    });
  });

  it("rejects empty drafts without opening another tab", async () => {
    const openWindow = vi.fn(() => ({ opener: null }));

    await expect(
      copyReviewReplyAndOpenGbp("   ", {
        writeText: vi.fn(async () => undefined),
        openWindow,
      }),
    ).rejects.toThrow("REPLY_REQUIRED");
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("closes the opened tab when clipboard writing fails", async () => {
    const close = vi.fn();

    await expect(
      copyReviewReplyAndOpenGbp("返信案", {
        writeText: vi.fn(async () => {
          throw new Error("clipboard denied");
        }),
        openWindow: vi.fn(() => ({ opener: null, close })),
      }),
    ).rejects.toThrow("clipboard denied");
    expect(close).toHaveBeenCalledOnce();
  });

  it("reports when the browser blocks the GBP tab", async () => {
    const writeText = vi.fn(async () => undefined);

    await expect(
      copyReviewReplyAndOpenGbp("返信案", {
        writeText,
        openWindow: vi.fn(() => null),
      }),
    ).rejects.toThrow("POPUP_BLOCKED");
    expect(writeText).toHaveBeenCalledWith("返信案");
  });
});
