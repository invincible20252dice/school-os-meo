import { sendLineReviewNotification } from "./line";

type FetchLike = typeof fetch;

export type IncomingGbpReview = {
  googleReviewId: string;
  googlePlaceId?: string;
  gbpLocationId?: string;
  reviewerName?: string;
  rating: number;
  reviewText: string;
  reviewUrl?: string;
  reviewedAt?: string;
};

type SchoolRecord = {
  id: string;
  name: string;
  googlePlaceId?: string | null;
  gbpLocationId?: string | null;
  lineChannelId?: string | null;
  schoolSetting?: {
    lineNotifyEnabled?: boolean | null;
    lineChannelAccessToken?: string | null;
    lineDestinationId?: string | null;
    notifyOnNewReview?: boolean | null;
    notifyOnLowRating?: boolean | null;
  } | null;
};

type ReviewRecord = {
  id: string;
};

type PrismaLike = {
  school: {
    findFirst(args: unknown): Promise<SchoolRecord | null>;
  };
  review: {
    findFirst(args: unknown): Promise<ReviewRecord | null>;
    create(args: unknown): Promise<ReviewRecord>;
    update(args: unknown): Promise<ReviewRecord>;
  };
};

type ProcessGbpReviewsInput = {
  reviews: IncomingGbpReview[];
  prisma: PrismaLike;
  fetchImpl?: FetchLike;
};

type GbpReplyInput = {
  schoolName: string;
  rating: number;
  reviewText: string;
};

export async function buildFallbackGbpReply(input: GbpReplyInput) {
  if (input.rating >= 4) {
    return `${input.schoolName}への温かい口コミをありがとうございます。お子さまが前向きに通ってくださっていることを大変うれしく思います。今後も一人ひとりに寄り添い、安心して学べる環境づくりに努めてまいります。`;
  }

  return `${input.schoolName}への貴重なご意見をありがとうございます。いただいた内容を真摯に受け止め、より安心して通っていただける教室運営に活かしてまいります。今後ともお気づきの点がございましたらお知らせください。`;
}

export async function generateGbpReviewReply(
  input: GbpReplyInput,
  fetchImpl: FetchLike = fetch,
) {
  if (!process.env.OPENAI_API_KEY) {
    return buildFallbackGbpReply(input);
  }

  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      input: [
        {
          role: "system",
          content:
            "あなたは学習塾のGoogle口コミ返信担当です。保護者に向けて、丁寧で自然、誇張のない返信文を1案だけ作成してください。",
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI reply generation failed: ${response.status}`);
  }

  const data = await response.json();
  return typeof data.output_text === "string" && data.output_text.trim()
    ? data.output_text.trim()
    : buildFallbackGbpReply(input);
}

function buildSchoolWhere(review: IncomingGbpReview) {
  const candidates = [
    review.googlePlaceId ? { googlePlaceId: review.googlePlaceId } : null,
    review.gbpLocationId ? { gbpLocationId: review.gbpLocationId } : null,
  ].filter(Boolean);

  return candidates.length === 1 ? candidates[0] : { OR: candidates };
}

async function findSchoolForReview(
  prisma: PrismaLike,
  review: IncomingGbpReview,
) {
  if (!review.googlePlaceId && !review.gbpLocationId) {
    return null;
  }

  return prisma.school.findFirst({
    where: buildSchoolWhere(review),
    include: {
      schoolSetting: true,
    },
  });
}

function normalizeToken(value?: string | null) {
  const token = value?.trim() || "";

  return token && !token.includes("*") ? token : "";
}

function shouldNotifyLine(school: SchoolRecord, review: IncomingGbpReview) {
  const setting = school.schoolSetting;

  if (setting?.lineNotifyEnabled === false) {
    return false;
  }

  const notifyOnLowRating = setting?.notifyOnLowRating ?? true;
  const notifyOnNewReview = setting?.notifyOnNewReview ?? true;

  return notifyOnNewReview || (notifyOnLowRating && review.rating <= 3);
}

function getLineDelivery(school: SchoolRecord, review: IncomingGbpReview) {
  if (!shouldNotifyLine(school, review)) {
    return null;
  }

  const channelAccessToken =
    normalizeToken(school.schoolSetting?.lineChannelAccessToken) ||
    normalizeToken(process.env.LINE_CHANNEL_ACCESS_TOKEN);
  const to =
    normalizeToken(school.schoolSetting?.lineDestinationId) ||
    normalizeToken(school.lineChannelId) ||
    normalizeToken(process.env.LINE_DEFAULT_TO_ID);

  return channelAccessToken && to ? { channelAccessToken, to } : null;
}

export async function processGbpReviews({
  reviews,
  prisma,
  fetchImpl = fetch,
}: ProcessGbpReviewsInput) {
  const summary = {
    received: reviews.length,
    saved: 0,
    notified: 0,
    skipped: 0,
  };

  for (const review of reviews) {
    const school = await findSchoolForReview(prisma, review);

    if (!school) {
      summary.skipped += 1;
      continue;
    }

    const aiReplyText = await generateGbpReviewReply(
      {
        schoolName: school.name,
        rating: review.rating,
        reviewText: review.reviewText,
      },
      fetchImpl,
    );
    const reviewedAt = review.reviewedAt ? new Date(review.reviewedAt) : null;
    const existing = await prisma.review.findFirst({
      where: {
        schoolId: school.id,
        OR: [
          { googleReviewId: review.googleReviewId },
          { gbpReviewId: review.googleReviewId },
        ],
      },
    });
    const lineDelivery = getLineDelivery(school, review);
    const data = {
      schoolId: school.id,
      source: "GOOGLE",
      status: "PENDING",
      parentName: review.reviewerName,
      authorName: review.reviewerName,
      rating: review.rating,
      originalText: review.reviewText,
      comment: review.reviewText,
      selectedReviewText: review.reviewText,
      googleReviewId: review.googleReviewId,
      gbpReviewId: review.googleReviewId,
      aiReplyText,
      aiReplyDraft: aiReplyText,
      aiReplyGeneratedAt: new Date(),
      replyText: null,
      lineUserId: lineDelivery?.to || null,
      postedAt: reviewedAt,
    };
    const savedReview = existing
      ? await prisma.review.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.review.create({ data });

    summary.saved += 1;

    if (lineDelivery) {
      await sendLineReviewNotification(
        {
          to: lineDelivery.to,
          channelAccessToken: lineDelivery.channelAccessToken,
          reviewId: savedReview.id,
          schoolName: school.name,
          rating: review.rating,
          reviewText: review.reviewText,
          aiReplyText,
          googleReviewUrl: review.reviewUrl,
        },
        fetchImpl,
      );
      summary.notified += 1;
    }
  }

  return summary;
}

export async function fetchGbpReviews(fetchImpl: FetchLike = fetch) {
  const reviewsUrl = process.env.GBP_API_REVIEWS_URL;
  const token = process.env.GBP_API_ACCESS_TOKEN;

  if (!reviewsUrl) {
    return [];
  }

  const response = await fetchImpl(reviewsUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    throw new Error(`GBP reviews fetch failed: ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data.reviews) ? (data.reviews as IncomingGbpReview[]) : [];
}
