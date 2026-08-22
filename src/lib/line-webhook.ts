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

type ReviewWithSchool = {
  id: string;
  schoolId: string;
  status: string;
  googleReviewId?: string | null;
  gbpReviewId?: string | null;
  aiReplyText?: string | null;
  aiReplyDraft?: string | null;
  replyText?: string | null;
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
    findFirst(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
};

type HandleLineWebhookEventsInput = {
  events: LineWebhookEvent[];
  prisma: PrismaLike;
  fetchImpl?: FetchLike;
};

const repliedStatuses = new Set(["APPROVED", "REVISED", "REPLIED", "POSTED"]);

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getLineSourceId(event: LineWebhookEvent) {
  return (
    normalizeString(event.source?.userId) ||
    normalizeString(event.source?.groupId) ||
    normalizeString(event.source?.roomId)
  );
}

function parsePostbackData(data: string) {
  return new URLSearchParams(data);
}

function buildReviewInclude() {
  return {
    school: {
      include: {
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

function getLineAccessToken(review?: ReviewWithSchool | null) {
  return review?.school.schoolSetting?.lineChannelAccessToken || undefined;
}

async function replyToLine({
  event,
  text,
  review,
  fetchImpl,
}: {
  event: LineWebhookEvent;
  text: string;
  review?: ReviewWithSchool | null;
  fetchImpl: FetchLike;
}) {
  const replyToken = normalizeString(event.replyToken);

  if (!replyToken) {
    return;
  }

  await replyLineMessage({
    replyToken,
    channelAccessToken: getLineAccessToken(review),
    text,
    fetchImpl,
  });
}

async function postReplyToGbp({
  review,
  replyText,
  fetchImpl,
}: {
  review: ReviewWithSchool;
  replyText: string;
  fetchImpl: FetchLike;
}) {
  const googleReviewId = review.googleReviewId || review.gbpReviewId || "";
  const accessToken = await resolveGbpAccessToken({
    googleRefreshToken: review.school.schoolSetting?.googleRefreshToken,
    fetchImpl,
  });

  await postGbpReviewReply({
    gbpAccountId: review.school.gbpAccountId,
    gbpLocationId:
      review.school.gbpLocationId ||
      review.school.schoolSetting?.selectedGbpLocationId,
    googleReviewId,
    replyText,
    accessToken,
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
    include: buildReviewInclude(),
  })) as ReviewWithSchool | null;

  if (!review) {
    await replyToLine({
      event,
      text: "対象の口コミが見つかりませんでした。",
      fetchImpl,
    });
    return "not_found";
  }

  if (repliedStatuses.has(review.status)) {
    await replyToLine({
      event,
      review,
      text: "この口コミは既に返信済みです。",
      fetchImpl,
    });
    return "already_replied";
  }

  const replyText = normalizeString(review.aiReplyDraft || review.aiReplyText);

  if (!replyText) {
    await replyToLine({
      event,
      review,
      text: "AI返信ドラフトが見つかりませんでした。管理画面で返信文を確認してください。",
      fetchImpl,
    });
    return "missing_draft";
  }

  await postReplyToGbp({ review, replyText, fetchImpl });
  await prisma.review.update({
    where: { id: review.id },
    data: {
      replyText,
      aiReplyText: replyText,
      aiReplyDraft: replyText,
      status: "APPROVED",
      repliedAt: new Date(),
    },
  });
  await replyToLine({
    event,
    review,
    text: "✅ Googleマップに返信を投稿しました！",
    fetchImpl,
  });

  return "approved";
}

async function reviseReply({
  event,
  prisma,
  fetchImpl,
}: {
  event: LineWebhookEvent;
  prisma: PrismaLike;
  fetchImpl: FetchLike;
}) {
  const sourceId = getLineSourceId(event);
  const replyText = normalizeString(event.message?.text);

  if (!sourceId || !replyText) {
    return "ignored";
  }

  const review = (await prisma.review.findFirst({
    where: {
      lineUserId: sourceId,
      status: "PENDING",
    },
    orderBy: { createdAt: "desc" },
    include: buildReviewInclude(),
  })) as ReviewWithSchool | null;

  if (!review) {
    await replyToLine({
      event,
      text: "修正対象の未返信口コミが見つかりませんでした。",
      fetchImpl,
    });
    return "pending_not_found";
  }

  await postReplyToGbp({ review, replyText, fetchImpl });
  await prisma.review.update({
    where: { id: review.id },
    data: {
      replyText,
      aiReplyText: replyText,
      status: "REVISED",
      repliedAt: new Date(),
    },
  });
  await replyToLine({
    event,
    review,
    text: `✅ 修正いただいた以下の内容でGoogleマップに返信を投稿しました：\n\n${replyText}`,
    fetchImpl,
  });

  return "revised";
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
    }

    if (event.type === "message" && event.message?.type === "text") {
      results.push(await reviseReply({ event, prisma, fetchImpl }));
      continue;
    }

    results.push("ignored");
  }

  return {
    processed: events.length,
    results,
  };
}
