export const DEFAULT_GOOGLE_REVIEW_URL =
  "https://g.page/r/CcECT8Glzr4bEBM/review";
export const DEFAULT_PUBLIC_SCHOOL_NAME = "大学受験専門塾 iスクール予備校";

function isInternalPlaceholderPlaceId(placeId: string | null) {
  const normalizedPlaceId = placeId?.trim() || "";
  return (
    normalizedPlaceId.startsWith("manual-") ||
    normalizedPlaceId.startsWith("system-")
  );
}

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

    if (
      url.hostname === "search.google.com" &&
      url.pathname === "/local/writereview" &&
      (!url.searchParams.get("placeid") ||
        isInternalPlaceholderPlaceId(url.searchParams.get("placeid")))
    ) {
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

  return DEFAULT_GOOGLE_REVIEW_URL;
}
