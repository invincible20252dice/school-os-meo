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

function normalizeLocationResource(gbpLocationId?: string | null) {
  const locationId = normalizeResourceName(gbpLocationId);

  if (!locationId) {
    return "";
  }

  if (locationId.startsWith("locations/")) {
    return locationId;
  }

  if (/^\d+$/.test(locationId)) {
    return `locations/${locationId}`;
  }

  return locationId;
}

function isFullReviewResourceName(value: string) {
  return /^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/.test(value);
}

function toDetailsString(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function readGoogleResponseBody(response: Response, fallbackComment: string) {
  const text = await response.text().catch(() => "");

  if (!text) {
    return { comment: fallbackComment };
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function buildGbpReviewReplyEndpoint({
  gbpAccountId,
  gbpLocationId,
  googleReviewId,
}: Pick<GbpReplyPostInput, "gbpAccountId" | "gbpLocationId" | "googleReviewId">) {
  const accountId = normalizeResourceName(gbpAccountId);
  const locationId = normalizeLocationResource(gbpLocationId);
  const reviewResourceName = normalizeResourceName(googleReviewId);

  if (!reviewResourceName) {
    throw new Error("Google口コミIDが設定されていません。");
  }

  if (isFullReviewResourceName(reviewResourceName)) {
    return `https://mybusiness.googleapis.com/v4/${reviewResourceName}/reply`;
  }

  if (locationId.startsWith("accounts/") && locationId.includes("/locations/")) {
    const reviewId = encodeURIComponent(normalizeReviewId(reviewResourceName));

    if (!reviewId) {
      throw new Error("Google口コミIDが設定されていません。");
    }

    return `https://mybusiness.googleapis.com/v4/${locationId}/reviews/${reviewId}/reply`;
  }

  const reviewId = encodeURIComponent(normalizeReviewId(reviewResourceName));

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

  const targetUrl = buildGbpReviewReplyEndpoint(input);

  console.info("[GBP Reply Request URL]:", targetUrl);
  console.info("[GBP Reply Payload]:", { comment });

  const response = await fetchImpl(targetUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ comment }),
  });

  const responseBody = await readGoogleResponseBody(response, comment);

  console.info("[GBP Reply Response Status]:", response.status);
  console.info("[GBP Reply Response Body]:", responseBody);

  if (!response.ok) {
    throw new GbpReplyError(response.status, toDetailsString(responseBody));
  }

  return responseBody;
}
