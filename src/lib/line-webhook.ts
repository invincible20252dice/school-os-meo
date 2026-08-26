import {
  postGbpReviewReply,
  resolveGbpAccessToken,
} from "./gbp-reply";
import { replyLineMessage } from "./line";

type FetchLike = typeof fetch;

type LineSource = {
  userId?: string;
  groupId?: string;
  roomId?: string;
};

export type LineWebhookEvent = {
  type: string;
  replyToken?: string;
  source?: LineSource;
  postback?: {
    data?: string;
  };
  message?: {
    type?: string;
    text?: string;
  };
};

type ReviewForApproval = {
  id: string;
  status: string;
  googleReviewId?: string | null;
  aiReplyText?: string | null;
  school: {
    gbpAccountId?: string | null;
    gbpLocationId?: string | null;
    schoolSetting?: {
      googleRefreshToken?: string | null;
      selectedGbpLocationId?: string | null;
      lineChannelAccessToken?: string | null;
    } | null;
  };
};

type PrismaLike = {
  review: {
    findUnique(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  schoolSetting?: {
    findFirst(args: unknown): Promise<unknown>;
  };
};

type HandleLineWebhookEventsInput = {
  events: LineWebhookEvent[];
  prisma: PrismaLike;
  fetchImpl?: FetchLike;
};

const repliedStatuses = new Set([
  "APPROVED",
  "REVISED",
  "REVISED_AND_REPLIED",
  "REPLIED",
  "POSTED",
]);
const dummyReplyTokens = new Set([
  "00000000000000000000000000000000",
  "ffffffffffffffffffffffffffffffff",
]);

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parsePostbackData(data: string) {
  if (data.startsWith("{")) {
    try {
      const parsed = JSON.parse(data) as {
        action?: unknown;
        reviewId?: unknown;
      };
      const params = new URLSearchParams();
      const action = normalizeString(parsed.action);
      const reviewId = normalizeString(parsed.reviewId);

      if (action) {
        params.set("action", action);
      }

      if (reviewId) {
        params.set("reviewId", reviewId);
      }

      return params;
    } catch {
      return new URLSearchParams();
    }
  }

  return new URLSearchParams(data);
}

function buildReviewApprovalSelect() {
  return {
    id: true,
    status: true,
    googleReviewId: true,
    aiReplyText: true,
    school: {
      select: {
        gbpAccountId: true,
        gbpLocationId: true,
        schoolSetting: {
          select: {
            googleRefreshToken: true,
            selectedGbpLocationId: true,
            lineChannelAccessToken: true,
          },
        },
      },
    },
  };
}

function isUsableReplyToken(replyToken: string) {
  return Boolean(replyToken) && !dummyReplyTokens.has(replyToken);
}

async function resolveLineAccessToken({
  prisma,
  review,
}: {
  prisma: PrismaLike;
  review?: ReviewForApproval | null;
}) {
  const reviewToken = normalizeString(
    review?.school.schoolSetting?.lineChannelAccessToken,
  );
  const envToken = normalizeString(process.env.LINE_CHANNEL_ACCESS_TOKEN);

  if (reviewToken) {
    return reviewToken;
  }

  if (envToken) {
    return envToken;
  }

  if (!prisma.schoolSetting?.findFirst) {
    return undefined;
  }

  try {
    const setting = (await prisma.schoolSetting.findFirst({
      where: {
        lineChannelAccessToken: {
          not: null,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        lineChannelAccessToken: true,
      },
    })) as { lineChannelAccessToken?: string | null } | null;

    return normalizeString(setting?.lineChannelAccessToken) || undefined;
  } catch (error) {
    console.error("[LINE Webhook] Failed to resolve LINE token from DB.", error);
    return undefined;
  }
}

async function replyToLine({
  event,
  text,
  review,
  prisma,
  fetchImpl,
}: {
  event: LineWebhookEvent;
  text: string;
  review?: ReviewForApproval | null;
  prisma: PrismaLike;
  fetchImpl: FetchLike;
}) {
  const replyToken = normalizeString(event.replyToken);

  if (!isUsableReplyToken(replyToken)) {
    return;
  }

  const channelAccessToken = await resolveLineAccessToken({ prisma, review });

  if (!channelAccessToken) {
    console.error("[LINE Webhook] Channel Access Token not found.");
    return;
  }

  await replyLineMessage({
    replyToken,
    channelAccessToken,
    text,
    fetchImpl,
  });
}

async function approveReply({
  event,
  reviewId,
  prisma,
  fetchImpl,
}: {
  event: LineWebhookEvent;
  reviewId: string;
  prisma: PrismaLike;
  fetchImpl: FetchLike;
}) {
  const review = (await prisma.review.findUnique({
    where: { id: reviewId },
    select: buildReviewApprovalSelect(),
  })) as ReviewForApproval | null;

  if (!review) {
    await replyToLine({
      event,
      text: "対象の口コミが見つかりませんでした。",
      prisma,
      fetchImpl,
    });
    return "not_found";
  }

  if (repliedStatuses.has(review.status)) {
    await replyToLine({
      event,
      review,
      text: "この口コミは既に返信済みです。",
      prisma,
      fetchImpl,
    });
    return "already_replied";
  }

  const replyText = normalizeString(review.aiReplyText);

  if (!replyText) {
    await replyToLine({
      event,
      review,
      text: "AI返信ドラフトが見つかりませんでした。管理画面で返信文を確認してください。",
      prisma,
      fetchImpl,
    });
    return "missing_draft";
  }

  const accessToken = await resolveGbpAccessToken({
    googleRefreshToken: review.school.schoolSetting?.googleRefreshToken,
    fetchImpl,
  });

  await postGbpReviewReply({
    gbpAccountId: review.school.gbpAccountId,
    gbpLocationId:
      review.school.gbpLocationId ||
      review.school.schoolSetting?.selectedGbpLocationId,
    googleReviewId: review.googleReviewId || "",
    replyText,
    accessToken,
    fetchImpl,
  });
  await prisma.review.update({
    where: { id: review.id },
    data: {
      replyText,
      aiReplyText: replyText,
      status: "APPROVED",
      repliedAt: new Date(),
    },
  });
  await replyToLine({
    event,
    review,
    text: "✅ AI返信ドラフトの内容でGoogleマップに返信を投稿しました！",
    prisma,
    fetchImpl,
  });

  return "approved";
}

export async function handleLineWebhookEvents({
  events,
  prisma,
  fetchImpl = fetch,
}: HandleLineWebhookEventsInput) {
  const results: string[] = [];

  for (const event of events) {
    if (event.type === "postback") {
      const params = parsePostbackData(normalizeString(event.postback?.data));

      if (params.get("action") === "approve_reply") {
        const reviewId = normalizeString(params.get("reviewId"));
        results.push(
          reviewId
            ? await approveReply({ event, reviewId, prisma, fetchImpl })
            : "missing_review_id",
        );
        continue;
      }

      results.push("ignored_postback");
      continue;
    }

    if (event.type === "message") {
      console.info("[LINE Webhook Message Ignored]:", {
        messageType: event.message?.type || "unknown",
        hasReplyToken: Boolean(normalizeString(event.replyToken)),
      });
      results.push("ignored_message");
      continue;
    }

    results.push("ignored");
  }

  return {
    processed: events.length,
    results,
  };
}
