import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

type SchoolSettingLineFields = {
  lineNotifyEnabled: boolean;
  lineChannelAccessToken: string | null;
  lineDestinationId: string | null;
  notifyOnNewReview: boolean;
  notifyOnLowRating: boolean;
  updatedAt: Date;
};

type RawLineRecord = Record<string, unknown>;

type LineSettingSources = {
  schoolSetting: SchoolSettingLineFields | null;
  rawSchoolSetting: RawLineRecord | null;
  rawLineSetting: RawLineRecord | null;
};

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

function firstNormalizedString(...values: unknown[]) {
  return values.map(normalizeString).find(Boolean) || "";
}

function firstBoolean(
  ...values: Array<boolean | null | undefined | unknown>
): boolean | undefined {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return undefined;
}

function firstDate(...values: unknown[]) {
  for (const value of values) {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const date = new Date(value);

      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }
  }

  return null;
}

function pick(record: RawLineRecord | null, ...keys: string[]) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function serializeLineSetting({
  schoolId,
  sources,
}: {
  schoolId: string;
  sources: LineSettingSources;
}) {
  const channelAccessToken = firstNormalizedString(
    pick(sources.rawLineSetting, "channelAccessToken", "lineAccessToken", "lineChannelAccessToken", "channel_access_token", "line_access_token"),
    sources.schoolSetting?.lineChannelAccessToken,
    pick(sources.rawSchoolSetting, "lineChannelAccessToken", "channelAccessToken", "lineAccessToken", "line_channel_access_token", "channel_access_token", "line_access_token"),
  );
  const lineUserId = firstNormalizedString(
    pick(sources.rawLineSetting, "lineUserId", "targetId", "groupId", "lineDestinationId", "lineTargetId", "line_user_id", "target_id", "group_id", "line_destination_id", "line_target_id"),
    sources.schoolSetting?.lineDestinationId,
    pick(sources.rawSchoolSetting, "lineDestinationId", "lineUserId", "targetId", "groupId", "lineTargetId", "line_destination_id", "line_user_id", "target_id", "group_id", "line_target_id"),
  );
  const enabled =
    firstBoolean(
      pick(sources.rawLineSetting, "enabled", "lineNotifyEnabled", "line_notify_enabled"),
      sources.schoolSetting?.lineNotifyEnabled,
      pick(sources.rawSchoolSetting, "lineNotifyEnabled", "enabled", "line_notify_enabled"),
    ) ?? Boolean(channelAccessToken && lineUserId);
  const notifyOnNewReview =
    firstBoolean(
      pick(sources.rawLineSetting, "notifyOnNewReview", "notify_on_new_review"),
      sources.schoolSetting?.notifyOnNewReview,
      pick(sources.rawSchoolSetting, "notifyOnNewReview", "notify_on_new_review"),
    ) ?? true;
  const notifyOnLowRating =
    firstBoolean(
      pick(sources.rawLineSetting, "notifyOnLowRating", "notify_on_low_rating"),
      sources.schoolSetting?.notifyOnLowRating,
      pick(sources.rawSchoolSetting, "notifyOnLowRating", "notify_on_low_rating"),
    ) ?? true;
  const updatedAt = firstDate(
    pick(sources.rawLineSetting, "updatedAt", "updated_at"),
    sources.schoolSetting?.updatedAt,
    pick(sources.rawSchoolSetting, "updatedAt", "updated_at"),
  );

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
    updatedAt: toUpdatedAt(updatedAt),
  };
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function findRawLineRecord(tableName: string, schoolId: string) {
  try {
    const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
      tableName,
    );
    const columnNames = columns.map((column) => column.column_name);
    const schoolColumn = columnNames.includes("schoolId")
      ? "schoolId"
      : columnNames.includes("school_id")
        ? "school_id"
        : "";

    if (!schoolColumn) {
      return null;
    }

    const rows = await prisma.$queryRawUnsafe<RawLineRecord[]>(
      `SELECT * FROM ${quoteIdentifier(tableName)} WHERE ${quoteIdentifier(schoolColumn)} = $1 LIMIT 1`,
      schoolId,
    );

    return rows[0] || null;
  } catch (error) {
    console.error(`[LINE settings raw lookup skipped: ${tableName}]`, error);

    return null;
  }
}

async function findLineSettingSources(schoolId: string): Promise<LineSettingSources> {
  const [schoolSetting, rawSchoolSetting, lineSetting, lineSettings, lineSettingSnake] =
    await Promise.all([
      prisma.schoolSetting.findUnique({
        where: { schoolId },
        select: {
          lineNotifyEnabled: true,
          lineChannelAccessToken: true,
          lineDestinationId: true,
          notifyOnNewReview: true,
          notifyOnLowRating: true,
          updatedAt: true,
        },
      }),
      findRawLineRecord("SchoolSetting", schoolId),
      findRawLineRecord("LineSetting", schoolId),
      findRawLineRecord("line_settings", schoolId),
      findRawLineRecord("line_setting", schoolId),
    ]);

  return {
    schoolSetting,
    rawSchoolSetting,
    rawLineSetting: lineSetting || lineSettings || lineSettingSnake,
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
    const sources = await findLineSettingSources(school.id);
    const lineSetting = serializeLineSetting({
      schoolId: school.id,
      sources,
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
