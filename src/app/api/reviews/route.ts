import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { canAccessSchool, isAllSchoolRole } from "@/lib/auth-access";
import { prisma } from "@/lib/prisma";
import {
  buildGoogleReviewManagementUrl,
  formatDraftText,
} from "@/lib/review-reply-assist";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

type ReviewRow = {
  id: string;
  schoolId: string;
  source: string;
  status: string;
  parentName: string | null;
  authorName: string | null;
  rating: number | null;
  originalText: string | null;
  comment: string | null;
  googleReviewId: string | null;
  gbpReviewId: string | null;
  aiReplyText: string | null;
  aiReplyDraft: string | null;
  replyText: string | null;
  aiReplyGeneratedAt: Date | null;
  repliedAt: Date | null;
  createdAt: Date;
  school: {
    name: string;
    schoolSetting: { selectedGbpLocationId: string | null } | null;
  };
};

type UpdateReviewBody = {
  reviewId?: string;
  replyText?: string;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function resolveScopedReview(request: Request, reviewId: string) {
  const url = new URL(request.url);
  const accessResult = await resolveRequestAccess(request, url);

  if (!accessResult.isAuthenticated) {
    return { error: "UNAUTHENTICATED" as const };
  }

  if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
    return { error: "PENDING" as const };
  }

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, schoolId: true, source: true },
  });

  if (!review) {
    return { error: "NOT_FOUND" as const };
  }

  if (!canAccessSchool(accessResult.access, review.schoolId)) {
    return { error: "FORBIDDEN" as const };
  }

  return { review };
}

function serializeReview(review: ReviewRow) {
  const authorName = review.authorName || review.parentName || "Googleユーザー";
  const originalText = review.originalText || review.comment || "";
  const aiReplyText = formatDraftText(review.aiReplyDraft || review.aiReplyText);
  const googleReviewId = review.googleReviewId || review.gbpReviewId || "";

  return {
    id: review.id,
    schoolId: review.schoolId,
    schoolName: review.school.name,
    googleReviewManagementUrl: buildGoogleReviewManagementUrl(
      review.school.schoolSetting?.selectedGbpLocationId,
    ),
    source: review.source,
    status: review.status,
    parentName: authorName,
    authorName,
    rating: review.rating,
    originalText,
    comment: originalText,
    googleReviewId,
    googleReviewName: review.googleReviewId || "",
    gbpReviewId: review.gbpReviewId || "",
    aiReplyText,
    aiReplyDraft: aiReplyText,
    replyText: formatDraftText(review.replyText),
    aiReplyGeneratedAt: review.aiReplyGeneratedAt?.toISOString() || "",
    repliedAt: review.repliedAt?.toISOString() || "",
    createdAt: review.createdAt.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedSchoolId = url.searchParams.get("schoolId")?.trim() || undefined;
    const accessResult = await resolveRequestAccess(request, url);

    if (!accessResult.isAuthenticated) {
      return NextResponse.json(
        { message: "ログイン後に口コミ一覧を確認してください。" },
        { status: 401 },
      );
    }

    if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
      return NextResponse.json(
        { message: "アカウント承認後に口コミ一覧を確認できます。" },
        { status: 403 },
      );
    }

    const scopedSchool = buildScopedSchoolFilter(
      accessResult.access,
      requestedSchoolId,
    );
    if (!isAllSchoolRole(accessResult.access.role) && (
      !scopedSchool.effectiveSchoolId ||
      !canAccessSchool(accessResult.access, scopedSchool.effectiveSchoolId) ||
      (requestedSchoolId && requestedSchoolId !== "all" && !canAccessSchool(accessResult.access, requestedSchoolId))
    )) {
      return NextResponse.json({ message: "担当校舎の権限を確認できません。管理者に校舎の割り当てを確認してください。" }, { status: 403 });
    }
    const reviews = await prisma.review.findMany({
      where: scopedSchool.effectiveSchoolId
        ? { schoolId: scopedSchool.effectiveSchoolId }
        : {},
      select: {
        id: true,
        schoolId: true,
        source: true,
        status: true,
        parentName: true,
        authorName: true,
        rating: true,
        originalText: true,
        comment: true,
        googleReviewId: true,
        gbpReviewId: true,
        aiReplyText: true,
        aiReplyDraft: true,
        replyText: true,
        aiReplyGeneratedAt: true,
        repliedAt: true,
        createdAt: true,
        school: {
          select: {
            name: true,
            schoolSetting: { select: { selectedGbpLocationId: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      reviews: reviews.map(serializeReview),
      access: {
        role: accessResult.access.role,
        effectiveSchoolId: scopedSchool.effectiveSchoolId || "",
        source: accessResult.access.source,
      },
    });
  } catch (error) {
    console.error("[GET /api/dashboard/reviews]", error);
    return NextResponse.json(
      { message: "口コミ一覧を取得できませんでした。" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as UpdateReviewBody;
    const reviewId = normalizeString(body.reviewId);
    const replyText = formatDraftText(normalizeString(body.replyText)).trim();

    if (!reviewId || !replyText) {
      return NextResponse.json(
        { message: "口コミと実際に投稿した返信文を確認してください。" },
        { status: 400 },
      );
    }

    const scopedReview = await resolveScopedReview(request, reviewId);

    if ("error" in scopedReview) {
      const status =
        scopedReview.error === "UNAUTHENTICATED"
          ? 401
          : scopedReview.error === "NOT_FOUND"
            ? 404
            : 403;
      return NextResponse.json(
        {
          message:
            status === 401
              ? "ログイン後に口コミの状態を更新してください。"
              : status === 404
              ? "対象のGoogle口コミが見つかりませんでした。"
              : "この口コミの状態は更新できません。",
        },
        { status },
      );
    }

    const updatedReview = await prisma.review.update({
      where: { id: scopedReview.review.id },
      data: {
        aiReplyText: replyText,
        aiReplyDraft: replyText,
        replyText,
        status: "REPLIED",
        repliedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        replyText: true,
        repliedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Googleでの返信完了を記録しました。",
      review: {
        ...updatedReview,
        repliedAt: updatedReview.repliedAt?.toISOString() || "",
      },
    });
  } catch (error) {
    console.error("[PATCH /api/dashboard/reviews]", error);
    return NextResponse.json(
      { message: "口コミの返信状態を更新できませんでした。" },
      { status: 500 },
    );
  }
}
