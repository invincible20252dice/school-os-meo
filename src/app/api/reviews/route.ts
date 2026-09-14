import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
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
  school: { name: string };
};

function serializeReview(review: ReviewRow) {
  const authorName = review.authorName || review.parentName || "Googleユーザー";
  const originalText = review.originalText || review.comment || "";
  const aiReplyText = review.aiReplyDraft || review.aiReplyText || "";
  const googleReviewId = review.googleReviewId || review.gbpReviewId || "";

  return {
    id: review.id,
    schoolId: review.schoolId,
    schoolName: review.school.name,
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
    replyText: review.replyText || "",
    aiReplyGeneratedAt: review.aiReplyGeneratedAt?.toISOString() || "",
    repliedAt: review.repliedAt?.toISOString() || "",
    createdAt: review.createdAt.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedSchoolId = url.searchParams.get("schoolId") || undefined;
    const accessResult = await resolveRequestAccess(request, url);

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
