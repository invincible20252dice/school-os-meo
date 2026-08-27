import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

function serializeReview(review: {
  id: string;
  schoolId: string;
  source: string;
  status: string;
  parentName: string | null;
  authorName: string | null;
  rating: number | null;
  originalText: string | null;
  googleReviewId: string | null;
  aiReplyText: string | null;
  aiReplyGeneratedAt: Date | null;
  repliedAt: Date | null;
  createdAt: Date;
  school: { name: string };
}) {
  return {
    id: review.id,
    schoolId: review.schoolId,
    schoolName: review.school.name,
    source: review.source,
    status: review.status,
    parentName: review.authorName || review.parentName || "Googleユーザー",
    rating: review.rating,
    originalText: review.originalText || "",
    googleReviewId: review.googleReviewId || "",
    aiReplyText: review.aiReplyText || "",
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
    const where = scopedSchool.effectiveSchoolId
      ? { schoolId: scopedSchool.effectiveSchoolId }
      : {};
    const reviews = await prisma.review.findMany({
      where,
      select: {
        id: true,
        schoolId: true,
        source: true,
        status: true,
        parentName: true,
        authorName: true,
        rating: true,
        originalText: true,
        googleReviewId: true,
        aiReplyText: true,
        aiReplyGeneratedAt: true,
        repliedAt: true,
        createdAt: true,
        school: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ repliedAt: "asc" }, { createdAt: "desc" }],
      take: 50,
    });

    return NextResponse.json({
      reviews: reviews.map(serializeReview),
      access: {
        role: accessResult.access.role,
        effectiveSchoolId: scopedSchool.effectiveSchoolId || "",
        source: accessResult.access.source,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "口コミ一覧を取得できませんでした。" },
      { status: 500 },
    );
  }
}
