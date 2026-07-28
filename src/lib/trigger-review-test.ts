import { generateGbpReviewReply } from "./gbp-webhook";
import { sendLineReviewNotification } from "./line";

type FetchLike = typeof fetch;

type SchoolSettingRecord = {
  schoolId: string;
  lineChannelAccessToken?: string | null;
  lineDestinationId?: string | null;
  school?: {
    id: string;
    name: string;
  } | null;
};

type ReviewRecord = {
  id: string;
};

export type TriggerReviewPrisma = {
  schoolSetting: {
    findFirst(args: unknown): Promise<SchoolSettingRecord | null>;
  };
  review: {
    create(args: unknown): Promise<ReviewRecord>;
  };
};

export type TriggerReviewInput = {
  schoolId?: string;
  schoolName?: string;
  lineChannelAccessToken?: string;
  lineDestinationId?: string;
  reviewerName?: string;
  rating?: number;
  reviewText?: string;
};

function normalizeToken(value?: string | null) {
  if (!value || value.includes("*")) {
    return "";
  }

  return value.trim();
}

export async function triggerReviewTest({
  input = {},
  prisma,
  fetchImpl = fetch,
}: {
  input?: TriggerReviewInput;
  prisma: TriggerReviewPrisma;
  fetchImpl?: FetchLike;
}) {
  const setting = await prisma.schoolSetting.findFirst({
    where: input.schoolId
      ? { schoolId: input.schoolId }
      : { lineNotifyEnabled: true },
    include: { school: true },
    orderBy: { updatedAt: "desc" },
  });
  const schoolId = setting?.schoolId || input.schoolId || "school-demo-001";
  const schoolName =
    setting?.school?.name || input.schoolName || "青葉ゼミナール 本校";
  const rating = input.rating ?? 5;
  const reviewText =
    input.reviewText ??
    "先生がとても親身で、子供の成績が上がりました！";
  const aiReplyText = await generateGbpReviewReply(
    {
      schoolName,
      rating,
      reviewText,
    },
    fetchImpl,
  );
  const savedReview = await prisma.review.create({
    data: {
      schoolId,
      source: "GOOGLE",
      status: "GENERATED",
      parentName: input.reviewerName ?? "テスト保護者",
      rating,
      originalText: reviewText,
      selectedReviewText: reviewText,
      googleReviewId: `test_review_${Date.now()}`,
      aiReplyText,
      aiReplyGeneratedAt: new Date(),
      postedAt: new Date(),
    },
  });
  const lineChannelAccessToken =
    normalizeToken(input.lineChannelAccessToken) ||
    normalizeToken(setting?.lineChannelAccessToken) ||
    normalizeToken(process.env.LINE_CHANNEL_ACCESS_TOKEN);
  const lineDestinationId =
    normalizeToken(input.lineDestinationId) ||
    normalizeToken(setting?.lineDestinationId) ||
    normalizeToken(process.env.LINE_DEFAULT_TO_ID);

  if (!lineChannelAccessToken || !lineDestinationId) {
    return {
      ok: false,
      saved: true,
      notified: false,
      reviewId: savedReview.id,
      message:
        "口コミは保存しましたが、LINEトークンまたは送信先IDが未設定です。",
    };
  }

  const lineResult = await sendLineReviewNotification(
    {
      to: lineDestinationId,
      channelAccessToken: lineChannelAccessToken,
      reviewId: savedReview.id,
      schoolName,
      rating,
      reviewText,
      aiReplyText,
      googleReviewUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000"}/dashboard/reviews`,
    },
    fetchImpl,
  );

  return {
    ok: true,
    saved: true,
    notified: true,
    reviewId: savedReview.id,
    line: lineResult,
    diagnostics: {
      db: "ReviewをDBへ保存しました。",
      lineApi: `LINE API accepted: ${lineResult.status}`,
      deliveryNote:
        lineResult.destinationType === "user"
          ? "送信先がUser IDです。対象ユーザーがこのMessaging APIチャネルのBotを友だち追加済みで、ブロックしていない必要があります。"
          : "送信先がグループ/ルームの場合、Botが対象トークへ参加している必要があります。",
    },
    message:
      "LINE APIはテスト通知を受け付けました。届かない場合は送信先の友だち追加/ブロック/チャネル一致を確認してください。",
  };
}
