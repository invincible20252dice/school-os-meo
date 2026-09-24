import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishDirectGbpReply, type DirectReplyInput } from "./gbp-direct-reply";

const replyText = "ご投稿ありがとうございます。\n今後もよろしくお願いいたします。";
const googleReview = {
  name: "accounts/1/locations/100/reviews/real-review",
  reviewId: "real-review",
  reviewer: { displayName: "佐藤英樹" },
  comment: "質問しやすく、数学の成績が上がりました。",
  starRating: "FIVE",
};
const input: DirectReplyInput = {
  refreshToken: "school-refresh-token",
  locationId: "locations/100",
  accountId: "accounts/1",
  review: {
    googleReviewId: googleReview.name,
    gbpReviewId: googleReview.reviewId,
    authorName: googleReview.reviewer.displayName,
    originalText: googleReview.comment,
    rating: 5,
  },
  replyText,
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function responses(...values: Response[]) {
  const mock = vi.fn<typeof fetch>();
  for (const response of values) mock.mockResolvedValueOnce(response);
  mock.mockRejectedValue(new Error("Unexpected Google request"));
  return mock;
}
const token = () => json({ access_token: "fresh-access-token" });
const listing = () => json({ reviews: [googleReview] });
const posted = () => json({ comment: replyText });
const withoutId = (): DirectReplyInput => ({
  ...input, review: { ...input.review, googleReviewId: null, gbpReviewId: null },
});
beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("publishDirectGbpReply", () => {
  it("refreshes the school token, verifies the real review, and PUTs normalized text", async () => {
    const fetchMock = responses(token(), listing(), posted());
    const result = await publishDirectGbpReply({ ...input, replyText: ` ${replyText.replace(/\n/g, "\\n")} ` }, fetchMock);
    expect(result).toEqual({ googleReviewId: googleReview.name, gbpReviewId: "real-review", replyText, alreadyPublished: false });
    const [tokenUrl, tokenRequest] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
    expect(Object.fromEntries(tokenRequest?.body as URLSearchParams)).toEqual({
      client_id: "client-id", client_secret: "client-secret",
      refresh_token: "school-refresh-token", grant_type: "refresh_token",
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://mybusiness.googleapis.com/v4/accounts/1/locations/100/reviews?pageSize=50");
    expect(fetchMock.mock.calls[2]).toEqual([
      "https://mybusiness.googleapis.com/v4/accounts/1/locations/100/reviews/real-review/reply",
      expect.objectContaining({ method: "PUT", headers: {
        Authorization: "Bearer fresh-access-token", "Content-Type": "application/json",
      }, body: JSON.stringify({ comment: replyText }), signal: expect.any(AbortSignal) }),
    ]);
  });

  it.each(["100", "accounts/1/locations/100"])("normalizes location %s", async (locationId) => {
    const fetchMock = responses(token(), listing(), posted());
    await publishDirectGbpReply({ ...input, accountId: locationId === "100" ? "1" : "", locationId, review: { ...input.review, googleReviewId: "reviews/real-review" } }, fetchMock);
    expect(fetchMock.mock.calls.at(-1)?.[0]).toContain("/accounts/1/locations/100/reviews/real-review/reply");
  });

  it("discovers paginated accounts and searches only the configured location across groups", async () => {
    const fetchMock = responses(
      token(),
      json({ accounts: [{ name: "accounts/2" }], nextPageToken: "account-page-2" }),
      json({ accounts: [{ name: "accounts/1" }] }),
      json({}, 404),
      json({ reviews: [], nextPageToken: "reviews-page-2" }),
      listing(), posted(),
    );
    await publishDirectGbpReply({ ...withoutId(), accountId: "owner@example.com" }, fetchMock);
    expect(String(fetchMock.mock.calls[2][0])).toContain("pageToken=account-page-2");
    expect(String(fetchMock.mock.calls[3][0])).toContain("accounts/2/locations/100/reviews");
    expect(String(fetchMock.mock.calls[5][0])).toContain("pageToken=reviews-page-2");
    expect(fetchMock.mock.calls[6][0]).toContain("accounts/1/locations/100/reviews/real-review/reply");
  });

  it("uses the bare saved review id instead of the local database id", async () => {
    const fetchMock = responses(token(), listing(), posted());
    await publishDirectGbpReply({ ...input, review: { ...input.review, googleReviewId: null } }, fetchMock);
    expect(fetchMock.mock.calls.at(-1)?.[0]).toContain("/reviews/real-review/reply");
  });

  it("matches an unlinked record by exact name, body and rating, not name alone", async () => {
    const fetchMock = responses(token(), json({ reviews: [
      { ...googleReview, reviewId: "other", name: undefined, comment: "別の内容" },
      { ...googleReview, reviewId: "partial-name", name: undefined, reviewer: { displayName: "佐藤" } },
      { ...googleReview, reviewId: "other-rating", name: undefined, starRating: "ONE" },
      googleReview,
    ] }), posted());
    await publishDirectGbpReply(withoutId(), fetchMock);
    expect(fetchMock.mock.calls.at(-1)?.[0]).toContain("/reviews/real-review/reply");
  });

  it("does not overwrite a previously published identical reply on retry", async () => {
    const fetchMock = responses(token(), json({ reviews: [{ ...googleReview, reviewReply: { comment: replyText } }] }));
    expect(await publishDirectGbpReply(input, fetchMock)).toMatchObject({ alreadyPublished: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    { replyText: "\\n " }, { replyText: "あ".repeat(4097) }, { refreshToken: " " },
    { locationId: "" }, { locationId: "manual-123" },
  ])("rejects invalid configuration before any network request (case %#)", async (override) => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(publishDirectGbpReply({ ...input, ...override }, fetchMock)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["accounts/1/locations/999/reviews/real-review", "GOOGLE_LOCATION_MISMATCH"],
    ["reviews/../../other", "GOOGLE_REVIEW_ID_INVALID"],
  ])("rejects cross-location or malformed stored resources", async (googleReviewId, code) => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(publishDirectGbpReply({ ...input, review: { ...input.review, googleReviewId } }, fetchMock)).rejects.toMatchObject({ code });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 429, 500])("does not PUT when Google listing fails with %s", async (status) => {
    const fetchMock = responses(token(), json({ error: { message: "upstream" } }, status));
    await expect(publishDirectGbpReply(input, fetchMock)).rejects.toMatchObject({ googleStatus: status });
    expect(fetchMock.mock.calls.every(([, init]) => init?.method !== "PUT")).toBe(true);
  });

  it.each([403, 404, 429, 500])("propagates rejected writes (%s) without inventing success", async (status) => {
    await expect(publishDirectGbpReply(input, responses(token(), listing(), json({}, status)))).rejects.toMatchObject({ googleStatus: status });
  });

  it.each([json({}, 400), json({})])("stops if OAuth refresh does not return a token", async (response) => {
    const fetchMock = responses(response);
    await expect(publishDirectGbpReply(input, fetchMock)).rejects.toMatchObject({ code: "GOOGLE_TOKEN_REFRESH_FAILED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not use a global token or another school when credentials are missing", async () => {
    vi.stubEnv("GBP_API_ACCESS_TOKEN", "other-school-token");
    const fetchMock = vi.fn<typeof fetch>();
    await expect(publishDirectGbpReply({ ...input, refreshToken: "" }, fetchMock)).rejects.toMatchObject({ code: "GOOGLE_NOT_CONNECTED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([{}, { accounts: [{ name: "invalid" }] }])("requires a real account after discovery", async (body) => {
    await expect(publishDirectGbpReply({ ...withoutId(), accountId: "" }, responses(token(), json(body)))).rejects.toMatchObject({ code: "GOOGLE_ACCOUNT_REQUIRED" });
  });

  it("reports API denial during account discovery", async () => {
    await expect(publishDirectGbpReply({ ...withoutId(), accountId: "" }, responses(token(), json({}, 403)))).rejects.toMatchObject({ googleStatus: 403 });
  });

  it.each([403, 404])("reports inaccessible locations rather than treating them as an empty list (%s)", async (status) => {
    await expect(publishDirectGbpReply({ ...withoutId(), accountId: "" }, responses(token(), json({ accounts: [{ name: "accounts/1" }] }), json({}, status)))).rejects.toMatchObject({ googleStatus: status });
  });

  it("does not hide quota errors during account discovery", async () => {
    await expect(publishDirectGbpReply({ ...withoutId(), accountId: "" }, responses(token(), json({ accounts: [{ name: "accounts/1" }] }), json({}, 429)))).rejects.toMatchObject({ googleStatus: 429 });
  });

  it.each([{}, { reviews: [] }, { reviews: [ { reviewId: "different" } ] }])("does not use a local id when no real review matches", async (body) => {
    const fetchMock = responses(token(), json(body));
    await expect(publishDirectGbpReply(input, fetchMock)).rejects.toMatchObject({ code: "GOOGLE_REVIEW_UNMATCHED" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects ambiguous matching content", async () => {
    await expect(publishDirectGbpReply(withoutId(), responses(token(), json({ reviews: [googleReview, { ...googleReview, name: undefined, reviewId: "duplicate" }] })))).rejects.toMatchObject({ code: "GOOGLE_REVIEW_AMBIGUOUS" });
  });

  it("will not use incomplete local or upstream author, body or rating for identity matching", async () => {
    const incomplete = [
      { reviewId: "no-data" },
      { ...googleReview, name: undefined, reviewId: "no-rating", starRating: undefined },
      { ...googleReview, name: undefined, reviewId: "no-comment", comment: undefined },
      { ...googleReview, name: undefined, reviewId: "no-author", reviewer: undefined },
      {},
      { ...googleReview, reviewId: "../invalid" },
      { ...googleReview, name: "accounts/1/locations/999/reviews/real-review" },
      { ...googleReview, name: "accounts/1/locations/100/reviews/inconsistent" },
    ];
    await expect(publishDirectGbpReply(withoutId(), responses(token(), json({ reviews: incomplete })))).rejects.toMatchObject({ code: "GOOGLE_REVIEW_UNMATCHED" });
    await expect(publishDirectGbpReply({ ...withoutId(), review: { ...withoutId().review, originalText: "" } }, responses(token(), listing()))).rejects.toMatchObject({ code: "GOOGLE_REVIEW_UNMATCHED" });
  });

  it("extracts the Google id from the full resource when the short id is absent", async () => {
    await expect(publishDirectGbpReply(input, responses(token(), json({ reviews: [{ ...googleReview, reviewId: undefined }] }), posted()))).resolves.toMatchObject({ gbpReviewId: "real-review" });
  });

  it.each(["not json", "null", "[]", '{"reviews":{}}'])("rejects malformed list responses: %s", async (body) => {
    await expect(publishDirectGbpReply(input, responses(token(), new Response(body)))).rejects.toMatchObject({ code: "GOOGLE_INVALID_RESPONSE" });
  });

  it("rejects looping pagination without posting a partial match", async () => {
    await expect(publishDirectGbpReply(input, responses(token(), json({ reviews: [googleReview], nextPageToken: "same" }), json({ nextPageToken: "same" })))).rejects.toMatchObject({ code: "GOOGLE_PAGINATION_ERROR" });
  });

  it.each([{}, { comment: "different" }])("does not accept an unconfirmed PUT response", async (body) => {
    await expect(publishDirectGbpReply(input, responses(token(), listing(), json(body)))).rejects.toMatchObject({ code: "GOOGLE_REPLY_UNCONFIRMED" });
  });

  it("handles network failure and deadlines without fabricating a result", async () => {
    await expect(publishDirectGbpReply(input, responses(token()))).rejects.toMatchObject({ code: "GOOGLE_REQUEST_FAILED" });
  });

  it("uses the standard fetch implementation when none is injected", async () => {
    const fetchMock = responses(token(), listing(), posted());
    vi.stubGlobal("fetch", fetchMock);
    await expect(publishDirectGbpReply(input)).resolves.toMatchObject({ replyText });
  });
});
