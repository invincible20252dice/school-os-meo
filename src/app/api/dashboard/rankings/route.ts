import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import {
  buildDashboardRankingData,
  type DashboardKeywordRankRecord,
  type DashboardSchoolRecord,
  type DashboardTargetKeywordRecord,
} from "@/lib/dashboard-rankings";
import { prisma } from "@/lib/prisma";
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

async function loadRankingData(schoolId?: string) {
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
    where: schoolId ? { schoolId } : undefined,
    orderBy: [{ createdAt: "asc" }],
    include: {
      rankHistories: {
        orderBy: { checkedAt: "desc" },
        take: 20,
      },
      aioScoreHistories: {
        orderBy: { checkedAt: "desc" },
        take: 5,
      },
    },
  });
  const keywordRanks = await prisma.keywordRank.findMany({
    where: schoolId ? { schoolId } : undefined,
    orderBy: { measuredAt: "desc" },
    take: 20,
  });

  return buildDashboardRankingData({
    school: school as DashboardSchoolRecord | null,
    keywords: keywords as DashboardTargetKeywordRecord[],
    keywordRanks: keywordRanks as DashboardKeywordRankRecord[],
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const accessResult = await resolveRequestAccess(request, url);

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
    const data = await loadRankingData(scopedSchool.effectiveSchoolId);

    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error("[GET /api/dashboard/rankings Error]:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "ランキングデータを取得できませんでした。",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const body = (await request.json()) as CreateKeywordBody;
    const accessResult = await resolveRequestAccess(request, url);

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

    const newKeyword = await prisma.targetKeyword.create({
      data: {
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
