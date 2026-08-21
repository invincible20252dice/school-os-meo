import { buildGoogleReviewUrl } from "./review-generator";

export const DEFAULT_GOOGLE_REVIEW_URL =
  "https://g.page/r/CcECT8Glzr4bEBM/review";
export const DEFAULT_PUBLIC_SCHOOL_NAME = "大学受験専門塾 iスクール予備校";

export function normalizeGoogleReviewUrl(value: string | null | undefined) {
  const trimmed = value?.trim() || "";

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

export function resolveGoogleReviewUrl(input: {
  settingReviewUrl?: string | null;
  schoolGoogleMapsUrl?: string | null;
  googlePlaceId?: string | null;
}) {
  const settingReviewUrl = normalizeGoogleReviewUrl(input.settingReviewUrl);

  if (settingReviewUrl) {
    return settingReviewUrl;
  }

  const schoolGoogleMapsUrl = normalizeGoogleReviewUrl(input.schoolGoogleMapsUrl);

  if (schoolGoogleMapsUrl) {
    return schoolGoogleMapsUrl;
  }

  const googlePlaceId = input.googlePlaceId?.trim();

  if (googlePlaceId) {
    return buildGoogleReviewUrl(googlePlaceId);
  }

  return DEFAULT_GOOGLE_REVIEW_URL;
}
