import { generateGbpReviewReply } from "./gbp-webhook";
import { resolveGbpAccessToken } from "./gbp-reply";

type FetchLike = typeof fetch;

type SchoolSettingRecord = {
  schoolId: string;
  googleAccountId: string | null;
  googleRefreshToken: string | null;
  selectedGbpLocationId: string | null;
  promptSystemRole?: string | null;
  promptReviewTone?: string | null;
  promptMustKeywords?: string[] | null;
  promptForbiddenWords?: string[] | null;
  promptTargetLength?: string | null;
  promptAutoReplyApproval?: boolean | null;
  school?: {
    name: string;
  } | null;
};

type ReviewRecord = {
  id: string;
};

type PrismaGbpReviewsSyncClient = {
  schoolSetting: {
    findFirst(args: unknown): Promise<SchoolSettingRecord | null>;
    update(args: unknown): Promise<SchoolSettingRecord>;
  };
  review: {
    findFirst(args: unknown): Promise<ReviewRecord | null>;
    create(args: unknown): Promise<ReviewRecord>;
    update(args: unknown): Promise<ReviewRecord>;
  };
};

type GbpReviewsApiItem = {
  name?: string;
  reviewId?: string;
  reviewer?: {
    displayName?: string;
    profilePhotoUrl?: string;
  };
  authorName?: string;
  starRating?: string | number;
  rating?: string | number;
  comment?: string;
  reviewReply?: {
    comment?: string;
    updateTime?: string;
  };
  createTime?: string;
  updateTime?: string;
};

type GbpAccountApiItem = {
  name?: string;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeResourceName(value: unknown) {
  return normalizeString(value).replace(/^\/+|\/+$/g, "");
}

function toAccountResource(value: unknown) {
  const accountId = normalizeResourceName(value);

  if (!accountId) {
    return "";
  }

  if (accountId.includes("@")) {
    return "";
  }

  return accountId.startsWith("accounts/") ? accountId : `accounts/${accountId}`;
}

function toLocationResource(value: unknown) {
  const locationId = normalizeResourceName(value);

  if (!locationId) {
    return "";
  }

  if (locationId.startsWith("accounts/") && locationId.includes("/locations/")) {
    return locationId;
  }

  return locationId.startsWith("locations/") ? locationId : `locations/${locationId}`;
}

function accountResourceFromLocation(value: unknown) {
  const locationId = normalizeResourceName(value);
  const match = locationId.match(/^(accounts\/[^/]+)\/locations\/[^/]+$/);

  return match?.[1] || "";
}

function locationResourceForEndpoint(value: unknown) {
  const locationId = toLocationResource(value);

  if (locationId.startsWith("accounts/") && locationId.includes("/locations/")) {
    return locationId.split("/").slice(2).join("/");
  }

  return locationId;
}

export function buildGbpReviewsListEndpoint({
  googleAccountId,
  selectedGbpLocationId,
}: {
  googleAccountId?: string | null;
  selectedGbpLocationId?: string | null;
}) {
  const locationResource = toLocationResource(selectedGbpLocationId);
  const accountResource =
    toAccountResource(googleAccountId) || accountResourceFromLocation(locationResource);

  if (!locationResource) {
    throw new Error("Google連携設定（ロケーションID）が見つかりません。設定画面をご確認ください。");
  }

  if (!accountResource) {
    throw new Error("Google連携設定（アカウントID）が見つかりません。設定画面をご確認ください。");
  }

  return `https://mybusiness.googleapis.com/v4/${accountResource}/${locationResourceForEndpoint(
    locationResource,
  )}/reviews`;
}

async function fetchFirstGbpAccountResource({
  accessToken,
  fetchImpl,
}: {
  accessToken: string;
  fetchImpl: FetchLike;
}) {
  const response = await fetchImpl(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const data = await readJsonResponse(response);

  console.info("[GBP Accounts API Response]:", JSON.stringify(data, null, 2));

  if (!response.ok) {
    throw new Error(
      data.error?.message || `Googleアカウント一覧を取得できませんでした。status=${response.status}`,
    );
  }

  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  const accountResource = toAccountResource(
    accounts.find((account: GbpAccountApiItem) => toAccountResource(account.name))?.name,
  );

  if (!accountResource) {
    throw new Error("Google Business ProfileのアカウントIDを自動取得できませんでした。");
  }

  return accountResource;
}

async function ensureGbpAccountResource({
  prisma,
  setting,
  accessToken,
  fetchImpl,
}: {
  prisma: PrismaGbpReviewsSyncClient;
  setting: SchoolSettingRecord;
  accessToken: string;
  fetchImpl: FetchLike;
}) {
  const locationResource = toLocationResource(setting.selectedGbpLocationId);
  const embeddedAccountResource = accountResourceFromLocation(locationResource);
  const existingAccountResource =
    toAccountResource(setting.googleAccountId) || embeddedAccountResource;

  if (existingAccountResource) {
    return existingAccountResource;
  }

  const resolvedAccountResource = await fetchFirstGbpAccountResource({
    accessToken,
    fetchImpl,
  });

  await prisma.schoolSetting.update({
    where: { schoolId: setting.schoolId },
    data: { googleAccountId: resolvedAccountResource },
  });

  return resolvedAccountResource;
}

export function ratingFromGbpStarRating(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(5, Math.max(1, Math.trunc(value)));
  }

  const normalized = normalizeString(value).toUpperCase();
  const ratings: Record<string, number> = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
  };

  return ratings[normalized] ?? 5;
}

