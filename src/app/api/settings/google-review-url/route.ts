import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { normalizeGoogleReviewUrl } from "@/lib/google-review-url";
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

async function resolveWritableSchool(request: Request, bodySchoolId?: string) {
  const url = new URL(request.url);
  const requestedSchoolId =
    normalizeSchoolId(bodySchoolId) ||
    normalizeSchoolId(url.searchParams.get("schoolId"));
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
    select: { id: true, status: true },
  });

  if (!school || school.status !== "ACTIVE") {
    throw new Error("SCHOOL_NOT_FOUND");
  }

  return school;
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
          : message === "INVALID_REVIEW_URL"
            ? 422
            : 500;

  return NextResponse.json(
    {
      message:
        status === 400
          ? "設定を保存する校舎を選択してください。"
          : status === 403
            ? "この校舎の設定は変更できません。"
            : status === 404
              ? "対象校舎が見つかりませんでした。"
              : status === 422
                ? "Google口コミ投稿リンクの形式を確認してください。"
                : "Google口コミ投稿リンクを保存できませんでした。",
    },
    { status },
  );
}

async function saveGoogleReviewUrl(request: Request) {
  try {
    const body = (await request.json()) as {
      schoolId?: string;
      googleReviewUrl?: string;
      reviewUrl?: string;
    };
    const school = await resolveWritableSchool(request, body.schoolId);
    const rawGoogleReviewUrl = normalizeString(
      body.googleReviewUrl ?? body.reviewUrl,
    );
    const googleReviewUrl = rawGoogleReviewUrl
      ? normalizeGoogleReviewUrl(rawGoogleReviewUrl)
      : "";

    if (rawGoogleReviewUrl && !googleReviewUrl) {
      throw new Error("INVALID_REVIEW_URL");
    }

    const setting = await prisma.schoolSetting.upsert({
      where: { schoolId: school.id },
      create: {
        schoolId: school.id,
        googleReviewUrl,
        promptForbiddenWords: [],
        promptMustKeywords: [],
      },
      update: {
        googleReviewUrl,
      },
      select: {
        id: true,
        schoolId: true,
        googleReviewUrl: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      message: "Google口コミ投稿リンクを保存しました。",
      setting: {
        id: setting.id,
        schoolId: setting.schoolId,
        googleReviewUrl: setting.googleReviewUrl || "",
        updatedAt: setting.updatedAt.toISOString().slice(0, 16).replace("T", " "),
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  return saveGoogleReviewUrl(request);
}

export async function POST(request: Request) {
  return saveGoogleReviewUrl(request);
}

export async function PUT(request: Request) {
  return saveGoogleReviewUrl(request);
}
