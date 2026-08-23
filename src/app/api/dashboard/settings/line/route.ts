import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSchoolId(value: unknown) {
  const schoolId = normalizeString(value);

  return schoolId === "all" ? "" : schoolId;
}

function toUpdatedAt(value?: Date | null) {
  return value ? value.toISOString().slice(0, 16).replace("T", " ") : "";
}

function serializeLineSetting({
  schoolId,
  setting,
}: {
  schoolId: string;
  setting: {
    lineNotifyEnabled: boolean;
    lineChannelAccessToken: string | null;
    lineDestinationId: string | null;
    notifyOnNewReview: boolean;
    notifyOnLowRating: boolean;
    updatedAt: Date;
  } | null;
}) {
  const channelAccessToken = setting?.lineChannelAccessToken || "";
  const lineUserId = setting?.lineDestinationId || "";
  const enabled = setting?.lineNotifyEnabled ?? true;
  const notifyOnNewReview = setting?.notifyOnNewReview ?? true;
  const notifyOnLowRating = setting?.notifyOnLowRating ?? true;

  return {
    schoolId,
    lineNotifyEnabled: enabled,
    enabled,
    lineChannelAccessToken: channelAccessToken,
    channelAccessToken,
    lineAccessToken: channelAccessToken,
    lineDestinationId: lineUserId,
    lineUserId,
    targetId: lineUserId,
    groupId: lineUserId,
    notifyOnNewReview,
    notifyOnLowRating,
    updatedAt: toUpdatedAt(setting?.updatedAt),
  };
}

async function resolveReadableSchool(request: Request) {
  const url = new URL(request.url);
  const requestedSchoolId = normalizeSchoolId(url.searchParams.get("schoolId"));
  const accessResult = await resolveRequestAccess(request, url);

  if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
    throw new Error("FORBIDDEN_PENDING");
  }

  const scopedSchool = buildScopedSchoolFilter(
    accessResult.access,
    requestedSchoolId,
  );
  const schoolId = scopedSchool.effectiveSchoolId || requestedSchoolId;

  if (!schoolId) {
    throw new Error("SCHOOL_REQUIRED");
  }

  if (requestedSchoolId && schoolId !== requestedSchoolId) {
    throw new Error("FORBIDDEN_SCHOOL");
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, status: true },
  });

  if (!school || school.status !== "ACTIVE") {
    throw new Error("SCHOOL_NOT_FOUND");
  }

  return {
    school,
    access: accessResult.access,
  };
}

function toErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const status =
    message === "SCHOOL_REQUIRED"
      ? 400
      : message === "FORBIDDEN_PENDING" || message === "FORBIDDEN_SCHOOL"
        ? 403
        : message === "SCHOOL_NOT_FOUND"
          ? 404
          : 500;

  if (status === 500) {
    console.error("LINE通知設定を取得できませんでした。", error);
  }

  return NextResponse.json(
    {
      success: false,
      message:
        status === 400
          ? "LINE通知設定を取得する校舎を選択してください。"
          : status === 403
            ? "この校舎のLINE通知設定は表示できません。"
            : status === 404
              ? "対象校舎が見つかりませんでした。"
              : "LINE通知設定を取得できませんでした。",
    },
    { status },
  );
}

export async function GET(request: Request) {
  try {
    const { school, access } = await resolveReadableSchool(request);
    const setting = await prisma.schoolSetting.findUnique({
      where: { schoolId: school.id },
      select: {
        lineNotifyEnabled: true,
        lineChannelAccessToken: true,
        lineDestinationId: true,
        notifyOnNewReview: true,
        notifyOnLowRating: true,
        updatedAt: true,
      },
    });
    const lineSetting = serializeLineSetting({
      schoolId: school.id,
      setting,
    });

    return NextResponse.json({
      success: true,
      school,
      setting: lineSetting,
      channelAccessToken: lineSetting.channelAccessToken,
      lineAccessToken: lineSetting.lineAccessToken,
      lineUserId: lineSetting.lineUserId,
      targetId: lineSetting.targetId,
      groupId: lineSetting.groupId,
      notifyOnNewReview: lineSetting.notifyOnNewReview,
      notifyOnLowRating: lineSetting.notifyOnLowRating,
      enabled: lineSetting.enabled,
      access: {
        role: access.role,
        effectiveSchoolId: school.id,
        source: access.source,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
