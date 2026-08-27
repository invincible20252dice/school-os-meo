import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGbpReviewReplyEndpoint,
  GbpReplyError,
  postGbpReviewReply,
  resolveGbpAccessToken,
} from "./gbp-reply";

const originalEnv = process.env;

vi.mock("./google-gbp-oauth", () => ({
  refreshGoogleAccessToken: vi.fn(async () => "refreshed-access-token"),
}));

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe("gbp-reply", () => {
  it("builds the GBP review reply endpoint from account and location names", () => {
    expect(
      buildGbpReviewReplyEndpoint({
        gbpAccountId: "accounts/1",
        gbpLocationId: "locations/100",
        googleReviewId: "reviews/google-review-1",
      }),
    ).toBe(
      "https://mybusiness.googleapis.com/v4/accounts/1/locations/100/reviews/google-review-1/reply",
    );
  });

  it("uses a full GBP review resource name without rebuilding it", () => {
    expect(
      buildGbpReviewReplyEndpoint({
        gbpAccountId: "accounts/ignored",
        gbpLocationId: "locations/ignored",
        googleReviewId: "accounts/1/locations/100/reviews/google-review-1",
      }),
    ).toBe(
      "https://mybusiness.googleapis.com/v4/accounts/1/locations/100/reviews/google-review-1/reply",
    );
  });

  it("builds the endpoint from a full location resource name", () => {
    expect(
      buildGbpReviewReplyEndpoint({
        gbpAccountId: null,
        gbpLocationId: "accounts/1/locations/100",
        googleReviewId: "google-review-1",
      }),
    ).toBe(
      "https://mybusiness.googleapis.com/v4/accounts/1/locations/100/reviews/google-review-1/reply",
    );
  });

  it("requires account, location, and review identifiers", () => {
    expect(() =>
      buildGbpReviewReplyEndpoint({
        gbpAccountId: "",
        gbpLocationId: "locations/100",
        googleReviewId: "google-review-1",
      }),
    ).toThrow("GBPアカウントID");
    expect(() =>
      buildGbpReviewReplyEndpoint({
        gbpAccountId: "accounts/1",
        gbpLocationId: "",
        googleReviewId: "google-review-1",
      }),
    ).toThrow("GBP店舗ID");
    expect(() =>
      buildGbpReviewReplyEndpoint({
        gbpAccountId: "accounts/1",
        gbpLocationId: "locations/100",
        googleReviewId: " ",
      }),
    ).toThrow("Google口コミID");
  });

  it("uses a stored refresh token before environment access token", async () => {
    process.env.GBP_API_ACCESS_TOKEN = "env-access-token";

    await expect(
      resolveGbpAccessToken({ googleRefreshToken: "refresh-token" }),
    ).resolves.toBe("refreshed-access-token");
  });

  it("falls back to environment access token when refresh token is absent", async () => {
    process.env.GBP_API_ACCESS_TOKEN = "env-access-token";

    await expect(resolveGbpAccessToken({})).resolves.toBe("env-access-token");
  });

  it("requires an access token source", async () => {
    delete process.env.GBP_API_ACCESS_TOKEN;

    await expect(resolveGbpAccessToken({})).rejects.toThrow(
      "Google Business Profileのアクセストークン",
    );
  });

  it("posts the approved reply to Google Business Profile", async () => {
    const consoleInfoSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ comment: "ありがとうございます。" }), {
        status: 200,
      }),
    );

    const result = await postGbpReviewReply({
      gbpAccountId: "accounts/1",
      gbpLocationId: "locations/100",
      googleReviewId: "google-review-1",
      replyText: "ありがとうございます。",
      accessToken: "access-token",
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({ comment: "ありがとうございます。" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://mybusiness.googleapis.com/v4/accounts/1/locations/100/reviews/google-review-1/reply",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
        body: JSON.stringify({ comment: "ありがとうございます。" }),
      }),
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[GBP Reply Request URL]:",
      "https://mybusiness.googleapis.com/v4/accounts/1/locations/100/reviews/google-review-1/reply",
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith("[GBP Reply Response Status]:", 200);
    consoleInfoSpy.mockRestore();
  });

  it("throws a typed error when GBP rejects the reply", async () => {
    const consoleInfoSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    await expect(
      postGbpReviewReply({
        gbpAccountId: "accounts/1",
        gbpLocationId: "locations/100",
        googleReviewId: "google-review-1",
        replyText: "ありがとうございます。",
        accessToken: "access-token",
        fetchImpl: vi.fn(async () => new Response("quota exceeded", { status: 429 })),
      }),
    ).rejects.toMatchObject({
      name: "GbpReplyError",
      status: 429,
      details: "quota exceeded",
    } satisfies Partial<GbpReplyError>);
    consoleInfoSpy.mockRestore();
  });

  it("requires a non-empty reply text", async () => {
    await expect(
      postGbpReviewReply({
        gbpAccountId: "accounts/1",
        gbpLocationId: "locations/100",
        googleReviewId: "google-review-1",
        replyText: " ",
        accessToken: "access-token",
        fetchImpl: vi.fn(),
      }),
    ).rejects.toThrow("返信文を入力してください。");
  });

  it("returns a local comment object when GBP response has no JSON body", async () => {
    const consoleInfoSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const result = await postGbpReviewReply({
      gbpAccountId: "accounts/1",
      gbpLocationId: "locations/100",
      googleReviewId: "google-review-1",
      replyText: "ありがとうございます。",
      accessToken: "access-token",
      fetchImpl: vi.fn(async () => new Response("", { status: 200 })),
    });

    expect(result).toEqual({ comment: "ありがとうございます。" });
    consoleInfoSpy.mockRestore();
  });
});
