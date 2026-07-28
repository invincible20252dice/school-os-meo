import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    schoolSetting: { findFirst: vi.fn() },
    review: { create: vi.fn() },
  },
}));

vi.mock("@/lib/trigger-review-test", () => ({
  triggerReviewTest: vi.fn(async () => ({
    ok: true,
    saved: true,
    notified: true,
    reviewId: "review-1",
    message: "LINEにテスト通知を送信しました！",
  })),
}));

vi.mock("@/lib/line", async () => {
  const actual = await vi.importActual<typeof import("@/lib/line")>("@/lib/line");

  return {
    ...actual,
    sendLineReviewNotification: vi.fn(),
  };
});

describe("POST /api/test/trigger-review", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("triggers a dummy review notification", async () => {
    const { triggerReviewTest } = await import("@/lib/trigger-review-test");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/test/trigger-review", {
        method: "POST",
        body: JSON.stringify({
          lineChannelAccessToken: "line-token",
          lineDestinationId: "line-group",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("LINEにテスト通知を送信しました！");
    expect(triggerReviewTest).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          lineChannelAccessToken: "line-token",
        }),
      }),
    );
  });

  it("falls back to a local preview when DB processing fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const service = await import("@/lib/trigger-review-test");
    vi.mocked(service.triggerReviewTest).mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/test/trigger-review", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.saved).toBe(false);
    expect(body.notified).toBe(false);
    expect(body.message).toContain("DB未接続");
    expect(body.preview.aiReplyText).toContain("青葉ゼミナール");
    consoleErrorSpy.mockRestore();
  });

  it("returns LINE API details from local fallback notification failures", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const service = await import("@/lib/trigger-review-test");
    const line = await import("@/lib/line");
    vi.mocked(service.triggerReviewTest).mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    vi.mocked(line.sendLineReviewNotification).mockRejectedValueOnce(
      new line.LineApiError(401, {
        message: "Authentication failed. Confirm that the access token is valid.",
      }),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/test/trigger-review", {
        method: "POST",
        body: JSON.stringify({
          lineChannelAccessToken: "invalid-token",
          lineDestinationId: "line-group",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.lineStatus).toBe(401);
    expect(body.message).toContain("LINE送信エラー");
    expect(body.details.message).toContain("Authentication failed");
    consoleErrorSpy.mockRestore();
  });

  it("returns LINE API details when DB-backed processing fails with a LINE API error", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const service = await import("@/lib/trigger-review-test");
    const line = await import("@/lib/line");
    vi.mocked(service.triggerReviewTest).mockRejectedValueOnce(
      new line.LineApiError(403, {
        message: "The bot is not a member of the group chat.",
      }),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/test/trigger-review", {
        method: "POST",
        body: JSON.stringify({
          lineChannelAccessToken: "line-token",
          lineDestinationId: "line-group",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      ok: false,
      saved: false,
      notified: false,
      error: "The bot is not a member of the group chat.",
      lineStatus: 403,
    });
    consoleErrorSpy.mockRestore();
  });

  it("sends LINE from the local fallback when DB processing fails but LINE settings are valid", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const service = await import("@/lib/trigger-review-test");
    const line = await import("@/lib/line");
    vi.mocked(service.triggerReviewTest).mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    vi.mocked(line.sendLineReviewNotification).mockResolvedValueOnce({
      status: 200,
      requestId: "line-request-1",
      destinationType: "user",
      destinationPreview: "U1234",
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/test/trigger-review", {
        method: "POST",
        body: JSON.stringify({
          schoolName: "青葉ゼミナール 駅前校",
          rating: 4,
          reviewText: "面談が丁寧でした。",
          lineChannelAccessToken: "line-token",
          lineDestinationId: "U1234567890",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      saved: false,
      notified: true,
      diagnostics: {
        db: "DB未接続のため口コミ保存はスキップしました。",
        lineApi: "LINE API accepted: 200",
        lineRequestId: "line-request-1",
        destinationType: "user",
        destinationPreview: "U1234",
      },
    });
    expect(body.diagnostics.deliveryNote).toContain("User ID");
    consoleErrorSpy.mockRestore();
  });

  it("ignores masked LINE values and returns a local preview", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const service = await import("@/lib/trigger-review-test");
    vi.mocked(service.triggerReviewTest).mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/test/trigger-review", {
        method: "POST",
        body: JSON.stringify({
          lineChannelAccessToken: "LINE_CHANNEL_TOKEN_********",
          lineDestinationId: "C****************",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.notified).toBe(false);
    expect(body.preview.reviewText).toContain("先生がとても親身");
    consoleErrorSpy.mockRestore();
  });
});
