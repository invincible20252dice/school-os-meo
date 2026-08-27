import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

type SerializedReview = {
  id: string;
  schoolId: string;
  schoolName: string;
  source: string;
  status: string;
  parentName: string;
  authorName: string;
  rating: number | null;
  originalText: string;
  comment: string;
  googleReviewId: string;
  googleReviewName: string;
  gbpReviewId: string;
  aiReplyText: string;
  aiReplyDraft: string;
  replyText: string;
  aiReplyGeneratedAt: string;
  repliedAt: string;
  createdAt: string;
};

type RawReviewRow = Record<string, unknown>;

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
}): SerializedReview {
  const authorName = review.authorName || review.parentName || "Googleユーザー";
  const originalText = review.originalText || "";
  const aiReplyText = review.aiReplyText || "";

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
    googleReviewId: review.googleReviewId || "",
    googleReviewName: review.googleReviewId || "",
    gbpReviewId: "",
    aiReplyText,
    aiReplyDraft: aiReplyText,
    replyText: "",
    aiReplyGeneratedAt: review.aiReplyGeneratedAt?.toISOString() || "",
    repliedAt: review.repliedAt?.toISOString() || "",
    createdAt: review.createdAt.toISOString(),
  };
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDate(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }

  return "";
}

function normalizeRating(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function isMissingColumnError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2022"
  );
}

function selectColumn(
  columns: Set<string>,
  columnName: string,
  alias = columnName,
  tableAlias = "r",
) {
  return columns.has(columnName)
    ? `${tableAlias}.${quoteIdentifier(columnName)} AS ${quoteIdentifier(alias)}`
    : `NULL AS ${quoteIdentifier(alias)}`;
}

async function getPublicColumns(tableName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
    tableName,
  );

  return new Set(rows.map((row) => row.column_name));
}

function serializeRawReview(row: RawReviewRow): SerializedReview | null {
  const id = normalizeString(row.id);

  if (!id) {
    return null;
  }

  const authorName =
    normalizeString(row.authorName) ||
    normalizeString(row.reviewerName) ||
    normalizeString(row.parentName) ||
    "Googleユーザー";
  const originalText =
    normalizeString(row.originalText) ||
    normalizeString(row.comment) ||
    normalizeString(row.content) ||
    normalizeString(row.text);
  const aiReplyText =
    normalizeString(row.aiReplyText) ||
    normalizeString(row.aiReplyDraft) ||
    normalizeString(row.draftReply);
  const replyText = normalizeString(row.replyText);
  const googleReviewId =
    normalizeString(row.googleReviewId) ||
    normalizeString(row.googleReviewName) ||
    normalizeString(row.gbpReviewId);

  return {
    id,
    schoolId: normalizeString(row.schoolId),
    schoolName: normalizeString(row.schoolName) || "校舎未設定",
    source: normalizeString(row.source) || "GOOGLE",
    status: normalizeString(row.status) || (replyText ? "REPLIED" : "PENDING"),
    parentName: authorName,
    authorName,
    rating: normalizeRating(row.rating ?? row.starRating),
    originalText,
    comment: originalText,
    googleReviewId,
    googleReviewName: googleReviewId,
    gbpReviewId: normalizeString(row.gbpReviewId),
    aiReplyText,
    aiReplyDraft: aiReplyText,
    replyText,
    aiReplyGeneratedAt: normalizeDate(row.aiReplyGeneratedAt),
    repliedAt: normalizeDate(row.repliedAt),
    createdAt: normalizeDate(row.createdAt),
  };
}

async function findReviewsWithRawColumns(schoolId?: string) {
  const reviewColumns = await getPublicColumns("Review");
  const schoolColumns = await getPublicColumns("School");
  const canJoinSchool = reviewColumns.has("schoolId") && schoolColumns.has("id");
  const selectExpressions = [
    selectColumn(reviewColumns, "id"),
    selectColumn(reviewColumns, "schoolId"),
    selectColumn(reviewColumns, "source"),
    selectColumn(reviewColumns, "status"),
    selectColumn(reviewColumns, "parentName"),
    selectColumn(reviewColumns, "reviewerName"),
    selectColumn(reviewColumns, "authorName"),
    selectColumn(reviewColumns, "rating"),
    selectColumn(reviewColumns, "starRating"),
    selectColumn(reviewColumns, "originalText"),
    selectColumn(reviewColumns, "comment"),
    selectColumn(reviewColumns, "content"),
    selectColumn(reviewColumns, "text"),
    selectColumn(reviewColumns, "googleReviewId"),
    selectColumn(reviewColumns, "googleReviewName"),
    selectColumn(reviewColumns, "gbpReviewId"),
    selectColumn(reviewColumns, "aiReplyText"),
    selectColumn(reviewColumns, "aiReplyDraft"),
    selectColumn(reviewColumns, "draftReply"),
    selectColumn(reviewColumns, "replyText"),
    selectColumn(reviewColumns, "aiReplyGeneratedAt"),
    selectColumn(reviewColumns, "repliedAt"),
    selectColumn(reviewColumns, "createdAt"),
    canJoinSchool && schoolColumns.has("name")
      ? `s.${quoteIdentifier("name")} AS ${quoteIdentifier("schoolName")}`
      : `NULL AS ${quoteIdentifier("schoolName")}`,
  ];
  const joinClause = canJoinSchool
    ? ` LEFT JOIN ${quoteIdentifier("School")} s ON r.${quoteIdentifier("schoolId")} = s.${quoteIdentifier("id")}`
    : "";
  const params: string[] = [];
  const whereClause =
    schoolId && reviewColumns.has("schoolId")
      ? (() => {
          params.push(schoolId);
          return ` WHERE r.${quoteIdentifier("schoolId")} = $1`;
        })()
      : "";
  const orderColumns = [
    reviewColumns.has("repliedAt")
      ? `r.${quoteIdentifier("repliedAt")} ASC NULLS FIRST`
      : "",
    reviewColumns.has("createdAt")
      ? `r.${quoteIdentifier("createdAt")} DESC NULLS LAST`
      : "",
  ].filter(Boolean);
  const orderClause = orderColumns.length ? ` ORDER BY ${orderColumns.join(", ")}` : "";
  const rows = await prisma.$queryRawUnsafe<RawReviewRow[]>(
    `SELECT ${selectExpressions.join(", ")} FROM ${quoteIdentifier("Review")} r${joinClause}${whereClause}${orderClause} LIMIT 50`,
    ...params,
  );

  return rows.map(serializeRawReview).filter((review): review is SerializedReview =>
    Boolean(review),
  );
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
    let reviews: SerializedReview[];

    try {
      const prismaReviews = await prisma.review.findMany({
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

      reviews = prismaReviews.map(serializeReview);
    } catch (error) {
      if (!isMissingColumnError(error)) {
        throw error;
      }

      console.error("[GET /api/dashboard/reviews P2022 fallback]", error);
      try {
        reviews = await findReviewsWithRawColumns(scopedSchool.effectiveSchoolId);
      } catch (rawError) {
        console.error("[GET /api/dashboard/reviews raw fallback failed]", rawError);
        reviews = [];
      }
    }

    return NextResponse.json({
      success: true,
      reviews,
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
