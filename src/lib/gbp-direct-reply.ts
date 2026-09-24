import {
  fetchGbpAccounts,
  GoogleBusinessProfileApiError,
  refreshGoogleAccessToken,
} from "./google-gbp-oauth";
import { buildGbpReviewReplyEndpoint } from "./gbp-reply";
import { formatDraftText } from "./review-reply-assist";

export class DirectReplyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 409,
    readonly googleStatus?: number,
  ) {
    super(message);
    this.name = "DirectReplyError";
  }
}

type GoogleReview = {
  name?: string;
  reviewId?: string;
  reviewer?: { displayName?: string };
  comment?: string;
  starRating?: string;
  reviewReply?: { comment?: string; updateTime?: string };
};

export type DirectReplyInput = {
  refreshToken: string;
  locationId: string;
  accountId: string;
  review: {
    googleReviewId: string | null;
    gbpReviewId: string | null;
    authorName: string;
    originalText: string;
    rating: number | null;
  };
  replyText: string;
};

const fullReviewPattern = /^accounts\/(\d+)\/locations\/(\d+)\/reviews\/([A-Za-z0-9_-]+)$/;

function normalizeText(text: string | undefined) {
  return formatDraftText(text).trim().replace(/\s+/g, " ");
}

function googleError(status: number) {
  if (status === 401) {
    return new DirectReplyError("GOOGLE_REAUTH_REQUIRED", "Google連携の認証が失効しています。設定画面から再連携してください。", 409, status);
  }
  if (status === 403) {
    return new DirectReplyError("GOOGLE_PERMISSION_DENIED", "Googleがアクセスを拒否しました。GBP APIの利用承認・店舗の管理権限・business.manage権限を確認してください。", 502, status);
  }
  if (status === 404) {
    return new DirectReplyError("GOOGLE_REVIEW_NOT_FOUND", "Google上の店舗または口コミが見つかりません。店舗設定と口コミ同期を確認してください。", 409, status);
  }
  if (status === 429) {
    return new DirectReplyError("GOOGLE_QUOTA_EXCEEDED", "Google APIの利用上限に達しました。利用枠を確認し、時間をおいて再試行してください。", 429, status);
  }
  return new DirectReplyError("GOOGLE_API_ERROR", "Google APIでエラーが発生しました。時間をおいて再試行してください。", 502, status);
}

async function readGoogleJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw googleError(response.status);
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as T;
  } catch {
    throw new DirectReplyError("GOOGLE_INVALID_RESPONSE", "Google APIの応答を確認できませんでした。口コミ同期で状態を確認してください。", 502);
  }
}

