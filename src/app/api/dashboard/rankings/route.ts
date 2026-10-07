import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isApprovedAccess } from "@/lib/access-control";
import { canAccessSchool } from "@/lib/auth-access";
import {
  buildDashboardRankingData,
  type DashboardKeywordRankRecord,
  type DashboardSchoolRecord,
  type DashboardTargetKeywordRecord,
} from "@/lib/dashboard-rankings";
import { prisma } from "@/lib/prisma";
import { withRankingSimulation } from "@/lib/ranking-simulation";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

type CreateKeywordBody = {
  schoolId?: string;
  keyword?: string;
  location?: string;
  nearestStation?: string;
  municipality?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  radiusMeters?: string | number | null;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDecimalInput(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error("緯度・経度には数値を入力してください。");
  }

  return parsed;
}

function normalizeRadius(value: unknown) {
  const parsed = value === undefined || value === null || value === "" ? 1500 : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error("計測半径には数値を入力してください。");
  }

  return Math.min(50000, Math.max(100, Math.trunc(parsed)));
}

async function loadRankingData(schoolId: string, keywordId?: string) {
  const school = schoolId
    ? await prisma.school.findUnique({
        where: { id: schoolId },
        select: {
          id: true,
          name: true,
          prefecture: true,
          city: true,
          addressLine: true,
          googlePlaceId: true,
        },
      })
    : null;
  const keywords = await prisma.targetKeyword.findMany({
    where: { schoolId },
    orderBy: [{ createdAt: "asc" }],
    include: {
      rankHistories: {
        orderBy: { checkedAt: "desc" },
      },
      aioScoreHistories: {
        orderBy: { checkedAt: "desc" },
        take: 5,
      },
    },
  });
  const keywordRanks = await prisma.keywordRank.findMany({
    where: { schoolId, ...(keywordId ? { keyword: keywords.find(keyword => keyword.id === keywordId)?.keyword ?? "" } : {}) },
    orderBy: { measuredAt: "desc" },
  });

  return buildDashboardRankingData({
    school: school as DashboardSchoolRecord | null,
    keywords: keywords as DashboardTargetKeywordRecord[],
    keywordRanks: keywordRanks as DashboardKeywordRankRecord[],
    keywordId,
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const accessResult = await resolveRequestAccess(request, url);

    if (!accessResult.isAuthenticated) return NextResponse.json({ success: false, error: "ログイン後に順位データを確認してください。" }, { status: 401 });

    if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
      return NextResponse.json(
        { success: false, error: "アカウント承認後に順位データを確認できます。" },
        { status: 403 },
      );
    }

    const scopedSchool = buildScopedSchoolFilter(
      accessResult.access,
      url.searchParams.get("schoolId"),
    );
    const schoolId = scopedSchool.effectiveSchoolId;
    const requested = url.searchParams.get("schoolId");
    if ((requested && requested !== "all" && !canAccessSchool(accessResult.access, requested)) ||
      (schoolId && !canAccessSchool(accessResult.access, schoolId))) {
      return NextResponse.json({ success: false, error: "この校舎の閲覧権限がありません。" }, { status: 403 });
    }
    if (!schoolId) return NextResponse.json({ success: false, error: "校舎を選択してください。" }, { status: 400 });
    const keywordId = url.searchParams.get("keywordId") || undefined;
    const data = withRankingSimulation(await loadRankingData(schoolId, keywordId), keywordId);
    if (!data.school || (keywordId && !data.selectedKeyword)) return NextResponse.json({ success: false, error: "校舎またはキーワードが見つかりません。" }, { status: 404 });

    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error("[GET /api/dashboard/rankings Error]:", error);
    const schemaMismatch = error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2022" || error.code === "P2021");
    return NextResponse.json(
      {
        success: false,
        code: schemaMismatch ? "RANKING_SCHEMA_UNAVAILABLE" : "RANKING_FETCH_FAILED",
        error: schemaMismatch
          ? "順位データの保存設定に不整合があります。管理者にお問い合わせください。"
          : "ランキングデータを取得できませんでした。",
      },
      { status: schemaMismatch ? 503 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const body = (await request.json()) as CreateKeywordBody;
    const accessResult = await resolveRequestAccess(request, url);

    if (!accessResult.isAuthenticated) return NextResponse.json({ success: false, error: "ログイン後にキーワードを追加してください。" }, { status: 401 });

    if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
      return NextResponse.json(
        { success: false, error: "アカウント承認後にキーワードを追加できます。" },
        { status: 403 },
      );
    }

    const requestedSchoolId = normalizeString(body.schoolId);
    const keyword = normalizeString(body.keyword);
    const scopedSchool = buildScopedSchoolFilter(
      accessResult.access,
      requestedSchoolId,
    );
    const schoolId = scopedSchool.effectiveSchoolId;

    if ((requestedSchoolId && requestedSchoolId !== "all" && !canAccessSchool(accessResult.access, requestedSchoolId)) ||
      (schoolId && !canAccessSchool(accessResult.access, schoolId))) {
      return NextResponse.json({ success: false, error: "この校舎の編集権限がありません。" }, { status: 403 });
    }

    if (!schoolId || !keyword) {
      return NextResponse.json(
        { success: false, error: "schoolId and keyword are required" },
        { status: 400 },
      );
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        prefecture: true,
        city: true,
        addressLine: true,
      },
    });
    const municipality = normalizeString(body.municipality) ||
      normalizeString(school?.city);
    const location = normalizeString(body.location) ||
      [school?.prefecture, school?.city, school?.addressLine]
        .map(normalizeString)
        .filter(Boolean)
        .join("");
    const nearestStation = normalizeString(body.nearestStation);

    if (!municipality || !location || !nearestStation) {
      return NextResponse.json(
        {
          success: false,
          error: "市町村名、計測地点、最寄り駅を入力してください。",
        },
        { status: 400 },
      );
    }

    const newKeyword = await prisma.targetKeyword.upsert({
      where: { schoolId_keyword_location: { schoolId, keyword, location } },
      update: { isActive: true },
      create: {
        schoolId,
        keyword,
        location,
        nearestStation,
        municipality,
        latitude: normalizeDecimalInput(body.latitude),
        longitude: normalizeDecimalInput(body.longitude),
        radiusMeters: normalizeRadius(body.radiusMeters),
      },
    });

    return NextResponse.json({ success: true, keyword: newKeyword });
  } catch (error) {
    console.error("[POST /api/dashboard/rankings Error]:", error);
    const errorMessage = error instanceof Error
      ? error.message
      : "キーワードを追加できませんでした。";
    const status = errorMessage.includes("緯度・経度") ||
      errorMessage.includes("計測半径")
      ? 400
      : 500;

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status },
    );
  }
}
