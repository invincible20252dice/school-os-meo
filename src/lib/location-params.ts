export type LocationParamsInput = {
  nearestStation?: string | null;
  municipality?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  radiusMeters?: string | number | null;
};

export type NormalizedLocationParams = {
  nearestStation: string;
  municipality: string;
  latitude?: number;
  longitude?: number;
  radiusMeters: number;
};

function trimRequired(value: string | null | undefined, label: string) {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  return trimmed;
}

function toOptionalNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error("Location coordinates must be valid numbers.");
  }

  return parsed;
}

function normalizeRadius(value: string | number | null | undefined) {
  const parsed = toOptionalNumber(value);

  if (parsed === undefined) {
    return 1500;
  }

  return Math.min(50000, Math.max(100, Math.trunc(parsed)));
}

export function normalizeLocationParams(
  input: LocationParamsInput,
): NormalizedLocationParams {
  const latitude = toOptionalNumber(input.latitude);
  const longitude = toOptionalNumber(input.longitude);

  if (
    (latitude === undefined && longitude !== undefined) ||
    (latitude !== undefined && longitude === undefined)
  ) {
    throw new Error("Latitude and longitude must be set together.");
  }

  if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
    throw new Error("Latitude must be between -90 and 90.");
  }

  if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
    throw new Error("Longitude must be between -180 and 180.");
  }

  return {
    nearestStation: trimRequired(input.nearestStation, "nearestStation"),
    municipality: trimRequired(input.municipality, "municipality"),
    ...(latitude !== undefined ? { latitude } : {}),
    ...(longitude !== undefined ? { longitude } : {}),
    radiusMeters: normalizeRadius(input.radiusMeters),
  };
}

export function buildRankSearchLabel({
  keyword,
  location,
}: {
  keyword: string;
  location: NormalizedLocationParams;
}) {
  const coordinates =
    location.latitude !== undefined && location.longitude !== undefined
      ? ` / ${location.latitude},${location.longitude}`
      : "";

  return `${keyword.trim()} / ${location.municipality} / ${location.nearestStation}${coordinates} / ${location.radiusMeters}m`;
}
