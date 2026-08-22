import { buildFallbackGbpReply, type IncomingGbpReview } from "./gbp-webhook";
import { buildLineReviewMessage, buildStarRating } from "./line";

export type ManualReviewTestInput = Partial<IncomingGbpReview> & {
  schoolName?: string;
};

export async function buildManualReviewTest(input: ManualReviewTestInput = {}) {
  const now = new Date();
  const review: IncomingGbpReview = {
    googleReviewId:
      input.googleReviewId ?? `manual_test_review_${now.getTime().toString(36)}`,
    googlePlaceId: input.googlePlaceId ?? "demo-place-id",
    gbpLocationId: input.gbpLocationId ?? "locations/aoba-yokohama-main",
    reviewerName: input.reviewerName ?? "手動テスト保護者",
    rating: input.rating ?? 5,
    reviewText:
      input.reviewText ??
      "手動テストです。先生の説明が丁寧で、子どもが前向きに通えています。",
    reviewUrl: input.reviewUrl ?? "https://search.google.com/local/reviews",
    reviewedAt: input.reviewedAt ?? now.toISOString(),
  };
  const schoolName = input.schoolName ?? "青葉ゼミナール 本校";
  const aiReplyText = await buildFallbackGbpReply({
    schoolName,
    rating: review.rating,
    reviewText: review.reviewText,
  });
  const savedReview = {
    id: `review_manual_${now.getTime().toString(36)}`,
    schoolName,
    status: "PENDING",
    stars: buildStarRating(review.rating),
    aiReplyText,
    aiReplyDraft: aiReplyText,
    dashboardUrl: "/dashboard/reviews",
  };
  const lineNotification = buildLineReviewMessage({
    reviewId: savedReview.id,
    schoolName,
    rating: review.rating,
    reviewText: review.reviewText,
    aiReplyText,
    googleReviewUrl: review.reviewUrl,
  });

  return {
    mode: "manual-review-test",
    dryRun: true,
    message:
      "DBと外部LINE送信を使わず、口コミ一覧とLINE通知の表示内容を模擬生成しました。",
    summary: {
      received: 1,
      saved: 1,
      notified: 1,
      skipped: 0,
    },
    review,
    savedReview,
    lineNotification,
  };
}
