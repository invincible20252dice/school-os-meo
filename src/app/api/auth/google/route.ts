import { NextResponse } from "next/server";
import {
  buildGoogleOAuthUrl,
  getForwardedOrigin,
  getGoogleRedirectUri,
} from "@/lib/google-gbp-oauth";

function normalizeSchoolId(value: string | null) {
  return value?.trim() || "school-demo-001";
}

function buildSettingsRedirect(requestUrl: string, message: string) {
  const redirectUrl = new URL("/dashboard/settings/google", requestUrl);
  redirectUrl.searchParams.set("google_error", message);
  return redirectUrl;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const schoolId = normalizeSchoolId(url.searchParams.get("schoolId"));

  try {
    const redirectUri = getGoogleRedirectUri(
      request.url,
      getForwardedOrigin(request.headers),
    );

    return NextResponse.redirect(
      buildGoogleOAuthUrl({
        redirectUri,
        state: schoolId,
      }),
    );
  } catch (error) {
    return NextResponse.redirect(
      buildSettingsRedirect(
        request.url,
        error instanceof Error
          ? error.message
          : "Google OAuth認可画面を開けませんでした。",
      ),
    );
  }
}
