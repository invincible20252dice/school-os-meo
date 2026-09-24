import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { canAccessSchool } from "@/lib/auth-access";
import { DirectReplyError, publishDirectGbpReply } from "@/lib/gbp-direct-reply";
import { prisma } from "@/lib/prisma";
import { formatDraftText } from "@/lib/review-reply-assist";
import { resolveRequestAccess } from "@/lib/supabase-access";

export const maxDuration = 60;

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reviewId = stringValue(url.searchParams.get("reviewId"));
  url.pathname = "/dashboard/reviews";
  url.search = "";
  if (reviewId) url.searchParams.set("reviewId", reviewId);
  return NextResponse.redirect(url);
}

export async function POST(request: Request) {
  let googlePosted = false;
  let reviewId = "";
  try {
    const accessResult = await resolveRequestAccess(request, new URL(request.url));
    if (!accessResult.isAuthenticated) {
      throw new DirectReplyError("UNAUTHENTICATED", "ログイン後に口コミへ返信してください。", 401);
    }
    if (!isApprovedAccess(accessResult.access)) {
      throw new DirectReplyError("FORBIDDEN", "アカウント承認後に口コミへ返信できます。", 403);
    }
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new DirectReplyError("INVALID_REQUEST", "返信する口コミと返信文を確認してください。", 400);
    }
    const payload = body as Record<string, unknown>;
    reviewId = stringValue(payload.reviewId);
    const replyText = formatDraftText(stringValue(payload.replyText)).trim();
    if (!reviewId || !replyText || replyText.length > 4096) {
      throw new DirectReplyError("INVALID_REQUEST", "口コミIDと1〜4096文字の返信文を指定してください。", 400);
    }
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true, schoolId: true, googleReviewId: true, gbpReviewId: true,
        authorName: true, parentName: true, originalText: true, comment: true, rating: true,
        school: {
          select: {
            gbpAccountId: true, gbpLocationId: true,
            schoolSetting: { select: {
              googleAccountId: true, googleRefreshToken: true, selectedGbpLocationId: true,
            } },
            googleAccount: { select: { refreshToken: true, locationId: true } },
          },
        },
      },
    });
    if (!review) throw new DirectReplyError("NOT_FOUND", "対象の口コミが見つかりませんでした。", 404);
    if (!canAccessSchool(accessResult.access, review.schoolId)) {
      throw new DirectReplyError("FORBIDDEN", "この校舎の口コミには返信できません。", 403);
    }
    const requestedSchoolId = stringValue(payload.schoolId);
    if (requestedSchoolId && requestedSchoolId !== review.schoolId) {
      throw new DirectReplyError("SCHOOL_MISMATCH", "選択中の校舎と口コミの所属校舎が一致しません。", 409);
    }
    const setting = review.school.schoolSetting;
    const account = review.school.googleAccount;
    let published: Awaited<ReturnType<typeof publishDirectGbpReply>>;
    try {
      published = await publishDirectGbpReply({
        refreshToken: setting?.googleRefreshToken || account?.refreshToken || "",
        locationId: setting?.selectedGbpLocationId || account?.locationId || review.school.gbpLocationId || "",
        accountId: review.school.gbpAccountId || setting?.googleAccountId || "",
        review: {
          googleReviewId: review.googleReviewId,
          gbpReviewId: review.gbpReviewId,
          authorName: review.authorName || review.parentName || "",
          originalText: review.originalText || review.comment || "",
          rating: review.rating,
        },
        replyText,
      });
    } catch (error) {
      // Persist only the editable draft. A provider refusal is never a published reply.
      if (!(error instanceof DirectReplyError) || (error.googleStatus !== 429 && error.googleStatus !== 403)) throw error;
      const warning = error.googleStatus === 429 ? "RATE_LIMITED" : "PERMISSION_DENIED";
      try {
        await prisma.review.update({
          where: { id: review.id },
          data: { aiReplyText: replyText, aiReplyDraft: replyText },
          select: { id: true },
        });
      } catch {
        throw new DirectReplyError("DRAFT_SAVE_FAILED", "Googleへ投稿できず、下書きの保存にも失敗しました。入力文をコピーして保管し、時間をおいて再試行してください。", 500, error.googleStatus);
      }
      console.warn("[GBP Direct Reply Draft Saved]", { reviewId, schoolId: review.schoolId, warning, googleStatus: error.googleStatus });
      return NextResponse.json({
        success: true, googlePosted: false, gbpPublished: false, draftSaved: true,
        deliveryStatus: "DRAFT_SAVED", warning, googleStatus: error.googleStatus,
        message: error.googleStatus === 429
          ? "返信文を下書き保存しました。Google APIの利用上限により、Googleには未反映です。利用枠を確認し、時間をおいて再送信するか、コピーしてGoogleで返信してください。"
          : "返信文を下書き保存しました。Googleがアクセスを拒否したため、Googleには未反映です。APIの利用承認・店舗の管理権限・Google連携を確認するか、コピーしてGoogleで返信してください。",
      });
    }
    googlePosted = true;
    const updated = await prisma.review.update({
      where: { id: review.id },
      data: {
        googleReviewId: published.googleReviewId,
        gbpReviewId: published.gbpReviewId,
        source: "GOOGLE",
        aiReplyText: published.replyText,
        aiReplyDraft: published.replyText,
        replyText: published.replyText,
        status: "REPLIED",
        repliedAt: new Date(),
      },
      select: { id: true, status: true, replyText: true, repliedAt: true },
    });
    console.info("[GBP Direct Reply]", { reviewId, schoolId: review.schoolId, googlePosted: true });
    return NextResponse.json({
      success: true, googlePosted: true, gbpPublished: true, deliveryStatus: "GOOGLE_POSTED",
      message: "Googleへ返信を送信しました。公開反映にはGoogle側の審査で時間がかかる場合があります。",
      review: { ...updated, repliedAt: updated.repliedAt?.toISOString() },
    });
  } catch (error) {
    const failure = error instanceof DirectReplyError ? error : new DirectReplyError(
      googlePosted ? "GOOGLE_POSTED_DB_FAILED" : "REPLY_FAILED",
      googlePosted
        ? "Googleへの返信送信は成功しましたが、管理画面への保存に失敗しました。口コミ同期で状態を更新してください。"
        : "口コミ返信の処理を完了できませんでした。ログイン状態を確認し、時間をおいて再試行してください。",
      500,
    );
    console.error("[GBP Direct Reply]", { reviewId, code: failure.code, googleStatus: failure.googleStatus, googlePosted });
    return NextResponse.json({
      success: false, googlePosted, gbpPublished: googlePosted,
      code: failure.code, googleStatus: failure.googleStatus, message: failure.message,
    }, { status: failure.status });
  }
}
