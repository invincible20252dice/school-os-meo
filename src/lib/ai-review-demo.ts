import { buildLineReviewMessage, buildStarRating } from "./line";

const demoReview = {
  id: "review_demo_001",
  googleReviewId: "google_review_demo_001",
  schoolName: "青葉ゼミナール 本校",
  reviewerName: "中2保護者",
  rating: 5,
  reviewText:
    "数学が苦手で通い始めましたが、先生が子どもの理解度に合わせて丁寧に見てくださり、家でも自分から机に向かう時間が増えました。面談での説明もわかりやすく安心しています。",
  reviewedAt: "2026-07-22 14:08",
};

const demoAiReplyText =
  "青葉ゼミナール 本校への温かい口コミをありがとうございます。お子さまが前向きに学習へ向き合う時間が増えているとのこと、大変うれしく拝見しました。今後も理解度に合わせた声かけと丁寧なサポートを大切にし、安心して通っていただける教室づくりに努めてまいります。";

export function buildAiReviewReplyDemo() {
  const lineNotification = buildLineReviewMessage({
    reviewId: demoReview.id,
    schoolName: demoReview.schoolName,
    rating: demoReview.rating,
    reviewText: demoReview.reviewText,
    aiReplyText: demoAiReplyText,
    googleReviewUrl: "https://search.google.com/local/reviews",
  });

  return {
    review: {
      ...demoReview,
      stars: buildStarRating(demoReview.rating),
    },
    aiReplyText: demoAiReplyText,
    savedReview: {
      id: demoReview.id,
      source: "GOOGLE",
      status: "PENDING",
      aiReplyDraft: demoAiReplyText,
      aiReplyGeneratedAt: "2026-07-22 14:09",
      lineNotifiedAt: "2026-07-22 14:09",
    },
    lineNotification,
    timeline: [
      {
        label: "Google口コミを受信",
        detail: "GBP webhook が新着口コミを受け取ります。",
        done: true,
      },
      {
        label: "AI返信案を生成",
        detail: "校舎名・評価・本文から、保護者向けの丁寧な返信案を作ります。",
        done: true,
      },
      {
        label: "Reviewテーブルへ保存",
        detail: "口コミ本文、AI返信案、Google review ID を保存します。",
        done: true,
      },
      {
        label: "LINEへ即時通知",
        detail: "評価、口コミ本文、AI返信案、確認ボタンをFlex Messageで送ります。",
        done: true,
      },
      {
        label: "Googleへ返信投稿",
        detail: "LINEの承認ボタン、または修正文メッセージからGBPへ投稿します。",
        done: true,
      },
    ],
  };
}
