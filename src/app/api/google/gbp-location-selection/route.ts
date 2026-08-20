import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

type LocationSelectionPayload = {
  schoolId?: string;
  accountName?: string;
  locationName?: string;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLocationName(value: unknown) {
  const locationName = normalizeString(value).replace(/^\/+/, "");

  if (!locationName) {
    return "";
  }

  return locationName.startsWith("locations/")
    ? locationName
    : `locations/${locationName}`;
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const accessResult = await resolveRequestAccess(request, url);

    if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
      return NextResponse.json(
        { message: "アカウント承認後にGBP店舗を保存できます。" },
        { status: 403 },
      );
    }

    const body = (await request.json()) as LocationSelectionPayload;
    const requestedSchoolId = normalizeString(body.schoolId);
    const accountName = normalizeString(body.accountName);
    const locationName = normalizeLocationName(body.locationName);

    if (!requestedSchoolId || !locationName) {
      return NextResponse.json(
        { message: "校舎とGBP店舗IDを入力してください。" },
        { status: 400 },
      );
    }

    const scopedSchool = buildScopedSchoolFilter(
      accessResult.access,
      requestedSchoolId,
    );

    if (scopedSchool.effectiveSchoolId !== requestedSchoolId) {
      return NextResponse.json(
        { message: "この校舎のGBP店舗は変更できません。" },
        { status: 403 },
      );
    }

    const [school, setting] = await prisma.$transaction([
      prisma.school.update({
        where: { id: requestedSchoolId },
        data: {
          ...(accountName ? { gbpAccountId: accountName } : {}),
          gbpLocationId: locationName,
        },
        select: {
          id: true,
          name: true,
          gbpAccountId: true,
          gbpLocationId: true,
        },
      }),
      prisma.schoolSetting.upsert({
        where: { schoolId: requestedSchoolId },
        create: {
          schoolId: requestedSchoolId,
          googleConnected: true,
          googleAccountId: accountName || "手動入力",
          selectedGbpLocationId: locationName,
          promptForbiddenWords: [],
          promptMustKeywords: [],
        },
        update: {
          googleConnected: true,
          ...(accountName ? { googleAccountId: accountName } : {}),
          selectedGbpLocationId: locationName,
        },
        select: {
          id: true,
          schoolId: true,
          googleConnected: true,
          googleAccountId: true,
          selectedGbpLocationId: true,
          updatedAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      school,
      setting: {
        ...setting,
        googleRefreshToken: "********",
        updatedAt: setting.updatedAt.toISOString().slice(0, 16).replace("T", " "),
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "GBP店舗の紐付けを保存できませんでした。" },
      { status: 500 },
    );
  }
}
