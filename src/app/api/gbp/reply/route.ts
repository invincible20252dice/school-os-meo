import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import {
  postGbpReviewReply,
  resolveGbpAccessToken,
  GbpReplyError,
} from "@/lib/gbp-reply";
import { prisma } from "@/lib/prisma";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

type ReplyBody = {
  reviewId?: string;
  replyText?: string;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toDashboardRedirect(request: Request, reviewId: string) {
  const url = new URL(request.url);
  url.pathname = "/dashboard/reviews";
  url.search = "";
  url.searchParams.set("reviewId", reviewId);
  return NextResponse.redirect(url);
}

async function assertCanAccessReview(request: Request, reviewId: string) {
  const url = new URL(request.url);
  const accessResult = await resolveRequestAccess(request, url);

  if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
    throw new Error("FORBIDDEN_PENDING");
  }

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: {
      school: {
        include: {
          schoolSetting: {
            select: {
              googleRefreshToken: true,
              selectedGbpLocationId: true,
            },
          },
        },
      },
    },
  });

  if (!review) {
    throw new Error("REVIEW_NOT_FOUND");
  }

  const scopedSchool = buildScopedSchoolFilter(accessResult.access, review.schoolId);

  if (scopedSchool.effectiveSchoolId && scopedSchool.effectiveSchoolId !== review.schoolId) {
    throw new Error("FORBIDDEN_SCHOOL");
  }

  return { review, access: accessResult.access };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const status =
    message === "REPLY_REQUIRED" || message === "REVIEW_ID_REQUIRED"
      ? 400
      : message === "FORBIDDEN_PENDING" || message === "FORBIDDEN_SCHOOL"
        ? 403
        : message === "REVIEW_NOT_FOUND"
          ? 404
          : error instanceof GbpReplyError
            ? 502
            : 500;

  if (status >= 500) {
    console.error("GBP口コミ返信の投稿に失敗しました。", error);
  }

  return NextResponse.json(
    {
      message:
        status === 400
          ? "返信する口コミと返信文を確認してください。"
          : status === 403
            ? "この口コミには返信できません。"
            : status === 404
              ? "対象の口コミが見つかりませんでした。"
              : error instanceof GbpReplyError
                ? "Google Business Profileへの返信投稿に失敗しました。Google連携設定を確認してください。"
                : "口コミ返信を投稿できませんでした。",
    },
    { status },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reviewId = normalizeString(url.searchParams.get("reviewId"));

  if (!reviewId) {
    return NextResponse.redirect(new URL("/dashboard/reviews", url));
  }

  return toDashboardRedirect(request, reviewId);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReplyBody;
    const reviewId = normalizeString(body.reviewId);
    const replyText = normalizeString(body.replyText);

    if (!reviewId) {
      throw new Error("REVIEW_ID_REQUIRED");
    }

    if (!replyText) {
      throw new Error("REPLY_REQUIRED");
    }

    const { review } = await assertCanAccessReview(request, reviewId);

    if (!review.googleReviewId) {
      throw new Error("REVIEW_NOT_FOUND");
    }

    const accessToken = await resolveGbpAccessToken({
      googleRefreshToken: review.school.schoolSetting?.googleRefreshToken,
    });

    await postGbpReviewReply({
      gbpAccountId: review.school.gbpAccountId,
      gbpLocationId:
        review.school.gbpLocationId ||
        review.school.schoolSetting?.selectedGbpLocationId,
      googleReviewId: review.googleReviewId,
      replyText,
      accessToken,
    });

    const updatedReview = await prisma.review.update({
      where: { id: review.id },
      data: {
        aiReplyText: replyText,
        aiReplyDraft: replyText,
        replyText,
        status: "REPLIED",
        repliedAt: new Date(),
      },
    });

    return NextResponse.json({
      message: "Google口コミへ返信を投稿しました。",
      review: {
        id: updatedReview.id,
        status: updatedReview.status,
        aiReplyText: updatedReview.aiReplyText,
        repliedAt: updatedReview.repliedAt?.toISOString() || "",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