function shortReviewIdFromName(value: unknown) {
  const name = normalizeResourceName(value);

  return name ? name.split("/").filter(Boolean).pop() || "" : "";
}

function reviewedAtFromGbpItem(item: GbpReviewsApiItem) {
  const rawDate = normalizeString(item.updateTime) || normalizeString(item.createTime);

  if (!rawDate) {
    return null;
  }

  const date = new Date(rawDate);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeGbpReviewsApiItem(item: GbpReviewsApiItem) {
  const googleReviewName = normalizeResourceName(item.name);
  const gbpReviewId =
    normalizeString(item.reviewId) || shortReviewIdFromName(googleReviewName);
  const authorName =
    normalizeString(item.reviewer?.displayName) ||
    normalizeString(item.authorName) ||
    "Googleユーザー";
  const comment = normalizeString(item.comment);
  const replyText = normalizeString(item.reviewReply?.comment);

  return {
    googleReviewId: googleReviewName || gbpReviewId,
    gbpReviewId,
    authorName,
    rating: ratingFromGbpStarRating(item.starRating ?? item.rating),
    originalText: comment,
    replyText: replyText || null,
    status: replyText ? "REPLIED" : "PENDING",
    postedAt: reviewedAtFromGbpItem(item),
  };
}

async function readJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as {
      reviews?: GbpReviewsApiItem[];
      accounts?: GbpAccountApiItem[];
      error?: { message?: string };
    };
  } catch {
    return { error: { message: text } };
  }
}

export async function syncGbpReviewsForSchool({
  prisma,
  schoolId,
  fetchImpl = fetch,
}: {
  prisma: PrismaGbpReviewsSyncClient;
  schoolId?: string;
  fetchImpl?: FetchLike;
}) {
  const setting = await prisma.schoolSetting.findFirst({
    where: schoolId ? { schoolId } : undefined,
    orderBy: { updatedAt: "desc" },
    select: {
      schoolId: true,
      googleAccountId: true,
      googleRefreshToken: true,
      selectedGbpLocationId: true,
      promptSystemRole: true,
      promptReviewTone: true,
      promptMustKeywords: true,
      promptForbiddenWords: true,
      promptTargetLength: true,
      promptAutoReplyApproval: true,
      school: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!setting?.selectedGbpLocationId) {
    throw new Error("Google連携設定（ロケーションID）が見つかりません。設定画面をご確認ください。");
  }

  const accessToken = await resolveGbpAccessToken({
    googleRefreshToken: setting.googleRefreshToken,
    fetchImpl,
  });
  const accountResource = await ensureGbpAccountResource({
    prisma,
    setting,
    accessToken,
    fetchImpl,
  });
  const endpoint = buildGbpReviewsListEndpoint({
    googleAccountId: accountResource,
    selectedGbpLocationId: setting.selectedGbpLocationId,
  });

  console.info("[GBP Fetching Reviews]:", endpoint);

  const response = await fetchImpl(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await readJsonResponse(response);

  console.info("[GBP Reviews API Response]:", JSON.stringify(data, null, 2));

  if (!response.ok) {
    throw new Error(
      data.error?.message || `Google口コミ一覧を取得できませんでした。status=${response.status}`,
    );
  }

  const gbpReviews = Array.isArray(data.reviews) ? data.reviews : [];

  for (const item of gbpReviews) {
    const review = normalizeGbpReviewsApiItem(item);
    const schoolName = setting.school?.name || "大学受験専門塾 iスクール予備校";
    const aiReplyText =
      review.status === "PENDING"
        ? await generateGbpReviewReply(
          {
            schoolName,
            rating: review.rating,
            reviewText: review.originalText,
            promptSetting: setting,
          },
          fetchImpl,
        )
        : "";
    const existing = await prisma.review.findFirst({
      where: {
        schoolId: setting.schoolId,
        OR: [
          { googleReviewId: review.googleReviewId },
          { gbpReviewId: review.gbpReviewId || review.googleReviewId },
        ],
      },
      select: { id: true },
    });
    const payload = {
      schoolId: setting.schoolId,
      source: "GOOGLE",
      status: review.status,
      parentName: review.authorName,
      authorName: review.authorName,
      rating: review.rating,
      originalText: review.originalText,
      comment: review.originalText,
      selectedReviewText: review.originalText,
      googleReviewId: review.googleReviewId,
      gbpReviewId: review.gbpReviewId || review.googleReviewId,
      aiReplyText,
      aiReplyDraft: aiReplyText,
      aiReplyGeneratedAt: aiReplyText ? new Date() : null,
      replyText: review.replyText,
      repliedAt: review.replyText ? new Date() : null,
      postedAt: review.postedAt,
    };

    if (existing) {
      await prisma.review.update({
        where: { id: existing.id },
        data: payload,
      });
    } else {
      await prisma.review.create({ data: payload });
    }
  }

  return {
    success: true,
    count: gbpReviews.length,
    schoolId: setting.schoolId,
  };
}
