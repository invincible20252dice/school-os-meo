import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import {
  fetchGbpAccounts,
  fetchGbpLocationsForAccounts,
  refreshGoogleAccessToken,
  type GbpLocation,
} from "@/lib/google-gbp-oauth";
import { prisma } from "@/lib/prisma";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

const DEFAULT_GBP_LOCATION_ID = "locations/6467241578381534467";

function normalizeLocationName(value: string | null | undefined) {
  const locationName = value?.trim().replace(/^\/+/, "") || "";

  if (!locationName) {
    return DEFAULT_GBP_LOCATION_ID;
  }

  if (locationName.startsWith("accounts/") && locationName.includes("/locations/")) {
    return `locations/${locationName.split("/locations/").pop()}`;
  }

  return locationName.startsWith("locations/")
    ? locationName
    : `locations/${locationName}`;
}

function buildKnownLocation(locationName: string): GbpLocation {
  return {
    accountName: "",
    accountDisplayName: "Google Business Profile",
    name: locationName,
    title: "iスクール予備校 本校",
    storeCode: "ischool_main",
    locationId: locationName.replace(/^locations\//, ""),
    address: "熊本県熊本市中央区手取本町（通町筋・下通）",
    placeId: "",
  };
}

function mergeKnownLocation(locations: GbpLocation[], locationName: string) {
  const merged = new Map<string, GbpLocation>([
    [locationName, buildKnownLocation(locationName)],
  ]);

  for (const location of locations) {
    merged.set(location.name, location);
  }

  return [...merged.values()];
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedSchoolId = url.searchParams.get("schoolId") || undefined;
    const accessResult = await resolveRequestAccess(request, url);

    if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
      return NextResponse.json(
        { message: "アカウント承認後にGBP店舗一覧を取得できます。" },
        { status: 403 },
      );
    }

    const scopedSchool = buildScopedSchoolFilter(
      accessResult.access,
      requestedSchoolId,
    );
    const schoolId = scopedSchool.effectiveSchoolId || requestedSchoolId;

    if (!schoolId) {
      return NextResponse.json(
        { message: "GBP店舗一覧を取得する校舎を選択してください。" },
        { status: 400 },
      );
    }

    const [setting, googleAccount] = await Promise.all([
      prisma.schoolSetting.findUnique({
        where: { schoolId },
        select: {
          googleRefreshToken: true,
          selectedGbpLocationId: true,
        },
      }),
      prisma.googleAccount.findUnique({
        where: { schoolId },
        select: {
          refreshToken: true,
          locationId: true,
        },
      }),
    ]);
    const selectedGbpLocationId = normalizeLocationName(
      setting?.selectedGbpLocationId || googleAccount?.locationId,
    );
    const googleRefreshToken =
      setting?.googleRefreshToken || googleAccount?.refreshToken || "";
    const access = {
      role: accessResult.access.role,
      effectiveSchoolId: schoolId,
      source: accessResult.access.source,
    };

    if (!googleRefreshToken) {
      return NextResponse.json({
        success: true,
        accounts: [],
        locations: [buildKnownLocation(selectedGbpLocationId)],
        selectedGbpLocationId,
        source: "saved-location",
        access,
      });
    }

    try {
      const accessToken = await refreshGoogleAccessToken({
        refreshToken: googleRefreshToken,
      });
      const accounts = await fetchGbpAccounts({ accessToken });
      const locations = await fetchGbpLocationsForAccounts({
        accessToken,
        accounts,
      });

      return NextResponse.json({
        success: true,
        accounts,
        locations: mergeKnownLocation(locations, selectedGbpLocationId),
        selectedGbpLocationId,
        source: "google-api",
        access,
      });
    } catch (error) {
      console.warn("GBP location API unavailable. Using the saved location.", error);
      return NextResponse.json({
        success: true,
        accounts: [],
        locations: [buildKnownLocation(selectedGbpLocationId)],
        selectedGbpLocationId,
        source: "saved-location",
        access,
      });
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({
      success: true,
      accounts: [],
      locations: [buildKnownLocation(DEFAULT_GBP_LOCATION_ID)],
      selectedGbpLocationId: DEFAULT_GBP_LOCATION_ID,
      source: "known-location",
    });
  }
}
