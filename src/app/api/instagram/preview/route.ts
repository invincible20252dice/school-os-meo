import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canAccessSchool } from "@/lib/auth-access";
import { isApprovedAccess } from "@/lib/access-control";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { RequestAuthenticationError } from "@/lib/request-authentication-error";
import { prisma } from "@/lib/prisma";
import { buildMockInstagramSyncPreview, DEFAULT_INSTAGRAM_LOCATION } from "@/lib/mock-instagram-sync";

function coordinate(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function readSyncTimestamp(schoolId: string) {
  try {
    const instagramSetting = await prisma.instagramSetting.findUnique({
      where: { schoolId }, select: { lastSyncedAt: true },
    });
    return { instagramSetting, syncTimestampUnavailable: false };
  } catch (error) {
    // The deployed legacy schema has no optional sync timestamp. This does not
    // establish manual-sync readiness; every other DB failure must still fail.
    if (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2022" && error.meta?.column === "InstagramSetting.lastSyncedAt") {
      return { instagramSetting: null, syncTimestampUnavailable: true };
    }
    throw error;
  }
}

async function readPreview(school: { id: string; name: string; city: string | null; gbpLocationId: string | null }) {
  const schoolId = school.id;
  const [keyword, syncTimestamp] = await Promise.all([
    prisma.targetKeyword.findFirst({ where: { schoolId, isActive: true }, orderBy: { createdAt: "asc" },
      select: { keyword: true, nearestStation: true, municipality: true, latitude: true, longitude: true, radiusMeters: true } }),
    readSyncTimestamp(schoolId),
  ]);
  const dashboardData = {
    school: { id: school.id, name: school.name, gbpLocationId: school.gbpLocationId || "" },
    location: {
      keyword: keyword?.keyword || DEFAULT_INSTAGRAM_LOCATION.keyword,
      nearestStation: keyword?.nearestStation || DEFAULT_INSTAGRAM_LOCATION.nearestStation,
      municipality: keyword?.municipality || school.city || DEFAULT_INSTAGRAM_LOCATION.municipality,
      latitude: coordinate(keyword?.latitude, DEFAULT_INSTAGRAM_LOCATION.latitude),
      longitude: coordinate(keyword?.longitude, DEFAULT_INSTAGRAM_LOCATION.longitude),
      radiusMeters: keyword?.radiusMeters || DEFAULT_INSTAGRAM_LOCATION.radiusMeters,
    },
    ...syncTimestamp,
  };
  return { dashboardData, preview: await buildMockInstagramSyncPreview({ school: dashboardData.school }) };
}

export type InstagramPreviewResponse = Awaited<ReturnType<typeof readPreview>>;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await resolveRequestAccess(request, url, undefined, { requireActiveProfile: true });
    if (!result.isAuthenticated) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
    if (!isApprovedAccess(result.access)) return NextResponse.json({ message: "アカウント承認後にプレビューを表示できます。" }, { status: 403 });
    const schoolId = url.searchParams.get("schoolId")?.trim();
    if (!schoolId || schoolId === "all") return NextResponse.json({ message: "プレビューを表示する校舎を選択してください。" }, { status: 400 });
    if (!canAccessSchool(result.access, schoolId)) return NextResponse.json({ message: "この校舎のプレビューは表示できません。" }, { status: 403 });
    const school = await prisma.school.findUnique({ where: { id: schoolId },
      select: { id: true, name: true, city: true, gbpLocationId: true, status: true } });
    if (!school || school.status !== "ACTIVE") return NextResponse.json({ message: "校舎が見つかりません。" }, { status: 404 });
    return NextResponse.json(await readPreview(school), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof RequestAuthenticationError) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
    console.error("Instagram preview lookup failed.");
    return NextResponse.json({ message: "プレビューを取得できませんでした。" }, { status: 500 });
  }
}
