import { describe, expect, it, vi } from "vitest";
import {
  copyReviewReply,
} from "./review-reply-assist";

describe("copyReviewReply", () => {
  it("copies the normalized draft", async () => {
    const writeText = vi.fn(async () => undefined);

    const result = await copyReviewReply("  返信案です。  ", {
      writeText,
    });

    expect(writeText).toHaveBeenCalledWith("返信案です。");
    expect(result).toBe("返信案です。");
  });

  it("rejects empty drafts without touching the clipboard", async () => {
    const writeText = vi.fn(async () => undefined);
    await expect(
      copyReviewReply("   ", {
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
});
