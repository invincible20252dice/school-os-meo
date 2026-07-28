import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_META_APP_ID,
  DEFAULT_META_APP_SECRET,
  exchangeInstagramCode,
  fetchInstagramBusinessAccountId,
  getForwardedOrigin,
  getInstagramRedirectUri,
} from "@/lib/instagram-oauth";

type InstagramOAuthCredentials = {
  metaAppId: string;
  metaAppSecret: string;
};

function firstPresent(...values: Array<string | null | undefined>) {
  return values.find((value) => value?.trim())?.trim();
}

function buildInstagramSettingsRedirect(requestUrl: string, params: Record<string, string>) {
  const redirectUrl = new URL("/dashboard/settings/instagram", requestUrl);

  for (const [key, value] of Object.entries(params)) {
    redirectUrl.searchParams.set(key, value);
  }

  return redirectUrl;
}

async function resolveInstagramOAuthCredentials(
  schoolId: string,
): Promise<InstagramOAuthCredentials> {
  const [instagramSetting, schoolSetting] = await Promise.all([
    prisma.instagramSetting.findUnique({
      where: { schoolId },
      select: {
        metaAppId: true,
        metaAppSecret: true,
      },
    }),
    prisma.schoolSetting.findUnique({
      where: { schoolId },
      select: {
        instagramMetaAppId: true,
        instagramMetaAppSecret: true,
      },
    }),
  ]);

  const metaAppId = DEFAULT_META_APP_ID;
  const metaAppSecret = firstPresent(
    schoolSetting?.instagramMetaAppSecret,
    instagramSetting?.metaAppSecret,
    process.env.META_APP_SECRET,
    process.env.NEXT_PUBLIC_META_APP_SECRET,
    DEFAULT_META_APP_SECRET,
  ) || DEFAULT_META_APP_SECRET;

  return { metaAppId, metaAppSecret };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const schoolId = url.searchParams.get("state");

  if (!code) {
    return NextResponse.redirect(
      buildInstagramSettingsRedirect(request.url, {
        instagram_error: "Instagram OAuth codeがありません。",
      }),
    );
  }

  if (!schoolId) {
    return NextResponse.redirect(
      buildInstagramSettingsRedirect(request.url, {
        instagram_error: "校舎IDを引き継げませんでした。設定画面から再度Instagram連携を開始してください。",
      }),
    );
  }

  try {
    const redirectUri = getInstagramRedirectUri(
      request.url,
      getForwardedOrigin(request.headers),
    );
    const credentials = await resolveInstagramOAuthCredentials(schoolId);

    const accessToken = await exchangeInstagramCode({
      code,
      redirectUri,
      metaAppId: credentials.metaAppId,
      metaAppSecret: credentials.metaAppSecret,
    });
    const instagramBusinessAccountId = await fetchInstagramBusinessAccountId({
      accessToken,
    });

    await prisma.instagramSetting.upsert({
      where: { schoolId },
      create: {
        schoolId,
        instagramAccessToken: accessToken,
        instagramBusinessAccountId,
        autoSyncEnabled: true,
        metaAppId: credentials.metaAppId,
        metaAppSecret: credentials.metaAppSecret,
      },
      update: {
        instagramAccessToken: accessToken,
        instagramBusinessAccountId,
        autoSyncEnabled: true,
        metaAppId: credentials.metaAppId,
        metaAppSecret: credentials.metaAppSecret,
      },
    });
    await prisma.schoolSetting.updateMany({
      where: { schoolId },
      data: {
        instagramConnected: true,
        instagramMetaAppId: credentials.metaAppId,
        instagramMetaAppSecret: credentials.metaAppSecret,
      },
    });

    return NextResponse.redirect(
      buildInstagramSettingsRedirect(request.url, {
        instagram_connected: "true",
      }),
    );
  } catch (error) {
    console.error(error);
    return NextResponse.redirect(
      buildInstagramSettingsRedirect(request.url, {
        instagram_error:
          error instanceof Error
            ? error.message
            : "Instagram連携の保存に失敗しました。",
      }),
    );
  }
}
