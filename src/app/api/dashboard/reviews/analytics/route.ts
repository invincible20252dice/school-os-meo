import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { canAccessSchool, isAllSchoolRole } from "@/lib/auth-access";
import { prisma } from "@/lib/prisma";
import { analyzeReviews, ReviewAnalysisError } from "@/lib/review-analytics-ai";
import { aggregateReviewAnalysis } from "@/lib/review-analytics";
import { resolveRequestAccess } from "@/lib/supabase-access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const limit = 50;

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const error = (message: string, status: number) => NextResponse.json({ success: false, error: message }, { status, headers });
  try {
    const url = new URL(request.url);
    const { access, isAuthenticated } = await resolveRequestAccess(request, url);
    if (!isAuthenticated) return error("ログイン後に口コミ分析を確認してください。", 401);
    if (!isApprovedAccess(access)) return error("アカウント承認後に口コミ分析を確認できます。", 403);
    const requested = url.searchParams.get("schoolId")?.trim();
    let schoolId = requested && requested !== "all" ? requested : null;
    if (!isAllSchoolRole(access.role)) {
      if (schoolId && !canAccessSchool(access, schoolId)) return error("この校舎のデータは閲覧できません。", 403);
      schoolId = schoolId || access.schoolId || access.schoolIds[0];
      if (!schoolId || !canAccessSchool(access, schoolId)) return error("担当校舎が設定されていません。", 403);
    }
    const schools = await prisma.school.findMany({ where: schoolId ? { id: schoolId } : { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { id: "asc" } });
    if (schoolId && !schools.length) return error("校舎が見つかりません。", 404);
    const where = { schoolId: { in: schools.map(school => school.id) }, source: "GOOGLE" as const, status: { not: "ARCHIVED" as const } };
    const [reviews, totalReviews] = await Promise.all([
      prisma.review.findMany({ where, select: { id: true, comment: true, originalText: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit }),
      prisma.review.count({ where }),
    ]);
    const inputs = reviews.map(row => ({ id: row.id, text: (row.comment?.trim() || row.originalText?.trim() || "") })).filter(row => row.text.length > 0);
    const analyses = await analyzeReviews(inputs);
    const { categories, opinions, ...summary } = aggregateReviewAnalysis(analyses);
    return NextResponse.json({ success: true, schoolId, schoolName: schoolId ? schools[0].name : "全校舎", totalReviews, sampledReviews: reviews.length, textReviews: inputs.length, limit, analyses, summary, categories, opinions }, { headers });
  } catch (cause) {
    console.error("[Review Analytics]", { code: cause instanceof ReviewAnalysisError ? cause.code : "DATABASE_OR_AUTH_FAILED" });
    if (cause instanceof ReviewAnalysisError) return error(cause.code === "NOT_CONFIGURED" ? "AI分析の接続設定が未完了です。管理者にお問い合わせください。" : "AI分析を完了できませんでした。時間をおいて再取得してください。", cause.status);
    return error("口コミ分析データを取得できませんでした。時間をおいて再取得してください。", 500);
  }
}
