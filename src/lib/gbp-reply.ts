import { refreshGoogleAccessToken } from "./google-gbp-oauth";

type FetchLike = typeof fetch;

export type GbpReplyPostInput = {
  gbpAccountId?: string | null;
  gbpLocationId?: string | null;
  googleReviewId: string;
  replyText: string;
  accessToken: string;
  fetchImpl?: FetchLike;
};

export type ResolveGbpAccessTokenInput = {
  googleRefreshToken?: string | null;
  fetchImpl?: FetchLike;
};

export class GbpReplyError extends Error {
  status: number;
  details: string;

  constructor(status: number, details: string) {
    super(`GBP review reply failed: ${status}`);
    this.name = "GbpReplyError";
    this.status = status;
    this.details = details;
  }
}

function normalizeResourceName(value?: string | null) {
  return value?.trim().replace(/^\/+|\/+$/g, "") || "";
}

function normalizeReviewId(value: string) {
  return value.trim().replace(/^reviews\//, "");
}

export function buildGbpReviewReplyEndpoint({
  gbpAccountId,
  gbpLocationId,
  googleReviewId,
}: Pick<GbpReplyPostInput, "gbpAccountId" | "gbpLocationId" | "googleReviewId">) {
  const accountId = normalizeResourceName(gbpAccountId);
  const locationId = normalizeResourceName(gbpLocationId);
  const reviewId = encodeURIComponent(normalizeReviewId(googleReviewId));

  if (!accountId) {
    throw new Error("GBPアカウントIDが設定されていません。");
  }

  if (!locationId) {
    throw new Error("GBP店舗IDが設定されていません。");
  }

  if (!reviewId) {
    throw new Error("Google口コミIDが設定されていません。");
  }

  return `https://mybusiness.googleapis.com/v4/${accountId}/${locationId}/reviews/${reviewId}/reply`;
}

export async function resolveGbpAccessToken({
  googleRefreshToken,
  fetchImpl = fetch,
}: ResolveGbpAccessTokenInput) {
  const refreshToken = googleRefreshToken?.trim() || "";

  if (refreshToken) {
    return refreshGoogleAccessToken({ refreshToken, fetchImpl });
  }

  const envToken = process.env.GBP_API_ACCESS_TOKEN?.trim() || "";

  if (!envToken) {
    throw new Error("Google Business Profileのアクセストークンを取得できませんでした。");
  }

  return envToken;
}

export async function postGbpReviewReply({
  accessToken,
  replyText,
  fetchImpl = fetch,
  ...input
}: GbpReplyPostInput) {
  const comment = replyText.trim();

  if (!comment) {
    throw new Error("返信文を入力してください。");
  }

  const response = await fetchImpl(buildGbpReviewReplyEndpoint(input), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ comment }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new GbpReplyError(response.status, details);
  }

  return response.json().catch(() => ({ comment }));
}