async function listReviews(parent: string, accessToken: string, fetchImpl: typeof fetch) {
  const reviews: GoogleReview[] = [];
  const seenTokens = new Set<string>();
  let pageToken = "";
  do {
    if (seenTokens.has(pageToken) || seenTokens.size >= 100) {
      throw new DirectReplyError("GOOGLE_PAGINATION_ERROR", "Google口コミ一覧を最後まで取得できませんでした。時間をおいて再試行してください。", 502);
    }
    seenTokens.add(pageToken);
    const url = new URL(`https://mybusiness.googleapis.com/v4/${parent}/reviews`);
    url.searchParams.set("pageSize", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await readGoogleJson<{ reviews?: GoogleReview[]; nextPageToken?: string }>(response);
    if (data.reviews !== undefined && !Array.isArray(data.reviews)) {
      throw new DirectReplyError("GOOGLE_INVALID_RESPONSE", "Google口コミ一覧の形式を確認できませんでした。", 502);
    }
    reviews.push(...(data.reviews ?? []));
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);
  return reviews;
}

export async function publishDirectGbpReply(input: DirectReplyInput, fetchImpl: typeof fetch = fetch) {
  const replyText = formatDraftText(input.replyText).trim();
  if (!replyText || replyText.length > 4096) {
    throw new DirectReplyError("INVALID_REPLY", "返信文は1〜4096文字で入力してください。", 400);
  }
  if (!input.refreshToken.trim()) {
    throw new DirectReplyError("GOOGLE_NOT_CONNECTED", "この校舎のGoogle認証情報がありません。設定画面からGoogleアカウントを連携してください。");
  }
  const locationMatch = /^(?:(?:accounts\/(\d+)\/)?locations\/)?(\d+)$/.exec(input.locationId.trim());
  if (!locationMatch) {
    throw new DirectReplyError("GOOGLE_LOCATION_REQUIRED", "この校舎のGBP店舗IDを設定してください。");
  }
  const locationId = locationMatch[2];
  const storedId = (input.review.googleReviewId || input.review.gbpReviewId || "").trim();
  const fullReview = fullReviewPattern.exec(storedId);
  const shortId = fullReview ? fullReview[3] : storedId.replace(/^reviews\//, "");
  if (storedId && !/^[A-Za-z0-9_-]+$/.test(shortId)) {
    throw new DirectReplyError("GOOGLE_REVIEW_ID_INVALID", "Google口コミIDを確認できません。口コミを再同期してください。");
  }
  if (fullReview && fullReview[2] !== locationId) {
    throw new DirectReplyError("GOOGLE_LOCATION_MISMATCH", "口コミの店舗IDと現在の連携店舗が一致しません。設定と口コミ同期を確認してください。");
  }

  // A single deadline covers OAuth, all listing pages, and the final write.
  const signal = AbortSignal.timeout(45_000);
  const timedFetch: typeof fetch = (url, init) => fetchImpl(url, { ...init, signal });
  let accessToken: string;
  try {
    accessToken = await refreshGoogleAccessToken({ refreshToken: input.refreshToken.trim(), fetchImpl: timedFetch });
  } catch (error) {
    if (error instanceof GoogleBusinessProfileApiError && (error.status === 429 || error.status === 403)) throw googleError(error.status);
    throw new DirectReplyError("GOOGLE_TOKEN_REFRESH_FAILED", "Googleのアクセストークンを更新できません。OAuth環境変数を確認し、Googleアカウントを再連携してください。", 502);
  }

  try {
    const configuredAccount = /^(?:accounts\/)?(\d+)$/.exec(input.accountId.trim());
    const knownAccount = fullReview?.[1] || locationMatch[1] || configuredAccount?.[1];
    const accounts = knownAccount
      ? [`accounts/${knownAccount}`]
      : (await fetchGbpAccounts({ accessToken, fetchImpl: timedFetch })).map((a) => a.name).filter((name) => /^accounts\/\d+$/.test(name));
    if (!accounts.length) {
      throw new DirectReplyError("GOOGLE_ACCOUNT_REQUIRED", "連携Googleアカウントに管理可能なGBPアカウントがありません。");
    }

    const matches = new Map<string, { name: string; item: GoogleReview }>();
    let inaccessible: DirectReplyError | undefined;
    for (const account of new Set(accounts)) {
      const parent = `${account}/locations/${locationId}`;
      let items: GoogleReview[];
      try {
        items = await listReviews(parent, accessToken, timedFetch);
      } catch (error) {
        // An account group may not own this location; never substitute another location.
        if (!knownAccount && error instanceof DirectReplyError && (error.googleStatus === 403 || error.googleStatus === 404)) {
          inaccessible = error;
          continue;
        }
        throw error;
      }
      for (const item of items) {
        const nameMatch = fullReviewPattern.exec(item.name ?? "");
        const id = item.reviewId || nameMatch?.[3] || "";
        if (!/^[A-Za-z0-9_-]+$/.test(id)) continue;
        if (nameMatch && (nameMatch[2] !== locationId || nameMatch[3] !== id)) continue;
        const ratings: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
        const matched = shortId
          ? id === shortId
          : Boolean(input.review.authorName.trim() && input.review.originalText.trim())
            && normalizeText(item.reviewer?.displayName) === normalizeText(input.review.authorName)
            && normalizeText(item.comment) === normalizeText(input.review.originalText)
            && ratings[item.starRating ?? ""] === input.review.rating;
        if (matched) matches.set(id, { name: `${parent}/reviews/${id}`, item });
      }
    }
    if (!matches.size) {
      if (inaccessible) throw inaccessible;
      throw new DirectReplyError("GOOGLE_REVIEW_UNMATCHED", "この口コミをGoogle上で特定できませんでした。GBP口コミを同期して、対象を確認してください。");
    }
    if (matches.size !== 1) {
      throw new DirectReplyError("GOOGLE_REVIEW_AMBIGUOUS", "同じ内容の口コミが複数あり、返信先を特定できません。GBP口コミを同期して対象を選び直してください。");
    }
    const [gbpReviewId, target] = [...matches][0];
    const alreadyPublished = target.item.reviewReply?.comment === replyText;
    if (!alreadyPublished) {
      const url = buildGbpReviewReplyEndpoint({ googleReviewId: target.name });
      const response = await timedFetch(url, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ comment: replyText }),
      });
      const result = await readGoogleJson<{ comment?: string }>(response);
      if (result.comment !== replyText) {
        throw new DirectReplyError("GOOGLE_REPLY_UNCONFIRMED", "Googleへの投稿結果を確認できませんでした。再送前に口コミ同期で状態を確認してください。", 502);
      }
    }
    return { googleReviewId: target.name, gbpReviewId, replyText, alreadyPublished };
  } catch (error) {
    if (error instanceof DirectReplyError) throw error;
    if (error instanceof GoogleBusinessProfileApiError) throw googleError(error.status);
    throw new DirectReplyError("GOOGLE_REQUEST_FAILED", "Googleとの通信が完了しませんでした。再送前に口コミ同期で投稿状態を確認してください。", 502);
  }
}
