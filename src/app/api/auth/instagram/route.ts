import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildInstagramOAuthUrl,
  DEFAULT_META_APP_ID,
  getForwardedOrigin,
  getInstagramRedirectUri,
} from "@/lib/instagram-oauth";

function firstPresent(...values: Array<string | null | undefined>) {
  return values.find((value) => value?.trim())?.trim();
}

async function resolveMetaAppId(schoolId: string, queryMetaAppId?: string) {
  let schoolSetting: { instagramMetaAppId: string | null } | null = null;
  let instagramSetting: { metaAppId: string | null } | null = null;

  if (!process.env.DATABASE_URL) {
    return firstPresent(queryMetaAppId, process.env.META_APP_ID, DEFAULT_META_APP_ID);
  }

  try {
    [schoolSetting, instagramSetting] = await Promise.all([
      prisma.schoolSetting.findUnique({
        where: { schoolId },
        select: { instagramMetaAppId: true },
      }),
      prisma.instagramSetting.findUnique({
        where: { schoolId },
        select: { metaAppId: true },
      }),
    ]);
  } catch (error) {
    console.warn("Instagram Meta App ID DB lookup skipped.", error);
  }

  return firstPresent(
    queryMetaAppId,
    process.env.META_APP_ID,
    schoolSetting?.instagramMetaAppId,
    instagramSetting?.metaAppId,
    DEFAULT_META_APP_ID,
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const metaAppId = url.searchParams.get("metaAppId") || undefined;
    const schoolId = url.searchParams.get("schoolId")?.trim() || "";

    if (!schoolId) {
      throw new Error("Instagram連携を開始する校舎を選択してください。");
    }

    const redirectUri = getInstagramRedirectUri(
      request.url,
      getForwardedOrigin(request.headers),
    );
    const clientId = await resolveMetaAppId(schoolId, metaAppId);
    const oauthUrl = buildInstagramOAuthUrl({
      metaAppId: clientId,
      redirectUri,
      state: schoolId,
    });

    return NextResponse.redirect(oauthUrl);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Instagram OAuthを開始できませんでした。";

    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
