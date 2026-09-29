import { NextResponse } from "next/server";
import { buildUniversalReview, ReviewGenerationError } from "@/lib/review-template";
import { type GenerateReviewRequest, type NormalizedReviewRequest, normalizeReviewRequest } from "@/lib/review-generator";

export const maxDuration = 60;

export async function POST(request: Request) {
  let input: NormalizedReviewRequest;
  try {
    input = normalizeReviewRequest((await request.json()) as GenerateReviewRequest);
  } catch {
    return NextResponse.json({ message: "ご回答者様（保護者様 / 生徒ご本人様）を選択し、回答内容を確認してください。" }, { status: 400 });
  }
  try {
    const review = await buildUniversalReview(input);
    return NextResponse.json({ success: true, generationSource: "ai", review, reviews: [review] });
  } catch (error) {
    const code = error instanceof ReviewGenerationError ? error.code : "PROVIDER_FAILED";
    const status = error instanceof ReviewGenerationError ? error.status : 502;
    console.error("[Generate Review]", { code });
    return NextResponse.json({
      success: false,
      message: code === "NOT_CONFIGURED"
        ? "AI生成の接続設定が未完了です。管理者にお問い合わせください。"
        : "口コミを生成できませんでした。入力内容は保持されています。時間をおいて再度お試しください。",
    }, { status });
  }
}
