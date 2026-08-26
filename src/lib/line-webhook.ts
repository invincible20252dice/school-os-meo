import {
  postGbpReviewReply,
  resolveGbpAccessToken,
} from "./gbp-reply";
import {
  buildLineCustomReplyConfirmationMessage,
  replyLineFlexMessage,
  replyLineMessage,
  replyLineTextMessages,
} from "./line";

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
  pendingCustomReply?: string | null;
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
const excludedRevisionStatuses = [...repliedStatuses, "ARCHIVED"];
const fallbackEditDraft =
  "青葉ゼミナール 本校への温かい口コミをありがとうございます。お子さまが前向きに通ってくださっていることを大変うれしく思います。今後も一人ひとりに寄り添い、安心して学べる環境づくりに努めてまいります。";
const dummyReplyTokens = new Set([
  "00000000000000000000000000000000",
  "ffffffffffffffffffffffffffffffff",
]);

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isTestReviewId(reviewId: string) {
  return reviewId === "mock" || /^(mock_|test_|local_test_|manual_test_)/.test(reviewId);
}

function getLineSourceIds(event: LineWebhookEvent) {
  return [
    normalizeString(event.source?.groupId),
    normalizeString(event.source?.userId),
    normalizeString(event.source?.roomId),
  ].filter(Boolean);
}

