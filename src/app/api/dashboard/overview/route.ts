import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { canAccessSchool, isAllSchoolRole } from "@/lib/auth-access";
import { buildDashboardOverview } from "@/lib/dashboard-summary";
import { prisma } from "@/lib/prisma";
import { resolveRequestAccess } from "@/lib/supabase-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const url = new URL(request.url);
    const { access, isAuthenticated } = await resolveRequestAccess(request, url);
    if (!isAuthenticated) return NextResponse.json({ success: false, error: "ログイン後にダッシュボードを確認してください。" }, { status: 401, headers });
    if (!isApprovedAccess(access)) return NextResponse.json({ success: false, error: "アカウント承認後にダッシュボードを確認できます。" }, { status: 403, headers });
    const requested = url.searchParams.get("schoolId")?.trim();
    let schoolId = requested && requested !== "all" ? requested : null;
    if (!isAllSchoolRole(access.role)) {
      if (schoolId && !canAccessSchool(access, schoolId)) return NextResponse.json({ success: false, error: "この校舎のデータは閲覧できません。" }, { status: 403, headers });
      schoolId = schoolId || access.schoolId || access.schoolIds[0];
      if (!schoolId || !canAccessSchool(access, schoolId)) return NextResponse.json({ success: false, error: "担当校舎が設定されていません。" }, { status: 403, headers });
    }
    const schools = await prisma.school.findMany({
      where: schoolId ? { id: schoolId } : { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { id: "asc" },
    });
    if (schoolId && !schools.length) return NextResponse.json({ success: false, error: "校舎が見つかりません。" }, { status: 404, headers });
    const scope = { schoolId: { in: schools.map(school => school.id) } };
    const [reviews, keywords, queries, alerts] = await Promise.all([
      prisma.review.findMany({ where: { ...scope, status: { not: "ARCHIVED" } }, select: { rating: true, status: true, repliedAt: true, postedAt: true, createdAt: true } }),
      prisma.targetKeyword.findMany({ where: { ...scope, isActive: true }, select: {
        id: true, schoolId: true, keyword: true,
        rankHistories: { orderBy: [{ checkedAt: "desc" }, { id: "desc" }], take: 2, select: { rank: true, checkedAt: true } },
        aioScoreHistories: { orderBy: [{ checkedAt: "desc" }, { id: "desc" }], take: 1, select: { chatgptScore: true, geminiScore: true, googleAiScore: true, totalScore: true, checkedAt: true } },
      } }),
      prisma.searchQueryLog.findMany({ where: scope, select: { query: true, targetMonth: true, impressionCount: true } }),
      prisma.churnAlert.findMany({ where: scope, select: { status: true, riskLevel: true } }),
    ]);
    const now = new Date();
    return NextResponse.json({ success: true, schoolId, schoolName: schoolId ? schools[0].name : "全校舎", schoolCount: schools.length,
      generatedAt: now.toISOString(), summary: buildDashboardOverview({ reviews, keywords, queries, alerts }, now) }, { headers });
  } catch (error) {
    console.error("[Dashboard Overview]", { code: error && typeof error === "object" && "code" in error ? error.code : "OVERVIEW_FAILED" });
    return NextResponse.json({ success: false, error: "ダッシュボードの集計データを取得できませんでした。時間をおいて再取得してください。" }, { status: 500, headers });
  }
}
