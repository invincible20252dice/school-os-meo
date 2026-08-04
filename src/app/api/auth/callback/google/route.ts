import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  exchangeGoogleCode,
  fetchGoogleAccountEmail,
  getForwardedOrigin,
  getGoogleRedirectUri,
} from "@/lib/google-gbp-oauth";

function buildGoogleSettingsRedirect(
  requestUrl: string,
  params: Record<string, string>,
) {
  const redirectUrl = new URL("/dashboard/settings/google", requestUrl);

  for (const [key, value] of Object.entries(params)) {
    redirectUrl.searchParams.set(key, value);
  }

  return redirectUrl;
}

function normalizeSchoolId(value: string | null) {
  return value?.trim() || "";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const schoolId = normalizeSchoolId(url.searchParams.get("state"));

  if (!code) {
    return NextResponse.redirect(
      buildGoogleSettingsRedirect(request.url, {
        google_error: "Google OAuth codeがありません。",
      }),
    );
  }

  if (!schoolId) {
    return NextResponse.redirect(
      buildGoogleSettingsRedirect(request.url, {
        google_error:
          "校舎IDを引き継げませんでした。設定画面から再度Google連携を開始してください。",
      }),
    );
  }

  try {
    const redirectUri = getGoogleRedirectUri(
      request.url,
      getForwardedOrigin(request.headers),
    );
    const currentSetting = await prisma.schoolSetting.findUnique({
      where: { schoolId },
      select: { googleRefreshToken: true },
    });
    const tokenSet = await exchangeGoogleCode({
      code,
      redirectUri,
      previousRefreshToken: currentSetting?.googleRefreshToken || "",
    });
    const accountEmail = await fetchGoogleAccountEmail({
      accessToken: tokenSet.accessToken,
    });

    await prisma.schoolSetting.upsert({
      where: { schoolId },
      create: {
        schoolId,
        googleConnected: true,
        googleAccountId: accountEmail || "Google Business Profile",
        googleRefreshToken: tokenSet.refreshToken,
        selectedGbpLocationId: "",
        promptForbiddenWords: [],
        promptMustKeywords: [],
      },
      update: {
        googleConnected: true,
        googleAccountId: accountEmail || "Google Business Profile",
        googleRefreshToken: tokenSet.refreshToken,
        selectedGbpLocationId: "",
      },
    });

    return NextResponse.redirect(
      buildGoogleSettingsRedirect(request.url, {
        schoolId,
        google_connected: "true",
      }),
    );
  } catch (error) {
    console.error(error);
    return NextResponse.redirect(
      buildGoogleSettingsRedirect(request.url, {
        schoolId,
        google_error:
          error instanceof Error
            ? error.message
            : "Google連携の保存に失敗しました。",
      }),
    );
  }
}