function parsePostbackData(data: string) {
  if (data.startsWith("{")) {
    try {
      const parsed = JSON.parse(data) as {
        action?: unknown;
        reviewId?: unknown;
        text?: unknown;
      };
      const params = new URLSearchParams();
      const action = normalizeString(parsed.action);
      const reviewId = normalizeString(parsed.reviewId);
      const text = normalizeString(parsed.text);

      if (action) {
        params.set("action", action);
      }

      if (reviewId) {
        params.set("reviewId", reviewId);
      }

      if (text) {
        params.set("text", text);
      }

      return params;
    } catch {
      return new URLSearchParams();
    }
  }

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

function isUsableReplyToken(replyToken: string) {
  return Boolean(replyToken) && !dummyReplyTokens.has(replyToken);
}

async function resolveLineAccessToken({
  prisma,
  review,
}: {
  prisma: PrismaLike;
  review?: ReviewWithSchool | null;
}) {
  const reviewToken = normalizeString(getLineAccessToken(review));
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
  review?: ReviewWithSchool | null;
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

async function replyFlexToLine({
  event,
  message,
  review,
  prisma,
  fetchImpl,
}: {
  event: LineWebhookEvent;
  message: ReturnType<typeof buildLineCustomReplyConfirmationMessage>;
  review?: ReviewWithSchool | null;
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

  await replyLineFlexMessage({
    replyToken,
    channelAccessToken,
    message,
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

  const replyText = normalizeString(review.aiReplyDraft || review.aiReplyText);

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
    text: "✅ AI返信ドラフトの内容でGoogleマップに返信を投稿しました！",
    prisma,
    fetchImpl,
  });

  return "approved";
}

async function findReviewById({
  reviewId,
  prisma,
}: {
  reviewId: string;
  prisma: PrismaLike;
}) {
  return (await prisma.review.findUnique({
    where: { id: reviewId },
    include: buildReviewInclude(),
  })) as ReviewWithSchool | null;
}

async function confirmCustomReply({
  event,
  reviewId,
  postbackText,
  prisma,
  fetchImpl,
}: {
  event: LineWebhookEvent;
  reviewId: string;
  postbackText?: string;
  prisma: PrismaLike;
  fetchImpl: FetchLike;
}) {
  if (isTestReviewId(reviewId)) {
    const replyText = normalizeString(postbackText);
    await replyToLine({
      event,
      text: replyText
        ? `✅ テスト用の確認フローが完了しました。\n\n【確認された返信文】\n${replyText}`
        : "✅ テスト用の確認フローが完了しました。",
      prisma,
      fetchImpl,
    });
    return "custom_reply_confirmed_mock";
  }

  const review = await findReviewById({ reviewId, prisma });

  if (!review) {
    const replyText = normalizeString(postbackText);
    if (replyText) {
      await replyToLine({
        event,
        text: `✅ テスト用の確認フローが完了しました。\n\n【確認された返信文】\n${replyText}`,
        prisma,
        fetchImpl,
      });
      return "custom_reply_confirmed_mock";
    }

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

  const replyText = normalizeString(review.pendingCustomReply);

  if (!replyText) {
    await replyToLine({
      event,
      review,
      text: "確認待ちの修正返信文が見つかりませんでした。もう一度、返信文を送信してください。",
      prisma,
      fetchImpl,
    });
    return "missing_pending_custom_reply";
  }

  await postReplyToGbp({ review, replyText, fetchImpl });
  await prisma.review.update({
    where: { id: review.id },
    data: {
      pendingCustomReply: null,
      replyText,
      aiReplyText: replyText,
      aiReplyDraft: replyText,
      status: "REVISED_AND_REPLIED",
      repliedAt: new Date(),
    },
  });
  await replyToLine({
    event,
    review,
    text: `✅ 修正いただいた以下の内容でGoogleマップに返信を投稿しました！\n\n【投稿された返信文】\n${replyText}`,
    prisma,
    fetchImpl,
  });

  return "custom_reply_confirmed";
}

async function requestEditText({
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
  const review = isTestReviewId(reviewId)
    ? null
    : await findReviewById({ reviewId, prisma });

  if (!review) {
    if (!isTestReviewId(reviewId)) {
      await replyToLine({
        event,
        text: "対象の口コミが見つかりませんでした。",
        prisma,
        fetchImpl,
      });
      return "not_found";
    }

    const replyToken = normalizeString(event.replyToken);

    if (isUsableReplyToken(replyToken)) {
      const channelAccessToken = await resolveLineAccessToken({ prisma });

      if (!channelAccessToken) {
        console.error("[LINE Webhook] Channel Access Token not found.");
        return "request_edit_text";
      }

      await replyLineTextMessages({
        replyToken,
        channelAccessToken,
        texts: [
          "📝 【返信文の編集】\n以下の文章をコピーして編集し、このチャットにそのまま送信してください。\n送信された内容でGoogleマップに返信が投稿されます。",
          fallbackEditDraft,
        ],
        fetchImpl,
      });
    }

    return "request_edit_text";
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

  const replyToken = normalizeString(event.replyToken);

  if (isUsableReplyToken(replyToken)) {
    const draftText = normalizeString(review.aiReplyDraft || review.aiReplyText);
    const channelAccessToken = await resolveLineAccessToken({ prisma, review });

    if (!channelAccessToken) {
      console.error("[LINE Webhook] Channel Access Token not found.");
      return "request_edit_text";
    }

    await replyLineTextMessages({
      replyToken,
      channelAccessToken,
      texts: [
        "📝 【返信文の編集】\n以下の文章をコピーして編集し、このチャットにそのまま送信してください。\n送信された内容でGoogleマップに返信が投稿されます。",
        draftText ||
          "AI返信ドラフトが見つかりませんでした。返信文を入力して送信してください。",
      ],
      fetchImpl,
    });
  }

  return "request_edit_text";
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
  const sourceIds = getLineSourceIds(event);
  const replyText = normalizeString(event.message?.text);

  if (!replyText) {
    return "ignored";
  }

  if (!sourceIds.length) {
    await replyFlexToLine({
      event,
      prisma,
      message: buildLineCustomReplyConfirmationMessage({
        reviewId: "mock",
        userCustomText: replyText,
        includeTextInPostback: true,
      }),
      fetchImpl,
    });
    return "custom_reply_confirmation_sent_mock";
  }

  const review = (await prisma.review.findFirst({
    where: {
      lineUserId: {
        in: sourceIds,
      },
      status: {
        notIn: excludedRevisionStatuses,
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: buildReviewInclude(),
  })) as ReviewWithSchool | null;

  if (!review) {
    await replyFlexToLine({
      event,
      prisma,
      message: buildLineCustomReplyConfirmationMessage({
        reviewId: "mock",
        userCustomText: replyText,
        includeTextInPostback: true,
      }),
      fetchImpl,
    });
    return "custom_reply_confirmation_sent_mock";
  }

  await prisma.review.update({
    where: { id: review.id },
    data: {
      pendingCustomReply: replyText,
      status: "PENDING_CUSTOM_REPLY",
    },
  });
  await replyFlexToLine({
    event,
    review,
    message: buildLineCustomReplyConfirmationMessage({
      reviewId: review.id,
      userCustomText: replyText,
    }),
    prisma,
    fetchImpl,
  });

  return "custom_reply_confirmation_sent";
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

      if (params.get("action") === "confirm_custom_reply") {
        const postbackText = normalizeString(params.get("text"));
        const reviewId = normalizeString(params.get("reviewId")) || (postbackText ? "mock" : "");
        results.push(
          reviewId
            ? await confirmCustomReply({
                event,
                reviewId,
                postbackText,
                prisma,
                fetchImpl,
              })
            : "missing_review_id",
        );
        continue;
      }

      if (params.get("action") === "request_edit_text") {
        const reviewId = normalizeString(params.get("reviewId")) || "mock";
        results.push(
          reviewId
            ? await requestEditText({ event, reviewId, prisma, fetchImpl })
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
